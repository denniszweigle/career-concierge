import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Database, FileCode2, Server, Shield, Layers, Wrench, Sparkles, Lightbulb, Code2, ShieldCheck, GitBranch } from "lucide-react";

type BusinessTool = {
  name: string;
  role: string;
  stat: string;
  description: string;
  link: string;
  icon: React.ElementType;
  color: string;
  badgeColor: string;
};

const BUSINESS_TOOLS: BusinessTool[] = [
  {
    name: "Manus.AI",
    role: "Concept & Architecture",
    stat: "8 hrs",
    description:
      "Used to rapidly prototype the product concept, define the core user journey, and establish the high-level architecture. Manus's autonomous agent capabilities allowed the entire product vision — from RAG pipeline design to user experience flow — to be explored and validated in a single focused session.",
    link: "https://manus.ai",
    icon: Lightbulb,
    color: "text-amber-600",
    badgeColor: "bg-amber-100 text-amber-700",
  },
  {
    name: "Anthropic Claude Code",
    role: "Technical Implementation",
    stat: "72 hrs",
    description:
      "Handled all technical details and code generation — from schema design and tRPC router definitions to the RAG matching engine, document extraction pipeline, Google Drive OAuth integration, and the full React frontend. Claude Code's deep codebase awareness and iterative refinement loop made it possible to build production-quality, type-safe TypeScript across a full-stack monorepo.",
    link: "https://claude.ai/code",
    icon: Code2,
    color: "text-violet-600",
    badgeColor: "bg-violet-100 text-violet-700",
  },
  {
    name: "Claude Code Hooks",
    role: "Security & Quality Enforcement",
    stat: "3 hooks",
    description:
      "• Secret guard — PreToolUse intercepts all Read, Grep, Edit, Write, and Bash calls, blocking access to .env, credentials.json, and token.pickle and sandboxing all file I/O to the project directory.\n\n• Type check — PostToolUse runs pnpm check (tsc --noEmit) after every TypeScript edit and pipes any type errors back to Claude as actionable feedback — never blocking a save.\n\n• Audit trail — a second PreToolUse hook logs every tool invocation with a timestamp to activity.jsonl.",
    link: "#",
    icon: ShieldCheck,
    color: "text-emerald-600",
    badgeColor: "bg-emerald-100 text-emerald-700",
  },
];

type TechItem = {
  name: string;
  version: string;
  why: string;
  link: string;
};

type TechSection = {
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  items: TechItem[];
};

