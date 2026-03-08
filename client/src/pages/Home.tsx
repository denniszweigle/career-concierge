import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { FileSearch, Brain, MessageSquare, ArrowRight, ChevronRight, Zap, GitBranch, Database, Box } from "lucide-react";
import { useSiteName } from "@/hooks/useSiteName";
import { useSiteConfig } from "@/hooks/useSiteConfig";

const TYPING_PHRASES = [
  "Principal Engineer",
  "VP of Engineering",
  "Platform Architect",
  "Head of AI/ML",
  "CTO",
  "Sr. Developer",
  "PBaaS Developer",
  "Full Stack Engineer",
  "RPA/APA",
];

export default function Home() {
  const [, navigate] = useLocation();
  const siteName = useSiteName();
  const siteConfig = useSiteConfig();
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [displayed, setDisplayed] = useState("");
  const [typing, setTyping] = useState(true);

  useEffect(() => {
    const phrase = TYPING_PHRASES[phraseIndex]!;
    if (typing) {
      if (displayed.length < phrase.length) {
        const t = setTimeout(() => setDisplayed(phrase.slice(0, displayed.length + 1)), 60);
        return () => clearTimeout(t);
      } else {
        const t = setTimeout(() => setTyping(false), 1800);
        return () => clearTimeout(t);
      }
    } else {
      if (displayed.length > 0) {
        const t = setTimeout(() => setDisplayed(displayed.slice(0, -1)), 30);
        return () => clearTimeout(t);
      } else {
        setPhraseIndex((phraseIndex + 1) % TYPING_PHRASES.length);
        setTyping(true);
      }
    }
  }, [displayed, typing, phraseIndex]);

  return (
    <div className="min-h-screen bg-[#050510] text-white overflow-x-hidden">
      {/* Aurora background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div
          className="absolute top-[-15%] left-[-8%] w-[600px] h-[600px] rounded-full opacity-30 animate-pulse"
          style={{ background: "radial-gradient(circle, rgba(99,102,241,0.5) 0%, transparent 70%)", filter: "blur(80px)" }}
        />
        <div
          className="absolute top-[5%] right-[-5%] w-[500px] h-[500px] rounded-full opacity-25 animate-pulse"
          style={{ background: "radial-gradient(circle, rgba(139,92,246,0.5) 0%, transparent 70%)", filter: "blur(80px)", animationDelay: "1s" }}
        />
        <div
          className="absolute bottom-[-5%] left-[25%] w-[450px] h-[450px] rounded-full opacity-20 animate-pulse"
          style={{ background: "radial-gradient(circle, rgba(59,130,246,0.5) 0%, transparent 70%)", filter: "blur(80px)", animationDelay: "2s" }}
        />
      </div>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative z-10 container mx-auto px-6 py-16 lg:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

          {/* Left — headline + CTAs */}
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/10 text-xs text-slate-400 mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
              2-stage RAG · HyDE · LLM re-ranking · Streaming Q&A
            </div>

            <h1 className="text-5xl xl:text-6xl font-bold leading-tight tracking-tight mb-4">
              The portfolio of{" "}
              <span className="bg-gradient-to-r from-blue-400 via-violet-400 to-indigo-300 bg-clip-text text-transparent">
                {siteConfig.candidateName}
              </span>
            </h1>

            <p className="text-xl font-medium text-slate-400 mb-6 h-7">
              Built for the{" "}
              <span className="text-white font-semibold">
                {displayed}
                <span className="animate-pulse opacity-70">|</span>
              </span>
              {" "}role.
            </p>

            <p className="text-slate-400 text-base leading-relaxed mb-3 max-w-lg">
              {siteConfig.heroTagline}
            </p>

            <div className="mb-10 max-w-lg border-l-2 border-blue-500/40 pl-4">
              <p className="text-white font-semibold text-sm mb-1">{siteConfig.matchPageTitle}</p>
              <p className="text-slate-500 text-sm leading-relaxed">{siteConfig.matchPageDescription}</p>
            </div>

            <div className="flex flex-wrap gap-4">
              <button
                onClick={() => navigate("/match")}
                className="flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-sm text-white transition-all shadow-lg shadow-blue-900/40"
                style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "linear-gradient(135deg, #3b82f6, #8b5cf6)")}
                onMouseLeave={e => (e.currentTarget.style.background = "linear-gradient(135deg, #2563eb, #7c3aed)")}
              >
                Analyze a Job Description
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => navigate("/chat")}
                className="flex items-center gap-2 px-6 py-3 rounded-lg border border-white/15 text-slate-300 font-semibold text-sm hover:bg-white/[0.06] hover:text-white transition-colors"
              >
                Ask the Portfolio
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Right — match score mockup */}
          <div className="hidden lg:block">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-md p-6 shadow-2xl">
              {/* Card header */}
              <div className="flex items-center justify-between mb-5">
                <div>
                  <div className="text-sm font-semibold text-white">Principal Engineer — Platform</div>
                  <div className="text-xs text-slate-500 mt-0.5">{siteConfig.candidateName} · Portfolio Match Report</div>
                </div>
                <span className="px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-400 text-xs font-medium border border-emerald-500/25">
                  Live Analysis
                </span>
              </div>

              {/* Score cards */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="rounded-xl bg-emerald-500/[0.08] border border-emerald-500/20 p-4">
                  <div className="text-[11px] text-emerald-400 mb-1 uppercase tracking-wide">Match Score</div>
                  <div className="text-3xl font-bold text-emerald-400">84.7%</div>
                  <div className="text-[11px] text-slate-600 mt-1">Alignment with requirements</div>
                </div>
                <div className="rounded-xl bg-orange-500/[0.08] border border-orange-500/20 p-4">
                  <div className="text-[11px] text-orange-400 mb-1 uppercase tracking-wide">Mismatch</div>
                  <div className="text-3xl font-bold text-orange-400">15.3%</div>
                  <div className="text-[11px] text-slate-600 mt-1">Gaps to address</div>
                </div>
              </div>

              {/* Category bars */}
              <div className="space-y-3 mb-5">
                {[
                  { label: "Hard Skills", pct: 88, weight: "40%", color: "#3b82f6" },
                  { label: "Experience",  pct: 82, weight: "30%", color: "#8b5cf6" },
                  { label: "Domain",      pct: 79, weight: "20%", color: "#6366f1" },
                  { label: "Soft Skills", pct: 91, weight: "10%", color: "#14b8a6" },
                ].map(({ label, pct, weight, color }) => (
                  <div key={label}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-slate-400">{label} <span className="text-slate-600">({weight})</span></span>
                      <span className="text-white font-medium">{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                      <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Chat teaser */}
              <div className="rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2.5 flex items-center gap-2">
                <span className="text-xs text-slate-600 flex-1">Ask about experience with distributed systems…</span>
                <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center flex-shrink-0">
                  <ArrowRight className="h-3 w-3 text-white" />
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ── Capability strip ─────────────────────────────────────────────── */}
      <section className="relative z-10 border-t border-white/[0.06] py-14">
        <div className="container mx-auto px-6">
          <p className="text-center text-[11px] text-slate-600 uppercase tracking-widest mb-10">
            What the platform does
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {[
              {
                icon: <FileSearch className="h-5 w-5 text-blue-400" />,
                iconBg: "bg-blue-500/10 border-blue-500/20",
                title: "2-Stage RAG Retrieval",
                desc: "HyDE embeds a hypothetical answer passage first, Stage 1 runs cosine search across all indexed chunks, Stage 2 uses an LLM re-ranker for language-level precision.",
              },
              {
                icon: <Brain className="h-5 w-5 text-violet-400" />,
                iconBg: "bg-violet-500/10 border-violet-500/20",
                title: "Chain of Density Extraction",
                desc: "Four-pass requirement extraction surfaces obvious requirements, implicit preferences, subtle signals, and culture-embedded expectations from any job description.",
              },
              {
                icon: <MessageSquare className="h-5 w-5 text-teal-400" />,
                iconBg: "bg-teal-500/10 border-teal-500/20",
                title: "Grounded Conversational Q&A",
                desc: "Every answer is anchored to retrieved document passages with source citations. No hallucination, no training data leakage — streams progressively from first token.",
              },
            ].map(({ icon, iconBg, title, desc }) => (
              <div
                key={title}
                className="rounded-xl bg-white/[0.03] border border-white/[0.07] p-5 hover:bg-white/[0.06] transition-colors"
              >
                <div className={`w-9 h-9 rounded-lg border flex items-center justify-center mb-4 ${iconBg}`}>
                  {icon}
                </div>
                <h3 className="text-sm font-semibold text-white mb-2">{title}</h3>
                <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How the AI works ─────────────────────────────────────────────── */}
      <section className="relative z-10 border-t border-white/[0.06] py-14">
        <div className="container mx-auto px-6 max-w-5xl">
          <p className="text-center text-[11px] text-slate-600 uppercase tracking-widest mb-3">
            AI Transparency
          </p>
          <h2 className="text-center text-2xl font-bold text-white mb-2">How this platform uses AI</h2>
          <p className="text-center text-slate-500 text-sm mb-10 max-w-xl mx-auto">
            Most AI career tools guess. This one retrieves — grounding every answer in indexed documents through a three-layer pipeline built to get past AI gatekeepers and surface the real story.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Round 1 */}
            <div className="rounded-xl bg-white/[0.03] border border-indigo-500/20 p-6 hover:bg-white/[0.05] transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-7 h-7 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 text-xs font-bold flex-shrink-0">1</span>
                <h3 className="text-sm font-semibold text-white">HyDE — Smarter Semantic Search</h3>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Before searching the portfolio, the AI generates a <span className="text-slate-300">hypothetical answer passage</span> — a dense paragraph of what the right answer would look like. That passage is embedded and used for retrieval instead of the raw question. This bridges the vocabulary gap between how questions are asked and how career documents are written.
              </p>
              <div className="mt-4 rounded-lg bg-white/[0.04] border border-white/[0.07] px-3 py-2">
                <p className="text-[11px] text-slate-600 italic">"Summarize leadership experience" → embeds a hypothetical resume passage → finds 1,300+ leadership chunks</p>
              </div>
            </div>

            {/* Round 2 */}
            <div className="rounded-xl bg-white/[0.03] border border-violet-500/20 p-6 hover:bg-white/[0.05] transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-7 h-7 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-400 text-xs font-bold flex-shrink-0">2</span>
                <h3 className="text-sm font-semibold text-white">Adaptive Retrieval Depth</h3>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Not every question needs the same number of document passages. The pipeline detects question intent — exploratory questions (<span className="text-slate-300">how is, applying, vision, strategy</span>) pull 3× more chunks; list queries pull 4×; focused questions use the baseline. More signal means more complete answers for complex multi-document topics.
              </p>
              <div className="mt-4 rounded-lg bg-white/[0.04] border border-white/[0.07] px-3 py-2">
                <p className="text-[11px] text-slate-600 italic">"How is Governance applied to IoT?" → 24 passages retrieved across 45 files instead of 8</p>
              </div>
            </div>

            {/* Round 3 */}
            <div className="rounded-xl bg-white/[0.03] border border-blue-500/20 p-6 hover:bg-white/[0.05] transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-7 h-7 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 text-xs font-bold flex-shrink-0">3</span>
                <h3 className="text-sm font-semibold text-white">Portfolio Attribution Context</h3>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Constitutional frameworks, patent filings, and governance blueprints are formal documents — the author's name isn't in every sentence. The AI is explicitly told that <span className="text-slate-300">every retrieved passage belongs to the candidate's personal portfolio</span>: documents authored, patents filed, frameworks designed. Content is attributed correctly without hallucinating.
              </p>
              <div className="mt-4 rounded-lg bg-white/[0.04] border border-white/[0.07] px-3 py-2">
                <p className="text-[11px] text-slate-600 italic">206 Governance+IoT chunks correctly attributed → rich, sourced answers instead of "no information found"</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Tech credibility bar ─────────────────────────────────────────── */}
      <section className="relative z-10 border-t border-white/[0.06] py-10">
        <div className="container mx-auto px-6">
          <p className="text-center text-[11px] text-slate-600 uppercase tracking-widest mb-7">
            Built with
          </p>
          <div className="flex flex-wrap justify-center items-center gap-x-8 gap-y-4">
            {[
              { name: "React 19",              icon: <Zap       className="h-3.5 w-3.5" /> },
              { name: "tRPC 11",               icon: <GitBranch className="h-3.5 w-3.5" /> },
              { name: "LangChain",             icon: <Brain     className="h-3.5 w-3.5" /> },
              { name: "SQLite + Drizzle",      icon: <Database  className="h-3.5 w-3.5" /> },
              { name: "OpenAI Embeddings",     icon: <Brain     className="h-3.5 w-3.5" /> },
              { name: "Docker + Caddy",        icon: <Box       className="h-3.5 w-3.5" /> },
              { name: "GitHub Actions CI/CD",  icon: <GitBranch className="h-3.5 w-3.5" /> },
              { name: "Hetzner VPS",           icon: <Box       className="h-3.5 w-3.5" /> },
            ].map(({ name, icon }) => (
              <div
                key={name}
                className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-300 transition-colors"
              >
                {icon}
                <span>{name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/[0.06] py-6">
        <div className="container mx-auto px-6 flex justify-between items-center">
          <p className="text-xs text-slate-700">{siteName} · {siteConfig.candidateName}</p>
          <a href="/admin" className="text-xs text-slate-700 hover:text-slate-400 transition-colors">
            Admin
          </a>
        </div>
      </footer>
    </div>
  );
}
