import { Express, Request, Response } from 'express';
import { createOAuth2Client, getTokensFromCode } from './googleDrive';
import { saveDriveToken } from './db';
import { sdk } from './_core/sdk';

/**
 * Register Google Drive OAuth callback route
 */
export function registerGoogleDriveCallback(app: Express) {
  app.get('/api/google-drive/callback', async (req: Request, res: Response) => {
    try {
      const { code, state } = req.query;

      if (!code || typeof code !== 'string') {
        return res.status(400).send('Missing authorization code');
      }

      if (!state || typeof state !== 'string') {
        return res.status(400).send('Missing state parameter');
      }

      // Get user from Manus session
      let user;
      try {
        user = await sdk.authenticateRequest(req);
        if (!user) {
          return res.status(401).send('Not authenticated. Please sign in to Manus first.');
        }
      } catch (error) {
        console.error('[Google Drive Callback] Authentication failed:', error);
        return res.status(401).send('Invalid session. Please sign in again.');
      }

      const userId = user.id;

      // Parse state to get origin
      let stateData;
      try {
        stateData = JSON.parse(state);
      } catch (error) {
        return res.status(400).send('Invalid state parameter');
      }

      const origin = stateData.origin;
      if (!origin) {
        return res.status(400).send('Missing origin in state');
      }

      // Exchange code for tokens
      const oauth2Client = createOAuth2Client(origin);
      const tokens = await getTokensFromCode(oauth2Client, code);

      if (!tokens.access_token) {
        return res.status(500).send('Failed to obtain access token');
      }

      // Save tokens to database
      // tokens.expiry_date is already a timestamp in milliseconds
      const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 3600 * 1000);
      await saveDriveToken({
        userId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        expiresAt,
        scope: tokens.scope || '',
      });

      // Redirect back to dashboard with success message
      res.redirect('/dashboard?drive_connected=true');
    } catch (error) {
      console.error('[Google Drive Callback] Error:', error);
      res.redirect('/dashboard?drive_error=true');
    }
  });
}
