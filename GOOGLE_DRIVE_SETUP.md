# Google Drive OAuth Setup Guide

This guide explains how to properly configure Google Drive API access to resolve 403 errors and enable document indexing.

## Understanding the 403 Error

A **403 Forbidden** error when accessing Google Drive typically occurs due to one of these issues:

1. **OAuth Redirect URI Mismatch**: The redirect URI in Google Cloud Console doesn't match your application's callback URL
2. **Missing or Invalid Credentials**: Google Drive API credentials not properly configured
3. **Insufficient API Scopes**: The OAuth token doesn't have permission to access the requested resources
4. **Folder Access Permissions**: The authenticated user doesn't have access to the target folder

## Step-by-Step Setup

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Enter project name: "Career Concierge" (or your preferred name)
4. Click "Create"

### 2. Enable Google Drive API

1. In the Google Cloud Console, navigate to "APIs & Services" → "Library"
2. Search for "Google Drive API"
3. Click on it and press "Enable"

### 3. Configure OAuth Consent Screen

1. Go to "APIs & Services" → "OAuth consent screen"
2. Select "External" user type (unless you have a Google Workspace)
3. Click "Create"
4. Fill in the required fields:
   - **App name**: Personal Career Concierge
   - **User support email**: Your email
   - **Developer contact**: Your email
5. Click "Save and Continue"
6. On the "Scopes" page, click "Add or Remove Scopes"
7. Add the following scope:
   - `https://www.googleapis.com/auth/drive.readonly`
8. Click "Update" then "Save and Continue"
9. Add test users (your email address) if the app is in testing mode
10. Click "Save and Continue"

### 4. Create OAuth 2.0 Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth 2.0 Client ID"
3. Select "Web application" as the application type
4. Enter a name: "Career Concierge Web Client"
5. **CRITICAL**: Add Authorized Redirect URI:
   ```
   https://YOUR-DOMAIN.manus.space/api/google-drive/callback
   ```
   Replace `YOUR-DOMAIN` with your actual Manus project subdomain.
   
   **Example**: If your app is at `https://career-concierge-abc123.manus.space`, use:
   ```
   https://career-concierge-abc123.manus.space/api/google-drive/callback
   ```

6. Click "Create"
7. Copy the **Client ID** and **Client Secret** (you'll need these next)

### 5. Configure Application Secrets

The application already has the Google Drive credentials configured through the Manus secrets system. If you need to update them:

1. Go to your application's Settings → Secrets panel in the Manus UI
2. Update these values:
   - `GOOGLE_DRIVE_CLIENT_ID`: Your OAuth 2.0 Client ID
   - `GOOGLE_DRIVE_CLIENT_SECRET`: Your OAuth 2.0 Client Secret

### 6. Verify Folder Permissions

The target Google Drive folder must be accessible by the Google account you'll use to authenticate:

**Current folder**: `https://drive.google.com/drive/folders/1WKYLMDQv5c-EKrXQ-qMlFA7ltpkUUxls`

**Options**:
- **Option A**: Make the folder publicly accessible (Anyone with the link can view)
- **Option B**: Share the folder with the specific Google account you'll use to sign in
- **Option C**: Use the Google account that owns the folder

To check/modify permissions:
1. Open the folder in Google Drive
2. Click the "Share" button
3. Adjust sharing settings as needed

## Testing the Connection

1. Navigate to your application dashboard
2. Click "Connect Google Drive"
3. You'll be redirected to Google's OAuth consent screen
4. Review the permissions (read-only access to Drive)
5. Click "Allow"
6. You should be redirected back to the dashboard with a success message

If you see a 403 error at this point, check:
- The redirect URI in Google Cloud Console **exactly** matches your callback URL
- The folder permissions allow access by your authenticated account
- The Google Drive API is enabled in your Cloud project

## Common Issues and Solutions

### Issue: "redirect_uri_mismatch" Error

**Cause**: The redirect URI doesn't match what's configured in Google Cloud Console

**Solution**: 
1. Check your application's URL (look in the browser address bar)
2. Ensure the redirect URI in Google Cloud Console is:
   ```
   https://YOUR-ACTUAL-DOMAIN.manus.space/api/google-drive/callback
   ```
3. No trailing slashes, exact protocol (https), exact path

### Issue: "access_denied" Error

**Cause**: User declined permissions or the OAuth consent screen isn't properly configured

**Solution**:
1. Ensure the OAuth consent screen is published (or you're added as a test user)
2. Try the authorization flow again and click "Allow"

### Issue: 403 When Listing Files

**Cause**: The authenticated user doesn't have access to the target folder

**Solution**:
1. Share the folder with the Google account you're using
2. Or use the account that owns the folder
3. Or make the folder accessible via link

### Issue: "invalid_client" Error

**Cause**: Client ID or Client Secret is incorrect

**Solution**:
1. Verify the credentials in your Manus secrets match those in Google Cloud Console
2. Regenerate credentials if needed
3. Restart the application after updating secrets

## Security Best Practices

1. **Never commit credentials**: The Client ID and Secret are stored as environment variables, never in code
2. **Use read-only scope**: The application only requests `drive.readonly` access
3. **Refresh tokens**: The application stores refresh tokens to maintain access without repeated authorization
4. **Audit access**: Regularly review which applications have access to your Google Drive in Google Account settings

## API Quota and Limits

Google Drive API has the following limits (free tier):
- **Queries per day**: 1,000,000,000
- **Queries per 100 seconds per user**: 1,000
- **Queries per 100 seconds**: 10,000

For the Career Concierge use case (personal portfolio with occasional syncs), these limits are more than sufficient.

## Troubleshooting Checklist

If you're still experiencing 403 errors, verify:

- [ ] Google Drive API is enabled in Google Cloud Console
- [ ] OAuth consent screen is configured with correct scopes
- [ ] OAuth 2.0 credentials are created for "Web application"
- [ ] Redirect URI **exactly** matches: `https://YOUR-DOMAIN.manus.space/api/google-drive/callback`
- [ ] Client ID and Secret are correctly set in application secrets
- [ ] The target folder is accessible by the authenticated user
- [ ] You've completed the OAuth flow and granted permissions

## Need Help?

If you continue to experience issues:

1. Check the browser console for detailed error messages
2. Review the server logs for API response details
3. Verify all steps in this guide have been completed
4. Try using a different Google account to isolate permission issues

## Additional Resources

- [Google Drive API Documentation](https://developers.google.com/drive/api/guides/about-sdk)
- [OAuth 2.0 for Web Server Applications](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google Cloud Console](https://console.cloud.google.com/)
