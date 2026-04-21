import { useEffect, useMemo, useState } from "react";
import { Search, Download, ArrowUpDown, Trophy, AlertTriangle, HelpCircle, MinusCircle } from "lucide-react";
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { scoreSearchTerm, categorizeTerm, negativityColor, type ProductProfile } from "@/lib/negativity";
import { PageSkeleton } from "@/components/ui/Skeleton";

interface SearchTerm {
  search_term: string;
  campaign_name: string;
  ad_group_name: string;
  keyword: string;
  match_type: string;
  impressions: number;
  clicks: number;
  cost: number;
  orders: number;
  sales: number;
  add_to_cart: number;
  acos: number;
  ctr: number;
  cpc: number;
}

type SortKey = "impressions" | "clicks" | "cost" | "orders" | "sales";
type Bucket = "winner" | "wasted" | "review" | "low";

const BUCKET_META: Record<Bucket, { label: string; color: string; Icon: any }> = {
  winner: { label: "Winner",      color: "#10b981", Icon: Trophy },
  wasted: { label: "Wasted",      color: "#ef4444", Icon: AlertTriangle },
  review: { label: "Review",      color: "#f59e0b", Icon: HelpCircle },
  low:    { label: "Low traffic", color: "#64748b", Icon: MinusCircle },
};

