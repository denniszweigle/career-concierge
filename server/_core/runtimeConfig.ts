import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { ENV } from "./env";

const CONFIG_PATH = join(process.cwd(), "data", "engine-config.json");

export type EngineConfig = {
  ragStrengthThreshold: number; // 0–100: score cutoff for strength vs gap
  ragTopKEvidence: number;      // 1–20: chunks retrieved per JD requirement
  ragTopKQA: number;            // 1–30: chunks retrieved per Q&A question
  ragTopKStage1: number;        // internal: stage-1 cosine scan candidate pool size
  llmModel: string;             // model identifier sent to the LLM endpoint
  llmTemperature: number;       // 0.0–1.0: response creativity
  llmMaxTokens: number;         // 512–32768: max tokens in any LLM response
  chunkSize: number;            // 200–4000: chars per document chunk (requires re-sync)
  chunkOverlap: number;         // 0–1000: overlap chars between chunks (requires re-sync)
};

function getDefaults(): EngineConfig {
  return {
    ragStrengthThreshold: ENV.ragStrengthThreshold,
    ragTopKEvidence: ENV.ragTopKEvidence,
    ragTopKQA: ENV.ragTopKQA,
    ragTopKStage1: ENV.ragTopKStage1,
    llmModel: ENV.llmModel,
    llmTemperature: ENV.llmTemperature,
    llmMaxTokens: ENV.llmMaxTokens,
    chunkSize: ENV.chunkSize,
    chunkOverlap: ENV.chunkOverlap,
  };
}

export function getEngineConfig(): EngineConfig {
  if (!existsSync(CONFIG_PATH)) return getDefaults();
  try {
    const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    return { ...getDefaults(), ...parsed };
  } catch {
    return getDefaults();
  }
}

export function saveEngineConfig(config: EngineConfig): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}
