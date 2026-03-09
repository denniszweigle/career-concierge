import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import {
  createOAuth2Client,
  getAuthUrl,
  getTokensFromCode,
  setCredentials,
  listFilesInFolder,
  downloadFile,
  extractFolderIdFromUrl,
} from "./googleDrive";
import { google } from 'googleapis';
import { ENV } from './_core/env';
import { getEngineConfig } from './_core/runtimeConfig';
import {
  saveDriveToken,
  getDriveToken,
  deleteDriveToken,
  upsertDocument,
  markDocumentIndexed,
  getDocuments,
  getDocumentByDriveFileId,
  deleteDocumentChunks,
  deleteDocument,
  setPrimaryResume,
  saveDocumentChunk,
  saveAnalysis,
  getAllAnalyses,
  getAnalysisById,
  saveChatMessage,
  getChatMessages,
  getSystemStats,
} from "./db";
import { extractText, chunkText } from "./documentExtractor";
import { generateEmbedding } from "./vectorEmbedding";
import { matchJobDescription, answerQuestion, clearChunkCache } from "./matchingEngine";
import { clearTailorPromptCache, readTailorPromptFile, writeTailorPromptFile } from "./tailorEngine";
import { syncStatus } from "./syncState";

const PORTFOLIO_FOLDER_URL = process.env.GOOGLE_DRIVE_FOLDER_URL || "https://drive.google.com/drive/folders/1WKYLMDQv5c-EKrXQ-qMlFA7ltpkUUxls";

