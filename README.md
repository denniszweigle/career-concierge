# Agentic Zweigle — Personal Career Concierge

**Author:** Dennis "DZ" Zweigle

A RAG-based (Retrieval-Augmented Generation) personal brand platform that indexes career documents from Google Drive and uses vector similarity to match them against job descriptions — delivering AI-powered match/mismatch analysis, conversational portfolio Q&A, and ATS-optimized resume tailoring.

Built by Dennis "DZ" Zweigle as a personal tool and designed to be released as **open source** so anyone can deploy their own AI-powered career identity — tailored to their personality, voice, and background. The goal: democratize AI-driven career positioning and keep AI transparent, human-centered, and accessible.

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
RAG_TOP_K_STAGE1          # default: 20 (Stage 1 cosine scan candidate pool)
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
2. Filters to extractable MIME types (PDF/DOCX/PPTX/XLSX/TXT); skips files where `isIndexed=true` and `modifiedTime` is unchanged
3. Deletes stale chunks before re-indexing changed files (no chunk duplication on repeat syncs)
4. Extracts text from each file
5. Chunks text and stores in `documents` + `documentChunks` SQLite tables
6. Generates embeddings, stores as JSON arrays in SQLite, then marks the document `isIndexed=true`; clears in-memory chunk cache after sync

**Job Matching** (`POST /api/stream-match` SSE endpoint):
1. Chain of Density extraction — four-pass LLM call extracts hard skills, experience, domain, and soft skill requirements from the JD
2. Stage 1 — cosine similarity scan across all chunks (loaded from in-memory cache after first request); top `RAG_TOP_K_STAGE1` (default 50) candidates selected per requirement
3. LLM re-ranker narrows to `RAG_TOP_K_EVIDENCE` (default 8) using language-level precision
4. Weighted score: `matchScore = hardSkills×0.4 + experience×0.3 + domain×0.2 + softSkills×0.1`
5. LLM generates a narrative report with top strengths and gaps, grounded in the top 3 retrieved evidence passages per requirement
6. Progress streamed as SSE events (`Extracting requirements` → `Searching portfolio` → `Scoring evidence` → `Generating report`) — client shows live stage name, cycling adjective, progress bar, and elapsed time

**Resume & Cover Letter Tailor** (`POST /api/stream-tailor` SSE endpoint):
1. `extractJobRequirements()` — same structured LLM call as the match pipeline; extracts hardSkills, experienceRequirements, domainKnowledge, softSkills from the JD
2. For each of the 4 requirement categories, embeds every requirement and retrieves top-K evidence passages from the **full 392-doc portfolio** (not just the resume) — so bridge strategy has real project-level proof
3. Primary resume chunks retrieved separately as the ATS structural template
4. Streams LLM generation with a structured prompt: template + per-category JD requirements + matched portfolio evidence
5. Title Optimization: every Work Experience title rewritten as "[Actual Title] | [JD-Aligned Framing]" for ATS title-matching
6. Bridge Strategy: each JD requirement explicitly bridged with evidence or omitted — never fabricated
4. Client parses the output on `### CUSTOM_RESUME` / `### CUSTOM_COVER_LETTER` delimiters into two documents
5. Rendered in a tabbed preview (Resume | Cover Letter) with **Download PDF** buttons; PDF is generated entirely client-side via `jsPDF` (selectable text, no server round-trip)
6. No DB save — ephemeral output only

**Portfolio Q&A** (`POST /api/stream-answer` SSE endpoint):
1. **HyDE (Hypothetical Document Embedding)** — before searching, an LLM generates a dense hypothetical career passage that *would* answer the question; that passage is embedded instead of the raw question, dramatically improving recall for broad/summary queries where question vocabulary differs from document vocabulary
2. Cosine similarity scan against the in-memory chunk cache using the HyDE embedding
3. Top `RAG_TOP_K_QA` (default 8) passages retrieved; broad queries ("summarize", "describe", "overview", "how is", "how does", "applying", "approach", "vision", "strategy") automatically expand to 3× the pool; list queries ("list all", "how many") expand to 4×
4. **Portfolio attribution** — the system prompt instructs the LLM that every retrieved passage is from the candidate's personal portfolio (documents authored, patents filed, frameworks designed) so content is correctly attributed even when the candidate's name doesn't appear in every sentence
5. SSE streaming — answer streams token-by-token; client shows status messages during retrieval, then renders text progressively; token usage (`in · out`) shown after completion

