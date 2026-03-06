import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowRight } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const MATCH_ADJECTIVES = ["Analyzing", "Extracting", "Processing", "Evaluating", "Searching", "Matching", "Computing", "Scoring"];

function formatElapsed(s: number) {
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function Match() {
  const [, navigate] = useLocation();
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [stage, setStage] = useState("");
  const [step, setStep] = useState(0);
  const [adjIdx, setAdjIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isAnalyzing) return;
    setAdjIdx(0);
    const id = setInterval(() => setAdjIdx(i => (i + 1) % MATCH_ADJECTIVES.length), 1800);
    return () => clearInterval(id);
  }, [isAnalyzing]);

  useEffect(() => {
    if (!isAnalyzing) { setElapsed(0); return; }
    startTimeRef.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current!) / 1000));
    }, 500);
    return () => clearInterval(id);
  }, [isAnalyzing]);

  const handleAnalyze = async () => {
    if (!jobDescription.trim()) {
      toast.error("Please enter a job description");
      return;
    }

    setIsAnalyzing(true);
    setStage("Starting analysis");
    setStep(0);

    try {
      const response = await fetch("/api/stream-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobTitle: jobTitle.trim() || undefined,
          jobDescription: jobDescription.trim(),
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
            setStage(data.stage);
            setStep(data.step);
          } else if (data.type === "done") {
            navigate(`/analysis/${data.analysisId}`);
          } else if (data.type === "error") {
            throw new Error("Analysis failed");
          }
        }
      }
    } catch {
      toast.error("Failed to analyze job description");
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-12">

        <div className="text-center max-w-3xl mx-auto mb-12">
          <h1 className="text-4xl font-bold text-foreground mb-4">Analyze a Job Description</h1>
          <p className="text-xl text-muted-foreground">
            Paste any job description to match it against Dennis "DZ" Zweigle's indexed portfolio
            documents and receive a transparent Match vs. Mismatch report.
          </p>
        </div>

        {/* Job Analysis Form */}
        <Card className="max-w-3xl mx-auto mb-16">
          <CardHeader>
            <CardTitle>Job Description</CardTitle>
            <CardDescription>
              Paste a job description to match it against Dennis "DZ" Zweigle's portfolio
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="jobTitle">Job Title (Optional)</Label>
              <Input
                id="jobTitle"
                placeholder="e.g., Senior Software Engineer"
                value={jobTitle}
                onChange={e => setJobTitle(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="jobDescription">Job Description *</Label>
              <Textarea
                id="jobDescription"
                placeholder="Paste the full job description here..."
                value={jobDescription}
                onChange={e => setJobDescription(e.target.value)}
                rows={12}
                className="font-mono text-sm"
              />
            </div>

            <Button
              onClick={handleAnalyze}
              disabled={isAnalyzing || !jobDescription.trim()}
              className="w-full"
              size="lg"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  Analyze Match
                  <ArrowRight className="ml-2 h-5 w-5" />
                </>
              )}
            </Button>

            {isAnalyzing && (
              <div className="flex flex-col items-center gap-2 pt-2 pb-1 px-3 rounded-lg bg-muted/50 border">
                <div className="flex items-center gap-2 pt-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  <span className="text-sm font-semibold text-red-500">{MATCH_ADJECTIVES[adjIdx]}</span>
                  <span className="text-xs text-muted-foreground">· {formatElapsed(elapsed)}</span>
                </div>
                <p className="text-xs text-muted-foreground">{stage}{step > 0 ? ` · step ${step} of 4` : ""}</p>
                <div className="w-full bg-muted rounded-full h-1 overflow-hidden mb-2">
                  <div
                    className="bg-blue-600 h-full rounded-full transition-all duration-700"
                    style={{ width: `${step > 0 ? (step / 4) * 100 : 5}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* How It Works */}
        <div className="max-w-3xl mx-auto bg-card rounded-xl p-8 shadow-sm border">
          <h3 className="text-2xl font-bold text-foreground mb-4">How It Works</h3>
          <div className="space-y-4">
            {[
              {
                n: 1,
                title: "Paste a Job Description",
                body: "Enter the job title and full job description above.",
              },
              {
                n: 2,
                title: "AI Extracts Requirements",
                body: "Chain of Density analysis identifies hard skills, experience, domain knowledge, and soft skill requirements across four passes.",
              },
              {
                n: 3,
                title: "Get a Weighted Match Report",
                body: "Receive a scored breakdown across four pillars — hard skills (40%), experience (30%), domain (20%), and soft skills (10%).",
              },
              {
                n: 4,
                title: "Ask Follow-Up Questions",
                body: "Use the conversational interface to explore specific aspects of the candidate's background.",
              },
            ].map(step => (
              <div key={step.n} className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                  {step.n}
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">{step.title}</h4>
                  <p className="text-muted-foreground">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </main>
    </div>
  );
}
