import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, type Firestore, type Timestamp } from 'firebase-admin/firestore';
import { ENV } from './_core/env';
import type {
  User,
  InsertUser,
  DriveToken,
  InsertDriveToken,
  Document,
  InsertDocument,
  DocumentChunk,
  InsertDocumentChunk,
  Analysis,
  InsertAnalysis,
  ChatMessage,
  InsertChatMessage,
} from '../drizzle/schema';

// Re-export types so consumers can import from db.ts if needed
export type {
  User,
  DriveToken,
  Document,
  DocumentChunk,
  Analysis,
  ChatMessage,
};

// ---------------------------------------------------------------------------
// Firebase initialization — lazy singleton
// ---------------------------------------------------------------------------

let _db: Firestore | null = null;

function getDb(): Firestore {
  if (!_db) {
    if (getApps().length === 0) {
      initializeApp({
        credential: cert(JSON.parse(ENV.firebaseServiceAccountKey)),
      });
    }
    _db = getFirestore();
    _db.settings({ ignoreUndefinedProperties: true });
  }
  return _db;
}

// ---------------------------------------------------------------------------
// Timestamp helpers
// ---------------------------------------------------------------------------

function tsToDate(ts: Timestamp | null | undefined): Date {
  if (!ts) return new Date(0);
  return ts.toDate();
}

function tsToDateOrNull(ts: Timestamp | null | undefined): Date | null {
  if (!ts) return null;
  return ts.toDate();
}

// ---------------------------------------------------------------------------
// User operations
// ---------------------------------------------------------------------------

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error('User openId is required for upsert');
  }

  const db = getDb();
  const now = new Date();

  const snapshot = await db
    .collection('users')
    .where('openId', '==', user.openId)
    .limit(1)
    .get();

  const updates: Record<string, unknown> = {
    updatedAt: now,
    lastSignedIn: user.lastSignedIn ?? now,
  };

  if (user.name !== undefined) updates.name = user.name ?? null;
  if (user.email !== undefined) updates.email = user.email ?? null;
  if (user.loginMethod !== undefined) updates.loginMethod = user.loginMethod ?? null;
  if (user.role !== undefined) {
    updates.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    updates.role = 'admin';
  }

  if (snapshot.empty) {
    await db.collection('users').add({
      openId: user.openId,
      name: user.name ?? null,
      email: user.email ?? null,
      loginMethod: user.loginMethod ?? null,
      role: updates.role ?? (user.openId === ENV.ownerOpenId ? 'admin' : 'user'),
      createdAt: now,
      updatedAt: now,
      lastSignedIn: user.lastSignedIn ?? now,
    });
  } else {
    await snapshot.docs[0]!.ref.update(updates);
  }
}

export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  const db = getDb();
  const snapshot = await db
    .collection('users')
    .where('openId', '==', openId)
    .limit(1)
    .get();

  if (snapshot.empty) return undefined;

  const doc = snapshot.docs[0]!;
  const data = doc.data();
  return {
    id: doc.id,
    openId: data.openId,
    name: data.name ?? null,
    email: data.email ?? null,
    loginMethod: data.loginMethod ?? null,
    role: data.role ?? 'user',
    createdAt: tsToDate(data.createdAt),
    updatedAt: tsToDate(data.updatedAt),
    lastSignedIn: tsToDate(data.lastSignedIn),
  };
}

// ---------------------------------------------------------------------------
// Google Drive Token operations
// ---------------------------------------------------------------------------

export async function saveDriveToken(token: InsertDriveToken): Promise<void> {
  const db = getDb();
  const now = new Date();
  // Use userId as doc ID so upsert is a simple set-with-merge
  await db.collection('driveTokens').doc(token.userId).set(
    {
      userId: token.userId,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken ?? null,
      expiresAt: token.expiresAt,
      scope: token.scope,
      updatedAt: now,
    },
    { merge: true }
  );

  // Set createdAt only if creating for the first time
  const ref = db.collection('driveTokens').doc(token.userId);
  const snap = await ref.get();
  if (!snap.data()?.createdAt) {
    await ref.update({ createdAt: now });
  }
}

