import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ArrowRight, FileEdit, Download } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useSiteConfig } from "@/hooks/useSiteConfig";

const MATCH_ADJECTIVES = ["Analyzing", "Extracting", "Processing", "Evaluating", "Searching", "Matching", "Computing", "Scoring"];
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
        return (
          <p key={i} className="text-foreground">
            {line}
          </p>
        );
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

  const newPage = () => {
    doc.addPage();
    y = 20;
  };

  const checkPageBreak = (needed: number) => {
    if (y + needed > pageH - 15) newPage();
  };

  const lines = content.split("\n");
  let isFirstHeader = isResume;

  for (const line of lines) {
    if (line.startsWith("## ")) {
      const text = line.slice(3).trim();
      if (isFirstHeader) {
        // Name — large bold
        checkPageBreak(10);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.text(text, pageW / 2, y, { align: "center" });
        y += 8;
        isFirstHeader = false;
      } else {
        // Section header
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

export default function Match() {
  const siteConfig = useSiteConfig();
  const [, navigate] = useLocation();
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");

  // Analyze state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [stage, setStage] = useState("");
  const [step, setStep] = useState(0);
  const [adjIdx, setAdjIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  // Tailor state
  const [isTailoring, setIsTailoring] = useState(false);
  const [tailorStage, setTailorStage] = useState("");
  const [tailorAdjIdx, setTailorAdjIdx] = useState(0);
  const [tailorElapsed, setTailorElapsed] = useState(0);
  const tailorStartRef = useRef<number | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [coverLetterText, setCoverLetterText] = useState("");
  const [tailorDone, setTailorDone] = useState(false);

  // Analyze cycling adjective
  useEffect(() => {
    if (!isAnalyzing) return;
    setAdjIdx(0);
    const id = setInterval(() => setAdjIdx(i => (i + 1) % MATCH_ADJECTIVES.length), 1800);
    return () => clearInterval(id);
  }, [isAnalyzing]);

  // Analyze elapsed timer
  useEffect(() => {
    if (!isAnalyzing) { setElapsed(0); return; }
    startTimeRef.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current!) / 1000));
    }, 500);
    return () => clearInterval(id);
  }, [isAnalyzing]);

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

  const handleTailor = async () => {
    if (!jobDescription.trim()) {
      toast.error("Please enter a job description");
      return;
    }

    setIsTailoring(true);
    setTailorStage("Starting...");
    setResumeText("");
    setCoverLetterText("");
    setTailorDone(false);

    let accumulated = "";

    try {
      const response = await fetch("/api/stream-tailor", {
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

  const safeJobTitle = (jobTitle.trim() || "Role").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40);

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-12">

        <div className="text-center max-w-3xl mx-auto mb-12">
          <h1 className="text-4xl font-bold text-foreground mb-4">{siteConfig.matchPageTitle}</h1>
          <p className="text-xl text-muted-foreground">{siteConfig.matchPageDescription}</p>
        </div>

        {/* Job Analysis Form */}
        <Card className="max-w-3xl mx-auto mb-8">
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

            <div className="flex gap-3">
              <Button
                onClick={handleAnalyze}
                disabled={isAnalyzing || isTailoring || !jobDescription.trim()}
                className="flex-1"
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

              <Button
                onClick={handleTailor}
                disabled={isAnalyzing || isTailoring || !jobDescription.trim()}
                variant="secondary"
                className="flex-1"
                size="lg"
              >
                {isTailoring ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Tailoring...
                  </>
                ) : (
                  <>
                    <FileEdit className="mr-2 h-5 w-5" />
                    Tailor Resume &amp; Cover Letter
                  </>
                )}
              </Button>
            </div>

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

            {isTailoring && (
              <div className="flex flex-col items-center gap-2 pt-2 pb-1 px-3 rounded-lg bg-muted/50 border">
                <div className="flex items-center gap-2 pt-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  <span className="text-sm font-semibold text-violet-500">{TAILOR_ADJECTIVES[tailorAdjIdx]}</span>
                  <span className="text-xs text-muted-foreground">· {formatElapsed(tailorElapsed)}</span>
                </div>
                <p className="text-xs text-muted-foreground">{tailorStage}</p>
                <div className="w-full bg-muted rounded-full h-1 overflow-hidden mb-2">
                  <div className="bg-violet-500 h-full rounded-full animate-pulse" style={{ width: "60%" }} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tailor Output */}
        {tailorDone && (resumeText || coverLetterText) && (
          <Card className="max-w-3xl mx-auto mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileEdit className="h-5 w-5 text-violet-500" />
                Tailored Documents
              </CardTitle>
              <CardDescription>
                ATS-optimized resume and cover letter tailored to the job description.
                Download as PDF for submission.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="resume">
                <TabsList className="mb-4">
                  <TabsTrigger value="resume">Resume</TabsTrigger>
                  <TabsTrigger value="cover-letter">Cover Letter</TabsTrigger>
                </TabsList>

                <TabsContent value="resume">
                  <div className="flex justify-end mb-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        generatePDF(
                          resumeText,
                          `DZ_Resume_${safeJobTitle}.pdf`,
                          true
                        ).catch(() => toast.error("PDF generation failed"))
                      }
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download Resume PDF
                    </Button>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-4 max-h-[600px] overflow-y-auto">
                    <ContentPreview content={resumeText} />
                  </div>
                </TabsContent>

                <TabsContent value="cover-letter">
                  <div className="flex justify-end mb-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        generatePDF(
                          coverLetterText,
                          `DZ_CoverLetter_${safeJobTitle}.pdf`,
                          false
                        ).catch(() => toast.error("PDF generation failed"))
                      }
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download Cover Letter PDF
                    </Button>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-4 max-h-[600px] overflow-y-auto">
                    <ContentPreview content={coverLetterText} />
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}

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
                title: "Analyze Match or Tailor Documents",
                body: "Run a weighted Match vs. Mismatch analysis, or generate an ATS-optimized resume and cover letter tailored to the role.",
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
            ].map(s => (
              <div key={s.n} className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                  {s.n}
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">{s.title}</h4>
                  <p className="text-muted-foreground">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </main>
    </div>
  );
}
