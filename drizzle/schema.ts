// Plain TypeScript types — Drizzle ORM removed, backed by Firebase Firestore

export type User = {
  id: string;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  role: 'user' | 'admin';
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
};

export type InsertUser = {
  openId: string;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  role?: 'user' | 'admin';
  lastSignedIn?: Date;
};

export type DriveToken = {
  id: string;
  userId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  scope: string;
  createdAt: Date;
  updatedAt: Date;
};

export type InsertDriveToken = {
  userId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  scope: string;
};

export type Document = {
  id: string;
  driveFileId: string;
  fileName: string;
  fileType: 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'txt';
  filePath: string;
  mimeType: string;
  fileSize: number | null;
  modifiedTime: Date | null;
  extractedText: string | null;
  isIndexed: boolean;
  isPrimaryResume: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type InsertDocument = {
  driveFileId: string;
  fileName: string;
  fileType: 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'txt';
  filePath: string;
  mimeType: string;
  fileSize?: number | null;
  modifiedTime?: Date | null;
  extractedText?: string | null;
  isIndexed?: boolean;
  isPrimaryResume?: boolean;
};

export type DocumentChunk = {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  embedding: number[] | null;
  // Denormalized from parent document (avoids collection-group queries)
  documentFileName: string;
  documentDriveFileId: string;
  documentFileType: string;
  createdAt: Date;
};

export type InsertDocumentChunk = {
  documentId: string;
  chunkIndex: number;
  content: string;
  embedding?: number[] | null;
  // Denormalized fields
  documentFileName?: string;
  documentDriveFileId?: string;
  documentFileType?: string;
};

export type Analysis = {
  id: string;
  userId: string | null;
  jobTitle: string | null;
  jobDescription: string;
  matchScore: number | null;
  mismatchScore: number | null;
  hardSkillsScore: number | null;
  experienceScore: number | null;
  domainScore: number | null;
  softSkillsScore: number | null;
  topStrengths: string[] | null;
  topGaps: string[] | null;
  detailedReport: string | null;
  tokensInput: number | null;
  tokensOutput: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type InsertAnalysis = {
  userId?: string | null;
  jobTitle?: string | null;
  jobDescription: string;
  matchScore?: number | null;
  mismatchScore?: number | null;
  hardSkillsScore?: number | null;
  experienceScore?: number | null;
  domainScore?: number | null;
  softSkillsScore?: number | null;
  topStrengths?: string[] | null;
  topGaps?: string[] | null;
  detailedReport?: string | null;
  tokensInput?: number | null;
  tokensOutput?: number | null;
};

export type ChatMessage = {
  id: string;
  analysisId: string;
  role: 'user' | 'assistant';
  content: string;
  tokensInput: number | null;
  tokensOutput: number | null;
  createdAt: Date;
};

export type InsertChatMessage = {
  analysisId: string;
  role: 'user' | 'assistant';
  content: string;
  tokensInput?: number | null;
  tokensOutput?: number | null;
};
