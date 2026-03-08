import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { llm } from "./_core/llm";
import { generateEmbedding, cosineSimilarity } from "./vectorEmbedding";
import { loadChunkCache, extractJobRequirements } from "./matchingEngine";
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

// ---------------------------------------------------------------------------
// Retrieval constants
// ---------------------------------------------------------------------------

// Portfolio chunks per individual JD requirement (all 392 docs, not resume-only)
const PORTFOLIO_TOP_K_PER_REQ = 3;
// Max deduplicated chunks shown per requirement category in the prompt
const PORTFOLIO_MAX_PER_CATEGORY = 10;
// Catch-all JD similarity chunks from the resume (structural context)
const TAILOR_TOP_K_JD = 12;
// Always-on career overview chunks from the resume
const TAILOR_TOP_K_OVERVIEW = 8;

// Fixed query that reliably surfaces current role, metrics, certifications, years of experience
const OVERVIEW_QUERY =
  "career summary current role title company experience achievements certifications credentials education";

// ---------------------------------------------------------------------------
// Portfolio evidence search — full 392-doc corpus, full chunk content
// ---------------------------------------------------------------------------

type ChunkItem = Awaited<ReturnType<typeof loadChunkCache>>[number];

/**
 * For each requirement string, finds the top-K most similar chunks
 * from the provided corpus (typically all portfolio chunks).
 * Returns full chunk content — not truncated — so the LLM has real evidence.
 */
