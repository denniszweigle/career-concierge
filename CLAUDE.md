# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start dev server (tsx watch on server/_core/index.ts + Vite HMR)
pnpm build        # Build frontend (Vite) + backend (esbuild ESM bundle)
pnpm start        # Run production build from dist/index.js
pnpm check        # TypeScript type checking (no emit)
pnpm format       # Prettier formatting
pnpm test         # Run all Vitest tests (server only, Node environment)
pnpm test server/openai.integration.test.ts   # Run a single test file
pnpm db:push      # Apply Drizzle schema to SQLite (run after schema changes)

# CI/CD: push to main triggers GitHub Actions → type-check → unit tests → build Docker image → deploy to GKE
# Requires GitHub secrets: GCP_SA_KEY
# GKE cluster: career-concierge (us-central1), project: career-concierge-prod, namespace: career-concierge
# Production URL: https://baeb90.com
# Manual k8s bootstrap: see k8s/secret-bootstrap.sh
```

Tests live in `server/**/*.test.ts` and `server/**/*.spec.ts`. There is no frontend test setup.

Integration tests (`*.integration.test.ts`) make real API calls and require valid env vars.

## Architecture

**Career Concierge** is a RAG-based personal brand tool that indexes career documents from Google Drive and uses vector similarity to match them against job descriptions.

### Stack
- **Frontend**: React 19 + TypeScript, Tailwind CSS 4, shadcn/ui (Radix), wouter routing, tRPC React Query
- **Backend**: Express 4 + tRPC 11, Drizzle ORM on SQLite (better-sqlite3)
- **LLM**: OpenAI-compatible endpoint via LangChain (`server/_core/llm.ts`) — configured by `BUILT_IN_FORGE_API_URL` + `BUILT_IN_FORGE_API_KEY`. Defaults to `gpt-4o-mini` for chat, `text-embedding-3-small` for embeddings
- **Observability**: LangSmith tracing enabled via `LANGCHAIN_TRACING_V2=true` + `LANGCHAIN_API_KEY`
- **Auth**: JWT session cookie (`app_session_id`) signed locally with `JWT_SECRET`. Manus OAuth (`OAUTH_SERVER_URL`) is only used during initial login and is not needed for localhost dev

### Key Data Flow

**Document Indexing Pipeline** (`drive.syncDocuments` tRPC procedure):
1. `googleDrive.ts` — lists files recursively from the configured Google Drive folder
2. `routers.ts` filters to extractable MIME types only (PDF/DOCX/PPTX/XLSX/TXT) before downloading — skips images, video, Visio, etc.
3. `documentExtractor.ts` — extracts text from PDF (pdf-parse@1.1.1 via createRequire), DOCX (mammoth), PPTX (JSZip), XLSX (SheetJS), TXT
4. Text is chunked (`CHUNK_SIZE`/`CHUNK_OVERLAP` chars) and stored in `documents` + `documentChunks` tables
5. `vectorEmbedding.ts` — generates embeddings via OpenAI and stores them as JSON arrays in SQLite

**Job Matching Pipeline** (`analysis.create` tRPC procedure):
1. `matchingEngine.extractJobRequirements()` — structured output call extracts 4 requirement categories (hardSkills, experience, domain, softSkills) from the JD
2. Each category is embedded and compared against all document chunks via cosine similarity (in-memory linear scan)
3. Weighted score: `matchScore = hardSkills×0.4 + experience×0.3 + domain×0.2 + softSkills×0.1`
4. LLM generates a narrative report with top strengths and gaps

### Auth & Role System

- `OWNER_OPEN_ID` — the openId that `db.ts` assigns `role = 'admin'` on upsert
- `adminProcedure` (in `trpc.ts`) — required for all Drive operations and analysis listing; checks `user.role === 'admin'`
- `protectedProcedure` — requires any authenticated user
- `publicProcedure` — no auth required (used by `auth.me`, `analysis.create`, `analysis.get`)
- For localhost dev, skip Manus OAuth entirely — see `docs/oauth_setup_instructions.md`

### Localhost Dev Login

When `OAUTH_SERVER_URL` is not set, visiting `/api/dev-login` (GET) creates/upserts an admin user using `OWNER_OPEN_ID`, sets a session cookie, and redirects to `/admin`. The endpoint is only registered in non-production (`!ENV.isProduction`). The Admin page shows a **Dev Login** button automatically when `import.meta.env.DEV` is true.

### Directory Structure
```
client/src/
  pages/         # Admin.tsx (Drive sync + docs), Analysis.tsx (results + Q&A), Home.tsx
  components/    # shadcn/ui + custom components
  hooks/         # Custom React hooks
