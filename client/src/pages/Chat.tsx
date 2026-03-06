import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Send, Sparkles, Bot, FileText } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

type Source = { documentId: number; fileName: string; driveFileId: string; fileType: string; similarity: number };
type Message = { role: "user" | "assistant"; content: string; sources?: Source[] };

const SUGGESTED_PROMPTS = [
  "What are Dennis's strongest technical skills?",
  "Summarize his leadership and team management experience",
  "What measurable business impact has he demonstrated?",
  "What does his portfolio reveal about his leadership style?",
  "How does he handle cross-functional collaboration?",
  "Tell me about his thoughts on Governance",
  "How is Dennis applying Governance to IoT and Blockchain?",
  "What are his most notable career achievements?",
  "What industries has Dennis worked across?",
  "What's the strongest case for hiring Dennis?",
];

export default function Chat() {
  const [history, setHistory] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, isStreaming, streamingText]);

  const handleAsk = async (q?: string) => {
    const text = (q ?? question).trim();
    if (!text || isStreaming) return;

    const userMsg: Message = { role: "user", content: text };
    const priorHistory = history;
    const nextHistory = [...history, userMsg];
    setHistory(nextHistory);
    setQuestion("");
    setIsStreaming(true);
    setStreamingText("");

    try {
      const response = await fetch("/api/stream-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          history: priorHistory.map(({ role, content }) => ({ role, content })),
        }),
      });

      if (!response.ok || !response.body) throw new Error("Stream failed");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

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
              accumulated += data.text;
              setStreamingText(accumulated);
            } else if (data.done) {
              setHistory(prev => [...prev, { role: "assistant", content: accumulated, sources: data.sources ?? [] }]);
              setStreamingText("");
              setIsStreaming(false);
            } else if (data.error) {
              throw new Error("Stream error from server");
            }
          } catch {
            // ignore individual line parse errors
          }
        }
      }
    } catch {
      toast.error("Failed to get answer");
      setHistory(priorHistory);
      setStreamingText("");
      setIsStreaming(false);
    } finally {
      inputRef.current?.focus();
    }
  };

  const hasMessages = history.length > 0;

  return (
    <div className="flex flex-col h-[calc(100vh-49px)] bg-background">

      {/* Page header */}
      <div className="bg-card border-b px-6 py-3 flex-shrink-0">
        <h1 className="text-lg font-semibold text-foreground">Portfolio Chat</h1>
        <p className="text-xs text-muted-foreground">Ask anything about Dennis — answers grounded in indexed portfolio documents</p>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: Suggested prompts sidebar ─────────────────────────── */}
        <aside className="w-72 flex-shrink-0 border-r bg-card flex flex-col overflow-y-auto">
          <div className="px-4 py-3 border-b">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              Suggested questions
            </div>
          </div>
          <div className="px-3 py-3 space-y-1.5">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => handleAsk(prompt)}
                disabled={isStreaming}
                className="w-full text-left text-xs px-3 py-2.5 rounded-lg border border-border bg-muted/50 hover:bg-blue-50 dark:hover:bg-blue-950 hover:border-blue-200 dark:hover:border-blue-800 hover:text-blue-700 dark:hover:text-blue-300 transition-colors disabled:opacity-50 leading-snug"
              >
                {prompt}
              </button>
            ))}
          </div>

          {hasMessages && (
            <div className="mt-auto px-3 pb-4">
              <button
                onClick={() => setHistory([])}
                className="w-full text-xs text-muted-foreground hover:text-foreground py-2 border border-dashed border-border rounded-lg transition-colors"
              >
                Clear conversation
              </button>
            </div>
          )}
        </aside>

        {/* ── Right: Chat area ─────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
            {!hasMessages && !isStreaming && (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground space-y-3">
                <Bot className="h-12 w-12 text-muted" />
                <div>
                  <p className="text-sm font-medium">Start a conversation</p>
                  <p className="text-xs mt-1">Select a prompt from the left or type your own question below.</p>
                </div>
              </div>
            )}

            {history.map((msg, idx) => (
              <div key={idx} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white rounded-br-sm"
                      : "bg-card border text-foreground rounded-bl-sm shadow-sm"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm prose-slate dark:prose-invert max-w-none">
                      <Streamdown>{msg.content}</Streamdown>
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>

                {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2 max-w-[75%] space-y-1">
                    <p className="text-xs text-muted-foreground px-1">Sources</p>
                    <div className="flex flex-wrap gap-1.5">
                      {msg.sources.map(src => (
                        <a
                          key={src.documentId}
                          href={`https://drive.google.com/file/d/${src.driveFileId}/view`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={src.fileName}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-card text-xs text-muted-foreground hover:bg-blue-50 dark:hover:bg-blue-950 hover:border-blue-300 hover:text-blue-700 dark:hover:text-blue-300 transition-colors max-w-[220px]"
                        >
                          <FileText className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{src.fileName}</span>
                          <span className="flex-shrink-0 text-muted-foreground">{src.similarity}%</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isStreaming && streamingText && (
              <div className="flex flex-col items-start">
                <div className="max-w-[75%] rounded-2xl rounded-bl-sm px-4 py-3 text-sm bg-card border text-foreground shadow-sm">
                  <div className="prose prose-sm prose-slate dark:prose-invert max-w-none">
                    <Streamdown>{streamingText}</Streamdown>
                  </div>
                </div>
              </div>
            )}

            {isStreaming && !streamingText && (
              <div className="flex justify-start">
                <div className="bg-card border rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="flex-shrink-0 border-t bg-card px-6 py-4">
            <div className="flex gap-3 max-w-3xl mx-auto">
              <Input
                ref={inputRef}
                placeholder="Ask anything about Dennis's experience, skills, or background…"
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAsk()}
                disabled={isStreaming}
              />
              <Button
                onClick={() => handleAsk()}
                disabled={isStreaming || !question.trim()}
              >
                {isStreaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
