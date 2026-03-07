import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, FileText, CheckCircle, XCircle, RefreshCw, Lock, Star, Trash2, Search, ArrowUpDown } from "lucide-react";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";

type SortKey = "name-asc" | "name-desc" | "date-desc" | "date-asc" | "type";
const FILE_TYPES = ["pdf", "docx", "pptx", "xlsx", "txt"] as const;

export default function Admin() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("date-desc");

  const connectionStatus = trpc.drive.getConnectionStatus.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const analyses = trpc.analysis.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const utils = trpc.useUtils();
  const getAuthUrl = trpc.drive.getAuthUrl.useMutation();
  const syncDocuments = trpc.drive.syncDocuments.useMutation();
  const deleteDocuments = trpc.drive.deleteDocuments.useMutation({
    onSuccess: () => {
      setSelectedIds(new Set());
      utils.drive.getDocuments.invalidate();
    },
  });
  const setPrimaryResume = trpc.drive.setPrimaryResume.useMutation({
    onSuccess: () => utils.drive.getDocuments.invalidate(),
  });
  const refreshTailorPrompt = trpc.drive.refreshTailorPrompt.useMutation({
    onSuccess: () => toast.success("Tailor prompt reloaded from data/tailor-prompt.md"),
    onError: () => toast.error("Failed to refresh tailor prompt"),
  });

  const tailorPromptQuery = trpc.drive.getTailorPrompt.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const [promptDraft, setPromptDraft] = useState("");
  useEffect(() => {
    if (tailorPromptQuery.data?.content !== undefined) {
      setPromptDraft(tailorPromptQuery.data.content);
    }
  }, [tailorPromptQuery.data?.content]);
  const saveTailorPrompt = trpc.drive.saveTailorPrompt.useMutation({
    onSuccess: () => toast.success("Tailor prompt saved and cache refreshed"),
    onError: () => toast.error("Failed to save tailor prompt"),
  });

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

  const visibleDocs = useMemo(() => {
    const all = documents.data ?? [];
    const q = search.trim().toLowerCase();
    let filtered = all
      .filter(d => typeFilter === "all" || d.fileType === typeFilter)
      .filter(d => !q || d.fileName.toLowerCase().includes(q));
    filtered.sort((a, b) => {
      switch (sortKey) {
        case "name-asc": return a.fileName.localeCompare(b.fileName);
        case "name-desc": return b.fileName.localeCompare(a.fileName);
        case "date-asc": return (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0);
        case "date-desc": return (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
        case "type": return a.fileType.localeCompare(b.fileType) || a.fileName.localeCompare(b.fileName);
      }
    });
    return filtered;
  }, [documents.data, search, typeFilter, sortKey]);

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
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Indexed Documents</CardTitle>
                  <CardDescription>Portfolio files ready for analysis</CardDescription>
                </div>
                {selectedIds.size > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={deleteDocuments.isPending}
                    onClick={async () => {
                      try {
                        await deleteDocuments.mutateAsync({ ids: Array.from(selectedIds) });
                        toast.success(`Deleted ${selectedIds.size} document(s)`);
                      } catch {
                        toast.error("Failed to delete documents");
                      }
                    }}
                  >
                    {deleteDocuments.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    Delete ({selectedIds.size})
                  </Button>
                )}
              </div>
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
                <div className="space-y-3">
                  {/* Stats row */}
                  <div className="flex items-baseline gap-2">
                    <div className="text-3xl font-bold text-foreground">{documents.data?.length || 0}</div>
                    <div className="text-sm text-muted-foreground">documents indexed</div>
                    {visibleDocs.length !== (documents.data?.length ?? 0) && (
                      <div className="text-xs text-muted-foreground ml-auto">{visibleDocs.length} shown</div>
                    )}
                  </div>

                  {/* Filter + sort controls */}
                  {(documents.data?.length ?? 0) > 0 && (
                    <div className="space-y-2">
                      {/* Search */}
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                        <input
                          type="text"
                          placeholder="Search files…"
                          value={search}
                          onChange={e => setSearch(e.target.value)}
                          className="w-full pl-7 pr-2 py-1.5 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </div>

                      {/* Type filter pills + sort */}
                      <div className="flex items-center gap-1 flex-wrap">
                        <button
                          onClick={() => setTypeFilter("all")}
                          className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${typeFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "border-input text-muted-foreground hover:bg-accent"}`}
                        >
                          All
                        </button>
                        {FILE_TYPES.map(t => (
                          <button
                            key={t}
                            onClick={() => setTypeFilter(prev => prev === t ? "all" : t)}
                            className={`px-2 py-0.5 rounded text-xs font-medium border uppercase transition-colors ${typeFilter === t ? "bg-primary text-primary-foreground border-primary" : "border-input text-muted-foreground hover:bg-accent"}`}
                          >
                            {t}
                          </button>
                        ))}
                        <div className="ml-auto flex items-center gap-1">
                          <ArrowUpDown className="h-3 w-3 text-muted-foreground shrink-0" />
                          <select
                            value={sortKey}
                            onChange={e => setSortKey(e.target.value as SortKey)}
                            className="text-xs border border-input rounded px-1 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                          >
                            <option value="date-desc">Newest</option>
                            <option value="date-asc">Oldest</option>
                            <option value="name-asc">Name A→Z</option>
                            <option value="name-desc">Name Z→A</option>
                            <option value="type">Type</option>
                          </select>
                        </div>
                      </div>

                      {/* Select-all for visible docs */}
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none w-fit">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5"
                          checked={visibleDocs.length > 0 && visibleDocs.every(d => selectedIds.has(d.id))}
                          onChange={e => {
                            setSelectedIds(prev => {
                              const next = new Set(prev);
                              if (e.target.checked) visibleDocs.forEach(d => next.add(d.id));
                              else visibleDocs.forEach(d => next.delete(d.id));
                              return next;
                            });
                          }}
                        />
                        Select all visible
                      </label>
                    </div>
                  )}

                  {/* Document rows */}
                  {visibleDocs.length > 0 ? (
                    <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                      {visibleDocs.map(doc => (
                        <div key={doc.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 shrink-0"
                            checked={selectedIds.has(doc.id)}
                            onChange={e => {
                              setSelectedIds(prev => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(doc.id);
                                else next.delete(doc.id);
                                return next;
                              });
                            }}
                          />
                          <button
                            title={doc.isPrimaryResume ? "Primary resume" : "Set as primary resume"}
                            disabled={setPrimaryResume.isPending}
                            onClick={async () => {
                              try {
                                await setPrimaryResume.mutateAsync({ id: doc.id });
                                toast.success(`"${doc.fileName}" set as primary resume`);
                              } catch {
                                toast.error("Failed to set primary resume");
                              }
                            }}
                            className="shrink-0 p-0.5 rounded hover:bg-accent disabled:opacity-50"
                          >
                            <Star className={`h-3.5 w-3.5 ${doc.isPrimaryResume ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                          </button>
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="truncate">{doc.fileName}</span>
                          <span className="ml-auto shrink-0 text-xs text-muted-foreground uppercase">{doc.fileType}</span>
                        </div>
                      ))}
                    </div>
                  ) : (documents.data?.length ?? 0) > 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-4">No documents match your filters</div>
                  ) : null}
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

        {/* Tailor Prompt Editor */}
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>AI Tailor System Prompt</CardTitle>
                <CardDescription>Edit and save the prompt used by the Resume Tailor. Changes take effect immediately — no restart needed.</CardDescription>
              </div>
              <Button
                onClick={() => saveTailorPrompt.mutate({ content: promptDraft })}
                disabled={saveTailorPrompt.isPending || tailorPromptQuery.isLoading}
              >
                {saveTailorPrompt.isPending
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : null}
                Save Prompt
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {tailorPromptQuery.isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="animate-spin h-6 w-6" />
              </div>
            ) : (
              <textarea
                value={promptDraft}
                onChange={e => setPromptDraft(e.target.value)}
                rows={24}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-y"
                spellCheck={false}
              />
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
