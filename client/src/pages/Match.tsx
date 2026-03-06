import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function Match() {
  const [, navigate] = useLocation();
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");

  const createAnalysis = trpc.analysis.create.useMutation();

  const handleAnalyze = async () => {
    if (!jobDescription.trim()) {
      toast.error("Please enter a job description");
      return;
    }

    try {
      const result = await createAnalysis.mutateAsync({
        jobTitle: jobTitle.trim() || undefined,
        jobDescription: jobDescription.trim(),
      });
      navigate(`/analysis/${result.analysisId}`);
    } catch {
      toast.error("Failed to analyze job description");
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
              disabled={createAnalysis.isPending || !jobDescription.trim()}
              className="w-full"
              size="lg"
            >
              {createAnalysis.isPending ? (
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
