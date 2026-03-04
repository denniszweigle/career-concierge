/**
 * OpenAI integration smoke tests.
 *
 * These tests make real API calls — they require a valid BUILT_IN_FORGE_API_KEY
 * in your .env file and will consume a small amount of API credits.
 *
 * Run with:  pnpm test server/openai.integration.test.ts
 */

import { config } from "dotenv";
import { describe, expect, it, beforeAll } from "vitest";
import type { ChatOpenAI } from "@langchain/openai";
import type { OpenAIEmbeddings } from "@langchain/openai";

// dotenv must run before llm.ts is imported, because ENV is read at module load time.
// Static imports are hoisted in ES modules, so we use dynamic imports instead.
config();

let llm: ChatOpenAI;
let embeddings: OpenAIEmbeddings;

beforeAll(async () => {
  if (!process.env.BUILT_IN_FORGE_API_KEY) {
    throw new Error("BUILT_IN_FORGE_API_KEY is not set — cannot run OpenAI integration tests");
  }
  const mod = await import("./_core/llm");
  llm = mod.llm;
  embeddings = mod.embeddings;
});

describe("OpenAI LLM (chat completion)", () => {
  it("returns a non-empty response to a simple prompt", async () => {
    const response = await llm.invoke("Reply with exactly the word: pong");

    const text = typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

    expect(text.toLowerCase()).toContain("pong");
  }, 30_000);
});

describe("OpenAI Embeddings", () => {
  it("returns a numeric vector for a short string", async () => {
    const result = await embeddings.embedQuery("career concierge smoke test");

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(typeof result[0]).toBe("number");
  }, 30_000);

  it("returns vectors of equal length for two different strings", async () => {
    const [a, b] = await embeddings.embedDocuments([
      "software engineer with 5 years experience",
      "product manager with MBA",
    ]);

    expect(a.length).toBe(b.length);
    expect(a.length).toBeGreaterThan(0);
  }, 30_000);
});
