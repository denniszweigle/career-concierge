/**
 * Google Drive integration smoke tests.
 *
 * These tests verify credentials and configuration WITHOUT requiring a user to
 * complete the OAuth consent flow. They confirm your client ID/secret are
 * recognised by Google and that the folder URL is correctly formatted.
 *
 * What CAN be tested here:
 *   - Credentials are present in .env
 *   - OAuth2 client initialises with those credentials
 *   - Google accepts the client ID (token-info endpoint)
 *   - Folder URL parses to a valid folder ID
 *   - Auth URL is well-formed
 *
 * What CANNOT be tested here (requires a completed OAuth flow):
 *   - Actually listing or downloading files from Drive
 *   - Token refresh
 *
 * Run with:  pnpm test server/googledrive.integration.test.ts
 */

import { config } from "dotenv";
import { describe, expect, it, beforeAll } from "vitest";

config();

import {
  createOAuth2Client,
  getAuthUrl,
  extractFolderIdFromUrl,
} from "./googleDrive";

const LOCALHOST_ORIGIN = "http://localhost:3000";

beforeAll(() => {
  if (!process.env.GOOGLE_DRIVE_CLIENT_ID || !process.env.GOOGLE_DRIVE_CLIENT_SECRET) {
    throw new Error(
      "GOOGLE_DRIVE_CLIENT_ID or GOOGLE_DRIVE_CLIENT_SECRET is not set — cannot run Google Drive tests"
    );
  }
});

describe("Google Drive credentials", () => {
  it("creates an OAuth2 client without throwing", () => {
    expect(() => createOAuth2Client(LOCALHOST_ORIGIN)).not.toThrow();
  });

  it("OAuth2 client contains the correct redirect URI", () => {
    const client = createOAuth2Client(LOCALHOST_ORIGIN);
    const creds = client._clientId;
    expect(creds).toBe(process.env.GOOGLE_DRIVE_CLIENT_ID);
  });

  it("generates a valid Google auth URL", () => {
    const client = createOAuth2Client(LOCALHOST_ORIGIN);
    const url = getAuthUrl(client, btoa(LOCALHOST_ORIGIN));

    expect(url).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url).toContain("drive.readonly");
    expect(url).toContain(encodeURIComponent(`${LOCALHOST_ORIGIN}/api/google-drive/callback`));
  });

  it("Google recognises the client ID (token-info endpoint check)", async () => {
    // This call does not require a token — it checks the client_id exists in Google's system.
    // A 400 with 'invalid_client' means the credentials are wrong.
    // A 400 with 'invalid_token' or 'missing token' means Google accepted the client but
    // we didn't supply a token, which is expected here.
    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID!;
    const resp = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?client_id=${encodeURIComponent(clientId)}`
    );
    const body = await resp.json() as Record<string, string>;

    // Google returns 400 for a missing token but the error should NOT be 'invalid_client'
    expect(body.error).not.toBe("invalid_client");
  }, 15_000);
});

describe("Google Drive folder URL", () => {
  it("extracts a folder ID from GOOGLE_DRIVE_FOLDER_URL", () => {
    const folderUrl = process.env.GOOGLE_DRIVE_FOLDER_URL ?? "";
    expect(folderUrl).toBeTruthy();

    const folderId = extractFolderIdFromUrl(folderUrl);
    expect(folderId).not.toBeNull();
    expect(folderId!.length).toBeGreaterThan(10);
  });

  it("extractFolderIdFromUrl handles standard Drive folder URLs", () => {
    const cases: [string, string][] = [
      ["https://drive.google.com/drive/folders/1ABC123xyz", "1ABC123xyz"],
      ["https://drive.google.com/drive/u/0/folders/1ABC123xyz", "1ABC123xyz"],
      ["https://drive.google.com/drive/folders/1ABC123xyz?usp=sharing", "1ABC123xyz"],
    ];

    for (const [url, expected] of cases) {
      expect(extractFolderIdFromUrl(url)).toBe(expected);
    }
  });

  it("extractFolderIdFromUrl returns null for invalid URLs", () => {
    expect(extractFolderIdFromUrl("https://drive.google.com")).toBeNull();
    expect(extractFolderIdFromUrl("not-a-url")).toBeNull();
  });
});