const SECTIONS: TechSection[] = [
  {
    title: "AI & RAG Pipeline",
    description: "The intelligence layer — retrieval, embeddings, and language generation",
    icon: Brain,
    color: "text-purple-600",
    items: [
      {
        name: "LangChain",
        version: "@langchain/core ^1.1 · @langchain/openai ^1.2",
        why: "Provides a unified abstraction over LLM providers, structured output (withStructuredOutput), and embedding models. Swapping from OpenAI to any compatible provider requires only an env var change — no code changes.",
        link: "https://js.langchain.com",
      },
      {
        name: "OpenAI API",
        version: "gpt-4o-mini (chat) · text-embedding-3-small (embeddings)",
        why: "gpt-4o-mini delivers high reasoning quality at low cost for report generation and Q&A. text-embedding-3-small produces 1536-dimension vectors with excellent semantic accuracy for portfolio retrieval.",
        link: "https://platform.openai.com",
      },
      {
        name: "LangSmith",
        version: "LANGCHAIN_TRACING_V2",
        why: "Traces every LLM call end-to-end — inputs, outputs, latency, token usage. Essential for tuning prompts and diagnosing hallucinations without adding instrumentation code.",
        link: "https://smith.langchain.com",
      },
      {
        name: "Cosine Similarity (in-memory)",
        version: "custom · vectorEmbedding.ts",
        why: "At personal portfolio scale (~500 documents, ~5,000 chunks), a linear cosine scan over SQLite-stored JSON vectors is fast enough (< 200ms) and eliminates the operational overhead of a dedicated vector database like Pinecone or Chroma.",
        link: "https://en.wikipedia.org/wiki/Cosine_similarity",
      },
    ],
  },
  {
    title: "Backend",
    description: "API layer connecting the AI pipeline to the client",
    icon: Server,
    color: "text-blue-600",
    items: [
      {
        name: "tRPC",
        version: "^11.6",
        why: "End-to-end type safety between server and client with zero schema duplication. The router definition in routers.ts is the single source of truth — the React client gets fully-typed hooks automatically with no REST contracts or code generation.",
        link: "https://trpc.io",
      },
      {
        name: "Express",
        version: "^4.21",
        why: "Lightweight, battle-tested HTTP server. Hosts tRPC, the Google Drive OAuth callback route, and the dev-login endpoint. Simple enough that no additional framework overhead is needed at this scale.",
        link: "https://expressjs.com",
      },
      {
        name: "Zod",
        version: "^4.1",
        why: "Runtime schema validation for all tRPC inputs. Catches malformed job descriptions and bad IDs at the API boundary before they reach the database or LLM, with TypeScript types inferred automatically.",
        link: "https://zod.dev",
      },
      {
        name: "jose",
        version: "6.1.0",
        why: "Standards-compliant JWT signing and verification (HS256) for session cookies. Pure ESM, no native dependencies — critical for the ESM-first server build.",
        link: "https://github.com/panva/jose",
      },
    ],
  },
  {
    title: "Database & Storage",
    description: "Persistent storage for documents, embeddings, and analyses",
    icon: Database,
    color: "text-green-600",
    items: [
      {
        name: "SQLite (better-sqlite3)",
        version: "^12.6",
        why: "Zero-config, file-based database. Stores everything — users, documents, vector embeddings (as JSON arrays), analyses, and chat history. No separate database server to manage. Sufficient for a single-owner personal tool.",
        link: "https://github.com/WiseLibs/better-sqlite3",
      },
      {
        name: "Drizzle ORM",
        version: "^0.44",
        why: "Type-safe SQL with schema-as-code. drizzle/schema.ts is the single source of truth for the database structure. pnpm db:push applies migrations automatically. Significantly lighter than Prisma with no query engine binary.",
        link: "https://orm.drizzle.team",
      },
      {
        name: "Google Drive API",
        version: "googleapis ^171",
        why: "The portfolio folder in Google Drive is the document source of truth. The googleapis SDK handles OAuth2 token exchange, file listing, and binary file download — no manual REST calls.",
        link: "https://developers.google.com/drive",
      },
    ],
  },
  {
    title: "Document Processing",
    description: "Extracting plain text from each supported file format",
    icon: FileCode2,
    color: "text-orange-600",
    items: [
      {
        name: "pdf-parse",
        version: "^1.1.1",
        why: "Wraps pdf.js to extract raw text from PDF buffers. Loaded via createRequire for CJS compatibility in the ESM server build. The 1.x branch is used specifically because 2.x broke the exported API.",
        link: "https://www.npmjs.com/package/pdf-parse",
      },
      {
        name: "mammoth",
        version: "^1.11",
        why: "Converts DOCX (Office Open XML) to plain text via extractRawText(). Handles both modern .docx and legacy .doc formats. Strips formatting cleanly without requiring a LibreOffice headless process.",
        link: "https://github.com/mwilliamson/mammoth.js",
      },
      {
        name: "JSZip",
        version: "^3.10",
        why: "PPTX files are ZIP archives containing XML slide data. JSZip unpacks them in-memory and a regex over <a:t> tags extracts slide text without a full presentation renderer.",
        link: "https://stuk.github.io/jszip",
      },
      {
        name: "SheetJS (xlsx)",
        version: "^0.18",
        why: "Reads XLSX and legacy XLS workbooks. sheet_to_csv() renders each worksheet as comma-separated text, preserving cell values and sheet names for the LLM context without layout noise.",
        link: "https://sheetjs.com",
      },
    ],
  },
  {
    title: "Frontend",
    description: "React application with type-safe server communication",
    icon: Layers,
    color: "text-indigo-600",
    items: [
      {
        name: "React 19",
        version: "^19.2",
        why: "Latest stable React with improved concurrent rendering. The entire UI is built as functional components with hooks — no class components or legacy patterns.",
        link: "https://react.dev",
      },
      {
        name: "TanStack Query (React Query)",
        version: "^5.90",
        why: "Powers all server-state management via tRPC's React adapter. Handles loading states, caching, background refetching, and polling (used for live sync status updates) with zero boilerplate.",
        link: "https://tanstack.com/query",
      },
      {
        name: "wouter",
        version: "^3.3",
        why: "Minimalist client-side router (~2KB). The app has only four routes — the full weight of React Router is unnecessary. wouter's hook-based API (useLocation, useParams) is idiomatic React.",
        link: "https://github.com/molefrog/wouter",
      },
      {
        name: "Tailwind CSS 4",
        version: "^4.1",
        why: "Utility-first CSS with the new Vite plugin — no PostCSS config needed. Zero-runtime styling with full design-system consistency across every component.",
        link: "https://tailwindcss.com",
      },
    ],
  },
  {
    title: "UI Components",
    description: "Accessible, composable building blocks for the interface",
    icon: Sparkles,
    color: "text-pink-600",
    items: [
      {
        name: "shadcn/ui + Radix UI",
        version: "Radix ^1–2.x per component",
        why: "shadcn/ui components are copied into the codebase (not installed as a package), giving full control over styling while Radix UI provides the unstyled accessible primitives underneath — dialogs, tooltips, selects, and more.",
        link: "https://ui.shadcn.com",
      },
      {
        name: "streamdown",
        version: "^1.4",
        why: "Renders LLM markdown responses with streaming-aware parsing. Handles the incremental token delivery pattern cleanly so assistant messages render progressively as they arrive.",
        link: "https://www.npmjs.com/package/streamdown",
      },
      {
        name: "sonner",
        version: "^2.0",
        why: "Opinionated toast notification library. Single import, zero configuration, looks great out of the box. Used for sync success/error feedback throughout the admin and analysis flows.",
        link: "https://sonner.emilkowal.ski",
      },
      {
        name: "lucide-react",
        version: "^0.453",
        why: "Consistent, tree-shakeable SVG icon set. Every icon in the app is from Lucide — a single icon family prevents visual inconsistency across pages.",
        link: "https://lucide.dev",
      },
    ],
  },
  {
    title: "Authentication",
    description: "Session management for admin access and Google Drive",
    icon: Shield,
    color: "text-red-600",
    items: [
      {
        name: "JWT Session Cookies",
        version: "jose 6.1.0",
        why: "Sessions are stored as HttpOnly cookies containing a signed JWT. No server-side session store needed. SameSite=Lax on HTTP (localhost) and SameSite=None on HTTPS (production) ensures compatibility in both environments.",
        link: "https://github.com/panva/jose",
      },
      {
        name: "Google OAuth2",
        version: "googleapis ^171",
        why: "Standard OAuth2 flow for granting the app access to a specific Google Drive folder. Tokens (access + refresh) are stored encrypted per user in the database. The same googleapis client handles both the auth flow and Drive API calls.",
        link: "https://developers.google.com/identity/protocols/oauth2",
      },
      {
        name: "Dev Login Endpoint",
        version: "server/devLogin.ts · localhost only",
        why: "GET /api/dev-login creates an admin session without requiring Manus OAuth. Registered only when NODE_ENV !== production. Eliminates the need for a real OAuth server during local development.",
        link: "#",
      },
    ],
  },
  {
    title: "Developer Experience",
    description: "Tooling that keeps the build fast and the code consistent",
    icon: Wrench,
    color: "text-slate-600",
    items: [
      {
        name: "Vite 7",
        version: "^7.1",
        why: "Sub-second HMR for the React frontend. The dev server proxies /api requests to the Express backend, making local development a single pnpm dev command with no CORS configuration.",
        link: "https://vitejs.dev",
      },
      {
        name: "esbuild",
        version: "^0.25",
        why: "Bundles the Express server into a single ESM file for production (dist/index.js) in milliseconds. No transpilation runtime needed — the output runs directly on Node.js.",
        link: "https://esbuild.github.io",
      },
      {
        name: "TypeScript 5.9",
        version: "5.9.3",
        why: "Strict mode enabled across the entire monorepo. Shared types in shared/ are available to both server and client via path aliases (@shared/). Type errors are caught at build time, not at runtime in production.",
        link: "https://www.typescriptlang.org",
      },
      {
        name: "Vitest",
        version: "^2.1",
        why: "Fast unit and integration test runner compatible with Vite's module resolution. Tests live alongside source files (server/**/*.test.ts). Integration tests make real API calls and are run separately from unit tests.",
        link: "https://vitest.dev",
      },
    ],
  },
];

