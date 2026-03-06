import { z } from "zod";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { llm } from "./_core/llm";
import { ENV } from "./_core/env";
import { generateEmbedding, cosineSimilarity } from "./vectorEmbedding";
import { getChunksBatchWithDocuments } from "./db";

const CHUNK_BATCH_SIZE = 5_000;

// Extracts token counts from a LangChain AIMessage response (handles both
// the newer usage_metadata API and the OpenAI response_metadata fallback).
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

export type AnswerSource = {
  documentId: number;
  fileName: string;
  driveFileId: string;
  fileType: string;
  similarity: number;
};

// ---------------------------------------------------------------------------
// Grounding directive injected into every system prompt.
// ---------------------------------------------------------------------------
const GROUNDING_DIRECTIVE = `
CRITICAL CONSTRAINTS — you MUST follow these without exception:
- Base every statement EXCLUSIVELY on the context or data provided in this conversation.
- Do NOT draw on your training knowledge about this individual, their employer history, or any external websites.
- Do NOT invent, extrapolate, or assume facts that are not explicitly present in the provided text.
- If the provided context does not contain sufficient information to answer something, say so clearly and stop — do not fill in gaps with guesses.
`.trim();

// ---------------------------------------------------------------------------
// In-memory chunk cache — populated on first request, cleared after sync
// ---------------------------------------------------------------------------
type CachedChunk = Awaited<ReturnType<typeof getChunksBatchWithDocuments>>[number];

let chunkCache: CachedChunk[] | null = null;

export function clearChunkCache(): void {
  chunkCache = null;
  console.log("[RAG] Chunk cache cleared");
}