export async function getDriveToken(userId: string): Promise<DriveToken | null> {
  const db = getDb();
  const doc = await db.collection('driveTokens').doc(userId).get();
  if (!doc.exists) return null;

  const data = doc.data()!;
  return {
    id: doc.id,
    userId: data.userId,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken ?? null,
    expiresAt: tsToDate(data.expiresAt),
    scope: data.scope ?? '',
    createdAt: tsToDate(data.createdAt),
    updatedAt: tsToDate(data.updatedAt),
  };
}

export async function deleteDriveToken(userId: string): Promise<void> {
  const db = getDb();
  await db.collection('driveTokens').doc(userId).delete();
}

// ---------------------------------------------------------------------------
// Document operations
// ---------------------------------------------------------------------------

export async function upsertDocument(doc: InsertDocument): Promise<string> {
  const db = getDb();
  const now = new Date();

  const snapshot = await db
    .collection('documents')
    .where('driveFileId', '==', doc.driveFileId)
    .limit(1)
    .get();

  if (!snapshot.empty) {
    const ref = snapshot.docs[0]!.ref;
    await ref.update({
      fileName: doc.fileName,
      modifiedTime: doc.modifiedTime ?? null,
      extractedText: doc.extractedText ?? null,
      isIndexed: doc.isIndexed ?? false,
      updatedAt: now,
    });
    return snapshot.docs[0]!.id;
  }

  const ref = await db.collection('documents').add({
    driveFileId: doc.driveFileId,
    fileName: doc.fileName,
    fileType: doc.fileType,
    filePath: doc.filePath,
    mimeType: doc.mimeType,
    fileSize: doc.fileSize ?? null,
    modifiedTime: doc.modifiedTime ?? null,
    extractedText: doc.extractedText ?? null,
    isIndexed: doc.isIndexed ?? false,
    isPrimaryResume: doc.isPrimaryResume ?? false,
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

export async function markDocumentIndexed(id: string): Promise<void> {
  const db = getDb();
  await db.collection('documents').doc(id).update({
    isIndexed: true,
    updatedAt: new Date(),
  });
}

export async function getDocuments(): Promise<Document[]> {
  const db = getDb();
  const snapshot = await db
    .collection('documents')
    .orderBy('createdAt', 'desc')
    .get();

  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      driveFileId: data.driveFileId,
      fileName: data.fileName,
      fileType: data.fileType,
      filePath: data.filePath,
      mimeType: data.mimeType,
      fileSize: data.fileSize ?? null,
      modifiedTime: tsToDateOrNull(data.modifiedTime),
      extractedText: data.extractedText ?? null,
      isIndexed: data.isIndexed ?? false,
      isPrimaryResume: data.isPrimaryResume ?? false,
      createdAt: tsToDate(data.createdAt),
      updatedAt: tsToDate(data.updatedAt),
    };
  });
}

export async function getDocumentById(id: string): Promise<Document | undefined> {
  const db = getDb();
  const doc = await db.collection('documents').doc(id).get();
  if (!doc.exists) return undefined;

  const data = doc.data()!;
  return {
    id: doc.id,
    driveFileId: data.driveFileId,
    fileName: data.fileName,
    fileType: data.fileType,
    filePath: data.filePath,
    mimeType: data.mimeType,
    fileSize: data.fileSize ?? null,
    modifiedTime: tsToDateOrNull(data.modifiedTime),
    extractedText: data.extractedText ?? null,
    isIndexed: data.isIndexed ?? false,
    isPrimaryResume: data.isPrimaryResume ?? false,
    createdAt: tsToDate(data.createdAt),
    updatedAt: tsToDate(data.updatedAt),
  };
}

