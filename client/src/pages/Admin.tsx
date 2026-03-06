import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, FileText, CheckCircle, XCircle, RefreshCw, Lock } from "lucide-react";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function Admin() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  const connectionStatus = trpc.drive.getConnectionStatus.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const analyses = trpc.analysis.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const getAuthUrl = trpc.drive.getAuthUrl.useMutation();
  const syncDocuments = trpc.drive.syncDocuments.useMutation();

  const syncStatusQuery = trpc.drive.getSyncStatus.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 5000,
  });

  const isSyncing = syncDocuments.isPending || syncStatusQuery.data?.isRunning === true;

  const documents = trpc.drive.getDocuments.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: isSyncing ? 5000 : false,
  });
  const disconnect = trpc.drive.disconnect.useMutation();

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-2">
              <Lock className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle>Admin Access Required</CardTitle>
            <CardDescription>Sign in to manage the portfolio and Google Drive connection</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {import.meta.env.DEV && (
              <Button
                onClick={() => (window.location.href = "/api/dev-login")}
                className="w-full"
                variant="secondary"
              >
                Dev Login (localhost only)
              </Button>
            )}
            <Button onClick={() => (window.location.href = getLoginUrl())} className="w-full">
              Sign In
            </Button>
            <Button variant="outline" onClick={() => navigate("/")} className="w-full">
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-4">
        <h1 className="text-2xl font-bold text-foreground">Admin</h1>
        <p className="text-sm text-muted-foreground">Portfolio & Google Drive Management</p>
      </div>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Google Drive Connection */}
          <Card>
            <CardHeader>
              <CardTitle>Google Drive Connection</CardTitle>
              <CardDescription>Connect to portfolio folder</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {connectionStatus.isLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="animate-spin h-5 w-5" />
                </div>
              ) : connectionStatus.data?.connected ? (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Connected</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
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
              {isSyncing && (
                <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-1">
                  <div className="flex items-center gap-2 text-blue-700 text-sm font-medium">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Syncing in progress
                  </div>
                  {syncStatusQuery.data && (
                    <>
                      <div className="text-xs text-blue-600">
                        {syncStatusQuery.data.processed} of {syncStatusQuery.data.total} files processed
                      </div>
                      {syncStatusQuery.data.currentFile && (
                        <div className="text-xs text-blue-500 truncate" title={syncStatusQuery.data.currentFile}>
                          {syncStatusQuery.data.currentFile}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
              {documents.isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="animate-spin h-6 w-6" />
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-3xl font-bold text-foreground">{documents.data?.length || 0}</div>
                  <div className="text-sm text-muted-foreground">documents indexed</div>
                  {documents.data && documents.data.length > 0 && (
                    <div className="mt-4 space-y-1">
                      {documents.data.map(doc => (
                        <div key={doc.id} className="flex items-center gap-2 text-sm">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="truncate">{doc.fileName}</span>
                        </div>
                      ))}
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
              <CardDescription>All job description matches</CardDescription>
            </CardHeader>
            <CardContent>
              {analyses.isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="animate-spin h-6 w-6" />
                </div>
              ) : analyses.data && analyses.data.length > 0 ? (
                <div className="space-y-2">
                  {analyses.data.slice(0, 10).map(analysis => (
                    <a
                      key={analysis.id}
                      href={`/analysis/${analysis.id}`}
                      className="block w-full text-left p-3 rounded-lg border hover:bg-accent transition-colors"
                    >
                      <div className="font-medium text-sm truncate">
                        {analysis.jobTitle || "Untitled Analysis"}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Match: {analysis.matchScore?.toFixed(1)}%
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground text-center py-8">No analyses yet</div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
