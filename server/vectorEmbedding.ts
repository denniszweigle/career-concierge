import { embeddings } from "./_core/llm";
import { ENV } from "./_core/env";

export async function generateEmbedding(text: string): Promise<number[]> {
  return embeddings.embedQuery(text);
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error("Vectors must have the same dimensions");
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i]! * vecB[i]!;
    magnitudeA += vecA[i]! * vecA[i]!;
    magnitudeB += vecB[i]! * vecB[i]!;
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) return 0;

  return dotProduct / (magnitudeA * magnitudeB);
}

export function findTopMatches(
  queryEmbedding: number[],
  chunks: Array<{ id: number; embedding: number[]; content: string }>,
  topK: number = ENV.ragTopKEvidence
): Array<{ id: number; content: string; similarity: number }> {
  return chunks
    .map(chunk => ({
      id: chunk.id,
      content: chunk.content,
      similarity: cosineSimilarity(queryEmbedding, chunk.embedding),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}