function TechCard({ item, link }: { item: TechItem; link: string }) {
  const hasLink = link !== "#";
  return (
    <a
      href={hasLink ? link : undefined}
      target={hasLink ? "_blank" : undefined}
      rel="noopener noreferrer"
      className={`block h-full ${hasLink ? "cursor-pointer" : "cursor-default"}`}
    >
      <Card className={`h-full transition-shadow border-slate-200 ${hasLink ? "hover:shadow-md hover:border-slate-300" : ""}`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base">{item.name}</CardTitle>
            <Badge variant="secondary" className="text-[10px] font-mono whitespace-nowrap flex-shrink-0">
              {item.version.split("·")[0]!.trim()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600 leading-relaxed">{item.why}</p>
        </CardContent>
      </Card>
    </a>
  );
}

export default function Tech() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto px-4 py-10 max-w-6xl">

        {/* Page header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-slate-900">Stack</h1>
          <p className="text-slate-500 mt-2 max-w-2xl">
            The AI tools that shaped this project and every library chosen to build it — with the reasoning behind each decision.
          </p>
        </div>

        {/* RAG Pipeline */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-white border shadow-sm">
              <GitBranch className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">RAG Pipeline Architecture</h2>
              <p className="text-sm text-slate-500">2-stage LangChain retrieval — how answers are grounded in portfolio documents</p>
              <p className="text-sm text-slate-500">- Business ideation and website skeleton layout in Manus.AI in 8 hours</p>
              <p className="text-sm text-slate-500">- technical implementation in 48 hours</p>
              <p className="text-sm text-slate-500">- git pipeline 8 hours</p>
              <p className="text-sm text-slate-500">- Push to production 8 hours</p>
            </div>
          </div>

          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">2-Stage Retrieval Flow</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 text-sm flex-wrap">
                {[
                  { label: "Question", sub: "user input" },
                  { label: "HyDE", sub: "LLM generates a hypothetical answer passage" },
                  { label: "Embed", sub: "text-embedding-3-small" },
                  { label: "Stage 1", sub: "cosine scan of 101,570 chunks → top 50" },
                  { label: "Stage 2", sub: "LLM re-ranker selects best 8" },
                  { label: "Answer", sub: "grounded in 8 focused passages" },
                ].map((step, i, arr) => (
                  <div key={step.label} className="flex items-center gap-2">
                    <div className="text-center">
                      <div className="font-semibold text-slate-900 text-xs">{step.label}</div>
                      <div className="text-[10px] text-slate-500 max-w-[120px]">{step.sub}</div>
                    </div>
                    {i < arr.length - 1 && (
                      <span className="text-slate-300 font-bold text-lg hidden sm:block">→</span>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-sm text-slate-600 mt-4 leading-relaxed">
                <strong>Why two stages?</strong> A single embedding similarity pass over 101,570 chunks fails when question vocabulary differs from document vocabulary — "measurable business impact" scores poorly against "$130 Trillion tokenization market" even though they describe the same thing. Stage 1 casts a broad net (top 50 by cosine proximity). Stage 2 uses full language understanding to select the 8 most relevant passages regardless of surface-level word overlap.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Reranker Options Evaluated</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Reranker</th>
                      <th className="text-left py-2 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                      <th className="text-left py-2 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Integration</th>
                      <th className="text-left py-2 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Extra API Key</th>
                      <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Best For</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[
                      { name: "Cohere Rerank v3.5", type: "Cross-encoder", integration: "@langchain/cohere", key: "Yes — Cohere", bestFor: "Gold standard for RAG; fast, cheap per call" },
                      { name: "Jina Reranker v2", type: "Cross-encoder", integration: "@langchain/community", key: "Yes — Jina (free tier)", bestFor: "Multilingual; open model; self-hostable" },
                      { name: "Qwen3-Reranker-8B", type: "Cross-encoder", integration: "Custom API call", key: "Depends on host", bestFor: "Open-source; strong on technical domain text" },
                      { name: "LLM-as-judge ✓", type: "Listwise LLM", integration: "Already wired (withStructuredOutput)", key: "No", bestFor: "Complex semantic reasoning; domain-aware", selected: true },
                    ].map(row => (
                      <tr key={row.name} className={row.selected ? "bg-blue-50" : ""}>
                        <td className={`py-2.5 pr-4 font-medium ${row.selected ? "text-blue-700" : "text-slate-800"}`}>{row.name}</td>
                        <td className="py-2.5 pr-4 text-slate-600 text-xs">{row.type}</td>
                        <td className="py-2.5 pr-4 text-slate-600 font-mono text-[11px]">{row.integration}</td>
                        <td className="py-2.5 pr-4 text-slate-600 text-xs">{row.key}</td>
                        <td className="py-2.5 text-slate-600 text-xs">{row.bestFor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-slate-600 mt-4 leading-relaxed">
                <strong>Why LLM-as-judge?</strong> Cross-encoders (Cohere, Jina, Qwen) are trained on generic English text pairs and rank by surface relevance. For this portfolio's domain — Proof of Governance, blockchain consensus, $130T institutional asset tokenization — the same model already used for answer generation understands the specialized vocabulary and selects passages by meaning, not keyword proximity. No additional API key, no cold-start latency, and the reranker improves automatically as the underlying LLM is upgraded.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Business Stack */}
        <div className="mb-12">
          <h2 className="text-xl font-bold text-slate-900 mb-1">Business Stack</h2>
          <p className="text-sm text-slate-500 mb-6">The AI tools that made this project possible — from concept to code.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {BUSINESS_TOOLS.map(tool => {
              const Icon = tool.icon;
              return (
                <a
                  key={tool.name}
                  href={tool.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <Card className="h-full hover:shadow-md transition-shadow border-slate-200 hover:border-slate-300">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-white border shadow-sm">
                            <Icon className={`h-5 w-5 ${tool.color}`} />
                          </div>
                          <div>
                            <CardTitle className="text-base">{tool.name}</CardTitle>
                            <CardDescription className="text-xs mt-0.5">{tool.role}</CardDescription>
                          </div>
                        </div>
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${tool.badgeColor}`}>
                          {tool.stat}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{tool.description}</p>
                    </CardContent>
                  </Card>
                </a>
              );
            })}
          </div>
        </div>

        {/* Technology Stack heading */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-slate-900 mb-1">Technology Stack</h2>
          <p className="text-sm text-slate-500">Libraries and frameworks — what each one does and why it was chosen.</p>
        </div>

        {/* Sections */}
        <div className="space-y-10">
          {SECTIONS.map(section => {
            const Icon = section.icon;
            return (
              <section key={section.title}>
                <div className="flex items-center gap-3 mb-4">
                  <div className={`p-2 rounded-lg bg-white border shadow-sm`}>
                    <Icon className={`h-5 w-5 ${section.color}`} />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{section.title}</h2>
                    <p className="text-xs text-slate-500">{section.description}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {section.items.map(item => (
                    <TechCard key={item.name} item={item} link={item.link} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

      </div>
    </div>
  );
}