export default function SearchTermsPage() {
  const [rows, setRows] = useState<SearchTerm[]>([]);
  const [profile, setProfile] = useState<ProductProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("clicks");
  const [sortAsc, setSortAsc] = useState(false);
  const [bucketFilter, setBucketFilter] = useState<"all" | Bucket>("all");

  useEffect(() => {
    async function load() {
      if (rows.length === 0) setLoading(true);
      try {
        const [termsRes, profileRes] = await Promise.all([
          api.get<{ rows: SearchTerm[] }>("/api/search-terms", { params: { sort: sortKey, limit: 500 } }),
          api.get<ProductProfile>("/api/profile"),
        ]);
        setRows(termsRes.data.rows || []);
        setProfile(profileRes.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortKey]);

  // Score + bucket each row
  const tagged = useMemo(() => rows.map((r) => {
    const { score, reason } = scoreSearchTerm(r.search_term, profile);
    return { ...r, _bucket: categorizeTerm(r) as Bucket, _negScore: score, _negReason: reason };
  }), [rows, profile]);

  // Summary stats
  const summary = useMemo(() => {
    const byBucket = { winner: 0, wasted: 0, review: 0, low: 0 } as Record<Bucket, number>;
    let wastedSpend = 0, winnerSales = 0, winnerAcosSum = 0, winnerCount = 0;
    for (const r of tagged) {
      byBucket[r._bucket]++;
      if (r._bucket === "wasted") wastedSpend += r.cost;
      if (r._bucket === "winner") {
        winnerSales += r.sales;
        winnerAcosSum += r.acos;
        winnerCount++;
      }
    }
    return {
      total: tagged.length,
      byBucket,
      wastedSpend,
      winnerSales,
      avgWinnerAcos: winnerCount > 0 ? winnerAcosSum / winnerCount : 0,
    };
  }, [tagged]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return tagged
      .filter((r) => bucketFilter === "all" || r._bucket === bucketFilter)
      .filter((r) => !q || r.search_term.toLowerCase().includes(q) || (r.campaign_name || "").toLowerCase().includes(q))
      .sort((a, b) => {
        const av = Number(a[sortKey] ?? 0);
        const bv = Number(b[sortKey] ?? 0);
        return sortAsc ? av - bv : bv - av;
      });
  }, [tagged, search, bucketFilter, sortKey, sortAsc]);

  function toggleSort(col: SortKey) {
    if (sortKey === col) setSortAsc(!sortAsc);
    else { setSortKey(col); setSortAsc(false); }
  }

  function exportCSV() {
    if (!filtered.length) return;
    const cols = ["search_term", "campaign_name", "keyword", "match_type", "impressions", "clicks", "cost", "orders", "sales", "acos", "_bucket", "_negScore", "_negReason"];
    const header = cols.join(",");
    const body = filtered.map((r: any) =>
      cols.map((c) => {
        const v = r[c] ?? "";
        return typeof v === "string" && v.includes(",") ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(",")
    ).join("\n");
    const blob = new Blob([header + "\n" + body], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `search_terms_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  if (loading) return <PageSkeleton rows={8} cols={7} />;

  const bucketDonutData = (Object.keys(BUCKET_META) as Bucket[]).map((k) => ({
    name: BUCKET_META[k].label,
    value: summary.byBucket[k],
    color: BUCKET_META[k].color,
  })).filter((b) => b.value > 0);

  const topWasteData = [...tagged]
    .filter((r) => r._bucket === "wasted")
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 10)
    .map((r) => ({ name: r.search_term.length > 22 ? r.search_term.slice(0, 22) + "…" : r.search_term, cost: r.cost }));

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto flex flex-col gap-5 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black bg-gradient-to-br from-brand-500 to-purple-500 bg-clip-text text-transparent">
            Search Terms
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Analyze customer search queries — winners, wasted spend, and review queue
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <SummaryCard label="Wasted spend"      value={`$${summary.wastedSpend.toFixed(2)}`} sub={`from ${summary.byBucket.wasted} terms`} color="red" />
        <SummaryCard label="Winners"           value={summary.byBucket.winner} sub={`$${summary.winnerSales.toFixed(2)} in sales`} color="emerald" />
        <SummaryCard label="Avg winner ACoS"   value={`${summary.avgWinnerAcos.toFixed(1)}%`} sub={summary.byBucket.winner > 0 ? "keep these" : "no winners yet"} color="emerald" />
        <SummaryCard label="Review queue"      value={summary.byBucket.review} sub="terms with 1-4 clicks" color="amber" />
      </div>

      {/* Charts */}
      {bucketDonutData.length > 0 && (
        <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))" }}>
          <div className="card p-5">
            <h3 className="font-bold mb-3 text-sm">Bucket breakdown</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={bucketDonutData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                     innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {bucketDonutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "rgb(var(--bg-card))", border: "1px solid rgb(var(--border))", borderRadius: 10, fontSize: 12 }} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {topWasteData.length > 0 && (
            <div className="card p-5">
              <h3 className="font-bold mb-3 text-sm">Top 10 waste terms</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={topWasteData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "rgb(var(--text-muted))" }} />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10, fill: "rgb(var(--text-muted))" }} />
                  <Tooltip contentStyle={{ background: "rgb(var(--bg-card))", border: "1px solid rgb(var(--border))", borderRadius: 10, fontSize: 12 }}
                           formatter={(v: any) => `$${Number(v).toFixed(2)}`} />
                  <Bar dataKey="cost" fill="#ef4444" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 card px-4 py-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search terms, campaigns, keywords..." value={search}
                 onChange={(e) => setSearch(e.target.value)}
                 className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none" />
        </div>
        <div className="flex gap-1 flex-wrap">
          <BucketPill active={bucketFilter === "all"}    onClick={() => setBucketFilter("all")}    label={`All (${summary.total})`}        color="slate" />
          <BucketPill active={bucketFilter === "winner"} onClick={() => setBucketFilter("winner")} label={`Winner (${summary.byBucket.winner})`} color="emerald" />
          <BucketPill active={bucketFilter === "wasted"} onClick={() => setBucketFilter("wasted")} label={`Wasted (${summary.byBucket.wasted})`} color="red" />
          <BucketPill active={bucketFilter === "review"} onClick={() => setBucketFilter("review")} label={`Review (${summary.byBucket.review})`} color="amber" />
          <BucketPill active={bucketFilter === "low"}    onClick={() => setBucketFilter("low")}    label={`Low traffic (${summary.byBucket.low})`} color="slate" />
        </div>
        <button onClick={exportCSV}
                className="ml-auto flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition">
          <Download size={13} /> CSV
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-slate-400">No search terms match the filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgb(var(--border))] bg-slate-50 dark:bg-slate-800/50">
                  <th className="text-left py-3 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Bucket</th>
                  <th className="text-left py-3 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Search term</th>
                  <th className="text-left py-3 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Campaign</th>
                  <th className="text-left py-3 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Keyword</th>
                  <th className="text-left py-3 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Match</th>
                  <SortTh label="Impr."   col="impressions" sortKey={sortKey} sortAsc={sortAsc} onClick={() => toggleSort("impressions")} />
                  <SortTh label="Clicks"  col="clicks"      sortKey={sortKey} sortAsc={sortAsc} onClick={() => toggleSort("clicks")} />
                  <SortTh label="Spend"   col="cost"        sortKey={sortKey} sortAsc={sortAsc} onClick={() => toggleSort("cost")} />
                  <SortTh label="Orders"  col="orders"      sortKey={sortKey} sortAsc={sortAsc} onClick={() => toggleSort("orders")} />
                  <SortTh label="Sales"   col="sales"       sortKey={sortKey} sortAsc={sortAsc} onClick={() => toggleSort("sales")} />
                  <th className="text-right py-3 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">ACoS</th>
                  <th className="text-left py-3 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Neg. score</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 300).map((r, i) => {
                  const bucket = BUCKET_META[r._bucket];
                  const BIcon = bucket.Icon;
                  return (
                    <tr key={i} className="border-b border-[rgb(var(--border))] hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="py-2 px-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                              style={{ background: bucket.color + "20", color: bucket.color }}>
                          <BIcon size={9} /> {bucket.label}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-semibold max-w-[200px] truncate" title={r.search_term}>{r.search_term}</td>
                      <td className="py-2 px-3 text-xs text-slate-500 max-w-[160px] truncate" title={r.campaign_name}>{r.campaign_name}</td>
                      <td className="py-2 px-3 text-xs text-slate-500 max-w-[120px] truncate" title={r.keyword}>{r.keyword}</td>
                      <td className="py-2 px-3">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold">
                          {r.match_type}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">{r.impressions.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{r.clicks}</td>
                      <td className="py-2 px-3 text-right tabular-nums">${r.cost.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{r.orders}</td>
                      <td className="py-2 px-3 text-right tabular-nums">${r.sales.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        <span className={r.acos > 50 ? "text-red-500 font-semibold" : r.acos > 30 ? "text-amber-500 font-semibold" : r.acos > 0 ? "text-emerald-500 font-semibold" : "text-slate-400"}>
                          {r.acos.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-2 px-3" title={r._negReason}>
                        <span className={cn("inline-block px-2 py-0.5 rounded-full text-[10px] font-bold", negativityColor(r._negScore))}>
                          {r._negScore}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {filtered.length > 300 && (
        <div className="text-center text-xs text-slate-400">
          Showing first 300 of {filtered.length}. Use filters to narrow down.
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, sub, color }: { label: string; value: any; sub: string; color: "red" | "emerald" | "amber" | "slate" }) {
  const colorMap: Record<string, string> = {
    red: "border-red-200 bg-red-50 dark:bg-red-500/5 dark:border-red-500/20",
    emerald: "border-emerald-200 bg-emerald-50 dark:bg-emerald-500/5 dark:border-emerald-500/20",
    amber: "border-amber-200 bg-amber-50 dark:bg-amber-500/5 dark:border-amber-500/20",
    slate: "border-slate-200 bg-slate-50 dark:bg-slate-500/5 dark:border-slate-500/20",
  };
  const textMap: Record<string, string> = {
    red: "text-red-700 dark:text-red-400",
    emerald: "text-emerald-700 dark:text-emerald-400",
    amber: "text-amber-700 dark:text-amber-400",
    slate: "text-slate-700 dark:text-slate-400",
  };
  return (
    <div className={cn("rounded-xl border p-4", colorMap[color])}>
      <div className={cn("text-[10px] font-bold tracking-wide uppercase", textMap[color])}>{label}</div>
      <div className="text-2xl font-black mt-1">{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{sub}</div>
    </div>
  );
}

function BucketPill({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: "bg-emerald-500 border-emerald-500",
    red: "bg-red-500 border-red-500",
    amber: "bg-amber-500 border-amber-500",
    slate: "bg-slate-500 border-slate-500",
  };
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 text-xs font-semibold rounded-full border transition",
        active ? `${colorMap[color]} text-white` : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
      )}
    >
      {label}
    </button>
  );
}

function SortTh({ label, col, sortKey, sortAsc, onClick }: any) {
  const active = sortKey === col;
  return (
    <th onClick={onClick}
        className="py-3 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500 cursor-pointer hover:text-brand-500 text-right">
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown size={10} className={active ? (sortAsc ? "text-brand-500 rotate-180" : "text-brand-500") : "opacity-40"} />
      </span>
    </th>
  );
}