async function findPortfolioEvidence(
  requirements: string[],
  corpus: ChunkItem[]
): Promise<{ requirement: string; chunks: string[] }[]> {
  if (requirements.length === 0) return [];

  const reqEmbeddings = await Promise.all(requirements.map(r => generateEmbedding(r)));

  return requirements.map((requirement, ri) => {
    const emb = reqEmbeddings[ri]!;
    const top = corpus
      .map(c => ({ content: c.content, sim: cosineSimilarity(emb, c.embedding as number[]) }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, PORTFOLIO_TOP_K_PER_REQ)
      .map(c => c.content);
    return { requirement, chunks: top };
  });
}

/**
 * Formats a requirement category with its portfolio evidence into the
 * structured prompt section the LLM uses for requirement-by-requirement bridging.
 */
function formatCategoryEvidence(
  label: string,
  items: { requirement: string; chunks: string[] }[]
): string {
  const seen = new Set<string>();
  const lines: string[] = [`### ${label}`];
  let totalChunks = 0;

  for (const item of items) {
    lines.push(`\n- **Required:** ${item.requirement}`);
    let matched = 0;
    for (const chunk of item.chunks) {
      if (!seen.has(chunk) && totalChunks < PORTFOLIO_MAX_PER_CATEGORY) {
        seen.add(chunk);
        totalChunks++;
        matched++;
        lines.push(`  > ${chunk.substring(0, 700)}`);
      }
    }
    if (matched === 0) {
      lines.push(`  *(no strong portfolio match — apply BRIDGE STRATEGY or OMIT)*`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------

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

  // ── Stage 1: Extract structured JD requirements ──────────────────────────
  yield { type: "status", message: "Extracting job requirements..." };
  const requirements = await extractJobRequirements(jobDescription);
  console.log(
    `[tailor] requirements extracted ${Date.now() - t0}ms`,
    `hardSkills=${requirements.hardSkills.length}`,
    `experience=${requirements.experienceRequirements.length}`,
    `domain=${requirements.domainKnowledge.length}`,
    `softSkills=${requirements.softSkills.length}`
  );

  // ── Stage 2: Load chunk cache + primary resume ────────────────────────────
  yield { type: "status", message: "Loading portfolio..." };
  const allChunks = await loadChunkCache();
  const validChunks = allChunks.filter(c => c.embedding && Array.isArray(c.embedding));
  console.log(`[tailor] chunk cache ready ${Date.now() - t0}ms (${validChunks.length} valid chunks)`);

  const primaryResume = await getPrimaryResume();
  const resumeChunks = primaryResume
    ? validChunks.filter(c => c.documentId === primaryResume.id)
    : validChunks;

  if (!primaryResume) {
    console.warn("[tailor] No primary resume set — using all chunks for resume template");
  }
  console.log(`[tailor] resume template: ${resumeChunks.length} chunks from "${primaryResume?.fileName ?? "all docs"}"`);

  // ── Stage 3: Portfolio evidence per requirement category (all 392 docs) ───
  yield { type: "status", message: "Searching portfolio for evidence..." };

  const queryText = jobTitle ? `${jobTitle}: ${jobDescription}` : jobDescription;
  const [
    jdEmbedding,
    overviewEmbedding,
    hardSkillsEvidence,
    experienceEvidence,
    domainEvidence,
    softSkillsEvidence,
  ] = await Promise.all([
    generateEmbedding(queryText),
    generateEmbedding(OVERVIEW_QUERY),
    findPortfolioEvidence(requirements.hardSkills, validChunks),
    findPortfolioEvidence(requirements.experienceRequirements, validChunks),
    findPortfolioEvidence(requirements.domainKnowledge, validChunks),
    findPortfolioEvidence(requirements.softSkills, validChunks),
  ]);
  console.log(`[tailor] portfolio evidence ready ${Date.now() - t0}ms`);

  // ── Stage 4: Resume catch-all (JD relevance + career overview) ───────────
  const jdChunks = resumeChunks
    .map(c => ({ content: c.content, similarity: cosineSimilarity(jdEmbedding, c.embedding as number[]) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, TAILOR_TOP_K_JD);

  const jdContentSet = new Set(jdChunks.map(c => c.content));
  const overviewChunks = resumeChunks
    .map(c => ({ content: c.content, similarity: cosineSimilarity(overviewEmbedding, c.embedding as number[]) }))
    .sort((a, b) => b.similarity - a.similarity)
    .filter(c => !jdContentSet.has(c.content))
    .slice(0, TAILOR_TOP_K_OVERVIEW);

  console.log(
    `[tailor] resume catch-all: JD chunks=${jdChunks.length} top-sim=${((jdChunks[0]?.similarity ?? 0) * 100).toFixed(1)}%`,
    `overview chunks=${overviewChunks.length}`
  );

  // ── Assemble prompt ───────────────────────────────────────────────────────
  yield { type: "status", message: "Generating tailored resume & cover letter..." };

  const resumeTemplate = resumeChunks.map(c => c.content).join("\n\n");

  const structuredEvidence = [
    formatCategoryEvidence("Hard Skills Required", hardSkillsEvidence),
    formatCategoryEvidence("Experience Requirements", experienceEvidence),
    formatCategoryEvidence("Domain Knowledge Required", domainEvidence),
    formatCategoryEvidence("Soft Skills & Leadership", softSkillsEvidence),
  ].join("\n\n");

  const catchAllSection =
    [...jdChunks.map((c, i) => `[Resume Context ${i + 1}]\n${c.content}`),
     ...overviewChunks.map((c, i) => `[Career Overview ${i + 1}]\n${c.content}`)].join("\n\n");

  const templateSection = primaryResume
    ? `## Primary Resume (Structural Template)\n${resumeTemplate}\n\n---\n\n`
    : "";

  const messages = [
    new SystemMessage(loadTailorPrompt()),
    new HumanMessage(
      `${templateSection}` +
      `## JD Requirements & Portfolio Evidence\n` +
      `Use the evidence passages below to fulfill each requirement. For each requirement, bridge or omit per the BRIDGE STRATEGY instructions.\n\n` +
      `${structuredEvidence}\n\n---\n\n` +
      `## Additional Resume Context\n${catchAllSection}\n\n---\n` +
      `Job Title: ${jobTitle ?? "Not specified"}\n\nJob Description:\n${jobDescription}`
    ),
  ];

  // ── Stream LLM output ─────────────────────────────────────────────────────
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
