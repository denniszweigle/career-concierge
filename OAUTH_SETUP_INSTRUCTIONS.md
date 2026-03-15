# Google Drive OAuth Setup - Complete Instructions

## The Problem

You're seeing **"Error 400: redirect_uri_mismatch"** because Google OAuth requires you to register **exact** redirect URIs in advance. The application uses different URLs for development vs. production deployment.

## The Solution

Add **BOTH** redirect URIs to your Google Cloud Console OAuth client:

### 1. Production URL (Published Site)
```
https://baeb90.com/api/google-drive/callback
```

### 2. Local Development URL
```
http://localhost:3000/api/google-drive/callback
```

## Step-by-Step Instructions

### Step 1: Open Google Cloud Console

1. Go to https://console.cloud.google.com/
2. Select your project: **"Me in 2026 using AI"**
3. Navigate to: **APIs & Services** → **Credentials**

### Step 2: Edit OAuth 2.0 Client

1. Find your OAuth client: **"Web client 1"** (Client ID: `183945423404-rtbkud00tg9qjep6hc0hlthkddhqt9s8...`)
2. Click the **edit** icon (pencil)

### Step 3: Add Both Redirect URIs

In the **"Authorized redirect URIs"** section:

1. You should already have:
   ```
   https://baeb90.com/api/google-drive/callback
   ```

2. Click **"+ ADD URI"**

3. Add the local development URL:
   ```
   http://localhost:3000/api/google-drive/callback
   ```

4. Click **"SAVE"**

### Step 4: Wait for Changes to Propagate

- Google notes: "It may take 5 minutes to a few hours for settings to take effect"
- Usually works within 5-10 minutes

### Step 5: Test the Connection

**Option A - Test Locally (Development)**
1. Start the dev server: `pnpm dev`
2. Go to: `http://localhost:3000`
3. Click "Connect Google Drive"
4. Sign in with `dennis.zweigle@gmail.com`
5. Grant permissions
6. Should redirect back with "Connected" status

**Option B - Test in Production**
1. Go to: https://baeb90.com
2. Click "Connect Google Drive"
3. Complete OAuth flow

## Why This Happens

The application dynamically constructs the redirect URI based on where it's running:

- **Development**: Uses `http://localhost:3000`
- **Production**: Uses `https://baeb90.com`

Google's OAuth security requires you to pre-register **every possible** redirect URI. This prevents malicious sites from intercepting your OAuth tokens.

## Verification

After adding both URIs, you should see them listed in Google Cloud Console like this:

```
Authorized redirect URIs:
✓ https://baeb90.com/api/google-drive/callback
✓ http://localhost:3000/api/google-drive/callback
```

## Troubleshooting

### Still seeing redirect_uri_mismatch?

1. **Check for typos**: The URI must be **exact** - no trailing slashes, correct protocol (https/http), exact domain
2. **Wait longer**: Changes can take up to an hour to propagate
3. **Clear browser cache**: Sometimes the error is cached
4. **Verify the Client ID**: Make sure you're editing the correct OAuth client

### Different error after fixing redirect URI?

If you now see **"Access blocked: baeb90.com has not completed the Google verification process"**:
- This means the redirect URI is correct!
- You just need to add yourself as a test user (already done in "Audience" section)

## Summary

**What you need to do:**
1. Add both redirect URIs to Google Cloud Console
2. Wait 5-10 minutes
3. Test the connection in your preferred environment

Both URLs will work simultaneously, allowing you to test locally and use in production without changing OAuth settings.
