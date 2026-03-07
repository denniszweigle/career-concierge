import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { llm } from "./_core/llm";
import { generateEmbedding, cosineSimilarity } from "./vectorEmbedding";
import { loadChunkCache } from "./matchingEngine";

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

// All factual anchors (role, company, metrics, certifications, years) come from the
// retrieved passages injected into the human message — nothing is hardcoded here.
const TAILOR_SYSTEM_PROMPT = `You are an expert Technical Career Strategist and ATS Optimization Engine.
Rewrite the candidate's resume and cover letter to align with the provided Job Description.

CRITICAL: Draw ALL factual content — current role, company name, metrics, certifications, years of experience — EXCLUSIVELY from the Career Overview Passages and Job-Relevant Passages provided in the user message. Do not invent, assume, or hallucinate any facts.

OBJECTIVE: 95%+ keyword match to bypass ATS filters while maintaining 100% factual integrity.

BRIDGE STRATEGY (critical):
- If the JD requires a technology not present in the passages but an equivalent skill exists, bridge them explicitly.
- Example: JD asks for AWS SageMaker → bridge with any equivalent cloud ML platform experience found in the passages
- Example: JD asks for Azure DevOps → bridge with any CI/CD, infrastructure, or DevOps experience found in the passages

RESUME INSTRUCTIONS:
- Keyword Injection: Scrape JD for hard skills; integrate naturally into Professional Summary and Skills using exact JD terminology
- Structural Integrity: Maintain chronological format; use the most recent role found in the Career Overview Passages as the top entry
- Quantifiable Impact: Front-load all metrics found in the passages (time savings, dollar amounts, team sizes, percentages, etc.)
- Tone: Professional, innovative, authoritative
- ATS Format: Clean section headers, standard fonts, no tables/columns — maximize ATS parseability

COVER LETTER INSTRUCTIONS:
- Hook: Open with the candidate's unique value proposition using years of experience and AI specialization found in the passages
- Pivot: Explicitly address the JD's primary pain point; highlight certifications and credentials found in the passages as trust signals
- The "Why": Connect leadership experience, team sizes, and any startup/founding experience found in the passages to the company's growth needs
- Tone: Confident, specific, compelling — not generic

OUTPUT FORMAT (exact — output nothing before the first delimiter):
### CUSTOM_RESUME
[resume content — use ## for section headers, - for bullet points]

### CUSTOM_COVER_LETTER
[cover letter content — paragraphs only, no bullets]`;

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

  // JD-aligned retrieval
  const jdChunks = validChunks
    .map(c => ({ content: c.content, similarity: cosineSimilarity(jdEmbedding, c.embedding as number[]) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, TAILOR_TOP_K_JD);

  // Career overview retrieval — deduplicate against JD chunks
  const jdContentSet = new Set(jdChunks.map(c => c.content));
  const overviewChunks = validChunks
    .map(c => ({ content: c.content, similarity: cosineSimilarity(overviewEmbedding, c.embedding as number[]) }))
    .sort((a, b) => b.similarity - a.similarity)
    .filter(c => !jdContentSet.has(c.content))
    .slice(0, TAILOR_TOP_K_OVERVIEW);

  console.log(
    `[tailor] JD chunks=${jdChunks.length} top-sim=${((jdChunks[0]?.similarity ?? 0) * 100).toFixed(1)}%`,
    `overview chunks=${overviewChunks.length}`
  );

  const overviewContext = overviewChunks
    .map((c, i) => `[Overview ${i + 1}]\n${c.content}`)
    .join("\n\n");

  const jdContext = jdChunks
    .map((c, i) => `[Job-Relevant ${i + 1}]\n${c.content}`)
    .join("\n\n");

  yield { type: "status", message: "Generating tailored resume & cover letter..." };

  const messages = [
    new SystemMessage(TAILOR_SYSTEM_PROMPT),
    new HumanMessage(
      `## Career Overview Passages\n${overviewContext}\n\n## Job-Relevant Passages\n${jdContext}\n\n---\nJob Title: ${jobTitle ?? "Not specified"}\n\nJob Description:\n${jobDescription}`
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