async function loadChunkCache(): Promise<CachedChunk[]> {
  if (chunkCache) return chunkCache;

  const chunks: CachedChunk[] = [];
  let offset = 0;
  while (true) {
    const batch = await getChunksBatchWithDocuments(offset, CHUNK_BATCH_SIZE);
    if (batch.length === 0) break;
    chunks.push(...batch);
    if (batch.length < CHUNK_BATCH_SIZE) break;
    offset += CHUNK_BATCH_SIZE;
  }

  chunkCache = chunks;
  console.log(`[RAG] Chunk cache populated: ${chunks.length} chunks`);
  return chunks;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const rerankSchema = z.object({
  selectedIds: z
    .array(z.number().int().min(1))
    .describe("1-based passage IDs ordered from most to least relevant"),
});

const jobRequirementsSchema = z.object({
  hardSkills: z.array(z.string()).describe("Technical skills, tools, languages, methodologies"),
  experienceRequirements: z.array(z.string()).describe("Years of experience, seniority level, specific role experience"),
  domainKnowledge: z.array(z.string()).describe("Industry knowledge, domain expertise, business understanding"),
  softSkills: z.array(z.string()).describe("Communication, leadership, collaboration, cultural fit indicators"),
});

type JobRequirements = z.infer<typeof jobRequirementsSchema>;
type EvidenceItem = { requirement: string; evidence: string[]; score: number };

// ---------------------------------------------------------------------------
// Requirement extraction — Chain of Density over the job description text only
// ---------------------------------------------------------------------------
export async function extractJobRequirements(jobDescription: string): Promise<
  JobRequirements & { allRequirements: string[] }
> {
  const structured = llm.withStructuredOutput(jobRequirementsSchema);

  const result = await structured.invoke([
    new SystemMessage(
      `You are a meticulous job requirement analyzer. Your task is to extract requirements from the job description text provided by the user — nothing else.

Use the Chain of Density technique across four passes:
1. First pass: Extract obvious, explicitly stated requirements
2. Second pass: Find implicit requirements and stated preferences
3. Third pass: Identify subtle requirements that candidates often overlook
4. Fourth pass: Detect requirements hidden in company culture or role framing

${GROUNDING_DIRECTIVE}`
    ),
    new HumanMessage(
      `Extract ALL requirements from this job description across four passes:\n\n${jobDescription}`
    ),
  ]);

  return {
    ...result,
    allRequirements: [
      ...result.hardSkills,
      ...result.experienceRequirements,
      ...result.domainKnowledge,
      ...result.softSkills,
    ],
  };
}

// ---------------------------------------------------------------------------
// Main matching pipeline
// ---------------------------------------------------------------------------
export async function matchJobDescription(
  jobDescription: string,
  jobTitle?: string
): Promise<{
  matchScore: number;
  mismatchScore: number;
  hardSkillsScore: number;
  experienceScore: number;
  domainScore: number;
  softSkillsScore: number;
  topStrengths: string[];
  topGaps: string[];
  detailedReport: string;
  tokensInput: number;
  tokensOutput: number;
}> {
  const requirements = await extractJobRequirements(jobDescription);

  const allRequirements = [
    ...requirements.hardSkills,
    ...requirements.experienceRequirements,
    ...requirements.domainKnowledge,
    ...requirements.softSkills,
  ];

  const allEvidence = await findEvidenceForRequirements(allRequirements);

  const hardSkillsEvidence  = allEvidence.slice(0, requirements.hardSkills.length);
  const experienceEvidence  = allEvidence.slice(requirements.hardSkills.length, requirements.hardSkills.length + requirements.experienceRequirements.length);
  const domainEvidence      = allEvidence.slice(requirements.hardSkills.length + requirements.experienceRequirements.length, requirements.hardSkills.length + requirements.experienceRequirements.length + requirements.domainKnowledge.length);
  const softSkillsEvidence  = allEvidence.slice(requirements.hardSkills.length + requirements.experienceRequirements.length + requirements.domainKnowledge.length);

  const hardSkillsScore = calculateCategoryScore(hardSkillsEvidence);
  const experienceScore = calculateCategoryScore(experienceEvidence);
  const domainScore = calculateCategoryScore(domainEvidence);
  const softSkillsScore = calculateCategoryScore(softSkillsEvidence);

  // Weighted: Hard Skills 40%, Experience 30%, Domain 20%, Soft Skills 10%
  const matchScore =
    hardSkillsScore * 0.4 +
    experienceScore * 0.3 +
    domainScore * 0.2 +
    softSkillsScore * 0.1;

  const analysis = await generateDetailedAnalysis(
    jobTitle,
    { hardSkills: hardSkillsEvidence, experience: experienceEvidence, domain: domainEvidence, softSkills: softSkillsEvidence },
    { matchScore, hardSkillsScore, experienceScore, domainScore, softSkillsScore }
  );

  return {
    matchScore: Math.round(matchScore * 10) / 10,
    mismatchScore: Math.round((100 - matchScore) * 10) / 10,
    hardSkillsScore: Math.round(hardSkillsScore * 10) / 10,
    experienceScore: Math.round(experienceScore * 10) / 10,
    domainScore: Math.round(domainScore * 10) / 10,
    softSkillsScore: Math.round(softSkillsScore * 10) / 10,
    topStrengths: analysis.topStrengths,
    topGaps: analysis.topGaps,
    detailedReport: analysis.report,
    tokensInput: analysis.tokensInput,
    tokensOutput: analysis.tokensOutput,
  };
}

// ---------------------------------------------------------------------------
// RAG helpers — uses in-memory chunk cache for performance
// ---------------------------------------------------------------------------

/**
 * For each requirement string, finds the top-K most similar chunks
 * using the in-memory chunk cache.
 */
async function findEvidenceForRequirements(
  requirements: string[]
): Promise<EvidenceItem[]> {
  if (requirements.length === 0) return [];

  const topK = ENV.ragTopKEvidence;
  // Embed all requirements up front in parallel
  const reqEmbeddings = await Promise.all(requirements.map(r => generateEmbedding(r)));

  const allChunks = await loadChunkCache();

  type Candidate = { content: string; similarity: number };
  const candidates: Candidate[][] = requirements.map(() => []);

  for (const chunk of allChunks) {
    if (!chunk.embedding || !Array.isArray(chunk.embedding)) continue;
    const emb = chunk.embedding as number[];
    for (let ri = 0; ri < reqEmbeddings.length; ri++) {
      const sim = cosineSimilarity(reqEmbeddings[ri]!, emb);
      candidates[ri]!.push({ content: chunk.content, similarity: sim });
    }
  }

  return requirements.map((requirement, ri) => {
    const top = (candidates[ri] ?? [])
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
    const avgSimilarity = top.reduce((sum, m) => sum + m.similarity, 0) / (top.length || 1);
    return {
      requirement,
      evidence: top.map(m => m.content.substring(0, 200)),
      score: avgSimilarity * 100,
    };
  });
}

function calculateCategoryScore(evidence: EvidenceItem[]): number {
  if (evidence.length === 0) return 0;
  return evidence.reduce((sum, e) => sum + e.score, 0) / evidence.length;
}

// ---------------------------------------------------------------------------
// Report generation — grounded only in computed scores and retrieved evidence
// ---------------------------------------------------------------------------
async function generateDetailedAnalysis(
  jobTitle: string | undefined,
  evidence: {
    hardSkills: EvidenceItem[];
    experience: EvidenceItem[];
    domain: EvidenceItem[];
    softSkills: EvidenceItem[];
  },
  scores: {
    matchScore: number;
    hardSkillsScore: number;
    experienceScore: number;
    domainScore: number;
    softSkillsScore: number;
  }
): Promise<{ topStrengths: string[]; topGaps: string[]; report: string; tokensInput: number; tokensOutput: number }> {
  const threshold = ENV.ragStrengthThreshold;

  const allEvidence = [
    ...evidence.hardSkills.map(e => ({ ...e, category: "Hard Skills" })),
    ...evidence.experience.map(e => ({ ...e, category: "Experience" })),
    ...evidence.domain.map(e => ({ ...e, category: "Domain Knowledge" })),
    ...evidence.softSkills.map(e => ({ ...e, category: "Soft Skills" })),
  ].sort((a, b) => b.score - a.score);

  const topStrengths = allEvidence
    .filter(e => e.score >= threshold)
    .slice(0, 3)
    .map(e => `${e.category}: ${e.requirement}`);

  const topGaps = allEvidence
    .filter(e => e.score < threshold)
    .slice(0, 3)
    .map(e => `${e.category}: ${e.requirement}`);

  // Build an evidence summary — send top 3 passages per item for richer context
  const evidenceSummary = allEvidence
    .slice(0, 10)
    .map(e => `[${e.category} | score ${e.score.toFixed(0)}%] ${e.requirement}\n  Evidence: ${e.evidence.slice(0, 3).join("\n---\n") || "none"}`)
    .join("\n\n");

  const response = await llm.invoke([
    new SystemMessage(
      `You are a High-Precision Executive Recruiter writing a Match vs. Mismatch report for Dennis "DZ" Zweigle.

${GROUNDING_DIRECTIVE}

Your report MUST be based solely on:
1. The numeric scores provided
2. The retrieved evidence passages provided
3. The requirement labels listed

Do not reference anything about this individual that is not explicitly present in the evidence passages below.`
    ),
    new HumanMessage(
      `Write a professional Match vs. Mismatch report using ONLY the data below.

Job Title: ${jobTitle ?? "Not specified"}
Overall Match Score: ${scores.matchScore.toFixed(1)}%  |  Mismatch: ${(100 - scores.matchScore).toFixed(1)}%

Category Scores:
- Hard Skills (40% weight): ${scores.hardSkillsScore.toFixed(1)}%
- Experience (30% weight): ${scores.experienceScore.toFixed(1)}%
- Domain Knowledge (20% weight): ${scores.domainScore.toFixed(1)}%
- Soft Skills (10% weight): ${scores.softSkillsScore.toFixed(1)}%

Top Strengths (score ≥ ${threshold}%):
${topStrengths.map((s, i) => `${i + 1}. ${s}`).join("\n") || "None above threshold"}

Top Gaps (score < ${threshold}%):
${topGaps.map((g, i) => `${i + 1}. ${g}`).join("\n") || "None below threshold"}

Retrieved Evidence (cite these passages directly — do not add external information):
${evidenceSummary}

Report structure:
1. Overall alignment summary (2-3 sentences, numbers only from above)
2. Top 3 strengths — cite the specific evidence passage for each
3. Top 3 gaps — explain why each matters for this role
4. Honest closing assessment`
    ),
  ]);

  const report =
    typeof response.content === "string" ? response.content : "Analysis report unavailable";

  const usage = extractUsage(response);
  return { topStrengths, topGaps, report, tokensInput: usage.input, tokensOutput: usage.output };
}

// ---------------------------------------------------------------------------
// Stage 2 — LLM re-ranker
// ---------------------------------------------------------------------------
const RERANK_TIMEOUT_MS = 12_000;

async function rerankChunks<T extends { content: string; fileName: string }>(
  question: string,
  candidates: T[],
  topN: number
): Promise<T[]> {
  if (candidates.length <= topN) return candidates;

  const numbered = candidates
    .map((c, i) => `[${i + 1}] (${c.fileName}): ${c.content.substring(0, 150)}`)
    .join("\n\n");

  const structured = llm.withStructuredOutput(rerankSchema);
  const timeoutPromise = new Promise<null>(resolve =>
    setTimeout(() => resolve(null), RERANK_TIMEOUT_MS)
  );

  try {
    const result = await Promise.race([
      structured.invoke([
        new SystemMessage(
          `You are a relevance judge for a career portfolio Q&A system. ` +
          `Select the ${topN} passage IDs most directly useful for answering the question. ` +
          `Prefer passages with specific facts, dollar amounts, percentages, named projects, ` +
          `technologies, and measurable achievements. Return IDs ordered most to least relevant.`
        ),
        new HumanMessage(
          `Question: "${question}"\n\nPassages:\n${numbered}\n\nReturn the ${topN} most relevant passage IDs.`
        ),
      ]),
      timeoutPromise,
    ]);

    if (!result) {
      console.log("[RAG] Re-ranker timed out, falling back to embedding order");
      return candidates.slice(0, topN);
    }

    const selected = result.selectedIds
      .filter((id) => id >= 1 && id <= candidates.length)
      .map((id) => candidates[id - 1]!)
      .slice(0, topN);

    // Pad with embedding-ranked remainder if LLM returned too few IDs
    if (selected.length < topN) {
      const usedIds = new Set(result.selectedIds);
      const remainder = candidates.filter((_, i) => !usedIds.has(i + 1));
      return [...selected, ...remainder].slice(0, topN);
    }
    return selected;
  } catch {
    // Structured output failed — fall back to embedding-ranked order
    return candidates.slice(0, topN);
  }
}

// ---------------------------------------------------------------------------
// HyDE — Hypothetical Document Embedding
// ---------------------------------------------------------------------------
async function generateHypotheticalPassage(question: string): Promise<{ passage: string; tokensInput: number; tokensOutput: number }> {
  const response = await llm.invoke([
    new SystemMessage(
      `You are a career document summarizer. Given a question about a person named Dennis "DZ" Zweigle, write a single dense paragraph (3-5 sentences) that would hypothetically appear in his portfolio documents and answer the question. Use specific facts, numbers, technologies, and domain vocabulary. Never say "I don't know" — always generate a plausible passage grounded in career language.`
    ),
    new HumanMessage(question),
  ]);
  const usage = extractUsage(response);
  const passage =
    typeof response.content === "string" && response.content.length > 20
      ? response.content
      : question;
  return { passage, tokensInput: usage.input, tokensOutput: usage.output };
}

// ---------------------------------------------------------------------------
// Shared retrieval helper used by both answerQuestion and streamAnswer
// ---------------------------------------------------------------------------
type RetrievalCandidate = {
  content: string;
  similarity: number;
  documentId: number;
  fileName: string;
  driveFileId: string;
  fileType: string;
};

async function retrievePassages(
  question: string,
  queryEmbedding: number[]
): Promise<{ relevantChunks: RetrievalCandidate[]; sources: AnswerSource[] }> {
  const listKeywords = /\b(all|every|list|enumerate|how many|count)\b/i;
  const isListQuery = listKeywords.test(question);
  const topK = isListQuery ? ENV.ragTopKQA * 4 : ENV.ragTopKQA;
  const stage1K = isListQuery ? ENV.ragTopKStage1 * 3 : ENV.ragTopKStage1;

  const allChunks = await loadChunkCache();
  const candidates: RetrievalCandidate[] = [];

  for (const c of allChunks) {
    if (!c.embedding || !Array.isArray(c.embedding)) continue;
    candidates.push({
      content: c.content,
      similarity: cosineSimilarity(queryEmbedding, c.embedding as number[]),
      documentId: c.documentId,
      fileName: c.fileName,
      driveFileId: c.driveFileId,
      fileType: c.fileType,
    });
  }

  // Stage 1: top-N by embedding similarity
  const stage1 = candidates
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, stage1K);

  console.log(`[RAG] Stage 1: ${stage1.length} candidates (listQuery=${isListQuery}), best sim=${((stage1[0]?.similarity ?? 0) * 100).toFixed(1)}%`);

  // Stage 2: LLM re-ranker
  const relevantChunks = await rerankChunks(question, stage1, topK);

  console.log(`[RAG] Stage 2: ${relevantChunks.length} passages selected`);
  relevantChunks.forEach((c, i) =>
    console.log(`[RAG] #${i + 1} file=${c.fileName} | ${c.content.substring(0, 100)}`)
  );

  // Deduplicate sources by documentId, keeping highest similarity per doc
  const sourceMap = new Map<number, AnswerSource>();
  for (const chunk of relevantChunks) {
    const existing = sourceMap.get(chunk.documentId);
    if (!existing || chunk.similarity > existing.similarity) {
      sourceMap.set(chunk.documentId, {
        documentId: chunk.documentId,
        fileName: chunk.fileName,
        driveFileId: chunk.driveFileId,
        fileType: chunk.fileType,
        similarity: Math.round(chunk.similarity * 100),
      });
    }
  }
  const sources = Array.from(sourceMap.values()).sort((a, b) => b.similarity - a.similarity);

  return { relevantChunks, sources };
}

