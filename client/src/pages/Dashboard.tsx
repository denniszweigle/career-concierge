import { useAuth } from "@/_core/hooks/useAuth";
import { useSiteName } from "@/hooks/useSiteName";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, FileText, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function Dashboard() {
  const { user, loading, isAuthenticated } = useAuth();
  const siteName = useSiteName();
  const [, navigate] = useLocation();
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");

  const connectionStatus = trpc.drive.getConnectionStatus.useQuery();
  const documents = trpc.drive.getDocuments.useQuery();
  const analyses = trpc.analysis.list.useQuery();

  const getAuthUrl = trpc.drive.getAuthUrl.useMutation();
  const syncDocuments = trpc.drive.syncDocuments.useMutation();
  const disconnect = trpc.drive.disconnect.useMutation();
  const createAnalysis = trpc.analysis.create.useMutation();

  const handleConnectDrive = async () => {
    try {
      const result = await getAuthUrl.mutateAsync({ origin: window.location.origin });
      window.location.href = result.authUrl;
    } catch (error) {
      toast.error("Failed to connect to Google Drive");
    }
  };

  const handleSync = async () => {
    try {
      const result = await syncDocuments.mutateAsync();
      toast.success(`Synced ${result.processed} documents`);
      documents.refetch();
    } catch (error) {
      toast.error("Failed to sync documents");
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect.mutateAsync();
      toast.success("Google Drive disconnected");
      connectionStatus.refetch();
      documents.refetch();
    } catch (error) {
      toast.error("Failed to disconnect Google Drive");
    }
  };

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
      toast.success("Analysis complete!");
      navigate(`/analysis/${result.analysisId}`);
    } catch (error) {
      toast.error("Failed to analyze job description");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
            <CardDescription>Please sign in to access the dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => (window.location.href = getLoginUrl())} className="w-full">
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{siteName}</h1>
            <p className="text-sm text-slate-600">Dennis "DZ" Zweigle's Portfolio Analyzer</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600">{user?.name || user?.email}</span>
            <Button variant="outline" onClick={() => navigate("/")}>
              Home
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Google Drive Connection */}
          <Card>
            <CardHeader>
              <CardTitle>Google Drive Connection</CardTitle>
              <CardDescription>Connect to portfolio folder</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {connectionStatus.data?.connected ? (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Connected</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-slate-600">
                  <XCircle className="h-5 w-5" />
                  <span>Not connected</span>
                </div>
              )}

              {!connectionStatus.data?.connected && (
                <Button onClick={handleConnectDrive} disabled={getAuthUrl.isPending} className="w-full">
                  {getAuthUrl.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Connect Google Drive
                </Button>
              )}

              {connectionStatus.data?.connected && (
                <>
                  <Button onClick={handleSync} disabled={syncDocuments.isPending} className="w-full">
                    {syncDocuments.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Sync Documents
                  </Button>
                  <Button 
                    onClick={handleDisconnect} 
                    disabled={disconnect.isPending} 
                    variant="outline" 
                    className="w-full"
                  >
                    {disconnect.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Disconnect
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Document Status */}
          <Card>
            <CardHeader>
              <CardTitle>Indexed Documents</CardTitle>
              <CardDescription>Portfolio files ready for analysis</CardDescription>
            </CardHeader>
            <CardContent>
              {documents.isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="animate-spin h-6 w-6" />
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-3xl font-bold text-slate-900">{documents.data?.length || 0}</div>
                  <div className="text-sm text-slate-600">documents indexed</div>
                  {documents.data && documents.data.length > 0 && (
                    <div className="mt-4 space-y-1">
                      {documents.data.slice(0, 3).map(doc => (
                        <div key={doc.id} className="flex items-center gap-2 text-sm">
                          <FileText className="h-4 w-4 text-slate-400" />
                          <span className="truncate">{doc.fileName}</span>
                        </div>
                      ))}
                      {documents.data.length > 3 && (
                        <div className="text-xs text-slate-500">+{documents.data.length - 3} more</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Analyses */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Analyses</CardTitle>
              <CardDescription>Your job description matches</CardDescription>
            </CardHeader>
            <CardContent>
              {analyses.isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="animate-spin h-6 w-6" />
                </div>
              ) : analyses.data && analyses.data.length > 0 ? (
                <div className="space-y-2">
                  {analyses.data.slice(0, 3).map(analysis => (
                    <button
                      key={analysis.id}
                      onClick={() => navigate(`/analysis/${analysis.id}`)}
                      className="w-full text-left p-3 rounded-lg border hover:bg-slate-50 transition-colors"
                    >
                      <div className="font-medium text-sm truncate">
                        {analysis.jobTitle || "Untitled Analysis"}
                      </div>
                      <div className="text-xs text-slate-600 mt-1">
                        Match: {analysis.matchScore?.toFixed(1)}%
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-slate-600 text-center py-8">No analyses yet</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Job Description Analysis */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Analyze Job Description</CardTitle>
            <CardDescription>
              Enter a job description to match against Dennis "DZ" Zweigle's portfolio
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
              {createAnalysis.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Analyze Match
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
