import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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

  const SECTION_KEYS = [
    "role-objective", "candidate-identity", "bridge-strategy",
    "structural-template", "resume-instructions", "title-optimization",
    "thought-leadership", "cover-letter", "output-format"
  ] as const;
  type SectionKey = typeof SECTION_KEYS[number];

  function parsePromptSections(raw: string): Record<SectionKey, string> {
    const result = Object.fromEntries(SECTION_KEYS.map(k => [k, ""])) as Record<SectionKey, string>;
    for (let i = 0; i < SECTION_KEYS.length; i++) {
      const key = SECTION_KEYS[i];
      const startMarker = `<!-- SECTION:${key} -->`;
      const startIdx = raw.indexOf(startMarker);
      if (startIdx === -1) continue;
      const contentStart = startIdx + startMarker.length;
      // Find next section marker
      let endIdx = raw.length;
      for (let j = i + 1; j < SECTION_KEYS.length; j++) {
        const nextMarker = `<!-- SECTION:${SECTION_KEYS[j]} -->`;
        const nextIdx = raw.indexOf(nextMarker, contentStart);
        if (nextIdx !== -1) { endIdx = nextIdx; break; }
      }
      result[key] = raw.slice(contentStart, endIdx).replace(/^\n/, "").replace(/\n$/, "");
    }
    return result;
  }

  function assemblePromptSections(drafts: Record<SectionKey, string>): string {
    return SECTION_KEYS.map(k => `<!-- SECTION:${k} -->\n${drafts[k]}`).join("\n\n") + "\n";
  }

  const tailorPromptQuery = trpc.drive.getTailorPrompt.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const [sectionDrafts, setSectionDrafts] = useState<Record<SectionKey, string>>(
    Object.fromEntries(SECTION_KEYS.map(k => [k, ""])) as Record<SectionKey, string>
  );
  useEffect(() => {
    if (tailorPromptQuery.data?.content !== undefined) {
      setSectionDrafts(parsePromptSections(tailorPromptQuery.data.content));
    }
  }, [tailorPromptQuery.data?.content]);
  const saveTailorPrompt = trpc.drive.saveTailorPrompt.useMutation({
    onSuccess: () => toast.success("Tailor prompt saved and cache refreshed"),
    onError: () => toast.error("Failed to save tailor prompt"),
  });

  type EngineConfigDraft = {
    ragStrengthThreshold: number;
    ragTopKEvidence: number;
    ragTopKQA: number;
    llmModel: string;
    llmTemperature: number;
    llmMaxTokens: number;
    chunkSize: number;
    chunkOverlap: number;
  };
  const ENGINE_DEFAULTS: EngineConfigDraft = {
    ragStrengthThreshold: 60,
    ragTopKEvidence: 3,
    ragTopKQA: 5,
    llmModel: "gpt-4o-mini",
    llmTemperature: 0.1,
    llmMaxTokens: 8192,
    chunkSize: 1000,
    chunkOverlap: 200,
  };
  const engineConfigQuery = trpc.system.getEngineConfig.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const [engineDraft, setEngineDraft] = useState<EngineConfigDraft>(ENGINE_DEFAULTS);
  useEffect(() => {
    if (engineConfigQuery.data) setEngineDraft(engineConfigQuery.data);
  }, [engineConfigQuery.data]);
  const saveEngineConfigMutation = trpc.system.saveEngineConfig.useMutation({
    onSuccess: () => toast.success("Engine settings saved — RAG changes take effect immediately"),
    onError: () => toast.error("Failed to save engine settings"),
  });

  const siteConfigQuery = trpc.system.getSiteConfig.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const [siteNameDraft, setSiteNameDraft] = useState("");
  const [candidateNameDraft, setCandidateNameDraft] = useState("");
  const [heroTaglineDraft, setHeroTaglineDraft] = useState("");
  const [matchPageTitleDraft, setMatchPageTitleDraft] = useState("");
  const [matchPageDescDraft, setMatchPageDescDraft] = useState("");
  const [chatPageDescDraft, setChatPageDescDraft] = useState("");
  useEffect(() => {
    if (siteConfigQuery.data) {
      setSiteNameDraft(siteConfigQuery.data.siteName ?? "");
      setCandidateNameDraft(siteConfigQuery.data.candidateName ?? "");
      setHeroTaglineDraft(siteConfigQuery.data.heroTagline ?? "");
      setMatchPageTitleDraft(siteConfigQuery.data.matchPageTitle ?? "");
      setMatchPageDescDraft(siteConfigQuery.data.matchPageDescription ?? "");
      setChatPageDescDraft(siteConfigQuery.data.chatPageDescription ?? "");
    }
  }, [siteConfigQuery.data]);
  const saveSiteConfig = trpc.system.saveSiteConfig.useMutation({
    onSuccess: () => {
      toast.success("Site settings saved");
      utils.system.getSiteConfig.invalidate();
    },
    onError: () => toast.error("Failed to save site settings"),
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

        {/* Site Settings Editor */}
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Site Settings</CardTitle>
                <CardDescription>Customize the name, candidate identity, and page copy. Changes take effect immediately.</CardDescription>
              </div>
              <Button
                onClick={() => saveSiteConfig.mutate({
                  siteName: siteNameDraft,
                  candidateName: candidateNameDraft,
                  heroTagline: heroTaglineDraft,
                  matchPageTitle: matchPageTitleDraft,
                  matchPageDescription: matchPageDescDraft,
                  chatPageDescription: chatPageDescDraft,
                })}
                disabled={saveSiteConfig.isPending || !siteNameDraft.trim()}
              >
                {saveSiteConfig.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save All
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Site Name</label>
                <input
                  type="text"
                  value={siteNameDraft}
                  onChange={e => setSiteNameDraft(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="Agentic Me"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Candidate Name</label>
                <input
                  type="text"
                  value={candidateNameDraft}
                  onChange={e => setCandidateNameDraft(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder='Dennis "DZ" Zweigle'
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Home Page — Hero Tagline</label>
              <textarea
                value={heroTaglineDraft}
                onChange={e => setHeroTaglineDraft(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-y"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Match Page — Title</label>
              <input
                type="text"
                value={matchPageTitleDraft}
                onChange={e => setMatchPageTitleDraft(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Match Page — Description</label>
              <textarea
                value={matchPageDescDraft}
                onChange={e => setMatchPageDescDraft(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-y"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Chat Page — Description</label>
              <input
                type="text"
                value={chatPageDescDraft}
                onChange={e => setChatPageDescDraft(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </CardContent>
        </Card>

        {/* Tailor Prompt Editor */}
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>AI Tailor System Prompt</CardTitle>
                <CardDescription>Edit and save the prompt used by the Resume Tailor. Changes take effect immediately — no restart needed.</CardDescription>
              </div>
              <Button
                onClick={() => saveTailorPrompt.mutate({ content: assemblePromptSections(sectionDrafts) })}
                disabled={saveTailorPrompt.isPending || tailorPromptQuery.isLoading}
              >
                {saveTailorPrompt.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
              <Tabs defaultValue="overview">
                <TabsList className="flex-wrap h-auto gap-1 mb-4">
                  <TabsTrigger value="overview">How It Works</TabsTrigger>
                  <TabsTrigger value="role-objective">Role & Objective</TabsTrigger>
                  <TabsTrigger value="candidate-identity">Candidate Identity</TabsTrigger>
                  <TabsTrigger value="bridge-strategy">Bridge Strategy</TabsTrigger>
                  <TabsTrigger value="structural-template">Structural Template</TabsTrigger>
                  <TabsTrigger value="resume-instructions">Resume Instructions</TabsTrigger>
                  <TabsTrigger value="title-optimization">Title Optimization</TabsTrigger>
                  <TabsTrigger value="thought-leadership">Thought Leadership</TabsTrigger>
                  <TabsTrigger value="cover-letter">Cover Letter</TabsTrigger>
                  <TabsTrigger value="output-format">Output Format</TabsTrigger>
                </TabsList>

                {/* How It Works */}
                <TabsContent value="overview">
                  <div className="space-y-4 text-sm text-muted-foreground">
                    <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 p-4 space-y-3">
                      <p className="font-semibold text-foreground">How the AI Tailor pipeline works</p>
                      <p>When you run the Resume Tailor, the AI receives two things: (1) this system prompt and (2) a human message containing your primary resume, the job description, and the top portfolio evidence matched to each JD requirement.</p>
                      <p><strong>Section priority order</strong> — each section builds on the previous:</p>
                      <ol className="list-decimal list-inside space-y-1 pl-2">
                        <li><strong>Candidate Identity</strong> — locks in known facts; the AI must use these, no exceptions</li>
                        <li><strong>Bridge Strategy</strong> — governs integrity: only cite evidence that exists; bridge partial matches; omit the rest</li>
                        <li><strong>Structural Template</strong> — preserves your resume layout exactly as-is</li>
                        <li><strong>Resume Instructions</strong> — shapes how content is written (keywords, metrics, tone)</li>
                        <li><strong>Title Optimization</strong> — <em>overrides</em> Structural Template for job title lines only; every title gets a pipe-framed JD alias</li>
                        <li><strong>Thought Leadership</strong> — optional signals the AI weaves in only when the JD context fits</li>
                      </ol>
                      <p><strong>OVERRIDE hierarchy:</strong> Title Optimization explicitly supersedes Structural Template for job title lines. The Structural Template section includes an exception sentence to prevent conflicts.</p>
                      <p><strong>Cover Letter</strong> and <strong>Output Format</strong> are independent — they control the second document and the delimiter markers the app uses to split the response.</p>
                      <p className="text-xs">The HTML comment delimiters (<code>{"<!-- SECTION:key -->"}</code>) are invisible to the AI but let this editor split the prompt into named sections. The AI receives the full assembled text.</p>
                    </div>
                  </div>
                </TabsContent>

                {/* Role & Objective */}
                <TabsContent value="role-objective">
                  <div className="space-y-3">
                    <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-sm text-muted-foreground">
                      <strong>Role & Objective</strong> — This is the AI's job title and main goal. It tells the AI it's acting as a career coach who writes resumes. The goal is to match as many keywords from the job posting as possible, so your resume passes automated screening software (ATS).<br /><br />
                      <em>Example: If the job asks for "cloud computing" and your resume says "hosted apps online," the AI rewrites it to say "cloud computing" — same work, better match.</em>
                    </div>
                    <textarea
                      value={sectionDrafts["role-objective"]}
                      onChange={e => setSectionDrafts(prev => ({ ...prev, "role-objective": e.target.value }))}
                      rows={8}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-y"
                      spellCheck={false}
                    />
                  </div>
                </TabsContent>

                {/* Candidate Identity */}
                <TabsContent value="candidate-identity">
                  <div className="space-y-3">
                    <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-sm text-muted-foreground">
                      <strong>Candidate Identity</strong> — These are the facts about you that the AI is always allowed to use — no matter what job you apply for. Think of it as your permanent cheat sheet.<br /><br />
                      <em>Example: If you have an MIT certification, the AI will always mention it when the job is in AI or technology, even if you didn't list it in the job description box.</em>
                    </div>
                    <textarea
                      value={sectionDrafts["candidate-identity"]}
                      onChange={e => setSectionDrafts(prev => ({ ...prev, "candidate-identity": e.target.value }))}
                      rows={10}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-y"
                      spellCheck={false}
                    />
                  </div>
                </TabsContent>

                {/* Bridge Strategy */}
                <TabsContent value="bridge-strategy">
                  <div className="space-y-3">
                    <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-sm text-muted-foreground">
                      <strong>Bridge Strategy</strong> — This tells the AI what to do when your experience doesn't perfectly match what the job is asking for. It has three moves: (1) If you've done it — say so directly. (2) If you've done something similar — mention your version and say it's equivalent. (3) If you've never done it — leave it out entirely.<br /><br />
                      <em>Example: Job asks for AWS, but you used Google Cloud → AI writes: "Google Cloud (equivalent to AWS environments)." Job asks for Salesforce, which you've never touched → AI leaves it out entirely.</em>
                    </div>
                    <textarea
                      value={sectionDrafts["bridge-strategy"]}
                      onChange={e => setSectionDrafts(prev => ({ ...prev, "bridge-strategy": e.target.value }))}
                      rows={16}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-y"
                      spellCheck={false}
                    />
                  </div>
                </TabsContent>

                {/* Structural Template */}
                <TabsContent value="structural-template">
                  <div className="space-y-3">
                    <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-sm text-muted-foreground">
                      <strong>Structural Template</strong> — This tells the AI to keep your resume in the same order and layout as your master resume — same sections, same headings, same bullet style. The AI rewrites the words but never scrambles the format. The one exception is job titles, which Title Optimization handles.<br /><br />
                      <em>Example: If your resume always has "Work Experience" before "Education," the AI will never flip them — even if the job posting puts Education first.</em>
                    </div>
                    <textarea
                      value={sectionDrafts["structural-template"]}
                      onChange={e => setSectionDrafts(prev => ({ ...prev, "structural-template": e.target.value }))}
                      rows={10}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-y"
                      spellCheck={false}
                    />
                  </div>
                </TabsContent>

                {/* Resume Instructions */}
                <TabsContent value="resume-instructions">
                  <div className="space-y-3">
                    <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-sm text-muted-foreground">
                      <strong>Resume Instructions</strong> — These are the writing rules for the body of the resume — how to highlight numbers, where to put keywords, and how to keep the format readable by hiring software.<br /><br />
                      <em>Example: If your resume mentions you cut invoice time from 25 days to 2 days, this section tells the AI to always put that number near the top of the bullet, not buried at the end.</em>
                    </div>
                    <textarea
                      value={sectionDrafts["resume-instructions"]}
                      onChange={e => setSectionDrafts(prev => ({ ...prev, "resume-instructions": e.target.value }))}
                      rows={12}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-y"
                      spellCheck={false}
                    />
                  </div>
                </TabsContent>

                {/* Title Optimization */}
                <TabsContent value="title-optimization">
                  <div className="space-y-3">
                    <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-sm text-muted-foreground">
                      <strong>Title Optimization</strong> — This is a special override: for every job you've held, the AI adds a second title after a pipe symbol (|) that echoes the job you're applying for. This helps automated systems that match job titles. This section supersedes the Structural Template for title lines only.<br /><br />
                      <em>Example: You held "Sr. Staff AI &amp; Data Solutions Architect." You're applying for "Enterprise Architect Solution Governance &amp; Agentic AI." → AI writes: "Sr. Staff AI &amp; Data Solutions Architect | Enterprise Architecture, Solution Governance &amp; Agentic AI." Your actual title stays — the extra label just shows the hiring system what role you're targeting.</em>
                    </div>
                    <textarea
                      value={sectionDrafts["title-optimization"]}
                      onChange={e => setSectionDrafts(prev => ({ ...prev, "title-optimization": e.target.value }))}
                      rows={16}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-y"
                      spellCheck={false}
                    />
                  </div>
                </TabsContent>

                {/* Thought Leadership */}
                <TabsContent value="thought-leadership">
                  <div className="space-y-3">
                    <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-sm text-muted-foreground">
                      <strong>Thought Leadership</strong> — These are your signature accomplishments that go beyond the job description — things that show you think at a strategic or visionary level. The AI only includes them when the job posting fits.<br /><br />
                      <em>Example: If the job mentions AI ethics or compliance, the AI will note your AIGP certification and connect it to the company's needs. If the job is pure coding work, the AI skips these.</em>
                    </div>
                    <textarea
                      value={sectionDrafts["thought-leadership"]}
                      onChange={e => setSectionDrafts(prev => ({ ...prev, "thought-leadership": e.target.value }))}
                      rows={12}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-y"
                      spellCheck={false}
                    />
                  </div>
                </TabsContent>

                {/* Cover Letter */}
                <TabsContent value="cover-letter">
                  <div className="space-y-3">
                    <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-sm text-muted-foreground">
                      <strong>Cover Letter</strong> — This controls the tone and structure of the cover letter — how it opens, what problem it highlights, and how it positions your background.<br /><br />
                      <em>Example: If the job is in a regulated industry like insurance or finance, the AI leads with your AI governance certification as a trust signal. If the job is a startup, it leads with your history of building things from scratch.</em>
                    </div>
                    <textarea
                      value={sectionDrafts["cover-letter"]}
                      onChange={e => setSectionDrafts(prev => ({ ...prev, "cover-letter": e.target.value }))}
                      rows={12}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-y"
                      spellCheck={false}
                    />
                  </div>
                </TabsContent>

                {/* Output Format */}
                <TabsContent value="output-format">
                  <div className="space-y-3">
                    <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-sm text-muted-foreground">
                      <strong>Output Format</strong> — This tells the AI exactly how to format its final answer so the app can split it into a resume and a cover letter automatically. Don't change this section unless you know what you're doing — if the formatting markers are wrong, neither document will display.<br /><br />
                      <em>Example: The AI must always start the resume with "### CUSTOM_RESUME" and the cover letter with "### CUSTOM_COVER_LETTER" — these are the signals the app uses to separate the two.</em>
                    </div>
                    <textarea
                      value={sectionDrafts["output-format"]}
                      onChange={e => setSectionDrafts(prev => ({ ...prev, "output-format": e.target.value }))}
                      rows={10}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-y"
                      spellCheck={false}
                    />
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>

        {/* Engine Settings */}
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Engine Settings</CardTitle>
                <CardDescription>
                  Tune how the AI finds evidence, scores matches, and generates answers. RAG changes take effect on the next match or question — no restart needed. LLM and chunking changes require a server restart or re-sync respectively.
                </CardDescription>
              </div>
              <Button
                onClick={() => saveEngineConfigMutation.mutate(engineDraft)}
                disabled={saveEngineConfigMutation.isPending || engineConfigQuery.isLoading}
              >
                {saveEngineConfigMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Settings
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {engineConfigQuery.isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="animate-spin h-6 w-6" />
              </div>
            ) : (
              <Tabs defaultValue="overview">
                <TabsList className="flex-wrap h-auto gap-1 mb-4">
                  <TabsTrigger value="overview">How It Works</TabsTrigger>
                  <TabsTrigger value="matching">Matching &amp; Scoring</TabsTrigger>
                  <TabsTrigger value="qa">Q&amp;A Retrieval</TabsTrigger>
                  <TabsTrigger value="llm">LLM Behavior</TabsTrigger>
                  <TabsTrigger value="chunking">Document Chunking</TabsTrigger>
                </TabsList>

                {/* How It Works */}
                <TabsContent value="overview">
                  <div className="space-y-4 text-sm text-muted-foreground">
                    <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 p-4 space-y-3">
                      <p className="font-semibold text-foreground">What these settings control</p>
                      <p>Every match score, strength, gap, and Q&A answer in this app is produced by a two-part process: (1) the AI searches your indexed portfolio documents for evidence, and (2) it scores how well that evidence answers each job requirement. These settings control both steps.</p>
                      <p><strong>How settings flow through the pipeline:</strong></p>
                      <ol className="list-decimal list-inside space-y-1.5 pl-2">
                        <li><strong>Matching &amp; Scoring</strong> — runs on every job match. Changes here take effect on the next match immediately.</li>
                        <li><strong>Q&amp;A Retrieval</strong> — runs every time you ask a question in the chat panel. Changes take effect on the next question.</li>
                        <li><strong>LLM Behavior</strong> — controls the AI model and writing style. Requires a server restart to take effect.</li>
                        <li><strong>Document Chunking</strong> — controls how your portfolio files are split into searchable pieces. Requires a full re-sync to take effect — existing chunks in the database are not automatically updated.</li>
                      </ol>
                      <p><strong>Which setting matters most right now?</strong> If your match scores seem too low or too high, start with the <strong>Strength Threshold</strong> in Matching &amp; Scoring. That single number determines which items show as strengths vs. gaps.</p>
                    </div>
                  </div>
                </TabsContent>

                {/* Matching & Scoring */}
                <TabsContent value="matching">
                  <div className="space-y-6">
                    <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-sm text-muted-foreground">
                      These two settings control every match score you see. Changes take effect immediately — no restart needed.
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-md border border-slate-200 bg-slate-50 dark:bg-slate-900/40 dark:border-slate-700 p-3 text-sm text-muted-foreground">
                        <strong>Strength Threshold</strong> — This is the cutoff score that decides whether evidence counts as a strength or a gap. If a portfolio passage scores at or above this number when matched against a job requirement, it gets listed under Top 3 Strengths. If it falls below, it's a gap — even if the match is close. Think of it like a passing grade: change the number, and the same evidence can go from an F to a B+.<br /><br />
                        <em>Example: Your portfolio has a chunk about building a GenAI platform. The AI matches it against "Artificial Intelligence" and scores it 59%. At threshold 60, that's a gap. At threshold 55, it's a strength — same evidence, different verdict. Lower the threshold if you're getting gaps that don't feel accurate.</em>
                      </div>
                      <div className="flex items-center gap-4">
                        <input
                          type="number"
                          min={0} max={100} step={1}
                          value={engineDraft.ragStrengthThreshold}
                          onChange={e => setEngineDraft(prev => ({ ...prev, ragStrengthThreshold: Number(e.target.value) }))}
                          className="w-28 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <span className="text-xs text-muted-foreground">Range: 0–100 &nbsp;·&nbsp; Current .env default: 60 &nbsp;·&nbsp; Recommended: 50–55</span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-md border border-slate-200 bg-slate-50 dark:bg-slate-900/40 dark:border-slate-700 p-3 text-sm text-muted-foreground">
                        <strong>Evidence Chunks per Requirement</strong> — For every skill or experience the job description asks for, the AI pulls this many portfolio passages to use as evidence. More passages gives the AI more to work with — it can see a fuller picture — but it also means more processing time per match and a slightly higher cost per run.<br /><br />
                        <em>Example: The JD asks for "cloud-native deployment." If this is set to 3, the AI grabs the 3 most similar passages from your portfolio and averages their scores. If only 1 passage exists about cloud deployment, setting this to 5 won't hurt — extra slots just pull in the next-closest matches.</em>
                      </div>
                      <div className="flex items-center gap-4">
                        <input
                          type="number"
                          min={1} max={20} step={1}
                          value={engineDraft.ragTopKEvidence}
                          onChange={e => setEngineDraft(prev => ({ ...prev, ragTopKEvidence: Number(e.target.value) }))}
                          className="w-28 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <span className="text-xs text-muted-foreground">Range: 1–20 &nbsp;·&nbsp; Current: {engineDraft.ragTopKEvidence} &nbsp;·&nbsp; Recommended: 3–8</span>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* Q&A Retrieval */}
                <TabsContent value="qa">
                  <div className="space-y-6">
                    <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-sm text-muted-foreground">
                      Controls how many portfolio passages the AI reads before answering a question in the chat panel. Takes effect on the next question — no restart needed.
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-md border border-slate-200 bg-slate-50 dark:bg-slate-900/40 dark:border-slate-700 p-3 text-sm text-muted-foreground">
                        <strong>Answer Passages</strong> — How many portfolio chunks the AI reads before writing a response to a chat question. More passages = richer, more complete answers that draw from more documents. Fewer = faster responses but potentially missing relevant context.<br /><br />
                        <em>Example: You ask "What measurable business impact has Dennis demonstrated?" At 5 passages, the AI might cite the invoice cycle reduction and the $30M claims outcome. At 12 passages, it might also surface a third metric from a project document you forgot was indexed. Raise this number if answers feel incomplete or miss known facts in your portfolio.</em>
                      </div>
                      <div className="flex items-center gap-4">
                        <input
                          type="number"
                          min={1} max={30} step={1}
                          value={engineDraft.ragTopKQA}
                          onChange={e => setEngineDraft(prev => ({ ...prev, ragTopKQA: Number(e.target.value) }))}
                          className="w-28 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <span className="text-xs text-muted-foreground">Range: 1–30 &nbsp;·&nbsp; Current: {engineDraft.ragTopKQA} &nbsp;·&nbsp; Recommended: 5–12</span>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* LLM Behavior */}
                <TabsContent value="llm">
                  <div className="space-y-6">
                    <div className="rounded-md border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800 p-3 text-sm text-muted-foreground">
                      <strong>Requires server restart to take effect.</strong> The AI model and its behavior settings are locked in when the server starts. Save here to persist the values, then restart the server to apply them.
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-md border border-slate-200 bg-slate-50 dark:bg-slate-900/40 dark:border-slate-700 p-3 text-sm text-muted-foreground">
                        <strong>Model</strong> — The name of the AI model used for everything: generating the match report, answering portfolio questions, extracting job requirements, and writing tailored resumes. This must be a model your API key has access to.<br /><br />
                        <em>Example: "gpt-4o-mini" is fast and inexpensive — good for everyday use. "gpt-4o" is slower and more expensive but produces noticeably sharper reports and cover letters. "claude-sonnet-4-6" works if your API URL points to an Anthropic-compatible endpoint.</em>
                      </div>
                      <input
                        type="text"
                        value={engineDraft.llmModel}
                        onChange={e => setEngineDraft(prev => ({ ...prev, llmModel: e.target.value }))}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                        placeholder="gpt-4o-mini"
                      />
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-md border border-slate-200 bg-slate-50 dark:bg-slate-900/40 dark:border-slate-700 p-3 text-sm text-muted-foreground">
                        <strong>Temperature</strong> — Controls how predictable vs. creative the AI's writing is. At 0.0, the AI always picks the most likely next word — responses are consistent and structured, great for scoring and requirement extraction. At 1.0, it varies more — better for cover letters that need personality but less reliable for data extraction.<br /><br />
                        <em>Example: For match reports and Q&A, 0.1 keeps answers tight and fact-based. If your cover letters feel robotic, try 0.3–0.5 for more natural prose without sacrificing accuracy.</em>
                      </div>
                      <div className="flex items-center gap-4">
                        <input
                          type="number"
                          min={0} max={1} step={0.05}
                          value={engineDraft.llmTemperature}
                          onChange={e => setEngineDraft(prev => ({ ...prev, llmTemperature: Number(e.target.value) }))}
                          className="w-28 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <span className="text-xs text-muted-foreground">Range: 0.0–1.0 &nbsp;·&nbsp; Recommended: 0.1</span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-md border border-slate-200 bg-slate-50 dark:bg-slate-900/40 dark:border-slate-700 p-3 text-sm text-muted-foreground">
                        <strong>Max Tokens</strong> — The maximum length of any single AI response, measured in tokens (roughly ¾ of a word each). If your tailored resumes or match reports are being cut off mid-sentence, raise this number. If you want to reduce cost per run, lower it — but not below ~4000 or the resume tailor will truncate.<br /><br />
                        <em>Example: A full tailored resume + cover letter typically uses 3,000–5,000 tokens of output. At the default of 8,192 there's headroom for long resumes. The match report alone uses 800–1,200 tokens.</em>
                      </div>
                      <div className="flex items-center gap-4">
                        <input
                          type="number"
                          min={512} max={32768} step={512}
                          value={engineDraft.llmMaxTokens}
                          onChange={e => setEngineDraft(prev => ({ ...prev, llmMaxTokens: Number(e.target.value) }))}
                          className="w-28 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <span className="text-xs text-muted-foreground">Range: 512–32768 &nbsp;·&nbsp; Recommended: 8192</span>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* Document Chunking */}
                <TabsContent value="chunking">
                  <div className="space-y-6">
                    <div className="rounded-md border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800 p-3 text-sm text-muted-foreground">
                      <strong>Requires a full re-sync to take effect.</strong> These settings control how documents are split when indexed — they don't change the documents already in the database. After saving, go to Admin → Sync Documents to re-index with the new chunk sizes. All existing chunks will be replaced.
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-md border border-slate-200 bg-slate-50 dark:bg-slate-900/40 dark:border-slate-700 p-3 text-sm text-muted-foreground">
                        <strong>Chunk Size</strong> — How many characters make up each searchable piece of a document. Smaller chunks are more precise — the AI retrieves exactly the right sentence — but each chunk has less surrounding context. Larger chunks give the AI more context per match but may include off-topic text that dilutes the similarity score.<br /><br />
                        <em>Example: Your resume has a section on blockchain work. At 500 characters, that section gets split into 4–5 precise chunks. At 2,000 characters, the whole section is one chunk — good context, but if a JD asks specifically about smart contracts, the score is averaged across everything else in that section too.</em>
                      </div>
                      <div className="flex items-center gap-4">
                        <input
                          type="number"
                          min={200} max={4000} step={100}
                          value={engineDraft.chunkSize}
                          onChange={e => setEngineDraft(prev => ({ ...prev, chunkSize: Number(e.target.value) }))}
                          className="w-28 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <span className="text-xs text-muted-foreground">Range: 200–4000 chars &nbsp;·&nbsp; Current: {engineDraft.chunkSize} &nbsp;·&nbsp; Recommended: 800–1200</span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-md border border-slate-200 bg-slate-50 dark:bg-slate-900/40 dark:border-slate-700 p-3 text-sm text-muted-foreground">
                        <strong>Chunk Overlap</strong> — How many characters are shared between one chunk and the next. Overlap is a safety net: it prevents an important sentence from being split right at a chunk boundary and losing its meaning. Zero overlap is fine for short documents, but for long resumes or dense project write-ups, 150–250 characters of overlap ensures continuity.<br /><br />
                        <em>Example: A bullet point says "Reduced invoice cycle from 25 days to 2 days — saving $400K annually." Without overlap, "saving $400K annually" might end up isolated in the next chunk with no context. With 200-character overlap, both chunks include enough of the surrounding sentence to understand what the number refers to.</em>
                      </div>
                      <div className="flex items-center gap-4">
                        <input
                          type="number"
                          min={0} max={1000} step={50}
                          value={engineDraft.chunkOverlap}
                          onChange={e => setEngineDraft(prev => ({ ...prev, chunkOverlap: Number(e.target.value) }))}
                          className="w-28 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <span className="text-xs text-muted-foreground">Range: 0–1000 chars &nbsp;·&nbsp; Current: {engineDraft.chunkOverlap} &nbsp;·&nbsp; Recommended: 150–250</span>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