export async function getDocumentByDriveFileId(driveFileId: string): Promise<Document | undefined> {
  const db = getDb();
  const snapshot = await db
    .collection('documents')
    .where('driveFileId', '==', driveFileId)
    .limit(1)
    .get();

  if (snapshot.empty) return undefined;

  const doc = snapshot.docs[0]!;
  const data = doc.data();
  return {
    id: doc.id,
    driveFileId: data.driveFileId,
    fileName: data.fileName,
    fileType: data.fileType,
    filePath: data.filePath,
    mimeType: data.mimeType,
    fileSize: data.fileSize ?? null,
    modifiedTime: tsToDateOrNull(data.modifiedTime),
    extractedText: data.extractedText ?? null,
    isIndexed: data.isIndexed ?? false,
    isPrimaryResume: data.isPrimaryResume ?? false,
    createdAt: tsToDate(data.createdAt),
    updatedAt: tsToDate(data.updatedAt),
  };
}

export async function deleteDocument(id: string): Promise<void> {
  await deleteDocumentChunks(id);
  const db = getDb();
  await db.collection('documents').doc(id).delete();
}

export async function setPrimaryResume(id: string): Promise<void> {
  const db = getDb();
  const snapshot = await db.collection('documents').get();
  const batch = db.batch();

  for (const doc of snapshot.docs) {
    batch.update(doc.ref, { isPrimaryResume: false });
  }
  batch.update(db.collection('documents').doc(id), { isPrimaryResume: true });

  await batch.commit();
}

export async function getPrimaryResume(): Promise<Document | undefined> {
  const db = getDb();
  const snapshot = await db
    .collection('documents')
    .where('isPrimaryResume', '==', true)
    .limit(1)
    .get();

  if (snapshot.empty) return undefined;

  const doc = snapshot.docs[0]!;
  const data = doc.data();
  return {
    id: doc.id,
    driveFileId: data.driveFileId,
    fileName: data.fileName,
    fileType: data.fileType,
    filePath: data.filePath,
    mimeType: data.mimeType,
    fileSize: data.fileSize ?? null,
    modifiedTime: tsToDateOrNull(data.modifiedTime),
    extractedText: data.extractedText ?? null,
    isIndexed: data.isIndexed ?? false,
    isPrimaryResume: data.isPrimaryResume ?? false,
    createdAt: tsToDate(data.createdAt),
    updatedAt: tsToDate(data.updatedAt),
  };
}

// ---------------------------------------------------------------------------
// Document Chunk operations
// ---------------------------------------------------------------------------

export async function saveDocumentChunk(chunk: InsertDocumentChunk): Promise<void> {
  const db = getDb();
  await db.collection('documentChunks').add({
    documentId: chunk.documentId,
    chunkIndex: chunk.chunkIndex,
    content: chunk.content,
    embedding: chunk.embedding ?? null,
    documentFileName: chunk.documentFileName ?? '',
    documentDriveFileId: chunk.documentDriveFileId ?? '',
    documentFileType: chunk.documentFileType ?? '',
    createdAt: new Date(),
  });
}

export async function getDocumentChunks(documentId: string): Promise<DocumentChunk[]> {
  const db = getDb();
  const snapshot = await db
    .collection('documentChunks')
    .where('documentId', '==', documentId)
    .get();

  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      documentId: data.documentId,
      chunkIndex: data.chunkIndex,
      content: data.content,
      embedding: data.embedding ?? null,
      documentFileName: data.documentFileName ?? '',
      documentDriveFileId: data.documentDriveFileId ?? '',
      documentFileType: data.documentFileType ?? '',
      createdAt: tsToDate(data.createdAt),
    };
  });
}

export async function deleteDocumentChunks(documentId: string): Promise<void> {
  const db = getDb();
  const snapshot = await db
    .collection('documentChunks')
    .where('documentId', '==', documentId)
    .get();

  if (snapshot.empty) return;

  // Delete in batches of 500 (Firestore batch limit)
  const BATCH_SIZE = 500;
  for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    snapshot.docs.slice(i, i + BATCH_SIZE).forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
}