---

## Portfolio Chat

### What it does

The **Portfolio Chat** page (`/chat`) is a conversational interface grounded exclusively in the candidate's indexed portfolio documents. It is designed to answer recruiter and hiring manager questions with cited, factual responses — no hallucination, no generic AI filler.

### Suggested Questions

The left sidebar displays 10 pre-built suggested prompts that demonstrate the depth of the portfolio. Each fires a full RAG query against all indexed documents:

| Prompt | What it surfaces |
|---|---|
| What are your strongest technical skills? | Hard skills extracted across resume + project docs |
| Summarize leadership and team management experience | Management history across all career documents |
| What measurable business impact has been demonstrated? | Metrics: invoice cycle reduction, claims outcomes, team scale |
| What does the portfolio reveal about leadership style? | Cross-document synthesis of management philosophy |
| How does he handle cross-functional collaboration? | Evidence from project docs, plans, and career history |
| Tell me about thoughts on Governance | Proof of Governance (PoG) framework — constitutions, whitepapers, investor docs |
| How is Dennis applying Governance to IoT and Blockchain? | PoG + IoT integration — 206 indexed chunks across 45 files |
| What are his most notable career achievements? | Top career milestones ranked by impact |
| What industries has he worked across? | Cross-domain synthesis: Aerospace, ERP, Retail, AI, Blockchain, HR, FinTech |
| What's the strongest case for hiring? | Full portfolio synthesis into a hiring narrative |

### RAG Pipeline Enhancements (Chat-specific)

Three rounds of improvements were made to ensure the Chat page finds and correctly answers questions about complex, multi-document topics:

**Round 1 — HyDE added to streaming pipeline**
The original `streamAnswer` function embedded the raw question directly. This caused vocabulary mismatch failures — a question like *"Summarize his leadership experience"* didn't semantically match resume phrases like *"Directed the migration of a CoE team"*. Fix: generate a hypothetical career passage first (same technique used in the non-streaming `answerQuestion`), embed that, then search. Recall improved dramatically for all broad/summary questions.

**Round 2 — Broader topK trigger**
The broad-query multiplier (3× chunks) originally only caught `summarize/describe/overview`. Questions like *"How is Dennis applying Governance to IoT?"* fell through to just 8 chunks. Fix: extended the regex to include `how is / how does / how did / what is / what are / applying / approach / vision / strategy` — any exploratory question now gets the expanded chunk pool.

**Round 3 — Portfolio attribution in system prompt**
The PoG Constitution, blockchain frameworks, and IoT governance documents are written as formal constitutional/legal documents — Dennis's name doesn't appear in every sentence. The LLM was seeing 206 relevant chunks but refusing to connect them to Dennis. Fix: the system prompt now explicitly states *"every retrieved passage is from the candidate's personal portfolio — documents he authored, patents he filed, frameworks he designed"* — so the LLM correctly attributes all content without hallucinating.

### UI Features

- **Collapsible sidebar** — suggested questions panel can be hidden/shown via a chevron toggle on the vertical separator, giving more space to the chat area
- **Live status messages** — each retrieval stage emits a status event: embedding → scanning N passages → retrieved M passages from K documents → composing response
- **Elapsed timer** — visible during retrieval and streaming so users know the system is working
- **Source citations** — every assistant response includes clickable source chips showing the file name and similarity score, linked directly to the source document in Google Drive
- **Token usage** — input and output token counts shown below each completed response
- **Conversation history** — multi-turn context is passed with every request; a Clear conversation button resets the session

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
  matchingEngine.ts    # Job matching, Chain of Density extraction, Q&A, chunk cache
  tailorEngine.ts      # Resume + cover letter tailor — RAG retrieval + streaming LLM generation
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
- `POST /api/stream-tailor` — SSE endpoint; streams tailored resume + cover letter (no DB save)

### Path Aliases

- `@/` → `client/src/`
- `@shared/` → `shared/`

---

## Tailor Resume & Cover Letter

### What it does

The **Tailor Resume & Cover Letter** feature generates a fully ATS-optimized resume and cover letter for any job description in one click. It:

