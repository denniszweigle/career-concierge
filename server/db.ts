import { eq, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import {
  InsertUser,
  users,
  driveTokens,
  InsertDriveToken,
  DriveToken,
  documents,
  InsertDocument,
  Document,
  documentChunks,
  InsertDocumentChunk,
  DocumentChunk,
  analyses,
  InsertAnalysis,
  Analysis,
  chatMessages,
  InsertChatMessage,
  ChatMessage
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!_db) {
    const dbPath = (process.env.DATABASE_URL ?? "file:./data/db.sqlite").replace(/^file:/, "");
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const sqlite = new Database(dbPath);
    sqlite.pragma("journal_mode = WAL");
    _db = drizzle(sqlite);
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = getDb();

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = getDb();
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// Google Drive Token Management
export async function saveDriveToken(token: InsertDriveToken): Promise<void> {
  const db = getDb();
  await db.insert(driveTokens).values(token).onConflictDoUpdate({
    target: driveTokens.userId,
    set: {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt,
      updatedAt: new Date(),
    },
  });
}

export async function getDriveToken(userId: number): Promise<DriveToken | null> {
  const db = getDb();
  const result = await db.select().from(driveTokens).where(eq(driveTokens.userId, userId)).limit(1);
  return result[0] || null;
}

export async function deleteDriveToken(userId: number): Promise<void> {
  const db = getDb();
  await db.delete(driveTokens).where(eq(driveTokens.userId, userId));
}

// Document Management
export async function upsertDocument(doc: InsertDocument): Promise<number> {
  const db = getDb();

  const existing = await db
    .select()
    .from(documents)
    .where(eq(documents.driveFileId, doc.driveFileId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(documents)
      .set({
        fileName: doc.fileName,
        modifiedTime: doc.modifiedTime,
        extractedText: doc.extractedText,
        isIndexed: doc.isIndexed,
        updatedAt: new Date(),
      })
      .where(eq(documents.driveFileId, doc.driveFileId));
    return existing[0]!.id;
  } else {
    const [row] = await db.insert(documents).values(doc).returning({ id: documents.id });
    return row!.id;
  }
}

export async function getDocuments(): Promise<Document[]> {
  const db = getDb();
  return db.select().from(documents).orderBy(desc(documents.createdAt));
}

export async function getDocumentById(id: number): Promise<Document | undefined> {
  const db = getDb();
  const result = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  return result[0];
}

// Document Chunk Management
export async function saveDocumentChunk(chunk: InsertDocumentChunk): Promise<void> {
  const db = getDb();
  await db.insert(documentChunks).values(chunk);
}

export async function getDocumentChunks(documentId: number): Promise<DocumentChunk[]> {
  const db = getDb();
  return db
    .select()
    .from(documentChunks)
    .where(eq(documentChunks.documentId, documentId));
}

export async function getChunksBatch(offset: number, limit: number): Promise<DocumentChunk[]> {
  const db = getDb();
  return db.select().from(documentChunks).limit(limit).offset(offset);
}

export async function getChunksBatchWithDocuments(offset: number, limit: number) {
  const db = getDb();
  return db
    .select({
      id: documentChunks.id,
      documentId: documentChunks.documentId,
      content: documentChunks.content,
      embedding: documentChunks.embedding,
      fileName: documents.fileName,
      driveFileId: documents.driveFileId,
      fileType: documents.fileType,
    })
    .from(documentChunks)
    .innerJoin(documents, eq(documentChunks.documentId, documents.id))
    .limit(limit)
    .offset(offset);
}

// Analysis Management
export async function saveAnalysis(analysis: InsertAnalysis): Promise<number> {
  const db = getDb();
  const [row] = await db.insert(analyses).values(analysis).returning({ id: analyses.id });
  return row!.id;
}

export async function getAnalysesByUser(userId: number): Promise<Analysis[]> {
  const db = getDb();
  return db
    .select()
    .from(analyses)
    .where(eq(analyses.userId, userId))
    .orderBy(desc(analyses.createdAt));
}

export async function getAllAnalyses(): Promise<Analysis[]> {
  const db = getDb();
  return db.select().from(analyses).orderBy(desc(analyses.createdAt));
}

export async function getAnalysisById(id: number): Promise<Analysis | undefined> {
  const db = getDb();
  const result = await db.select().from(analyses).where(eq(analyses.id, id)).limit(1);
  return result[0];
}

// Chat Message Management
export async function saveChatMessage(message: InsertChatMessage): Promise<void> {
  const db = getDb();
  await db.insert(chatMessages).values(message);
}

export async function getChatMessages(analysisId: number): Promise<ChatMessage[]> {
  const db = getDb();
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.analysisId, analysisId));
}

// Aggregate stats for public reporting dashboard
export async function getSystemStats() {
  const db = getDb();

  const docsByType = await db
    .select({
      fileType: documents.fileType,
      count: sql<number>`cast(count(*) as int)`,
      totalChunks: sql<number>`cast(0 as int)`,
    })
    .from(documents)
    .groupBy(documents.fileType);

  const chunksByType = await db
    .select({
      fileType: documents.fileType,
      chunks: sql<number>`cast(count(${documentChunks.id}) as int)`,
    })
    .from(documentChunks)
    .innerJoin(documents, eq(documentChunks.documentId, documents.id))
    .groupBy(documents.fileType);

  const totalChunksResult = await db
    .select({ total: sql<number>`cast(count(*) as int)` })
    .from(documentChunks);

  const analysisTokens = await db
    .select({
      totalAnalyses: sql<number>`cast(count(*) as int)`,
      tokensInput: sql<number>`cast(coalesce(sum(${analyses.tokensInput}), 0) as int)`,
      tokensOutput: sql<number>`cast(coalesce(sum(${analyses.tokensOutput}), 0) as int)`,
    })
    .from(analyses);

  const chatTokens = await db
    .select({
      tokensInput: sql<number>`cast(coalesce(sum(${chatMessages.tokensInput}), 0) as int)`,
      tokensOutput: sql<number>`cast(coalesce(sum(${chatMessages.tokensOutput}), 0) as int)`,
    })
    .from(chatMessages)
    .where(eq(chatMessages.role, "assistant"));

  return {
    docsByType,
    chunksByType,
    totalChunks: totalChunksResult[0]?.total ?? 0,
    totalAnalyses: analysisTokens[0]?.totalAnalyses ?? 0,
    analysisTokensInput: analysisTokens[0]?.tokensInput ?? 0,
    analysisTokensOutput: analysisTokens[0]?.tokensOutput ?? 0,
    chatTokensInput: chatTokens[0]?.tokensInput ?? 0,
    chatTokensOutput: chatTokens[0]?.tokensOutput ?? 0,
  };
}