export async function getChunksBatchWithDocuments(
  offset: number,
  limit: number
): Promise<Array<{
  id: string;
  documentId: string;
  content: string;
  embedding: number[] | null;
  fileName: string;
  driveFileId: string;
  fileType: string;
}>> {
  const db = getDb();
  const snapshot = await db
    .collection('documentChunks')
    .orderBy('createdAt')
    .offset(offset)
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      documentId: data.documentId,
      content: data.content,
      embedding: data.embedding ?? null,
      fileName: data.documentFileName ?? '',
      driveFileId: data.documentDriveFileId ?? '',
      fileType: data.documentFileType ?? '',
    };
  });
}

// ---------------------------------------------------------------------------
// Analysis operations
// ---------------------------------------------------------------------------

export async function saveAnalysis(analysis: InsertAnalysis): Promise<string> {
  const db = getDb();
  const now = new Date();
  const ref = await db.collection('analyses').add({
    userId: analysis.userId ?? null,
    jobTitle: analysis.jobTitle ?? null,
    jobDescription: analysis.jobDescription,
    matchScore: analysis.matchScore ?? null,
    mismatchScore: analysis.mismatchScore ?? null,
    hardSkillsScore: analysis.hardSkillsScore ?? null,
    experienceScore: analysis.experienceScore ?? null,
    domainScore: analysis.domainScore ?? null,
    softSkillsScore: analysis.softSkillsScore ?? null,
    topStrengths: analysis.topStrengths ?? null,
    topGaps: analysis.topGaps ?? null,
    detailedReport: analysis.detailedReport ?? null,
    tokensInput: analysis.tokensInput ?? null,
    tokensOutput: analysis.tokensOutput ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

export async function getAnalysisById(id: string): Promise<Analysis | undefined> {
  const db = getDb();
  const doc = await db.collection('analyses').doc(id).get();
  if (!doc.exists) return undefined;

  const data = doc.data()!;
  return {
    id: doc.id,
    userId: data.userId ?? null,
    jobTitle: data.jobTitle ?? null,
    jobDescription: data.jobDescription,
    matchScore: data.matchScore ?? null,
    mismatchScore: data.mismatchScore ?? null,
    hardSkillsScore: data.hardSkillsScore ?? null,
    experienceScore: data.experienceScore ?? null,
    domainScore: data.domainScore ?? null,
    softSkillsScore: data.softSkillsScore ?? null,
    topStrengths: data.topStrengths ?? null,
    topGaps: data.topGaps ?? null,
    detailedReport: data.detailedReport ?? null,
    tokensInput: data.tokensInput ?? null,
    tokensOutput: data.tokensOutput ?? null,
    createdAt: tsToDate(data.createdAt),
    updatedAt: tsToDate(data.updatedAt),
  };
}

export async function getAllAnalyses(): Promise<Analysis[]> {
  const db = getDb();
  const snapshot = await db
    .collection('analyses')
    .orderBy('createdAt', 'desc')
    .get();

  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      userId: data.userId ?? null,
      jobTitle: data.jobTitle ?? null,
      jobDescription: data.jobDescription,
      matchScore: data.matchScore ?? null,
      mismatchScore: data.mismatchScore ?? null,
      hardSkillsScore: data.hardSkillsScore ?? null,
      experienceScore: data.experienceScore ?? null,
      domainScore: data.domainScore ?? null,
      softSkillsScore: data.softSkillsScore ?? null,
      topStrengths: data.topStrengths ?? null,
      topGaps: data.topGaps ?? null,
      detailedReport: data.detailedReport ?? null,
      tokensInput: data.tokensInput ?? null,
      tokensOutput: data.tokensOutput ?? null,
      createdAt: tsToDate(data.createdAt),
      updatedAt: tsToDate(data.updatedAt),
    };
  });
}