- **Structured JD extraction** — same 4-category requirement extraction used by the match engine (hardSkills, experience, domain, softSkills), not a single blob embedding
- **Full portfolio evidence retrieval** — for each requirement, searches all 392 indexed documents (not just the resume) to find the real project-level proof needed to back up each bridge
- **Keyword-injects** hard skills scraped from the JD naturally into the Professional Summary and Skills sections
- **Title Optimization** — every Work Experience title rewritten as `[Actual Title] | [JD-Aligned Framing]` so ATS title-matching and 6-second human scans both see the right keywords on every line
- **Bridges equivalent technologies** — e.g., JD asks for AWS SageMaker → bridges with Google Cloud/Vertex AI MLOps experience
- **Maintains factual integrity** — all content is grounded in indexed portfolio documents via RAG retrieval (top 30 chunks by cosine similarity)
- **Frames 7 years of AI** — the hook emphasizes progressive AI architecture mastery from early ML pipelines to agentic RAG, not a longer career span
- **Generates ATS-friendly PDFs** client-side via `jsPDF` (selectable text, standard fonts, clean headers, 20mm margins)

### How to use

**From the Match page:**
1. Go to `/match`, paste a job title and description
2. Click **Tailor Resume & Cover Letter**
3. Watch status messages stream: Extracting requirements → Searching portfolio → Generating
4. After ~30–60s, two tabs appear: **Resume** | **Cover Letter**
5. Click **Download Resume PDF** or **Download Cover Letter PDF**

**From an Analysis results page:**
1. Run **Analyze Match** on any job description
2. On the results page, click the prominent **Tailor Resume & Cover Letter** button (above the score cards, or in the top bar) — no re-pasting required, the JD is stored
3. Tailored documents appear below the Detailed Report

No database entries are created — the output is ephemeral.

### System prompt

The tailor system prompt lives in **`data/tailor-prompt.md`** — a plain text file that can be edited at any time without redeploying. It is cached in memory on first use and can be refreshed live from the Admin page without restarting the server.

Key sections in the prompt:
- **CANDIDATE IDENTITY** — AIGP cert, MIT AI Strategy, SWARM Tech AI role, team size range, key metrics to front-load
- **BRIDGE STRATEGY** — for each JD requirement, uses the retrieved portfolio evidence to bridge or explicitly omit; never fabricates; every Skills section entry must be backed by a body bullet
- **TITLE OPTIMIZATION** — every Work Experience title rewritten as `[Actual Title] | [JD-Aligned Framing]` using the pipe format; applied to all positions, not just current role
- **STRUCTURAL TEMPLATE** — instructs the LLM to mirror the ATS section order of the starred (primary) resume exactly
- **THOUGHT LEADERSHIP SIGNALS** — signature differentiators to surface when JD context fits: blockchain asset tokenization ($130T addressable market), AI workforce displacement curriculum (1.5M pathway), open-source AI career platform vision, and the 6–7 year paradigm cadence
- **RESUME INSTRUCTIONS** — keyword injection, chronological format, quantifiable impact front-loading
- **COVER LETTER INSTRUCTIONS** — hook, governance angle for regulated industries, thought leadership closing

To edit: update `data/tailor-prompt.md` directly, then click **Refresh Prompt Cache** in Admin → AI Tailor System Prompt.

### Codebase locations

| File | Purpose |
|---|---|
| `server/tailorEngine.ts` | `streamTailor()` async generator — RAG retrieval + streaming LLM |
| `server/_core/index.ts` | `POST /api/stream-tailor` SSE endpoint |
| `client/src/pages/Match.tsx` | Tailor button, status UI, tab output, PDF download |
| `client/src/pages/Analysis.tsx` | Tailor button in top bar + above score cards; inline output with PDF download |

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

CI/CD is handled by GitHub Actions (`.github/workflows/deploy.yml`) in three stages:
1. **Type-check & unit tests** — runs `pnpm check` + `pnpm test` on every push to `main`
2. **Build & push Docker image** — builds the production image in GitHub Actions (with GHA layer caching) and pushes to GitHub Container Registry (`ghcr.io`)
3. **Deploy** — SSHs into the Hetzner server, pulls the pre-built image from ghcr.io, and runs `docker compose up -d` — no server-side build, deploy completes in under 2 minutes

The SQLite database and Caddy TLS certificates persist across deploys via Docker named volumes (`sqlite_data`, `caddy_data`).

---

## License

MIT