const QA_SYSTEM_PROMPT = `You are a knowledgeable assistant answering questions about Dennis "DZ" Zweigle's career, based on his indexed portfolio documents.

${GROUNDING_DIRECTIVE}

Use the retrieved passages as your primary source. When a passage describes a market opportunity, technology, or initiative that Dennis has created or is driving, treat that as evidence of his business impact and explain it clearly. Only use the phrase "The portfolio documents do not contain information about that" if the retrieved passages are entirely unrelated to the question — not simply because the phrasing differs from the question. Synthesize and interpret what is present rather than refusing to engage.`;

// ---------------------------------------------------------------------------
// Conversational Q&A — strictly grounded in retrieved portfolio chunks
// ---------------------------------------------------------------------------
export async function answerQuestion(
  question: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>
): Promise<{ answer: string; sources: AnswerSource[]; tokensInput: number; tokensOutput: number }> {
  const { passage: hypotheticalPassage, tokensInput: hydeIn, tokensOutput: hydeOut } =
    await generateHypotheticalPassage(question);
  const queryEmbedding = await generateEmbedding(hypotheticalPassage);

  console.log(`[RAG] Q: "${question.substring(0, 80)}"`);
  console.log(`[RAG] HyDE: "${hypotheticalPassage.substring(0, 120)}"`);
  console.log(`[RAG] HyDE tokens: in=${hydeIn} out=${hydeOut}`);

  const { relevantChunks, sources } = await retrievePassages(question, queryEmbedding);

  const context = relevantChunks.map((c, i) => `[Passage ${i + 1} — from ${c.fileName}]\n${c.content}`).join("\n\n");

  const historyMessages = conversationHistory.map(m =>
    m.role === "user" ? new HumanMessage(m.content) : new SystemMessage(m.content)
  );

  const response = await llm.invoke([
    new SystemMessage(QA_SYSTEM_PROMPT),
    ...historyMessages,
    new HumanMessage(
      `Portfolio passages (your ONLY source of truth):\n\n${context}\n\n---\nQuestion: ${question}`
    ),
  ]);

  const answer = typeof response.content === "string"
    ? response.content
    : "I could not generate an answer.";

  const answerUsage = extractUsage(response);
  return {
    answer,
    sources,
    tokensInput: hydeIn + answerUsage.input,
    tokensOutput: hydeOut + answerUsage.output,
  };
}

