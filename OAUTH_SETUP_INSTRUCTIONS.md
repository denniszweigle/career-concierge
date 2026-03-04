# Google Drive OAuth Setup - Complete Instructions

## The Problem

You're seeing **"Error 400: redirect_uri_mismatch"** because Google OAuth requires you to register **exact** redirect URIs in advance. The application uses different URLs for development preview vs. production deployment.

## The Solution

Add **BOTH** redirect URIs to your Google Cloud Console OAuth client:

### 1. Production URL (Published Site)
```
https://careerconcierge-cedwcmhu.manus.space/api/google-drive/callback
```

### 2. Development Preview URL (Testing)
```
https://3000-iefof8di98c2t5xdu5uc2-a07ff6f8.us2.manus.computer/api/google-drive/callback
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
   https://careerconcierge-cedwcmhu.manus.space/api/google-drive/callback
   ```

2. Click **"+ ADD URI"**

3. Add the development preview URL:
   ```
   https://3000-iefof8di98c2t5xdu5uc2-a07ff6f8.us2.manus.computer/api/google-drive/callback
   ```

4. Click **"SAVE"**

### Step 4: Wait for Changes to Propagate

- Google notes: "It may take 5 minutes to a few hours for settings to take effect"
- Usually works within 5-10 minutes

### Step 5: Test the Connection

**Option A - Test in Development Preview (Immediate)**
1. Go to: https://3000-iefof8di98c2t5xdu5uc2-a07ff6f8.us2.manus.computer/dashboard
2. Click "Connect Google Drive"
3. Sign in with `dennis.zweigle@gmail.com`
4. Grant permissions
5. Should redirect back with "Connected" status

**Option B - Test in Production (After Publishing)**
1. Publish the latest checkpoint in Manus UI
2. Wait for deployment to complete
3. Go to: https://careerconcierge-cedwcmhu.manus.space/dashboard
4. Click "Connect Google Drive"
5. Complete OAuth flow

## Why This Happens

The application dynamically constructs the redirect URI based on where it's running:

- **Development**: Uses the preview URL (`3000-iefof8di98c2t5xdu5uc2...`)
- **Production**: Uses the published domain (`careerconcierge-cedwcmhu.manus.space`)

Google's OAuth security requires you to pre-register **every possible** redirect URI. This prevents malicious sites from intercepting your OAuth tokens.

## Verification

After adding both URIs, you should see them listed in Google Cloud Console like this:

```
Authorized redirect URIs:
✓ https://careerconcierge-cedwcmhu.manus.space/api/google-drive/callback
✓ https://3000-iefof8di98c2t5xdu5uc2-a07ff6f8.us2.manus.computer/api/google-drive/callback
```

## Troubleshooting

### Still seeing redirect_uri_mismatch?

1. **Check for typos**: The URI must be **exact** - no trailing slashes, correct protocol (https), exact subdomain
2. **Wait longer**: Changes can take up to an hour to propagate
3. **Clear browser cache**: Sometimes the error is cached
4. **Verify the Client ID**: Make sure you're editing the correct OAuth client

### Different error after fixing redirect URI?

If you now see **"Access blocked: manus.space has not completed the Google verification process"**:
- This means the redirect URI is correct!
- You just need to add yourself as a test user (already done in "Audience" section)

## Summary

**What you need to do:**
1. Add the development preview URL to Google Cloud Console redirect URIs
2. Wait 5-10 minutes
3. Test the connection in the preview dashboard
4. Once working, publish and test in production

Both URLs will work simultaneously, allowing you to test in development and use in production without changing OAuth settings.
