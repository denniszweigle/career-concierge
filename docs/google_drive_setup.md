# Google Drive Setup — Localhost Development

---

## Overview

The app uses Google's OAuth 2.0 flow to read files from a Drive folder you own.
You need a Google Cloud project with the Drive API enabled and an OAuth 2.0 client
configured to allow `http://localhost:3000` as a redirect URI.

---

## Step 1 — Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Click the project dropdown → **New Project**.
3. Give it a name (e.g. `career-concierge-dev`) and click **Create**.

---

## Step 2 — Enable the Google Drive API

1. In the left sidebar go to **APIs & Services → Library**.
2. Search for **Google Drive API** and click **Enable**.

---

## Step 3 — Configure the OAuth consent screen

1. Go to **APIs & Services → OAuth consent screen**.
2. Choose **External** (works for personal accounts), click **Create**.
3. Fill in:
   - **App name**: Career Concierge Dev
   - **User support email**: your Google account email
   - **Developer contact email**: your Google account email
4. Click **Save and Continue** through the remaining screens.
5. On the **Test users** screen, add your own Google account email.
6. Click **Back to Dashboard**.

> The app will remain in "Testing" mode, which is fine for personal localhost use.
> You can add up to 100 test users.

---

## Step 4 — Create OAuth 2.0 credentials

1. Go to **APIs & Services → Credentials**.
2. Click **Create Credentials → OAuth client ID**.
3. Set **Application type** to **Web application**.
4. Set a name (e.g. `localhost`).
5. Under **Authorized redirect URIs** click **Add URI** and enter:
   ```
   http://localhost:3000/api/google-drive/callback
   ```
6. Click **Create**.
7. Copy the **Client ID** and **Client Secret** from the dialog.

---

## Step 5 — Set env vars

In `.env`:

```env
GOOGLE_DRIVE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_DRIVE_CLIENT_SECRET=your-client-secret
GOOGLE_DRIVE_FOLDER_URL=https://drive.google.com/drive/folders/YOUR_FOLDER_ID
```

To get the folder URL:
1. Open Google Drive in your browser.
2. Navigate into the folder that contains your career documents.
3. Copy the URL from the address bar — it contains `/folders/<ID>`.

---

## Step 6 — Fix the localhost HTTPS issue

The app has a hardcoded `https://` scheme when building the Google OAuth redirect URI
(`server/routers.ts` line 118). This breaks on localhost because Google will try to redirect
to `https://localhost:3000/...` which is not registered and will fail.

Change line 118 in `server/routers.ts` from:
```ts
const origin = `https://${host}`;
```
to:
```ts
const isLocalhost = host?.startsWith('localhost') || host?.startsWith('127.0.0.1');
const origin = isLocalhost ? `http://${host}` : `https://${host}`;
```

---

## Step 7 — Connect Google Drive in the UI

1. Start the dev server: `pnpm dev`
2. Open `http://localhost:3000` and ensure you are logged in as admin
   (see `oauth_setup_instructions.md`).
3. Go to the Dashboard.
4. Click **Connect Google Drive** — you will be redirected to Google's consent screen.
5. Approve the permissions with your Google account.
6. You will be redirected back to `http://localhost:3000/dashboard?drive_connected=true`.
7. Click **Sync Documents** to index your Drive folder.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `redirect_uri_mismatch` from Google | Registered URI doesn't match exactly | Ensure the URI in Google Console is `http://localhost:3000/api/google-drive/callback` with no trailing slash |
| `Google Drive OAuth credentials not configured` | Env vars missing | Check `GOOGLE_DRIVE_CLIENT_ID` and `GOOGLE_DRIVE_CLIENT_SECRET` in `.env` |
| Redirected to `https://localhost:3000/...` | HTTPS hardcoding bug | Apply the fix in Step 6 above |
| `403 Forbidden` on sync | Not logged in as admin | Make sure your session user has `role = 'admin'` (see `oauth_setup_instructions.md`) |
| `Invalid folder URL` | Folder URL format wrong | Paste the full URL from the browser, not just the folder ID |
