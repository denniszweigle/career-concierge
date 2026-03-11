import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerGoogleDriveCallback } from "../googleDriveCallback";
import { registerDevLogin } from "../devLogin";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { streamAnswer, streamMatchJobDescription } from "../matchingEngine";
import { streamTailor } from "../tailorEngine";
import { saveChatMessage, getChatMessages, saveAnalysis } from "../db";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // Dev-only one-click login (no-op in production)
  registerDevLogin(app);
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Google Drive OAuth callback
  registerGoogleDriveCallback(app);
  // Health check — used by k8s liveness + readiness probes
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  // Streaming match analysis — SSE endpoint, emits progress then saves & redirects
  app.post("/api/stream-match", async (req, res) => {
    const { jobTitle, jobDescription } = req.body as {
      jobTitle?: string;
      jobDescription: string;
    };

    if (!jobDescription || typeof jobDescription !== "string") {
      res.status(400).json({ error: "jobDescription required" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const matchSse = (payload: object) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
        (res as any).flush?.();
      }
    };

    try {
      for await (const event of streamMatchJobDescription(jobDescription, jobTitle)) {
        if (event.type === "status") {
          matchSse(event);
        } else {
          const analysisId = await saveAnalysis({
            userId: null,
            jobTitle: jobTitle || null,
            jobDescription,
            matchScore: event.data.matchScore,
            mismatchScore: event.data.mismatchScore,
            hardSkillsScore: event.data.hardSkillsScore,
            experienceScore: event.data.experienceScore,
            domainScore: event.data.domainScore,
            softSkillsScore: event.data.softSkillsScore,
            topStrengths: event.data.topStrengths,
            topGaps: event.data.topGaps,
            detailedReport: event.data.detailedReport,
            tokensInput: event.data.tokensInput,
            tokensOutput: event.data.tokensOutput,
          });
          matchSse({ type: "done", analysisId, tokensInput: event.data.tokensInput, tokensOutput: event.data.tokensOutput });
        }
      }
    } catch (err) {
      console.error("[stream-match] Error:", err);
      matchSse({ type: "error", message: "Analysis failed" });
    }
    if (!res.writableEnded) res.end();
  });

  // Streaming Q&A — SSE endpoint, bypasses tRPC for progressive rendering
  app.post("/api/stream-answer", async (req, res) => {
    const { question, history, analysisId } = req.body as {
      question: string;
      history: Array<{ role: "user" | "assistant"; content: string }>;
      analysisId?: string;
    };

    if (!question || typeof question !== "string") {
      res.status(400).json({ error: "question required" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const sse = (payload: object) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
        (res as any).flush?.();
      }
    };

    // Hard 45-second request timeout — client gets an error instead of hanging
    const requestTimeout = setTimeout(() => {
      console.warn("[stream-answer] Hard timeout after 45s");
      sse({ error: true });
      if (!res.writableEnded) res.end();
    }, 45_000);
    res.on("close", () => clearTimeout(requestTimeout));

    // Save user message to DB before streaming
    if (analysisId) {
      await saveChatMessage({ analysisId, role: "user", content: question });
    }

    let fullAnswer = "";
    try {
      // Build history from DB if analysisId provided (so history param is optional)
      let resolvedHistory = history ?? [];
      if (analysisId && (!history || history.length === 0)) {
        const msgs = await getChatMessages(analysisId);
        // Exclude the user message we just saved (last one)
        resolvedHistory = msgs
          .slice(0, -1)
          .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
      }

      for await (const event of streamAnswer(question, resolvedHistory)) {
        if (res.writableEnded) break;
        if (event.type === "status") {
          sse({ status: event.message });
        } else if (event.type === "chunk") {
          fullAnswer += event.text;
          sse({ text: event.text });
        } else {
          // Save completed assistant message to DB
          if (analysisId) {
            await saveChatMessage({
              analysisId,
              role: "assistant",
              content: fullAnswer,
              tokensInput: event.tokensInput,
              tokensOutput: event.tokensOutput,
            });
          }
          sse({ done: true, sources: event.sources, tokensInput: event.tokensInput, tokensOutput: event.tokensOutput });
        }
      }
    } catch (err) {
      console.error("[stream-answer] Error:", err);
      sse({ error: true });
    }
    clearTimeout(requestTimeout);
    if (!res.writableEnded) res.end();
  });

  // Streaming resume + cover letter tailor — SSE endpoint, no DB save
  app.post("/api/stream-tailor", async (req, res) => {
    const { jobTitle, jobDescription } = req.body as {
      jobTitle?: string;
      jobDescription: string;
    };

    if (!jobDescription || typeof jobDescription !== "string") {
      res.status(400).json({ error: "jobDescription required" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const sse = (payload: object) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
        (res as any).flush?.();
      }
    };

    try {
      for await (const event of streamTailor(jobDescription, jobTitle)) {
        sse(event);
      }
    } catch (err) {
      console.error("[stream-tailor] Error:", err);
      sse({ type: "error", message: "Tailor failed" });
    }
    if (!res.writableEnded) res.end();
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError({ error, path }) {
        console.error(`[tRPC error] ${path}:`, error.message, error.cause);
      },
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
