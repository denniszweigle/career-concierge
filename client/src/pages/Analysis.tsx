import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, TrendingUp, TrendingDown, Send, Sparkles, FileText, FileEdit, Download, Pencil, Eye } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useParams } from "wouter";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

const SUGGESTED_PROMPTS = [
  "What are Dennis's strongest technical skills for this role?",
  "Summarize his leadership and team management experience",
  "What measurable business impact has he demonstrated?",
  "How does his domain expertise align with this industry?",
  "What gaps should be explored in an interview?",
  "What's the strongest case for moving Dennis forward?",
  "How does he handle cross-functional collaboration?",
  "What does his portfolio reveal about his leadership style?",
  "Tell me about his thoughts on Governance",
  "How is Dennis applying Governance to IoT and Blockchain?",
];

const TAILOR_ADJECTIVES = ["Crafting", "Optimizing", "Tailoring", "Aligning", "Bridging", "Weaving", "Sharpening", "Polishing"];

function formatElapsed(s: number) {
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function ContentPreview({ content }: { content: string }) {
  return (
    <div className="space-y-0.5 text-sm font-mono leading-relaxed">
      {content.split("\n").map((line, i) => {
        if (line.startsWith("## ")) {
          return (
            <p key={i} className="font-bold text-base text-foreground mt-4 mb-1">
              {line.slice(3)}
            </p>
          );
        }
        if (line.startsWith("- ")) {
          return (
            <p key={i} className="pl-4 text-muted-foreground">
              &bull; {line.slice(2)}
            </p>
          );
        }
        if (!line.trim()) {
          return <div key={i} className="h-1.5" />;
        }
        return <p key={i} className="text-foreground">{line}</p>;
      })}
    </div>
  );
}

async function generatePDF(content: string, filename: string, isResume: boolean): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 20;
  const maxW = pageW - marginX * 2;
  let y = 20;

  const newPage = () => { doc.addPage(); y = 20; };
  const checkPageBreak = (needed: number) => { if (y + needed > pageH - 15) newPage(); };

  const lines = content.split("\n");
  let isFirstHeader = isResume;

  for (const line of lines) {
    if (line.startsWith("## ")) {
      const text = line.slice(3).trim();
      if (isFirstHeader) {
        checkPageBreak(10);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.text(text, pageW / 2, y, { align: "center" });
        y += 8;
        isFirstHeader = false;
      } else {
        checkPageBreak(8);
        if (y > 22) {
          doc.setDrawColor(180);
          doc.line(marginX, y - 1, pageW - marginX, y - 1);
          y += 1;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text(text.toUpperCase(), marginX, y);
        y += 6;
      }
    } else if (line.startsWith("- ")) {
      const text = line.slice(2).trim();
      checkPageBreak(5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      const wrapped = doc.splitTextToSize(`\u2022  ${text}`, maxW - 4);
      for (const wline of wrapped) {
        checkPageBreak(5);
        doc.text(wline, marginX + 3, y);
        y += 4.5;
      }
    } else if (!line.trim()) {
      y += 2;
    } else {
      checkPageBreak(5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      const wrapped = doc.splitTextToSize(line.trim(), maxW);
      for (const wline of wrapped) {
        checkPageBreak(5);
        doc.text(wline, marginX, y);
        y += 4.5;
      }
    }
  }

  doc.save(filename);
}

function parseTailorOutput(fullText: string): { resume: string; coverLetter: string } {
  const clIdx = fullText.indexOf("### CUSTOM_COVER_LETTER");
  const resumeRaw = fullText
    .slice(0, clIdx === -1 ? undefined : clIdx)
    .replace("### CUSTOM_RESUME", "")
    .trim();
  const coverLetterRaw = clIdx === -1 ? "" : fullText.slice(clIdx).replace("### CUSTOM_COVER_LETTER", "").trim();
  return { resume: resumeRaw, coverLetter: coverLetterRaw };
}

export default function Analysis() {
  const { id } = useParams<{ id: string }>();
  const analysisId = parseInt(id || "0");
  const [question, setQuestion] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [sourcesMap, setSourcesMap] = useState<Record<number, { documentId: number; fileName: string; driveFileId: string; fileType: string; similarity: number }[]>>({});
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");

  // Tailor state
  const [isTailoring, setIsTailoring] = useState(false);
  const [tailorStage, setTailorStage] = useState("");
  const [tailorAdjIdx, setTailorAdjIdx] = useState(0);
  const [tailorElapsed, setTailorElapsed] = useState(0);
  const tailorStartRef = useRef<number | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [coverLetterText, setCoverLetterText] = useState("");
  const [tailorDone, setTailorDone] = useState(false);
  const [resumeEditMode, setResumeEditMode] = useState(false);
  const [coverLetterEditMode, setCoverLetterEditMode] = useState(false);
  const tailorRef = useRef<HTMLDivElement>(null);

  const analysis = trpc.analysis.get.useQuery({ id: analysisId });
  const chatHistory = trpc.analysis.getChatHistory.useQuery({ analysisId });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory.data, streamingText]);

  // Tailor cycling adjective
  useEffect(() => {
    if (!isTailoring) return;
    setTailorAdjIdx(0);
    const id = setInterval(() => setTailorAdjIdx(i => (i + 1) % TAILOR_ADJECTIVES.length), 1800);
    return () => clearInterval(id);
  }, [isTailoring]);

  // Tailor elapsed timer
  useEffect(() => {
    if (!isTailoring) { setTailorElapsed(0); return; }
    tailorStartRef.current = Date.now();
    setTailorElapsed(0);
    const id = setInterval(() => {
      setTailorElapsed(Math.floor((Date.now() - tailorStartRef.current!) / 1000));
    }, 500);
    return () => clearInterval(id);
  }, [isTailoring]);

  const handleAskQuestion = async (q?: string) => {
    const text = (q ?? question).trim();
    if (!text || isStreaming) return;

    setQuestion("");
    setIsStreaming(true);
    setStreamingText("");

    const prevAssistantCount = (chatHistory.data ?? []).filter(m => m.role === "assistant").length;

    try {
      const response = await fetch("/api/stream-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, history: [], analysisId }),
      });

      if (!response.ok || !response.body) throw new Error("Stream failed");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (!payload) continue;
          try {
            const data = JSON.parse(payload);
            if (data.text) {
              setStreamingText(prev => prev + data.text);
            } else if (data.done) {
              await chatHistory.refetch();
              if (data.sources?.length > 0) {
                setSourcesMap(prev => ({ ...prev, [prevAssistantCount]: data.sources }));
              }
              setStreamingText("");
              setIsStreaming(false);
            } else if (data.error) {
              throw new Error("Stream error from server");
            }
          } catch {
            // ignore parse errors on individual lines
          }
        }
      }
    } catch {
      toast.error("Failed to get answer");
      setStreamingText("");
      setIsStreaming(false);
    }
  };

  const handleTailor = async () => {
    if (!analysis.data) return;

    setIsTailoring(true);
    setTailorStage("Starting...");
    setResumeText("");
    setCoverLetterText("");
    setTailorDone(false);

    // Scroll to tailor section after a brief delay
    setTimeout(() => tailorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);

    let accumulated = "";

    try {
      const response = await fetch("/api/stream-tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobTitle: analysis.data.jobTitle ?? undefined,
          jobDescription: analysis.data.jobDescription,
        }),
      });

      if (!response.ok || !response.body) throw new Error("Stream failed");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (!payload) continue;
          let data: any;
          try { data = JSON.parse(payload); } catch { continue; }
          if (data.type === "status") {
            setTailorStage(data.message);
          } else if (data.type === "chunk") {
            accumulated += data.text;
          } else if (data.type === "done") {
            const parsed = parseTailorOutput(accumulated);
            setResumeText(parsed.resume);
            setCoverLetterText(parsed.coverLetter);
            setTailorDone(true);
          } else if (data.type === "error") {
            throw new Error("Tailor failed");
          }
        }
      }
    } catch {
      toast.error("Failed to generate tailored documents");
    } finally {
      setIsTailoring(false);
    }
  };

  if (analysis.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8" />
      </div>
    );
  }

  if (!analysis.data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Analysis Not Found</CardTitle>
            <CardDescription>The requested analysis could not be found</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => (window.location.href = "/")} className="w-full">
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const data = analysis.data;
  const hasChat = chatHistory.data && chatHistory.data.length > 0;
  const safeJobTitle = (data.jobTitle ?? "Role").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Page title bar */}
      <div className="bg-card border-b flex-shrink-0 px-4 py-3 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground truncate">
            {data.jobTitle || "Job Description Analysis"}
          </h1>
          <p className="text-xs text-muted-foreground">Dennis "DZ" Zweigle's Portfolio Match Report</p>
        </div>
        <Button
          onClick={handleTailor}
          disabled={isTailoring}
          variant="secondary"
          size="sm"
          className="flex-shrink-0"
        >
          {isTailoring ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {TAILOR_ADJECTIVES[tailorAdjIdx]}… {formatElapsed(tailorElapsed)}
            </>
          ) : (
            <>
              <FileEdit className="mr-2 h-4 w-4" />
              Tailor Resume &amp; Cover Letter
            </>
          )}
        </Button>
      </div>

      {/* Two-panel body */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: Chat Panel ─────────────────────────────────────────── */}
        <aside className="w-80 xl:w-96 flex-shrink-0 border-r bg-card flex flex-col">
          <div className="px-4 py-3 border-b">
            <h2 className="font-semibold text-foreground text-sm">Ask About Dennis</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Answers grounded in indexed portfolio documents</p>
          </div>

          {/* Suggested prompts */}
          {!hasChat && (
            <div className="px-3 py-3 border-b space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                <Sparkles className="h-3 w-3" />
                Suggested questions
              </div>
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleAskQuestion(prompt)}
                  disabled={isStreaming}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg border border-border bg-muted/50 hover:bg-blue-50 dark:hover:bg-blue-950 hover:border-blue-200 dark:hover:border-blue-800 hover:text-blue-700 dark:hover:text-blue-300 transition-colors disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {/* Chat history */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {!hasChat && !isStreaming && (
              <p className="text-xs text-muted-foreground text-center mt-8">
                Select a prompt above or type your own question below.
              </p>
            )}

            {chatHistory.data?.map((msg, idx) => {
              const assistantIdx = chatHistory.data!.filter((m, i) => m.role === "assistant" && i <= idx).length - 1;
              const sources = msg.role === "assistant" ? sourcesMap[assistantIdx] : undefined;
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[90%] rounded-lg px-3 py-2 text-xs ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-muted text-foreground border"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <Streamdown>{msg.content}</Streamdown>
                    ) : (
                      msg.content
                    )}
                  </div>

                  {sources && sources.length > 0 && (
                    <div className="mt-1.5 max-w-[90%] space-y-1">
                      <p className="text-[10px] text-muted-foreground px-0.5">Sources</p>
                      <div className="flex flex-wrap gap-1">
                        {sources.map(src => (
                          <a
                            key={src.documentId}
                            href={`https://drive.google.com/file/d/${src.driveFileId}/view`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={src.fileName}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-card text-[10px] text-muted-foreground hover:bg-blue-50 dark:hover:bg-blue-950 hover:border-blue-300 hover:text-blue-700 dark:hover:text-blue-300 transition-colors max-w-[160px]"
                          >
                            <FileText className="h-2.5 w-2.5 flex-shrink-0" />
                            <span className="truncate">{src.fileName}</span>
                            <span className="flex-shrink-0 text-muted-foreground">{src.similarity}%</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {isStreaming && (
              <div className="flex flex-col items-start">
                <div className="max-w-[90%] rounded-lg px-3 py-2 text-xs bg-muted text-foreground border">
                  {streamingText
                    ? <Streamdown>{streamingText}</Streamdown>
                    : <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Suggested prompts — shown inline after first message */}
          {hasChat && (
            <div className="px-3 py-2 border-t space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Sparkles className="h-3 w-3" />
                Quick prompts
              </div>
              <div className="flex flex-wrap gap-1">
                {SUGGESTED_PROMPTS.slice(0, 4).map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleAskQuestion(prompt)}
                    disabled={isStreaming}
                    className="text-xs px-2 py-1 rounded-full border border-border bg-muted/50 hover:bg-blue-50 dark:hover:bg-blue-950 hover:border-blue-200 dark:hover:border-blue-800 hover:text-blue-700 dark:hover:text-blue-300 transition-colors disabled:opacity-50"
                  >
                    {prompt.length > 40 ? prompt.slice(0, 38) + "…" : prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="px-3 py-3 border-t flex gap-2">
            <Input
              placeholder="Ask a question…"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAskQuestion()}
              disabled={isStreaming}
              className="text-xs"
            />
            <Button
              size="icon"
              onClick={() => handleAskQuestion()}
              disabled={isStreaming || !question.trim()}
            >
              {isStreaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </aside>

        {/* ── Right: Analysis + Tailor Content ─────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-6 py-8 max-w-4xl">

            {/* Tailor CTA — above score cards */}
            <div className="flex justify-center mb-6">
              <Button
                onClick={handleTailor}
                disabled={isTailoring}
                size="lg"
                className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
              >
                {isTailoring ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {TAILOR_ADJECTIVES[tailorAdjIdx]}… {formatElapsed(tailorElapsed)}
                  </>
                ) : (
                  <>
                    <FileEdit className="h-5 w-5" />
                    Tailor Resume &amp; Cover Letter
                  </>
                )}
              </Button>
            </div>

            {/* Match Score Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <Card className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-400">
                    <TrendingUp className="h-5 w-5" />
                    Match Score
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-5xl font-bold text-green-700 dark:text-green-400">{data.matchScore?.toFixed(1)}%</div>
                  <div className="text-sm text-green-600 dark:text-green-500 mt-2">Alignment with requirements</div>
                </CardContent>
              </Card>

              <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
                    <TrendingDown className="h-5 w-5" />
                    Mismatch Score
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-5xl font-bold text-orange-700 dark:text-orange-400">{data.mismatchScore?.toFixed(1)}%</div>
                  <div className="text-sm text-orange-600 dark:text-orange-500 mt-2">Gaps to address</div>
                </CardContent>
              </Card>
            </div>

            {/* Category Scores */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Category Breakdown</CardTitle>
                <CardDescription>Weighted scoring across four pillars</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Hard Skills (40%)</div>
                    <div className="text-2xl font-bold text-foreground">{data.hardSkillsScore?.toFixed(1)}%</div>
                    <div className="w-full bg-border rounded-full h-2 mt-2">
                      <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${data.hardSkillsScore}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Experience (30%)</div>
                    <div className="text-2xl font-bold text-foreground">{data.experienceScore?.toFixed(1)}%</div>
                    <div className="w-full bg-border rounded-full h-2 mt-2">
                      <div className="bg-purple-600 h-2 rounded-full" style={{ width: `${data.experienceScore}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Domain (20%)</div>
                    <div className="text-2xl font-bold text-foreground">{data.domainScore?.toFixed(1)}%</div>
                    <div className="w-full bg-border rounded-full h-2 mt-2">
                      <div className="bg-indigo-600 h-2 rounded-full" style={{ width: `${data.domainScore}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Soft Skills (10%)</div>
                    <div className="text-2xl font-bold text-foreground">{data.softSkillsScore?.toFixed(1)}%</div>
                    <div className="w-full bg-border rounded-full h-2 mt-2">
                      <div className="bg-teal-600 h-2 rounded-full" style={{ width: `${data.softSkillsScore}%` }} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Strengths & Gaps */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <Card className="border-green-200 dark:border-green-900">
                <CardHeader>
                  <CardTitle className="text-green-700 dark:text-green-400">Top 3 Alignment Strengths</CardTitle>
                  <CardDescription>Evidence of strong matches</CardDescription>
                </CardHeader>
                <CardContent>
                  {data.topStrengths && data.topStrengths.length > 0 ? (
                    <ul className="space-y-3">
                      {data.topStrengths.map((strength, idx) => (
                        <li key={idx} className="flex gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 flex items-center justify-center text-sm font-bold">
                            {idx + 1}
                          </div>
                          <div className="text-sm text-muted-foreground">{strength}</div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-sm text-muted-foreground">No strengths identified</div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-orange-200 dark:border-orange-900">
                <CardHeader>
                  <CardTitle className="text-orange-700 dark:text-orange-400">Top 3 Critical Gaps</CardTitle>
                  <CardDescription>Areas needing attention</CardDescription>
                </CardHeader>
                <CardContent>
                  {data.topGaps && data.topGaps.length > 0 ? (
                    <ul className="space-y-3">
                      {data.topGaps.map((gap, idx) => (
                        <li key={idx} className="flex gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 flex items-center justify-center text-sm font-bold">
                            {idx + 1}
                          </div>
                          <div className="text-sm text-muted-foreground">{gap}</div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-sm text-muted-foreground">No gaps identified</div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Detailed Report */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Detailed Analysis Report</CardTitle>
                <CardDescription>Professional assessment by High-Precision Executive Recruiter</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="prose prose-slate dark:prose-invert max-w-none">
                  <Streamdown>{data.detailedReport || "No detailed report available"}</Streamdown>
                </div>
              </CardContent>
            </Card>

            {/* ── Tailor Section ─────────────────────────────────────────── */}
            <div ref={tailorRef}>
              {/* Tailor in-progress */}
              {isTailoring && (
                <Card className="mb-6 border-violet-200 dark:border-violet-900">
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center gap-2 py-4">
                      <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
                      <span className="text-sm font-semibold text-violet-500">{TAILOR_ADJECTIVES[tailorAdjIdx]}…</span>
                      <p className="text-xs text-muted-foreground">{tailorStage}</p>
                      <span className="text-xs text-muted-foreground">{formatElapsed(tailorElapsed)}</span>
                      <div className="w-full max-w-sm bg-muted rounded-full h-1 overflow-hidden mt-1">
                        <div className="bg-violet-500 h-full rounded-full animate-pulse" style={{ width: "60%" }} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Tailor output */}
              {tailorDone && (resumeText || coverLetterText) && (
                <Card className="border-violet-200 dark:border-violet-900">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileEdit className="h-5 w-5 text-violet-500" />
                      Tailored Documents
                    </CardTitle>
                    <CardDescription>
                      ATS-optimized resume and cover letter tailored to this job description. Download as PDF for submission.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="resume">
                      <TabsList className="mb-4">
                        <TabsTrigger value="resume">Resume</TabsTrigger>
                        <TabsTrigger value="cover-letter">Cover Letter</TabsTrigger>
                      </TabsList>

                      <TabsContent value="resume">
                        <div className="flex items-center justify-between mb-3">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setResumeEditMode(m => !m)}
                          >
                            {resumeEditMode ? (
                              <><Eye className="mr-2 h-4 w-4" />Preview</>
                            ) : (
                              <><Pencil className="mr-2 h-4 w-4" />Edit</>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              generatePDF(resumeText, `DZ_Resume_${safeJobTitle}.pdf`, true)
                                .catch(() => toast.error("PDF generation failed"))
                            }
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Download Resume PDF
                          </Button>
                        </div>
                        {resumeEditMode ? (
                          <textarea
                            value={resumeText}
                            onChange={e => setResumeText(e.target.value)}
                            rows={30}
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-y"
                            spellCheck={false}
                          />
                        ) : (
                          <div className="rounded-lg border bg-muted/20 p-4 max-h-[600px] overflow-y-auto">
                            <ContentPreview content={resumeText} />
                          </div>
                        )}
                      </TabsContent>

                      <TabsContent value="cover-letter">
                        <div className="flex items-center justify-between mb-3">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setCoverLetterEditMode(m => !m)}
                          >
                            {coverLetterEditMode ? (
                              <><Eye className="mr-2 h-4 w-4" />Preview</>
                            ) : (
                              <><Pencil className="mr-2 h-4 w-4" />Edit</>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              generatePDF(coverLetterText, `DZ_CoverLetter_${safeJobTitle}.pdf`, false)
                                .catch(() => toast.error("PDF generation failed"))
                            }
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Download Cover Letter PDF
                          </Button>
                        </div>
                        {coverLetterEditMode ? (
                          <textarea
                            value={coverLetterText}
                            onChange={e => setCoverLetterText(e.target.value)}
                            rows={20}
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-y"
                            spellCheck={false}
                          />
                        ) : (
                          <div className="rounded-lg border bg-muted/20 p-4 max-h-[600px] overflow-y-auto">
                            <ContentPreview content={coverLetterText} />
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              )}
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
