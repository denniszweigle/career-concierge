import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, TrendingUp, TrendingDown, Send, Sparkles, FileText } from "lucide-react";
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

export default function Analysis() {
  const { id } = useParams<{ id: string }>();
  const analysisId = parseInt(id || "0");
  const [question, setQuestion] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  // Sources are not stored in DB — track them client-side keyed by assistant message index
  const [sourcesMap, setSourcesMap] = useState<Record<number, { documentId: number; fileName: string; driveFileId: string; fileType: string; similarity: number }[]>>({});

  const analysis = trpc.analysis.get.useQuery({ id: analysisId });
  const chatHistory = trpc.analysis.getChatHistory.useQuery({ analysisId });
  const askQuestion = trpc.analysis.askQuestion.useMutation();

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory.data]);

  const handleAskQuestion = async (q?: string) => {
    const text = (q ?? question).trim();
    if (!text) return;

    try {
      const result = await askQuestion.mutateAsync({ analysisId, question: text });
      setQuestion("");
      await chatHistory.refetch();
      // Map sources to the new assistant message (last in refetched history)
      if (result.sources && result.sources.length > 0) {
        const assistantMsgs = (chatHistory.data ?? []).filter(m => m.role === "assistant");
        const idx = assistantMsgs.length; // will be the new one after refetch
        setSourcesMap(prev => ({ ...prev, [idx]: result.sources }));
      }
    } catch {
      toast.error("Failed to get answer");
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col">
      {/* Page title bar */}
      <div className="bg-white border-b flex-shrink-0 px-4 py-3">
        <h1 className="text-xl font-bold text-slate-900">
          {data.jobTitle || "Job Description Analysis"}
        </h1>
        <p className="text-xs text-slate-500">Dennis "DZ" Zweigle's Portfolio Match Report</p>
      </div>

      {/* Two-panel body */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: Chat Panel ─────────────────────────────────────────── */}
        <aside className="w-80 xl:w-96 flex-shrink-0 border-r bg-white flex flex-col">
          <div className="px-4 py-3 border-b">
            <h2 className="font-semibold text-slate-900 text-sm">Ask About Dennis</h2>
            <p className="text-xs text-slate-500 mt-0.5">Answers grounded in indexed portfolio documents</p>
          </div>

          {/* Suggested prompts */}
          {!hasChat && (
            <div className="px-3 py-3 border-b space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-2">
                <Sparkles className="h-3 w-3" />
                Suggested questions
              </div>
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleAskQuestion(prompt)}
                  disabled={askQuestion.isPending}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-colors disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {/* Chat history */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {!hasChat && !askQuestion.isPending && (
              <p className="text-xs text-slate-400 text-center mt-8">
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
                      : "bg-slate-100 text-slate-900 border"
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
                    <p className="text-[10px] text-slate-400 px-0.5">Sources</p>
                    <div className="flex flex-wrap gap-1">
                      {sources.map(src => (
                        <a
                          key={src.documentId}
                          href={`https://drive.google.com/file/d/${src.driveFileId}/view`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={src.fileName}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-slate-200 bg-white text-[10px] text-slate-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors max-w-[160px]"
                        >
                          <FileText className="h-2.5 w-2.5 flex-shrink-0" />
                          <span className="truncate">{src.fileName}</span>
                          <span className="flex-shrink-0 text-slate-400">{src.similarity}%</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
            })}

            {askQuestion.isPending && (
              <div className="flex justify-start">
                <div className="bg-slate-100 border rounded-lg px-3 py-2">
                  <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Suggested prompts — shown inline after first message */}
          {hasChat && (
            <div className="px-3 py-2 border-t space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                <Sparkles className="h-3 w-3" />
                Quick prompts
              </div>
              <div className="flex flex-wrap gap-1">
                {SUGGESTED_PROMPTS.slice(0, 4).map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleAskQuestion(prompt)}
                    disabled={askQuestion.isPending}
                    className="text-xs px-2 py-1 rounded-full border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-colors disabled:opacity-50"
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
              disabled={askQuestion.isPending}
              className="text-xs"
            />
            <Button
              size="icon"
              onClick={() => handleAskQuestion()}
              disabled={askQuestion.isPending || !question.trim()}
            >
              {askQuestion.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </aside>

        {/* ── Right: Analysis Content ───────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-6 py-8 max-w-4xl">

            {/* Match Score Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <Card className="border-green-200 bg-green-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-700">
                    <TrendingUp className="h-5 w-5" />
                    Match Score
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-5xl font-bold text-green-700">{data.matchScore?.toFixed(1)}%</div>
                  <div className="text-sm text-green-600 mt-2">Alignment with requirements</div>
                </CardContent>
              </Card>

              <Card className="border-orange-200 bg-orange-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-orange-700">
                    <TrendingDown className="h-5 w-5" />
                    Mismatch Score
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-5xl font-bold text-orange-700">{data.mismatchScore?.toFixed(1)}%</div>
                  <div className="text-sm text-orange-600 mt-2">Gaps to address</div>
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
                    <div className="text-sm text-slate-600 mb-1">Hard Skills (40%)</div>
                    <div className="text-2xl font-bold text-slate-900">{data.hardSkillsScore?.toFixed(1)}%</div>
                    <div className="w-full bg-slate-200 rounded-full h-2 mt-2">
                      <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${data.hardSkillsScore}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-slate-600 mb-1">Experience (30%)</div>
                    <div className="text-2xl font-bold text-slate-900">{data.experienceScore?.toFixed(1)}%</div>
                    <div className="w-full bg-slate-200 rounded-full h-2 mt-2">
                      <div className="bg-purple-600 h-2 rounded-full" style={{ width: `${data.experienceScore}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-slate-600 mb-1">Domain (20%)</div>
                    <div className="text-2xl font-bold text-slate-900">{data.domainScore?.toFixed(1)}%</div>
                    <div className="w-full bg-slate-200 rounded-full h-2 mt-2">
                      <div className="bg-indigo-600 h-2 rounded-full" style={{ width: `${data.domainScore}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-slate-600 mb-1">Soft Skills (10%)</div>
                    <div className="text-2xl font-bold text-slate-900">{data.softSkillsScore?.toFixed(1)}%</div>
                    <div className="w-full bg-slate-200 rounded-full h-2 mt-2">
                      <div className="bg-teal-600 h-2 rounded-full" style={{ width: `${data.softSkillsScore}%` }} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Strengths & Gaps */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <Card className="border-green-200">
                <CardHeader>
                  <CardTitle className="text-green-700">Top 3 Alignment Strengths</CardTitle>
                  <CardDescription>Evidence of strong matches</CardDescription>
                </CardHeader>
                <CardContent>
                  {data.topStrengths && data.topStrengths.length > 0 ? (
                    <ul className="space-y-3">
                      {data.topStrengths.map((strength, idx) => (
                        <li key={idx} className="flex gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-sm font-bold">
                            {idx + 1}
                          </div>
                          <div className="text-sm text-slate-700">{strength}</div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-sm text-slate-600">No strengths identified</div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-orange-200">
                <CardHeader>
                  <CardTitle className="text-orange-700">Top 3 Critical Gaps</CardTitle>
                  <CardDescription>Areas needing attention</CardDescription>
                </CardHeader>
                <CardContent>
                  {data.topGaps && data.topGaps.length > 0 ? (
                    <ul className="space-y-3">
                      {data.topGaps.map((gap, idx) => (
                        <li key={idx} className="flex gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-sm font-bold">
                            {idx + 1}
                          </div>
                          <div className="text-sm text-slate-700">{gap}</div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-sm text-slate-600">No gaps identified</div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Detailed Report */}
            <Card>
              <CardHeader>
                <CardTitle>Detailed Analysis Report</CardTitle>
                <CardDescription>Professional assessment by High-Precision Executive Recruiter</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="prose prose-slate max-w-none">
                  <Streamdown>{data.detailedReport || "No detailed report available"}</Streamdown>
                </div>
              </CardContent>
            </Card>

          </div>
        </main>
      </div>
    </div>
  );
}
