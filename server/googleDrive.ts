import { google, Auth } from 'googleapis';

type OAuth2Client = Auth.OAuth2Client;
import { ENV } from './_core/env';

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
const REDIRECT_URI = '/api/google-drive/callback';

/**
 * Create OAuth2 client for Google Drive API
 */
export function createOAuth2Client(origin: string): OAuth2Client {
  // Use environment variables for OAuth credentials
  // These will be set via webdev_request_secrets
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    throw new Error('Google Drive OAuth credentials not configured');
  }

  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    `${origin}${REDIRECT_URI}`
  );
}

/**
 * Generate authorization URL for Google Drive OAuth
 */
export function getAuthUrl(oauth2Client: OAuth2Client, state: string): string {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    state,
    prompt: 'consent', // Force consent to get refresh token
  });
}

/**
 * Exchange authorization code for tokens
 */
export async function getTokensFromCode(oauth2Client: OAuth2Client, code: string) {
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  return tokens;
}

/**
 * Set credentials from stored tokens
 */
export function setCredentials(oauth2Client: OAuth2Client, accessToken: string, refreshToken?: string) {
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
}

/**
 * List all files in a Google Drive folder recursively
 */
export async function listFilesInFolder(
  oauth2Client: OAuth2Client,
  folderId: string
): Promise<Array<{
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  parents?: string[];
}>> {
  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  const allFiles: Array<{
    id: string;
    name: string;
    mimeType: string;
    modifiedTime: string;
    size?: string;
    parents?: string[];
  }> = [];

  // Document types for text extraction (RAG matching)
  const textExtractionMimeTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
    'application/msword', // .doc
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
    'text/plain', // .txt
    'text/csv',   // .csv
  ];

  // All supported file types (including metadata-only)
  const allSupportedMimeTypes = [
    ...textExtractionMimeTypes,
    // Images
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/svg+xml',
    'image/gif',
    // Videos
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    // Visio
    'application/vnd.visio',
    'application/vnd.ms-visio.drawing',
    // DrawIO
    'application/xml',
    'text/xml',
  ];

  async function scanFolder(currentFolderId: string) {
    let pageToken: string | undefined;

    do {
      const response = await drive.files.list({
        q: `'${currentFolderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size, parents)',
        pageSize: 100,
        pageToken,
      });

      const files = response.data.files || [];

      for (const file of files) {
        if (file.mimeType === 'application/vnd.google-apps.folder') {
          // Recursively scan subfolders
          await scanFolder(file.id!);
        } else if (file.mimeType && (allSupportedMimeTypes.includes(file.mimeType) || file.name?.match(/\.(drawio|vsd|vsdx|png|jpg|jpeg|svg|gif|mp4|mov|avi)$/i))) {
          // Add supported document files
          allFiles.push({
            id: file.id!,
            name: file.name!,
            mimeType: file.mimeType,
            modifiedTime: file.modifiedTime!,
            size: file.size || undefined,
            parents: file.parents || undefined,
          });
        }
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);
  }

  await scanFolder(folderId);
  return allFiles;
}

/**
 * Download file content from Google Drive
 */
export async function downloadFile(
  oauth2Client: OAuth2Client,
  fileId: string
): Promise<Buffer> {
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );

  return Buffer.from(response.data as ArrayBuffer);
}

/**
 * Extract folder ID from Google Drive URL
 */
export function extractFolderIdFromUrl(url: string): string | null {
  const match = url.match(/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}
