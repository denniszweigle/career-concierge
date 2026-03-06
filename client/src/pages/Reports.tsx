import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LineChart, Line, BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Brush, Legend,
} from "recharts";
import { Download, BarChart2, GitBranch, CheckCircle2, Cpu, Database, TrendingUp } from "lucide-react";

// ─── helpers ────────────────────────────────────────────────────────────────

function parseJsonArray(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return []; } }
  return [];
}

function escapeCsv(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]): void {
  const csv = rows.map(r => r.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function pct(v: number | null | undefined): number {
  // Scores are stored in 0–100 range in the DB — no multiplication needed
  return v ?? 0;
}

function fmt2(v: number): string {
  return v.toFixed(2);
}

function avg(vals: number[]): number {
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  return new Date(v as string | number);
}

function fmtK(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K`
    : String(n);
}

// gpt-4o-mini pricing (USD per 1M tokens)
const PRICE_INPUT_PER_M = 0.15;
const PRICE_OUTPUT_PER_M = 0.60;

const CATEGORY_COLORS = ["#3b82f6", "#8b5cf6", "#14b8a6", "#f59e0b"];
const TYPE_COLORS: Record<string, string> = {
  pdf: "#ef4444", docx: "#3b82f6", pptx: "#f97316", xlsx: "#22c55e", txt: "#8b5cf6",
};

// ─── sub-components ──────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold text-foreground mt-0.5">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ScoreBadge({ value }: { value: number }) {
  const cls = value >= 70 ? "bg-green-100 text-green-700"
    : value >= 40 ? "bg-yellow-100 text-yellow-700"
    : "bg-red-100 text-red-700";
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{fmt2(value)}%</span>;
}

function SectionHeading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="max-w-6xl mx-auto mb-4">
      <h2 className="text-xl font-bold text-foreground">{title}</h2>
      {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function Reports() {
  const [, navigate] = useLocation();

  // Filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);

  const { data: analyses = [], isLoading: analysesLoading } = trpc.analysis.getPublicReport.useQuery();
  const { data: stats, isLoading: statsLoading } = trpc.stats.getPublicStats.useQuery();

  // ── filtered dataset ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return analyses.filter(a => {
      const d = toDate(a.createdAt);
      if (dateFrom && d < new Date(dateFrom)) return false;
      if (dateTo && d > new Date(dateTo + "T23:59:59")) return false;
      if (minScore > 0 && pct(a.matchScore) < minScore) return false;
      if (selectedBucket) {
        const s = pct(a.matchScore);
        const [lo, hi] = selectedBucket.split("–").map(x => parseInt(x));
        if (s < lo! || s > hi!) return false;
      }
      return true;
    });
  }, [analyses, dateFrom, dateTo, minScore, selectedBucket]);

  // ── chart data ────────────────────────────────────────────────────────────

  const lineData = useMemo(() =>
    [...filtered]
      .sort((a, b) => toDate(a.createdAt).getTime() - toDate(b.createdAt).getTime())
      .map(a => ({
        date: toDate(a.createdAt).toLocaleDateString(),
        score: pct(a.matchScore),
        id: a.id,
        jobTitle: a.jobTitle ?? "Untitled",
      })),
    [filtered]
  );

  const avgData = useMemo(() => [
    { category: "Hard Skills", score: parseFloat(avg(filtered.map(a => a.hardSkillsScore ?? 0)).toFixed(2)), weight: "40%" },
    { category: "Experience", score: parseFloat(avg(filtered.map(a => a.experienceScore ?? 0)).toFixed(2)), weight: "30%" },
    { category: "Domain", score: parseFloat(avg(filtered.map(a => a.domainScore ?? 0)).toFixed(2)), weight: "20%" },
    { category: "Soft Skills", score: parseFloat(avg(filtered.map(a => a.softSkillsScore ?? 0)).toFixed(2)), weight: "10%" },
  ], [filtered]);

  const radarData = useMemo(() => avgData.map(d => ({ subject: d.category, score: d.score, fullMark: 100 })), [avgData]);

  const histData = useMemo(() => {
    const buckets = [
      { range: "0–19", label: "0–19%", count: 0 },
      { range: "20–39", label: "20–39%", count: 0 },
      { range: "40–59", label: "40–59%", count: 0 },
      { range: "60–79", label: "60–79%", count: 0 },
      { range: "80–100", label: "80–100%", count: 0 },
    ];
    analyses.filter(a => {
      const d = toDate(a.createdAt);
      if (dateFrom && d < new Date(dateFrom)) return false;
      if (dateTo && d > new Date(dateTo + "T23:59:59")) return false;
      if (minScore > 0 && pct(a.matchScore) < minScore) return false;
      return true;
    }).forEach(a => {
      const s = pct(a.matchScore);
      if (s <= 19) buckets[0]!.count++;
      else if (s <= 39) buckets[1]!.count++;
      else if (s <= 59) buckets[2]!.count++;
      else if (s <= 79) buckets[3]!.count++;
      else buckets[4]!.count++;
    });
    return buckets;
  }, [analyses, dateFrom, dateTo, minScore]);

  // Strengths/gaps frequency across all filtered analyses
  const strengthsFreq = useMemo(() => {
    const counts: Record<string, number> = {};
    filtered.forEach(a => parseJsonArray(a.topStrengths).forEach(s => { counts[s] = (counts[s] ?? 0) + 1; }));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([text, count]) => ({ text: text.length > 40 ? text.slice(0, 40) + "…" : text, count }));
  }, [filtered]);

  const gapsFreq = useMemo(() => {
    const counts: Record<string, number> = {};
    filtered.forEach(a => parseJsonArray(a.topGaps).forEach(g => { counts[g] = (counts[g] ?? 0) + 1; }));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([text, count]) => ({ text: text.length > 40 ? text.slice(0, 40) + "…" : text, count }));
  }, [filtered]);

  // Token usage over time (analyses only)
  const tokenLineData = useMemo(() =>
    [...analyses]
      .filter(a => (a.tokensInput ?? 0) + (a.tokensOutput ?? 0) > 0)
      .sort((a, b) => toDate(a.createdAt).getTime() - toDate(b.createdAt).getTime())
      .map(a => ({
        date: toDate(a.createdAt).toLocaleDateString(),
        input: a.tokensInput ?? 0,
        output: a.tokensOutput ?? 0,
        total: (a.tokensInput ?? 0) + (a.tokensOutput ?? 0),
        jobTitle: a.jobTitle ?? "Untitled",
      })),
    [analyses]
  );

  // Aggregate token totals
  const totalTokensInput = (stats?.analysisTokensInput ?? 0) + (stats?.chatTokensInput ?? 0);
  const totalTokensOutput = (stats?.analysisTokensOutput ?? 0) + (stats?.chatTokensOutput ?? 0);
  const estimatedCost = ((totalTokensInput / 1_000_000) * PRICE_INPUT_PER_M +
    (totalTokensOutput / 1_000_000) * PRICE_OUTPUT_PER_M).toFixed(4);

  // Doc type pie data
  const pieData = useMemo(() =>
    (stats?.docsByType ?? []).map(d => ({ name: d.fileType.toUpperCase(), value: d.count })),
    [stats]
  );
  const chunksByTypeData = useMemo(() =>
    (stats?.chunksByType ?? []).map(d => ({ type: d.fileType.toUpperCase(), chunks: d.chunks })),
    [stats]
  );

  // ── CSV exports ───────────────────────────────────────────────────────────

  const exportSummaryCsv = () => {
    const h = ["Date", "Job Title", "Match %", "Hard Skills %", "Experience %", "Domain %", "Soft Skills %", "Mismatch %", "Tokens In", "Tokens Out"];
    const rows = filtered.map(a => [
      toDate(a.createdAt).toLocaleDateString(), a.jobTitle ?? "",
      pct(a.matchScore), pct(a.hardSkillsScore), pct(a.experienceScore),
      pct(a.domainScore), pct(a.softSkillsScore), pct(a.mismatchScore),
      a.tokensInput ?? 0, a.tokensOutput ?? 0,
    ]);
    downloadCsv("career-concierge-summary.csv", [h, ...rows]);
  };

  const exportStrengthsGapsCsv = () => {
    const h = ["Analysis ID", "Date", "Job Title", "Type", "Text"];
    const rows: (string | number)[][] = [];
    filtered.forEach(a => {
      const date = toDate(a.createdAt).toLocaleDateString();
      parseJsonArray(a.topStrengths).forEach(s => rows.push([a.id, date, a.jobTitle ?? "", "Strength", s]));
      parseJsonArray(a.topGaps).forEach(g => rows.push([a.id, date, a.jobTitle ?? "", "Gap", g]));
    });
    downloadCsv("career-concierge-strengths-gaps.csv", [h, ...rows]);
  };

  const isLoading = analysesLoading || statsLoading;

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-12">

        {/* ── Header ── */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h1 className="text-4xl font-bold text-foreground mb-4">Reporting & Analytics</h1>
          <p className="text-xl text-muted-foreground">
            Interactive job match reporting, knowledge base stats, and token usage — with CSV exports
            for Power BI integration.
          </p>
        </div>

        {/* ── Strategy Cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto mb-12">

          <Card className="hover:shadow-md hover:border-slate-300 transition-all">
            <CardHeader>
              <div className="flex items-center justify-between mb-2">
                <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
                  <BarChart2 className="h-5 w-5 text-teal-600" />
                </div>
                <Badge className="bg-teal-100 text-teal-700 border-0">Already Installed</Badge>
              </div>
              <CardTitle className="text-lg">In-App Recharts</CardTitle>
              <CardDescription>React-native interactive charts, zero extra dependencies</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>Recharts v2.15.2 is already bundled — no additional licenses, external services, or API keys required.</p>
              <p>Filters update all charts instantly in the browser. Every chart supports tooltips, click-through navigation, and drill-down filtering.</p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md hover:border-slate-300 transition-all">
            <CardHeader>
              <div className="flex items-center justify-between mb-2">
                <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
                </div>
                <Badge variant="secondary">5 Options Evaluated</Badge>
              </div>
              <CardTitle className="text-lg">Options Evaluated</CardTitle>
              <CardDescription>Why Recharts was selected over BI platforms</CardDescription>
            </CardHeader>
            <CardContent>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1 text-muted-foreground font-medium">Option</th>
                    <th className="text-left py-1 text-muted-foreground font-medium">Blocker</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  {[
                    ["Static Power BI PNG", "No interactivity"],
                    ["Power BI Embedded", "Azure AD + Pro license"],
                    ["Google Looker Studio", "External service"],
                    ["Tableau", "Paid license"],
                    ["D3.js", "High complexity"],
                  ].map(([opt, blocker]) => (
                    <tr key={opt} className="border-b">
                      <td className="py-1.5">{opt}</td>
                      <td className="py-1.5">{blocker}</td>
                    </tr>
                  ))}
                  <tr className="bg-teal-50">
                    <td className="py-1.5 font-semibold text-teal-700">Recharts ✓</td>
                    <td className="py-1.5 text-teal-600">Already installed</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md hover:border-slate-300 transition-all">
            <CardHeader>
              <div className="flex items-center justify-between mb-2">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <GitBranch className="h-5 w-5 text-blue-600" />
                </div>
                <Badge className="bg-blue-100 text-blue-700 border-0">Export Ready</Badge>
              </div>
              <CardTitle className="text-lg">Migration Path to Power BI</CardTitle>
              <CardDescription>CSV exports → Power BI Desktop → Service</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                The two CSVs share an <code className="bg-muted px-1 rounded text-xs">analysisId</code> key, forming a 1:many relational model that maps directly to Power BI tables.
              </p>
              <p>Migration: export CSVs → Power BI Desktop → load both tables → set relationship on <code className="bg-muted px-1 rounded text-xs">analysisId</code> → publish to Service.</p>
            </CardContent>
          </Card>
        </div>

        {/* ── Overview Stat Cards ── */}
        {!isLoading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-6xl mx-auto mb-10">
            <StatCard
              label="Total Analyses"
              value={stats?.totalAnalyses ?? analyses.length}
              sub="job descriptions analyzed"
              icon={TrendingUp}
              color="bg-blue-100 text-blue-600"
            />
            <StatCard
              label="Avg Match Score"
              value={`${avg(analyses.map(a => pct(a.matchScore))).toFixed(2)}%`}
              sub="across all analyses"
              icon={BarChart2}
              color="bg-purple-100 text-purple-600"
            />
            <StatCard
              label="Documents Indexed"
              value={fmtK(stats?.totalChunks ?? 0)}
              sub={`chunks from ${(stats?.docsByType ?? []).reduce((s, d) => s + d.count, 0)} files`}
              icon={Database}
              color="bg-teal-100 text-teal-600"
            />
            <StatCard
              label="Tokens Consumed"
              value={fmtK(totalTokensInput + totalTokensOutput)}
              sub={`~$${estimatedCost} estimated cost`}
              icon={Cpu}
              color="bg-amber-100 text-amber-600"
            />
          </div>
        )}

        {/* ── Filters ── */}
        <Card className="max-w-6xl mx-auto mb-10">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>
              Narrow the dataset — all charts and the data table update instantly.{" "}
              {selectedBucket && (
                <span className="text-indigo-600 font-medium">
                  Score filter active: {selectedBucket}%.{" "}
                  <button className="underline" onClick={() => setSelectedBucket(null)}>Clear</button>
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-6 items-end">
              <div>
                <Label htmlFor="dateFrom">Date From</Label>
                <Input id="dateFrom" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" />
              </div>
              <div>
                <Label htmlFor="dateTo">Date To</Label>
                <Input id="dateTo" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" />
              </div>
              <div>
                <Label htmlFor="minScore">Min Match Score (%)</Label>
                <Input id="minScore" type="number" min={0} max={100} value={minScore || ""} placeholder="0"
                  onChange={e => setMinScore(Number(e.target.value))} className="w-28" />
              </div>
              <Button variant="outline" onClick={() => { setDateFrom(""); setDateTo(""); setMinScore(0); setSelectedBucket(null); }}>
                Reset All
              </Button>
              <span className="text-sm text-muted-foreground ml-auto self-end">
                {filtered.length} of {analyses.length} analyses shown
              </span>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="text-center text-muted-foreground py-16">Loading analytics data…</div>
        ) : (
          <>
            {/* ════════════════════════════════════════════
                Section 1 — Analysis Insights
            ════════════════════════════════════════════ */}
            <SectionHeading
              title="Analysis Insights"
              sub="Job match scores, category breakdowns, and qualitative strength/gap patterns"
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl mx-auto mb-6">

              {/* Line: Scores Over Time */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Match Score Over Time</CardTitle>
                  <CardDescription>Click any dot to open that analysis. Drag the brush below to zoom.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={lineData} margin={{ top: 4, right: 16, bottom: 4, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0]?.payload;
                          return (
                            <div className="bg-card border rounded shadow p-2 text-xs max-w-48">
                              <p className="font-semibold truncate">{d?.jobTitle}</p>
                              <p className="text-muted-foreground">{d?.date}</p>
                              <p className="text-blue-600 font-bold">{(d?.score ?? 0).toFixed(2)}% match</p>
                              <p className="text-muted-foreground mt-0.5">Click to open →</p>
                            </div>
                          );
                        }}
                      />
                      <Line
                        type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2}
                        dot={{ r: 5, cursor: "pointer" }} activeDot={{ r: 7 }}
                        onClick={(_, payload: any) => payload?.payload?.id && navigate(`/analysis/${payload.payload.id}`)}
                      />
                      <Brush dataKey="date" height={20} stroke="#cbd5e1" travellerWidth={6} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Radar: Category Profile */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Portfolio Category Profile</CardTitle>
                  <CardDescription>Average score across all filtered analyses per weighted pillar</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                      <Radar name="Avg Score" dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} />
                      <Tooltip formatter={(v: number) => [`${v.toFixed(2)}%`, "Avg Score"]} />
                    </RadarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Histogram: Score Distribution */}
            <Card className="max-w-6xl mx-auto mb-6">
              <CardHeader>
                <CardTitle className="text-base">Score Distribution</CardTitle>
                <CardDescription>
                  Click a bar to filter the data table to that score tier. Click again or Reset All to clear.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={histData} margin={{ top: 4, right: 16, bottom: 4, left: -10 }}
                    onClick={(data) => {
                      if (data?.activePayload?.[0]) {
                        const range = data.activePayload[0].payload.range as string;
                        setSelectedBucket(prev => prev === range ? null : range);
                      }
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => [v, "Analyses"]} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} cursor="pointer">
                      {histData.map(d => (
                        <Cell
                          key={d.range}
                          fill={selectedBucket === d.range ? "#4338ca" : "#6366f1"}
                          opacity={selectedBucket && selectedBucket !== d.range ? 0.4 : 1}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Category Averages + Strengths/Gaps */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl mx-auto mb-10">

              {/* Bar: Category Averages */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Category Avg Scores</CardTitle>
                  <CardDescription>Mean per pillar, filtered set</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={avgData} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                      <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} width={74} />
                      <Tooltip formatter={(v: number) => [`${v.toFixed(2)}%`, "Avg Score"]} />
                      <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                        {avgData.map((_, i) => <Cell key={i} fill={CATEGORY_COLORS[i]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Bar: Top Strengths */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Top Strengths</CardTitle>
                  <CardDescription>Most frequent across filtered analyses</CardDescription>
                </CardHeader>
                <CardContent>
                  {strengthsFreq.length === 0
                    ? <p className="text-sm text-muted-foreground py-8 text-center">No data</p>
                    : (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={strengthsFreq} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                          <YAxis type="category" dataKey="text" tick={{ fontSize: 9 }} width={100} />
                          <Tooltip formatter={(v: number) => [v, "Analyses"]} />
                          <Bar dataKey="count" fill="#22c55e" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                </CardContent>
              </Card>

              {/* Bar: Top Gaps */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Top Gaps</CardTitle>
                  <CardDescription>Most frequent gaps across filtered analyses</CardDescription>
                </CardHeader>
                <CardContent>
                  {gapsFreq.length === 0
                    ? <p className="text-sm text-muted-foreground py-8 text-center">No data</p>
                    : (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={gapsFreq} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                          <YAxis type="category" dataKey="text" tick={{ fontSize: 9 }} width={100} />
                          <Tooltip formatter={(v: number) => [v, "Analyses"]} />
                          <Bar dataKey="count" fill="#ef4444" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                </CardContent>
              </Card>
            </div>

            {/* ════════════════════════════════════════════
                Section 2 — Knowledge Base
            ════════════════════════════════════════════ */}
            <SectionHeading
              title="Knowledge Base"
              sub="Indexed document inventory by file type"
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl mx-auto mb-10">

              {/* Pie: Documents by Type */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Documents by File Type</CardTitle>
                  <CardDescription>Distribution of indexed source files</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={pieData} cx="50%" cy="50%" outerRadius={90} innerRadius={40}
                        dataKey="value" nameKey="name" label={({ name, value }) => `${name}: ${value}`}
                        labelLine={true}
                      >
                        {pieData.map(d => (
                          <Cell key={d.name} fill={TYPE_COLORS[d.name.toLowerCase()] ?? "#94a3b8"} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number, name: string) => [v, name]} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Bar: Chunks by Type */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Chunks by File Type</CardTitle>
                  <CardDescription>Number of searchable text chunks per document type</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={chunksByTypeData} margin={{ top: 4, right: 16, bottom: 4, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="type" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => [fmtK(v), "Chunks"]} />
                      <Bar dataKey="chunks" radius={[4, 4, 0, 0]}>
                        {chunksByTypeData.map(d => (
                          <Cell key={d.type} fill={TYPE_COLORS[d.type.toLowerCase()] ?? "#94a3b8"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* ════════════════════════════════════════════
                Section 3 — Token Usage
            ════════════════════════════════════════════ */}
            <SectionHeading
              title="Token Usage"
              sub="LLM token consumption per analysis and estimated API cost (gpt-4o-mini pricing)"
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl mx-auto mb-10">

              {/* Line: Tokens Over Time */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Tokens Per Analysis Over Time</CardTitle>
                  <CardDescription>Input and output tokens for each job analysis. Drag brush to zoom.</CardDescription>
                </CardHeader>
                <CardContent>
                  {tokenLineData.length === 0
                    ? <p className="text-sm text-muted-foreground py-12 text-center">No token data yet — run a new analysis to start tracking.</p>
                    : (
                      <ResponsiveContainer width="100%" height={280}>
                        <LineChart data={tokenLineData} margin={{ top: 4, right: 16, bottom: 4, left: -10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const d = payload[0]?.payload;
                              return (
                                <div className="bg-card border rounded shadow p-2 text-xs">
                                  <p className="font-semibold truncate max-w-36">{d?.jobTitle}</p>
                                  <p className="text-muted-foreground">{d?.date}</p>
                                  <p className="text-blue-600">In: {fmtK(d?.input ?? 0)}</p>
                                  <p className="text-purple-600">Out: {fmtK(d?.output ?? 0)}</p>
                                  <p className="text-muted-foreground">Total: {fmtK(d?.total ?? 0)}</p>
                                </div>
                              );
                            }}
                          />
                          <Legend />
                          <Line type="monotone" dataKey="input" name="Input Tokens" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                          <Line type="monotone" dataKey="output" name="Output Tokens" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                          <Brush dataKey="date" height={20} stroke="#cbd5e1" travellerWidth={6} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                </CardContent>
              </Card>

              {/* Bar: Input vs Output + Cost Card */}
              <div className="flex flex-col gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Input vs Output Token Split</CardTitle>
                    <CardDescription>Analysis tokens vs chat/Q&A tokens</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart
                        data={[
                          { op: "Analysis", input: stats?.analysisTokensInput ?? 0, output: stats?.analysisTokensOutput ?? 0 },
                          { op: "Chat Q&A", input: stats?.chatTokensInput ?? 0, output: stats?.chatTokensOutput ?? 0 },
                        ]}
                        margin={{ top: 4, right: 16, bottom: 4, left: -10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="op" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v: number, name: string) => [fmtK(v), name === "input" ? "Input Tokens" : "Output Tokens"]} />
                        <Legend formatter={n => n === "input" ? "Input" : "Output"} />
                        <Bar dataKey="input" name="input" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="output" name="output" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card className="bg-amber-50 border-amber-200">
                  <CardHeader>
                    <CardTitle className="text-base text-amber-800">Estimated API Cost</CardTitle>
                    <CardDescription className="text-amber-600">gpt-4o-mini: $0.15/1M input · $0.60/1M output</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-amber-700">Total input tokens</span>
                      <span className="font-mono font-semibold text-amber-900">{fmtK(totalTokensInput)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-amber-700">Total output tokens</span>
                      <span className="font-mono font-semibold text-amber-900">{fmtK(totalTokensOutput)}</span>
                    </div>
                    <div className="flex justify-between border-t border-amber-200 pt-1 mt-1">
                      <span className="text-amber-800 font-semibold">Estimated cost</span>
                      <span className="font-mono font-bold text-amber-900">${estimatedCost}</span>
                    </div>
                    <p className="text-xs text-amber-500 pt-1">Only tracks tokens from new analyses run after the token tracking update. Historical analyses show $0.</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* ════════════════════════════════════════════
                Data Table + CSV Export
            ════════════════════════════════════════════ */}
            <Card className="max-w-6xl mx-auto">
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <CardTitle className="text-base">Analysis Data Table</CardTitle>
                    <CardDescription>
                      Click any row to open the full report.
                      {selectedBucket && ` Filtered to score range ${selectedBucket}%.`}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" size="sm" onClick={exportSummaryCsv}>
                      <Download className="h-4 w-4 mr-1" />
                      Summary CSV
                    </Button>
                    <Button variant="outline" size="sm" onClick={exportStrengthsGapsCsv}>
                      <Download className="h-4 w-4 mr-1" />
                      Strengths &amp; Gaps CSV
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        {["Date", "Job Title", "Match", "Hard Skills", "Experience", "Domain", "Soft Skills", "Tokens"].map(h => (
                          <th key={h} className="pb-2 pr-4 text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(a => (
                        <tr
                          key={a.id}
                          onClick={() => navigate(`/analysis/${a.id}`)}
                          className="border-b hover:bg-muted/50 cursor-pointer transition-colors"
                        >
                          <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">{toDate(a.createdAt).toLocaleDateString()}</td>
                          <td className="py-2 pr-4 text-foreground font-medium max-w-48 truncate">
                            {a.jobTitle ?? <span className="text-muted-foreground italic">Untitled</span>}
                          </td>
                          <td className="py-2 pr-4"><ScoreBadge value={pct(a.matchScore)} /></td>
                          <td className="py-2 pr-4 text-muted-foreground">{fmt2(pct(a.hardSkillsScore))}%</td>
                          <td className="py-2 pr-4 text-muted-foreground">{fmt2(pct(a.experienceScore))}%</td>
                          <td className="py-2 pr-4 text-muted-foreground">{fmt2(pct(a.domainScore))}%</td>
                          <td className="py-2 pr-4 text-muted-foreground">{fmt2(pct(a.softSkillsScore))}%</td>
                          <td className="py-2 text-muted-foreground text-xs whitespace-nowrap">
                            {(a.tokensInput ?? 0) + (a.tokensOutput ?? 0) > 0
                              ? fmtK((a.tokensInput ?? 0) + (a.tokensOutput ?? 0))
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filtered.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">No analyses match the current filters.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
