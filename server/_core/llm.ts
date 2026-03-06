import { ChatOpenAI } from "@langchain/openai";
import { OpenAIEmbeddings } from "@langchain/openai";
import { ENV } from "./env";

const baseURL = ENV.forgeApiUrl?.trim()
  ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1`
  : "https://forge.manus.im/v1";

export const llm = new ChatOpenAI({
  model: ENV.llmModel,
  apiKey: ENV.forgeApiKey,
  maxTokens: ENV.llmMaxTokens,
  temperature: ENV.llmTemperature,
  timeout: 60_000,
  configuration: { baseURL },
});

export const embeddings = new OpenAIEmbeddings({
  model: ENV.embeddingModel,
  apiKey: ENV.forgeApiKey,
  configuration: { baseURL },
});