server/
  _core/         # index.ts (Express entry), trpc.ts, context.ts, llm.ts, sdk.ts, oauth.ts, env.ts, cookies.ts
  routers.ts     # All tRPC routers (auth, drive, analysis)
  db.ts          # All Drizzle CRUD — single source of truth for DB access
  devLogin.ts    # GET /api/dev-login — localhost-only session bootstrap
  matchingEngine.ts    # Job matching, Chain of Density extraction, Q&A
  vectorEmbedding.ts   # Embedding generation + in-memory cosine similarity search
  documentExtractor.ts # PDF/DOCX/PPTX/XLSX/TXT extraction + chunking
  googleDrive.ts       # Google Drive API wrapper (OAuth2 client, file listing, download)
  googleDriveCallback.ts  # Express route for /api/google-drive/callback
drizzle/
  schema.ts      # DB schema: users, driveTokens, documents, documentChunks, analyses, chatMessages
docs/
  oauth_setup_instructions.md  # Localhost dev session setup (bypassing Manus)
  google_drive_setup.md        # Google Cloud project + Drive OAuth setup for localhost
```

### tRPC API Shape
- `auth.me` / `auth.logout` — public
- `drive.getAuthUrl` / `.handleCallback` / `.getConnectionStatus` / `.disconnect` / `.syncDocuments` / `.getDocuments` — admin only
- `analysis.create` / `.get` / `.askQuestion` / `.getChatHistory` — public
- `analysis.list` — admin only

### Path Aliases
- `@/` → `client/src/`
- `@shared/` → `shared/`

### Environment Variables
```
# Required
DATABASE_URL              # SQLite path, e.g. file:./data/db.sqlite
JWT_SECRET                # Signs session JWTs — any random 32+ char string for dev
BUILT_IN_FORGE_API_URL    # OpenAI-compatible base URL, e.g. https://api.openai.com
BUILT_IN_FORGE_API_KEY    # OpenAI API key
GOOGLE_DRIVE_CLIENT_ID
GOOGLE_DRIVE_CLIENT_SECRET
GOOGLE_DRIVE_FOLDER_URL   # Full Google Drive folder URL

# Required for admin access
OWNER_OPEN_ID             # openId string that gets role=admin in the DB
VITE_APP_ID               # Embedded in JWT payload — any string works for dev

# Optional / localhost unused
OAUTH_SERVER_URL          # Manus OAuth server — leave blank for localhost dev

# LangSmith (optional)
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY
LANGCHAIN_PROJECT

# LLM tuning (all have sensible defaults)
LLM_MODEL                 # default: gpt-4o-mini
LLM_MAX_TOKENS            # default: 8192
LLM_TEMPERATURE           # default: 0.1
EMBEDDING_MODEL           # default: text-embedding-3-small
CHUNK_SIZE                # default: 1000 (chars)
CHUNK_OVERLAP             # default: 200 (chars)
RAG_TOP_K_EVIDENCE        # default: 3
RAG_TOP_K_QA              # default: 5
RAG_STRENGTH_THRESHOLD    # default: 60 (0–100 score cutoff for strength vs gap)
```

### Known Limitations
- Vector search is an in-memory linear scan over all chunks — not suitable for large document sets
- Document sync runs synchronously in the request — no background job queue
- pdf-parse uses CJS interop via `createRequire` — keep it that way; ESM import will fail
