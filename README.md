# Personal Career Concierge

**Author:** Dennis "DZ" Zweigle

A RAG-based (Retrieval-Augmented Generation) web application that indexes career documents from Google Drive and uses vector similarity to match them against job descriptions, providing AI-powered match/mismatch analysis and conversational Q&A.

---

## System Prerequisites

Install these before anything else:

| Tool | Version | Install |
|---|---|---|
| **Node.js** | 18+ | https://nodejs.org or `nvm install 20` |
| **pnpm** | 10+ | `npm install -g pnpm` |

Verify:
```bash
node --version   # v18.x or higher
pnpm --version   # 10.x or higher
```

---

## Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, TypeScript, Tailwind CSS 4, shadcn/ui (Radix), wouter, tRPC React Query, dark mode (cookie-persisted) |
| **Backend** | Express 4, tRPC 11, Drizzle ORM |
| **Database** | SQLite via `better-sqlite3` |
| **LLM** | OpenAI-compatible endpoint via LangChain (`gpt-4o-mini` default, `text-embedding-3-small` for embeddings) |
| **Auth** | JWT session cookie (`app_session_id`) signed with `JWT_SECRET` |
| **Document parsing** | `pdf-parse` (PDF), `mammoth` (DOCX), `jszip` (PPTX), `xlsx` (XLSX), plain text |

---

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Create `.env`