// ---------------------------------------------------------------------------
// Streaming match pipeline — same as matchJobDescription but emits progress
// ---------------------------------------------------------------------------
export type StreamMatchEvent =
  | { type: "status"; stage: string; step: number; totalSteps: number }
  | { type: "result"; data: Awaited<ReturnType<typeof matchJobDescription>> };

export async function* streamMatchJobDescription(
  jobDescription: string,
  jobTitle?: string
): AsyncGenerator<StreamMatchEvent> {
  yield { type: "status", stage: "Extracting requirements", step: 1, totalSteps: 4 };
  const requirements = await extractJobRequirements(jobDescription);

  const allRequirements = [
    ...requirements.hardSkills,
    ...requirements.experienceRequirements,
    ...requirements.domainKnowledge,
    ...requirements.softSkills,
  ];

  yield { type: "status", stage: "Searching portfolio", step: 2, totalSteps: 4 };
  const allEvidence = await findEvidenceForRequirements(allRequirements);

  yield { type: "status", stage: "Scoring evidence", step: 3, totalSteps: 4 };
  const hardSkillsEvidence = allEvidence.slice(0, requirements.hardSkills.length);
  const experienceEvidence = allEvidence.slice(
    requirements.hardSkills.length,
    requirements.hardSkills.length + requirements.experienceRequirements.length
  );
  const domainEvidence = allEvidence.slice(
    requirements.hardSkills.length + requirements.experienceRequirements.length,
    requirements.hardSkills.length + requirements.experienceRequirements.length + requirements.domainKnowledge.length
  );
  const softSkillsEvidence = allEvidence.slice(
    requirements.hardSkills.length + requirements.experienceRequirements.length + requirements.domainKnowledge.length
  );

  const hardSkillsScore = calculateCategoryScore(hardSkillsEvidence);
  const experienceScore = calculateCategoryScore(experienceEvidence);
  const domainScore = calculateCategoryScore(domainEvidence);
  const softSkillsScore = calculateCategoryScore(softSkillsEvidence);
  const matchScore =
    hardSkillsScore * 0.4 + experienceScore * 0.3 + domainScore * 0.2 + softSkillsScore * 0.1;

  yield { type: "status", stage: "Generating report", step: 4, totalSteps: 4 };
  const analysis = await generateDetailedAnalysis(
    jobTitle,
    { hardSkills: hardSkillsEvidence, experience: experienceEvidence, domain: domainEvidence, softSkills: softSkillsEvidence },
    { matchScore, hardSkillsScore, experienceScore, domainScore, softSkillsScore }
  );

  yield {
    type: "result",
    data: {
      matchScore: Math.round(matchScore * 10) / 10,
      mismatchScore: Math.round((100 - matchScore) * 10) / 10,
      hardSkillsScore: Math.round(hardSkillsScore * 10) / 10,
      experienceScore: Math.round(experienceScore * 10) / 10,
      domainScore: Math.round(domainScore * 10) / 10,
      softSkillsScore: Math.round(softSkillsScore * 10) / 10,
      topStrengths: analysis.topStrengths,
      topGaps: analysis.topGaps,
      detailedReport: analysis.report,
      tokensInput: analysis.tokensInput,
      tokensOutput: analysis.tokensOutput,
    },
  };
}