export async function getAnalysesByUser(userId: string): Promise<Analysis[]> {
  const db = getDb();
  const snapshot = await db
    .collection('analyses')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .get();

  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      userId: data.userId ?? null,
      jobTitle: data.jobTitle ?? null,
      jobDescription: data.jobDescription,
      matchScore: data.matchScore ?? null,
      mismatchScore: data.mismatchScore ?? null,
      hardSkillsScore: data.hardSkillsScore ?? null,
      experienceScore: data.experienceScore ?? null,
      domainScore: data.domainScore ?? null,
      softSkillsScore: data.softSkillsScore ?? null,
      topStrengths: data.topStrengths ?? null,
      topGaps: data.topGaps ?? null,
      detailedReport: data.detailedReport ?? null,
      tokensInput: data.tokensInput ?? null,
      tokensOutput: data.tokensOutput ?? null,
      createdAt: tsToDate(data.createdAt),
      updatedAt: tsToDate(data.updatedAt),
    };
  });
}

// ---------------------------------------------------------------------------
// Chat Message operations
// ---------------------------------------------------------------------------

export async function saveChatMessage(message: InsertChatMessage): Promise<void> {
  const db = getDb();
  await db.collection('chatMessages').add({
    analysisId: message.analysisId,
    role: message.role,
    content: message.content,
    tokensInput: message.tokensInput ?? null,
    tokensOutput: message.tokensOutput ?? null,
    createdAt: new Date(),
  });
}

export async function getChatMessages(analysisId: string): Promise<ChatMessage[]> {
  const db = getDb();
  const snapshot = await db
    .collection('chatMessages')
    .where('analysisId', '==', analysisId)
    .orderBy('createdAt')
    .get();

  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      analysisId: data.analysisId,
      role: data.role,
      content: data.content,
      tokensInput: data.tokensInput ?? null,
      tokensOutput: data.tokensOutput ?? null,
      createdAt: tsToDate(data.createdAt),
    };
  });
}

// ---------------------------------------------------------------------------
// Aggregate stats (in-memory aggregation — personal-scale tool)
// ---------------------------------------------------------------------------

export async function getSystemStats() {
  const db = getDb();

  const [docsSnap, chunksSnap, analysesSnap, chatSnap] = await Promise.all([
    db.collection('documents').get(),
    db.collection('documentChunks').get(),
    db.collection('analyses').get(),
    db.collection('chatMessages').where('role', '==', 'assistant').get(),
  ]);

  // Count documents by fileType
  const docCountByType = new Map<string, number>();
  for (const doc of docsSnap.docs) {
    const ft = doc.data().fileType ?? 'unknown';
    docCountByType.set(ft, (docCountByType.get(ft) ?? 0) + 1);
  }

  // Count chunks by documentFileType
  const chunkCountByType = new Map<string, number>();
  for (const doc of chunksSnap.docs) {
    const ft = doc.data().documentFileType ?? 'unknown';
    chunkCountByType.set(ft, (chunkCountByType.get(ft) ?? 0) + 1);
  }

  const docsByType = Array.from(docCountByType.entries()).map(([fileType, count]) => ({
    fileType,
    count,
    totalChunks: 0,
  }));

  const chunksByType = Array.from(chunkCountByType.entries()).map(([fileType, chunks]) => ({
    fileType,
    chunks,
  }));

  let analysisTokensInput = 0;
  let analysisTokensOutput = 0;
  for (const doc of analysesSnap.docs) {
    const data = doc.data();
    analysisTokensInput += data.tokensInput ?? 0;
    analysisTokensOutput += data.tokensOutput ?? 0;
  }

  let chatTokensInput = 0;
  let chatTokensOutput = 0;
  for (const doc of chatSnap.docs) {
    const data = doc.data();
    chatTokensInput += data.tokensInput ?? 0;
    chatTokensOutput += data.tokensOutput ?? 0;
  }

  return {
    docsByType,
    chunksByType,
    totalChunks: chunksSnap.size,
    totalAnalyses: analysesSnap.size,
    analysisTokensInput,
    analysisTokensOutput,
    chatTokensInput,
    chatTokensOutput,
  };
}
