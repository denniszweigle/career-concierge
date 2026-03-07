import { integer, real, text, sqliteTable } from "drizzle-orm/sqlite-core";

/**
 * Core user table backing auth flow.
 */
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  openId: text("openId").notNull().unique(),
  name: text("name"),
  email: text("email"),
  loginMethod: text("loginMethod"),
  role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  lastSignedIn: integer("lastSignedIn", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Google Drive OAuth tokens for accessing the portfolio folder
 */
export const driveTokens = sqliteTable("drive_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull().unique(),
  accessToken: text("accessToken").notNull(),
  refreshToken: text("refreshToken"),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  scope: text("scope").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});

export type DriveToken = typeof driveTokens.$inferSelect;
export type InsertDriveToken = typeof driveTokens.$inferInsert;

/**
 * Documents indexed from Google Drive
 */
export const documents = sqliteTable("documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  driveFileId: text("driveFileId").notNull().unique(),
  fileName: text("fileName").notNull(),
  fileType: text("fileType", { enum: ["pdf", "docx", "pptx", "xlsx", "txt"] }).notNull(),
  filePath: text("filePath").notNull(),
  mimeType: text("mimeType").notNull(),
  fileSize: integer("fileSize"),
  modifiedTime: integer("modifiedTime", { mode: "timestamp" }),
  extractedText: text("extractedText"),
  isIndexed: integer("isIndexed", { mode: "boolean" }).notNull().default(false),
  isPrimaryResume: integer("is_primary_resume", { mode: "boolean" }).default(false),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});

export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

/**
 * Text chunks from documents for vector search
 */
export const documentChunks = sqliteTable("document_chunks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  documentId: integer("documentId").notNull(),
  chunkIndex: integer("chunkIndex").notNull(),
  content: text("content").notNull(),
  embedding: text("embedding", { mode: "json" }).$type<number[]>(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type DocumentChunk = typeof documentChunks.$inferSelect;
export type InsertDocumentChunk = typeof documentChunks.$inferInsert;

/**
 * Job description analysis sessions
 */
export const analyses = sqliteTable("analyses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId"),
  jobTitle: text("jobTitle"),
  jobDescription: text("jobDescription").notNull(),
  matchScore: real("matchScore"),
  mismatchScore: real("mismatchScore"),
  hardSkillsScore: real("hardSkillsScore"),
  experienceScore: real("experienceScore"),
  domainScore: real("domainScore"),
  softSkillsScore: real("softSkillsScore"),
  topStrengths: text("topStrengths", { mode: "json" }).$type<string[]>(),
  topGaps: text("topGaps", { mode: "json" }).$type<string[]>(),
  detailedReport: text("detailedReport"),
  tokensInput: integer("tokensInput"),
  tokensOutput: integer("tokensOutput"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});

export type Analysis = typeof analyses.$inferSelect;
export type InsertAnalysis = typeof analyses.$inferInsert;

/**
 * Conversational Q&A messages for each analysis session
 */
export const chatMessages = sqliteTable("chat_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  analysisId: integer("analysisId").notNull(),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  tokensInput: integer("tokensInput"),
  tokensOutput: integer("tokensOutput"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;