export const appRouter = router({
  system: systemRouter,
  stats: router({
    getPublicStats: publicProcedure.query(async () => getSystemStats()),
  }),
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  drive: router({
    // Get Google Drive OAuth URL
    getAuthUrl: adminProcedure
      .input(z.object({ origin: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const oauth2Client = createOAuth2Client(input.origin);
        const state = JSON.stringify({ userId: ctx.user.id, origin: input.origin });
        const authUrl = getAuthUrl(oauth2Client, state);
        console.log('[Drive] Auth URL redirect_uri:', `${input.origin}/api/google-drive/callback`);
        return { authUrl };
      }),

    // Handle OAuth callback
    handleCallback: adminProcedure
      .input(z.object({ code: z.string(), origin: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const oauth2Client = createOAuth2Client(input.origin);
        const tokens = await getTokensFromCode(oauth2Client, input.code);

        if (!tokens.access_token) {
          throw new Error("Failed to get access token");
        }

        const expiresAt = new Date(Date.now() + (tokens.expiry_date || 3600 * 1000));

        await saveDriveToken({
          userId: ctx.user.id,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || null,
          expiresAt,
          scope: tokens.scope || "",
        });

        return { success: true };
      }),

    // Check connection status
    getConnectionStatus: adminProcedure.query(async ({ ctx }) => {
      const token = await getDriveToken(ctx.user.id);
      return {
        connected: !!token,
        expiresAt: token?.expiresAt,
      };
    }),

    // Disconnect Google Drive
    disconnect: adminProcedure.mutation(async ({ ctx }) => {
      await deleteDriveToken(ctx.user.id);
      return { success: true };
    }),

    // Sync documents from Google Drive
    syncDocuments: adminProcedure.mutation(async ({ ctx }) => {
      console.log('[syncDocuments] Starting sync for user:', ctx.user.id);
      const token = await getDriveToken(ctx.user.id);
      console.log('[syncDocuments] Token retrieved:', token ? 'yes' : 'no');
      if (!token) {
        throw new Error("Google Drive not connected");
      }

      const folderId = extractFolderIdFromUrl(PORTFOLIO_FOLDER_URL);
      if (!folderId) {
        throw new Error("Invalid folder URL");
      }

      const host = ctx.req.get('host');
      const isLocalhost = host?.startsWith('localhost') || host?.startsWith('127.0.0.1');
      const origin = isLocalhost ? `http://${host}` : `https://${host}`;
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_DRIVE_CLIENT_ID,
        process.env.GOOGLE_DRIVE_CLIENT_SECRET,
        `${origin}/api/google-drive/callback`
      );
      console.log('[syncDocuments] Using redirect URI:', `${origin}/api/google-drive/callback`);
      setCredentials(oauth2Client, token.accessToken, token.refreshToken || undefined);

      console.log('[syncDocuments] About to list files in folder:', folderId);
      let files;
      try {
        files = await listFilesInFolder(oauth2Client, folderId);
        console.log('[syncDocuments] Files retrieved:', files.length);
      } catch (error: any) {
        console.error('[syncDocuments] Error listing files:', error.message, error.code);
        console.error('[syncDocuments] Full error:', JSON.stringify(error, null, 2));
        if (error.response) {
          console.error('[syncDocuments] Error response:', JSON.stringify(error.response.data, null, 2));
        }
        throw error;
      }

      // Only attempt text extraction on these MIME types — skip images, video, Visio, etc.
      const EXTRACTABLE_MIME_TYPES = new Set([
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/plain',
        'text/csv',
        'text/markdown',
      ]);

      const extractableFiles = files.filter(f => EXTRACTABLE_MIME_TYPES.has(f.mimeType));
      console.log(`[syncDocuments] ${files.length} total files, ${extractableFiles.length} extractable (skipping ${files.length - extractableFiles.length} images/video/other)`);

      let processed = 0;
      let skipped = 0;
      let failed = 0;

      syncStatus.isRunning = true;
      syncStatus.processed = 0;
      syncStatus.skipped = 0;
      syncStatus.total = extractableFiles.length;
      syncStatus.currentFile = null;
      syncStatus.startedAt = new Date().toISOString();
      syncStatus.finishedAt = null;

      try {
        for (const file of extractableFiles) {
          try {
            syncStatus.currentFile = file.name;

            // Incremental sync: skip if file is unchanged
            const existing = await getDocumentByDriveFileId(file.id);
            const driveModified = new Date(file.modifiedTime ?? 0).getTime();
            const dbModified = existing?.modifiedTime?.getTime() ?? 0;

            if (existing?.isIndexed && driveModified === dbModified) {
              skipped++;
              syncStatus.skipped = skipped;
              console.log(`[syncDocuments] ~ skipped (unchanged): ${file.name}`);
              continue;
            }

            // File is new or changed — delete stale chunks before re-indexing
            if (existing) {
              await deleteDocumentChunks(existing.id);
              console.log(`[syncDocuments] Deleted stale chunks for ${file.name}`);
            }

            const fileType =
              file.mimeType.includes("pdf") ? "pdf" :
              file.mimeType.includes("wordprocessing") || file.mimeType === "application/msword" ? "docx" :
              file.mimeType.includes("presentationml") ? "pptx" :
              file.mimeType.includes("spreadsheetml") || file.mimeType === "application/vnd.ms-excel" ? "xlsx" :
              "txt";

            console.log(`[syncDocuments] Processing ${file.name} (${file.mimeType})`);
            const buffer = await downloadFile(oauth2Client, file.id);
            const extractedText = await extractText(buffer, file.mimeType);

            const documentId = await upsertDocument({
              driveFileId: file.id,
              fileName: file.name,
              fileType,
              filePath: `drive://${file.id}`,
              mimeType: file.mimeType,
              fileSize: file.size ? parseInt(file.size) : null,
              modifiedTime: new Date(file.modifiedTime),
              extractedText,
              isIndexed: false,
            });

            // Generate chunks and embeddings (use runtime config for chunk sizing)
            const { chunkSize, chunkOverlap } = getEngineConfig();
            const chunks = chunkText(extractedText, chunkSize, chunkOverlap);
            for (let i = 0; i < chunks.length; i++) {
              const embedding = await generateEmbedding(chunks[i]!);
              await saveDocumentChunk({
                documentId,
                chunkIndex: i,
                content: chunks[i]!,
                embedding,
              });
            }
            await markDocumentIndexed(documentId);

            processed++;
            syncStatus.processed = processed;
            console.log(`[syncDocuments] ✓ ${processed}/${extractableFiles.length} — ${file.name} (${chunks.length} chunks)`);
          } catch (error) {
            console.error(`Failed to process file ${file.name}:`, error);
            failed++;
          }
        }
      } finally {
        syncStatus.isRunning = false;
        syncStatus.currentFile = null;
        syncStatus.finishedAt = new Date().toISOString();
        clearChunkCache();
      }

      return {
        total: files.length,
        processed,
        skipped,
        failed,
      };
    }),

    // Get indexed documents
    getDocuments: adminProcedure.query(async () => {
      return getDocuments();
    }),

    // Get current sync progress
    getSyncStatus: adminProcedure.query(() => {
      return syncStatus;
    }),

    // Delete one or more documents
    deleteDocuments: adminProcedure
      .input(z.object({ ids: z.array(z.number()).min(1) }))
      .mutation(async ({ input }) => {
        for (const id of input.ids) await deleteDocument(id);
        return { deleted: input.ids.length };
      }),

    // Mark a document as the primary resume
    setPrimaryResume: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await setPrimaryResume(input.id);
        return { success: true };
      }),

    // Get the current tailor system prompt file content
    getTailorPrompt: adminProcedure.query(() => {
      return { content: readTailorPromptFile() };
    }),

    // Save edited prompt content to file and clear cache
    saveTailorPrompt: adminProcedure
      .input(z.object({ content: z.string().min(1) }))
      .mutation(({ input }) => {
        writeTailorPromptFile(input.content);
        return { success: true };
      }),

    // Reload the tailor system prompt from data/tailor-prompt.md
    refreshTailorPrompt: adminProcedure.mutation(() => {
      clearTailorPromptCache();
      return { success: true };
    }),
  }),

  analysis: router({
    // Create new analysis
    create: publicProcedure
      .input(
        z.object({
          jobTitle: z.string().optional(),
          jobDescription: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const result = await matchJobDescription(input.jobDescription, input.jobTitle);

        const analysisId = await saveAnalysis({
          userId: ctx.user?.id ?? null,
          jobTitle: input.jobTitle || null,
          jobDescription: input.jobDescription,
          matchScore: result.matchScore,
          mismatchScore: result.mismatchScore,
          hardSkillsScore: result.hardSkillsScore,
          experienceScore: result.experienceScore,
          domainScore: result.domainScore,
          softSkillsScore: result.softSkillsScore,
          topStrengths: result.topStrengths,
          topGaps: result.topGaps,
          detailedReport: result.detailedReport,
          tokensInput: result.tokensInput,
          tokensOutput: result.tokensOutput,
        });

        return {
          analysisId,
          ...result,
        };
      }),

    // Get all analyses (admin only)
    list: adminProcedure.query(async () => {
      return getAllAnalyses();
    }),

    // Get all analyses for public reporting (no auth required)
    getPublicReport: publicProcedure.query(async () => {
      return getAllAnalyses();
    }),

    // Get specific analysis
    get: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      return getAnalysisById(input.id);
    }),

    // Ask question about analysis
    askQuestion: publicProcedure
      .input(
        z.object({
          analysisId: z.number(),
          question: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        const messages = await getChatMessages(input.analysisId);
        const history = messages.map(m => ({
          role: m.role,
          content: m.content,
        }));

        const { answer, sources, tokensInput, tokensOutput } = await answerQuestion(input.question, history);

        await saveChatMessage({
          analysisId: input.analysisId,
          role: "user",
          content: input.question,
        });

        await saveChatMessage({
          analysisId: input.analysisId,
          role: "assistant",
          content: answer,
          tokensInput,
          tokensOutput,
        });

        return { answer, sources };
      }),

    // Get chat history
    getChatHistory: publicProcedure
      .input(z.object({ analysisId: z.number() }))
      .query(async ({ input }) => {
        return getChatMessages(input.analysisId);
      }),

    // General portfolio Q&A — no JD required, history managed client-side
    chatGeneral: publicProcedure
      .input(
        z.object({
          question: z.string(),
          history: z.array(
            z.object({ role: z.enum(["user", "assistant"]), content: z.string() })
          ),
        })
      )
      .mutation(async ({ input }) => {
        const { answer, sources } = await answerQuestion(input.question, input.history);
        return { answer, sources };
      }),
  }),
});

export type AppRouter = typeof appRouter;