Copy the template below and fill in values (see [Environment Variables](#environment-variables) for details):

```env
# Database
DATABASE_URL=file:./data/db.sqlite

# Auth (required)
JWT_SECRET=<generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
OWNER_OPEN_ID=local-dev-user
VITE_APP_ID=career-concierge-dev
OAUTH_SERVER_URL=                      # Leave blank for localhost dev

# LLM (OpenAI-compatible endpoint)
BUILT_IN_FORGE_API_URL=https://api.openai.com
BUILT_IN_FORGE_API_KEY=sk-...

# Google Drive
GOOGLE_DRIVE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
GOOGLE_DRIVE_CLIENT_SECRET=<your-client-secret>
GOOGLE_DRIVE_FOLDER_URL=https://drive.google.com/drive/folders/<folder-id>
```

### 3. Initialize the database

```bash
pnpm db:push
```

### 4. Start the dev server

```bash
pnpm dev
```

App runs at `http://localhost:3000`.

### 5. Log in (localhost only)

Visit `http://localhost:3000/api/dev-login` — this creates/upserts an admin user from `OWNER_OPEN_ID`, sets a session cookie, and redirects to `/admin`. No Manus OAuth required.

Alternatively, the Admin page shows a **Dev Login** button automatically when running in dev mode.

---

## Commands

```bash
pnpm dev          # Start dev server (tsx watch + Vite HMR)
pnpm build        # Build frontend (Vite) + backend (esbuild ESM bundle)
pnpm start        # Run production build from dist/index.js
pnpm check        # TypeScript type checking (no emit)
pnpm format       # Prettier formatting
pnpm test         # Run all Vitest tests (server only)
pnpm db:push      # Apply Drizzle schema to SQLite (run after schema changes)
```

Run a single test file:
```bash
pnpm test server/openai.integration.test.ts
```

Integration tests (`*.integration.test.ts`) make real API calls and require valid env vars.

---

## Environment Variables

### Required

```env
DATABASE_URL              # SQLite path, e.g. file:./data/db.sqlite
JWT_SECRET                # Signs session JWTs — any random 32+ char string for dev
BUILT_IN_FORGE_API_URL    # OpenAI-compatible base URL, e.g. https://api.openai.com (no /v1 suffix — code appends it)
BUILT_IN_FORGE_API_KEY    # OpenAI API key

GOOGLE_DRIVE_CLIENT_ID
GOOGLE_DRIVE_CLIENT_SECRET
GOOGLE_DRIVE_FOLDER_URL   # Full Google Drive folder URL

OWNER_OPEN_ID             # The openId string that gets role=admin in the DB
VITE_APP_ID               # Embedded in JWT payload — any string works for dev
```

### Optional / Localhost Unused

```env
OAUTH_SERVER_URL          # Manus OAuth server — leave blank for localhost dev
```

### LangSmith Observability (optional)

```env
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=<your-langsmith-key>
LANGCHAIN_PROJECT=<project-name>
```

### LLM Tuning (all have defaults)

```env
LLM_MODEL                 # default: gpt-4o-mini
LLM_MAX_TOKENS            # default: 8192
LLM_TEMPERATURE           # default: 0.1
EMBEDDING_MODEL           # default: text-embedding-3-small
CHUNK_SIZE                # default: 1000 (chars)
CHUNK_OVERLAP             # default: 200 (chars)
RAG_TOP_K_STAGE1          # default: 50 (Stage 1 cosine scan candidate pool)
RAG_TOP_K_EVIDENCE        # default: 8 (Stage 2 re-ranker final passage count)
RAG_STRENGTH_THRESHOLD    # default: 50 (0–100 score cutoff for strength vs gap)
```

---

## Google Drive Setup

See [`docs/google_drive_setup.md`](docs/google_drive_setup.md) for the full walkthrough. Summary:

1. Create a Google Cloud project and enable the **Google Drive API**.
2. Create an OAuth 2.0 Web Application credential.
3. Add `http://localhost:3000/api/google-drive/callback` as an authorized redirect URI.
4. Copy the Client ID and Secret into `.env`.
5. In the app, go to Admin → Connect Google Drive → complete the OAuth flow.
6. Click **Sync Documents** to index your folder.

Supported file types: PDF, DOCX, PPTX, XLSX, TXT. All other types (images, video, Visio, etc.) are skipped.

---

## Auth & Roles

- `OWNER_OPEN_ID` — the `openId` that gets `role = 'admin'` on upsert
- `adminProcedure` — required for Drive operations and analysis listing
- `protectedProcedure` — any authenticated user
- `publicProcedure` — no auth (used by `auth.me`, `analysis.create`, `analysis.get`)

For full localhost auth setup details see [`docs/oauth_setup_instructions.md`](docs/oauth_setup_instructions.md).

---

## Architecture

### Key Data Flow

**Document Indexing** (`drive.syncDocuments` tRPC procedure):
1. Lists files recursively from the configured Google Drive folder
2. Filters to extractable MIME types (PDF/DOCX/PPTX/XLSX/TXT); skips unchanged files via `modifiedTime` comparison
3. Deletes stale chunks before re-indexing changed files (no chunk duplication on repeat syncs)
4. Extracts text from each file
5. Chunks text and stores in `documents` + `documentChunks` SQLite tables
6. Generates embeddings and stores as JSON arrays in SQLite; clears in-memory chunk cache after sync

**Job Matching** (`POST /api/stream-match` SSE endpoint):
1. Chain of Density extraction — four-pass LLM call extracts hard skills, experience, domain, and soft skill requirements from the JD
2. Stage 1 — cosine similarity scan across all chunks (loaded from in-memory cache after first request); top `RAG_TOP_K_STAGE1` (default 50) candidates selected per requirement
3. LLM re-ranker narrows to `RAG_TOP_K_EVIDENCE` (default 8) using language-level precision
4. Weighted score: `matchScore = hardSkills×0.4 + experience×0.3 + domain×0.2 + softSkills×0.1`
5. LLM generates a narrative report with top strengths and gaps, grounded in the top 3 retrieved evidence passages per requirement
6. Progress streamed as SSE events (`Extracting requirements` → `Searching portfolio` → `Scoring evidence` → `Generating report`) — client shows live stage name, cycling adjective, progress bar, and elapsed time

**Portfolio Q&A** (`POST /api/stream-answer` SSE endpoint):
1. HyDE — generates a hypothetical passage, embeds it for Stage 1 search
2. Stage 1 — cosine scan against in-memory chunk cache; list queries ("list all patents", "how many...") automatically use `topK×4` and `stage1Pool×3`
3. Stage 2 — LLM re-ranker selects final passages
4. SSE streaming — answer streams token-by-token; client shows cycling adjective + elapsed time during retrieval, then renders text progressively; token usage (`in · out`) shown after completion

### Directory Structure

```
client/src/
  pages/         # Admin.tsx, Analysis.tsx, Chat.tsx, Home.tsx, Reports.tsx, Tech.tsx
  components/    # shadcn/ui + custom components
  hooks/         # Custom React hooks
server/
  _core/         # index.ts (Express entry), trpc.ts, context.ts, llm.ts, env.ts, cookies.ts
  routers.ts     # All tRPC routers (auth, drive, analysis)
  db.ts          # All Drizzle CRUD — single source of truth for DB access
  devLogin.ts    # GET /api/dev-login — localhost-only session bootstrap
  matchingEngine.ts    # Job matching, Chain of Density extraction, Q&A
  vectorEmbedding.ts   # Embedding generation + in-memory cosine similarity search
  documentExtractor.ts # PDF/DOCX/PPTX/XLSX/TXT extraction + chunking
  googleDrive.ts       # Google Drive API wrapper
  googleDriveCallback.ts  # Express route for /api/google-drive/callback
  syncState.ts         # In-memory chunk cache + incremental sync state
drizzle/
  schema.ts      # DB schema: users, driveTokens, documents, documentChunks, analyses, chatMessages
docs/
  oauth_setup_instructions.md  # Localhost dev session setup
  google_drive_setup.md        # Google Cloud project + Drive OAuth setup
```

### tRPC API Shape

- `auth.me` / `auth.logout` — public
- `drive.getAuthUrl` / `.handleCallback` / `.getConnectionStatus` / `.disconnect` / `.syncDocuments` / `.getDocuments` — admin only
- `analysis.create` / `.get` / `.askQuestion` / `.getChatHistory` / `.chatGeneral` — public
- `analysis.list` — admin only
- `stats.getPublicStats` — public
- `POST /api/stream-match` — SSE endpoint; streams job match pipeline progress + final result
- `POST /api/stream-answer` — SSE endpoint; streams Q&A answers token-by-token with token usage in done event

### Path Aliases

- `@/` → `client/src/`
- `@shared/` → `shared/`

---

## Scoring Algorithm

```
Match Score = (Hard Skills × 0.4) + (Experience × 0.3) + (Domain × 0.2) + (Soft Skills × 0.1)
```

Each category score is the average cosine similarity between the embedded requirement and the top matching document chunks.

---

## Known Limitations

- **Vector search** uses an in-memory chunk cache with linear cosine scan — fast for personal document sets, not suitable for large corpora
- **Document sync** runs synchronously in the request — no background job queue; incremental sync skips unchanged files to reduce latency
- **pdf-parse** uses CJS interop via `createRequire` — must stay that way; ESM import will fail

---

## Tests

```
server/openai.integration.test.ts       # Verifies LLM + embedding connectivity
server/googledrive.integration.test.ts  # Verifies Drive OAuth setup
server/documentExtractor.test.ts        # 8 tests covering all 5 file types
```

---

## Production Deployment

Deployed on a Hetzner VPS using Docker Compose with Caddy as a reverse proxy for automatic HTTPS.

See [`docs/hetzner_deployment.md`](docs/hetzner_deployment.md) for the full step-by-step guide.

CI/CD is handled by GitHub Actions (`.github/workflows/deploy.yml`): every push to `main` runs type-check and unit tests, then SSHes into the Hetzner server to pull and rebuild automatically.

---

## License

MIT
