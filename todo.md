# Project TODO

## Backend Infrastructure
- [x] Google Drive OAuth integration with manual login flow
- [x] Recursive folder scanning to extract PDF, DOCX, and PPTX files
- [x] Document content extraction pipeline (PDF, DOCX, PPTX to text chunks)
- [x] Vector embedding system using LLM for searchable index
- [x] Database schema for documents, embeddings, and analysis results
- [x] Document sync mechanism to update vector index when new files are added

## Matching & Analysis Engine
- [x] Job description parsing and requirement extraction
- [x] RAG-based matching algorithm comparing JD against portfolio documents
- [x] Chain of Density mismatch detection protocol for gap identification
- [x] Scoring algorithm (Hard Skills 40%, Experience 30%, Domain 20%, Soft Skills 10%)
- [x] Conversational Q&A interface powered by LLM using indexed documents

## Frontend UI
- [x] Google Drive connection interface with OAuth flow
- [x] Document sync status dashboard showing indexed files
- [x] Job description input interface (paste or upload)
- [x] Interactive Match/Mismatch dashboard with alignment scores
- [x] Top 3 strengths and gaps visualization
- [x] Conversational Q&A chat interface
- [x] Document management and re-sync controls

## Testing & Documentation
- [ ] Unit tests for document extraction pipeline
- [ ] Unit tests for matching algorithm
- [ ] Integration tests for complete workflow
- [x] README documentation with API explanations

## Bug Fixes
- [x] Debug and fix 403 error when accessing Google Drive
- [x] Add missing OAuth callback route handler
- [x] Create comprehensive OAuth setup documentation
- [x] Test complete OAuth flow end-to-end with user credentials - VERIFIED WORKING
- [x] Fix OAuth callback - tokens not being saved after successful authentication
- [x] Use Manus SDK authentication to identify user in callback
- [x] Debug token storage in database after Google OAuth flow completes
- [x] Fix token expiry timestamp calculation (was creating year 2082 dates)
- [x] Add development preview URL to Google Cloud Console redirect URIs
- [x] Document that both dev and prod URLs need to be in Google OAuth settings

## Testing & Deployment
- [x] Save checkpoint with current implementation
- [ ] Test OAuth flow with updated Google Cloud Console settings
- [ ] Enable Google Drive API in Google Cloud Console
- [ ] Test document sync from Google Drive folder
- [ ] Verify job description analysis works end-to-end
- [ ] Publish to production after successful testing

## New Requirements
- [x] Update GOOGLE_DRIVE_FOLDER_URL to new Corporate folder location
- [x] Fix document sync to recursively scan all subfolders (already implemented)
- [x] Extract text from: PDF, DOCX, PPTX, DOC for RAG matching
- [x] Index metadata only for: images, videos, Visio, DrawIO (show in list but don't extract text)
- [ ] Test sync with new folder structure containing multiple subfolders
- [ ] Verify all file types are being indexed correctly

## Critical Bug - OAuth Credentials
- [x] Fix unauthorized_client error when syncing documents - removed hardcoded placeholder URL
- [x] Fixed OAuth2Client creation to not require redirect URI for token refresh
- [ ] Test document sync after fix

## New Feature - Google Drive Disconnect
- [x] Add disconnect button to dashboard to clear Google Drive tokens
- [x] Add disconnect mutation in routers.ts to delete tokens from database
- [x] Update Dashboard UI to show disconnect button when connected
- [ ] Test disconnect and reconnect flow to get fresh tokens in production