// ---------------------------------------------------------------------------
// Streaming Q&A — direct cosine similarity (no HyDE, no re-ranker) for speed
// ---------------------------------------------------------------------------
export async function* streamAnswer(
  question: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>
): AsyncGenerator<
  | { type: "status"; message: string }
  | { type: "chunk"; text: string }
  | { type: "done"; sources: AnswerSource[]; tokensInput: number; tokensOutput: number }
> {
  console.log(`[RAG stream] Q: "${question.substring(0, 80)}"`);

  yield { type: "status", message: "Embedding your question to prepare for semantic search..." };
  const queryEmbedding = await generateEmbedding(question);

  const allChunks = await loadChunkCache();
  yield { type: "status", message: `Scanning ${allChunks.length.toLocaleString()} portfolio passages for relevant content...` };

  const candidates: RetrievalCandidate[] = [];
  for (const c of allChunks) {
    if (!c.embedding || !Array.isArray(c.embedding)) continue;
    candidates.push({
      content: c.content,
      similarity: cosineSimilarity(queryEmbedding, c.embedding as number[]),
      documentId: c.documentId,
      fileName: c.fileName,
      driveFileId: c.driveFileId,
      fileType: c.fileType,
    });
  }

  const listKeywords = /\b(all|every|list|enumerate|how many|count)\b/i;
  const isListQuery = listKeywords.test(question);
  const topK = isListQuery ? ENV.ragTopKQA * 4 : ENV.ragTopKQA;

  const relevantChunks = candidates
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  // Deduplicate sources by documentId
  const sourceMap = new Map<number, AnswerSource>();
  for (const chunk of relevantChunks) {
    const existing = sourceMap.get(chunk.documentId);
    if (!existing || chunk.similarity > existing.similarity) {
      sourceMap.set(chunk.documentId, {
        documentId: chunk.documentId,
        fileName: chunk.fileName,
        driveFileId: chunk.driveFileId,
        fileType: chunk.fileType,
        similarity: Math.round(chunk.similarity * 100),
      });
    }
  }
  const sources = Array.from(sourceMap.values()).sort((a, b) => b.similarity - a.similarity);

  const uniqueFiles = new Set(relevantChunks.map(c => c.fileName));
  yield {
    type: "status",
    message: `Retrieved ${relevantChunks.length} passages from ${uniqueFiles.size} document${uniqueFiles.size !== 1 ? "s" : ""} — composing a grounded response...`,
  };

  const context = relevantChunks
    .map((c, i) => `[Passage ${i + 1} — from ${c.fileName}]\n${c.content}`)
    .join("\n\n");

  const historyMessages = conversationHistory.map(m =>
    m.role === "user" ? new HumanMessage(m.content) : new SystemMessage(m.content)
  );

  const messages = [
    new SystemMessage(QA_SYSTEM_PROMPT),
    ...historyMessages,
    new HumanMessage(
      `Portfolio passages (your ONLY source of truth):\n\n${context}\n\n---\nQuestion: ${question}`
    ),
  ];

  const stream = await llm.stream(messages);
  let tokensIn = 0;
  let tokensOut = 0;
  let lastChunk: any = null;

  for await (const chunk of stream) {
    lastChunk = chunk;
    const text = typeof chunk.content === "string" ? chunk.content : "";
    if (text) yield { type: "chunk", text };
  }

  if (lastChunk) {
    const usage = extractUsage(lastChunk);
    tokensIn = usage.input;
    tokensOut = usage.output;
  }

  yield { type: "done", sources, tokensInput: tokensIn, tokensOutput: tokensOut };
}
