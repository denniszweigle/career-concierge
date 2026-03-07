import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { llm } from "./_core/llm";
import { generateEmbedding, cosineSimilarity } from "./vectorEmbedding";
import { loadChunkCache } from "./matchingEngine";
import { getPrimaryResume } from "./db";

// ---------------------------------------------------------------------------
// System prompt — loaded from data/tailor-prompt.md and cached in memory.
// Edit that file, then click "Refresh Tailor Prompt" in Admin to reload.
// ---------------------------------------------------------------------------
const PROMPT_PATH = join(process.cwd(), "data", "tailor-prompt.md");
let cachedSystemPrompt: string | null = null;

function loadTailorPrompt(): string {
  if (cachedSystemPrompt) return cachedSystemPrompt;
  try {
    cachedSystemPrompt = readFileSync(PROMPT_PATH, "utf-8").trim();
    console.log(`[tailor] system prompt loaded from ${PROMPT_PATH} (${cachedSystemPrompt.length} chars)`);
  } catch (err) {
    console.error(`[tailor] failed to load prompt file at ${PROMPT_PATH} — using fallback`, err);
    cachedSystemPrompt = "You are an expert Technical Career Strategist. Rewrite the resume and cover letter to match the job description. Output ### CUSTOM_RESUME then ### CUSTOM_COVER_LETTER.";
  }
  return cachedSystemPrompt;
}

export function clearTailorPromptCache(): void {
  cachedSystemPrompt = null;
  console.log("[tailor] system prompt cache cleared — will reload from file on next request");
}

export function readTailorPromptFile(): string {
  return readFileSync(PROMPT_PATH, "utf-8");
}

export function writeTailorPromptFile(content: string): void {
  writeFileSync(PROMPT_PATH, content, "utf-8");
  cachedSystemPrompt = null;
  console.log("[tailor] system prompt file updated and cache cleared");
}

// JD-aligned chunks: topical relevance to the specific role
const TAILOR_TOP_K_JD = 20;
// Career overview chunks: always-on facts regardless of JD topic
const TAILOR_TOP_K_OVERVIEW = 10;

// Fixed query that reliably surfaces current role, metrics, certifications, years of experience
const OVERVIEW_QUERY =
  "career summary current role title company experience achievements certifications credentials education";

function extractUsage(response: { usage_metadata?: any; response_metadata?: any }): {
  input: number;
  output: number;
} {
  if (response.usage_metadata) {
    return {
      input: response.usage_metadata.input_tokens ?? 0,
      output: response.usage_metadata.output_tokens ?? 0,
    };
  }
  const u = response.response_metadata?.tokenUsage;
  return { input: u?.promptTokens ?? 0, output: u?.completionTokens ?? 0 };
}


export type TailorEvent =
  | { type: "status"; message: string }
  | { type: "chunk"; text: string }
  | { type: "done"; tokensInput: number; tokensOutput: number };

export async function* streamTailor(
  jobDescription: string,
  jobTitle?: string
): AsyncGenerator<TailorEvent> {
  const t0 = Date.now();
  console.log(`[tailor] starting for job: "${(jobTitle ?? "unknown").substring(0, 60)}"`);

  yield { type: "status", message: "Analyzing job requirements..." };

  // Embed JD and career-overview query in parallel
  const queryText = jobTitle ? `${jobTitle}: ${jobDescription}` : jobDescription;
  const [jdEmbedding, overviewEmbedding] = await Promise.all([
    generateEmbedding(queryText),
    generateEmbedding(OVERVIEW_QUERY),
  ]);
  console.log(`[tailor] embeddings done ${Date.now() - t0}ms`);

  yield { type: "status", message: "Retrieving portfolio highlights..." };

  const allChunks = await loadChunkCache();
  console.log(`[tailor] chunk cache ready ${Date.now() - t0}ms (${allChunks.length} chunks)`);

  const validChunks = allChunks.filter(c => c.embedding && Array.isArray(c.embedding));

  const primaryResume = await getPrimaryResume();
  const resumeChunks = primaryResume
    ? validChunks.filter(c => c.documentId === primaryResume.id)
    : validChunks;

  if (!primaryResume) {
    console.warn("[tailor] No primary resume set — searching all documents");
  }
  console.log(`[tailor] using ${resumeChunks.length} chunks from ${primaryResume ? `"${primaryResume.fileName}"` : "all docs"}`);

  // JD-aligned retrieval
  const jdChunks = resumeChunks
    .map(c => ({ content: c.content, similarity: cosineSimilarity(jdEmbedding, c.embedding as number[]) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, TAILOR_TOP_K_JD);

  // Career overview retrieval — deduplicate against JD chunks
  const jdContentSet = new Set(jdChunks.map(c => c.content));
  const overviewChunks = resumeChunks
    .map(c => ({ content: c.content, similarity: cosineSimilarity(overviewEmbedding, c.embedding as number[]) }))
    .sort((a, b) => b.similarity - a.similarity)
    .filter(c => !jdContentSet.has(c.content))
    .slice(0, TAILOR_TOP_K_OVERVIEW);

  console.log(
    `[tailor] JD chunks=${jdChunks.length} top-sim=${((jdChunks[0]?.similarity ?? 0) * 100).toFixed(1)}%`,
    `overview chunks=${overviewChunks.length}`
  );

  // Full resume text in document order — used as the structural template
  const resumeTemplate = resumeChunks.map(c => c.content).join("\n\n");

  const overviewContext = overviewChunks
    .map((c, i) => `[Overview ${i + 1}]\n${c.content}`)
    .join("\n\n");

  const jdContext = jdChunks
    .map((c, i) => `[Job-Relevant ${i + 1}]\n${c.content}`)
    .join("\n\n");

  yield { type: "status", message: "Generating tailored resume & cover letter..." };

  const templateSection = primaryResume
    ? `## Primary Resume (Structural Template)\n${resumeTemplate}\n\n---\n\n`
    : "";

  const messages = [
    new SystemMessage(loadTailorPrompt()),
    new HumanMessage(
      `${templateSection}## Career Overview Passages\n${overviewContext}\n\n## Job-Relevant Passages\n${jdContext}\n\n---\nJob Title: ${jobTitle ?? "Not specified"}\n\nJob Description:\n${jobDescription}`
    ),
  ];

  const firstChunkController = new AbortController();
  const firstChunkTimer = setTimeout(() => firstChunkController.abort(), 30_000);

  let tokensIn = 0;
  let tokensOut = 0;
  let lastChunk: any = null;
  let gotFirstChunk = false;

  try {
    const stream = await llm.stream(messages, { signal: firstChunkController.signal });
    for await (const chunk of stream) {
      if (!gotFirstChunk) {
        clearTimeout(firstChunkTimer);
        gotFirstChunk = true;
        console.log(`[tailor] first token at ${Date.now() - t0}ms`);
      }
      lastChunk = chunk;
      const text = typeof chunk.content === "string" ? chunk.content : "";
      if (text) yield { type: "chunk", text };
    }
  } catch (err: any) {
    clearTimeout(firstChunkTimer);
    if (firstChunkController.signal.aborted) {
      throw new Error("LLM did not respond within 30 seconds — please try again");
    }
    throw err;
  } finally {
    clearTimeout(firstChunkTimer);
  }

  console.log(`[tailor] stream complete at ${Date.now() - t0}ms`);

  if (lastChunk) {
    const usage = extractUsage(lastChunk);
    tokensIn = usage.input;
    tokensOut = usage.output;
  }

  yield { type: "done", tokensInput: tokensIn, tokensOutput: tokensOut };
}
