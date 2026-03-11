export const ENV = {
  // Auth / Manus
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",

  // Firebase
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID ?? "",
  firebaseServiceAccountKey: process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",

  // LLM endpoint (Manus forge / OpenAI-compatible)
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",

  // LLM tuning
  llmModel: process.env.LLM_MODEL ?? "gpt-4o-mini",
  llmMaxTokens: parseInt(process.env.LLM_MAX_TOKENS ?? "8192"),
  llmTemperature: parseFloat(process.env.LLM_TEMPERATURE ?? "0.1"),
  embeddingModel: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",

  // Document chunking
  chunkSize: parseInt(process.env.CHUNK_SIZE ?? "1000"),
  chunkOverlap: parseInt(process.env.CHUNK_OVERLAP ?? "200"),

  // RAG retrieval — 2-stage pipeline
  ragTopKStage1: parseInt(process.env.RAG_TOP_K_STAGE1 ?? "20"),   // Stage 1: broad candidate pool
  ragTopKQA: parseInt(process.env.RAG_TOP_K_QA ?? "8"),            // Stage 2: final passages after re-rank
  ragTopKEvidence: parseInt(process.env.RAG_TOP_K_EVIDENCE ?? "8"),// Job matching evidence per requirement
  ragStrengthThreshold: parseFloat(process.env.RAG_STRENGTH_THRESHOLD ?? "50"),
};
