import mammoth from 'mammoth';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string; numpages: number }>;
import * as XLSX from 'xlsx';
import { ENV } from './_core/env';

/**
 * Extract text content from a PDF buffer using pdf-parse (pdf.js-based).
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const data = await pdfParse(buffer);
    return data.text;
  } catch (error) {
    console.error('[PDF Extraction] Error:', error);
    throw new Error('Failed to extract text from PDF');
  }
}

/**
 * Extract text content from a DOCX (or legacy .doc) buffer using mammoth.
 */
export async function extractDocxText(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (error) {
    console.error('[DOCX Extraction] Error:', error);
    throw new Error('Failed to extract text from DOCX');
  }
}

/**
 * Extract text from a PPTX buffer.
 * PPTX files are ZIP archives — slide text lives in <a:t> tags inside ppt/slides/slide*.xml.
 */
export async function extractPptxText(buffer: Buffer): Promise<string> {
  try {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buffer);

    const slideFiles = Object.keys(zip.files)
      .filter(name => name.startsWith('ppt/slides/slide') && name.endsWith('.xml'))
      .sort(); // process slides in order

    const textParts: string[] = [];

    for (const slideFile of slideFiles) {
      const content = await zip.files[slideFile]!.async('string');
      const textMatches = content.match(/<a:t[^>]*>([^<]+)<\/a:t>/g);
      if (textMatches) {
        textMatches.forEach((match: string) => {
          const text = match.replace(/<a:t[^>]*>/, '').replace(/<\/a:t>/, '');
          textParts.push(text);
        });
      }
    }

    return textParts.join(' ');
  } catch (error) {
    console.error('[PPTX Extraction] Error:', error);
    throw new Error('Failed to extract text from PPTX');
  }
}

/**
 * Extract text from an XLSX (or legacy .xls) buffer using SheetJS.
 * Each sheet is rendered as tab-separated values joined by newlines.
 */
export async function extractXlsxText(buffer: Buffer): Promise<string> {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const parts: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]!;
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
      if (csv.trim().length > 0) {
        parts.push(`[Sheet: ${sheetName}]\n${csv}`);
      }
    }

    return parts.join('\n\n');
  } catch (error) {
    console.error('[XLSX Extraction] Error:', error);
    throw new Error('Failed to extract text from XLSX');
  }
}

/**
 * Extract text from a plain-text buffer (.txt, .md, .csv, etc.).
 */
export function extractTxtText(buffer: Buffer): string {
  return buffer.toString('utf-8');
}

/**
 * Extract text from any supported document type based on MIME type.
 */
export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  switch (mimeType) {
    case 'application/pdf':
      return extractPdfText(buffer);

    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/msword':
      return extractDocxText(buffer);

    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return extractPptxText(buffer);

    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    case 'application/vnd.ms-excel':
      return extractXlsxText(buffer);

    case 'text/plain':
    case 'text/csv':
    case 'text/markdown':
      return extractTxtText(buffer);

    default:
      throw new Error(`Unsupported document type: ${mimeType}`);
  }
}

/**
 * Split text into overlapping chunks for embedding.
 * Splits on sentence boundaries, then slides a window with overlap.
 */
export function chunkText(
  text: string,
  chunkSize: number = ENV.chunkSize,
  overlap: number = ENV.chunkOverlap
): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);

  let currentChunk = '';

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();

    if (currentChunk.length + trimmedSentence.length > chunkSize) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());

        const words = currentChunk.split(' ');
        const overlapWords = words.slice(-Math.floor(overlap / 5));
        currentChunk = overlapWords.join(' ') + ' ' + trimmedSentence;
      } else {
        chunks.push(trimmedSentence);
        currentChunk = '';
      }
    } else {
      currentChunk += (currentChunk ? '. ' : '') + trimmedSentence;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}
