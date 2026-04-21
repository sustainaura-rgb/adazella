import React, { useEffect, useMemo, useState } from "react";
import {
  Search, Download, Loader2, Ban, DollarSign, MousePointerClick,
  ShieldCheck, AlertTriangle, ChevronRight, ChevronDown,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

interface Negative {
  id: number;
  keyword_id: string;
  keyword_text: string;
  match_type: string;
  scope: string;
  campaign_name: string;
  impressions: number;
  clicks: number;
  cost: number;
  orders: number;
  sales: number;
}

interface Summary {
  total_negatives: number;
  with_history: number;
  total_wasted: number;
  total_clicks: number;
}

interface Suggestion {
  term: string;
  campaign_id: string;
  campaign_name: string;
  clicks: number;
  cost: number;
  orders: number;
  reason: string;
  confidence: number;
}

interface GroupedNegative {
  key: string;
  keyword_text: string;
  match_type: string;
  scope: string;
  instances: Negative[];
  impressions: number;
  clicks: number;
  cost: number;
  orders: number;
  sales: number;
}

export default function NegativesPage() {
  const [rows, setRows] = useState<Negative[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggTotal, setSuggTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(90);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedSugg, setSelectedSugg] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      if (rows.length === 0) setLoading(true);
      try {
        const [negRes, suggRes] = await Promise.all([
          api.get<{ rows: Negative[]; summary: Summary }>("/api/negatives", { params: { days } }),
          api.get<{ rows: Suggestion[]; total_wasted: number }>("/api/negatives/suggestions", { params: { days } }),
        ]);
        setRows(negRes.data.rows || []);
        setSummary(negRes.data.summary);
        setSuggestions(suggRes.data.rows || []);
        setSuggTotal(suggRes.data.total_wasted);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  // Group duplicate negatives (same text+match+scope) — one row with count badge
  const grouped = useMemo((): GroupedNegative[] => {
    const q = search.toLowerCase();
    const filtered = rows.filter((r) =>
      !q || r.keyword_text.toLowerCase().includes(q) || (r.campaign_name || "").toLowerCase().includes(q)
    );
    const map = new Map<string, GroupedNegative>();
    for (const r of filtered) {
      const key = `${r.keyword_text.toLowerCase()}|${r.match_type}|${r.scope}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          keyword_text: r.keyword_text,
          match_type: r.match_type,
          scope: r.scope,
          instances: [],
          impressions: 0, clicks: 0, cost: 0, orders: 0, sales: 0,
        });
      }
      const g = map.get(key)!;
      g.instances.push(r);
      g.impressions += r.impressions;
      g.clicks      += r.clicks;
      g.cost        += r.cost;
      g.orders      += r.orders;
      g.sales       += r.sales;
    }
    // Average metrics across instances (same keyword_text → same search_term history)
    const list = Array.from(map.values()).map((g) => {
      const n = g.instances.length;
      return {
        ...g,
        impressions: Math.round(g.impressions / n),
        clicks: Math.round(g.clicks / n),
        cost: g.cost / n,
        orders: Math.round(g.orders / n),
        sales: g.sales / n,
      };
    });
    list.sort((a, b) => b.cost - a.cost);
    return list;
  }, [rows, search]);

  function toggleSugg(term: string) {
    const next = new Set(selectedSugg);
    next.has(term) ? next.delete(term) : next.add(term);
    setSelectedSugg(next);
  }

  function toggleAllSugg() {
    if (selectedSugg.size === suggestions.length) setSelectedSugg(new Set());
    else setSelectedSugg(new Set(suggestions.map((s) => s.term)));
  }

  function exportSuggCSV() {
    const toExport = selectedSugg.size > 0
      ? suggestions.filter((s) => selectedSugg.has(s.term))
      : suggestions;
    if (!toExport.length) return;
    const header = ["Product", "Entity", "Operation", "Campaign Id", "Keyword Text", "Match Type", "State"].join(",");
    const body = toExport.map((s) => [
      "Sponsored Products", "Negative Keyword", "Create",
      s.campaign_id || "",
      `"${s.term.replace(/"/g, '""')}"`,
      "negativeExact", "enabled",
    ].join(",")).join("\n");
    const blob = new Blob([header + "\n" + body], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `suggested_negatives_${Date.now()}.csv`;
    a.click();
  }

  function exportNegCSV() {
    if (!rows.length) return;
    const cols = ["keyword_text", "match_type", "scope", "campaign_name", "impressions", "clicks", "cost", "orders", "sales"];
    const header = cols.join(",");
    const body = rows.map((r: any) =>
      cols.map((c) => {
        const v = r[c] ?? "";
        return typeof v === "string" && v.includes(",") ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(",")
    ).join("\n");
    const blob = new Blob([header + "\n" + body], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `negatives_${Date.now()}.csv`;
    a.click();
  }

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="animate-spin text-brand-500" size={32} /></div>;

  const topWaste = [...rows]
    .filter((r) => r.cost > 0)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 10)
    .map((r) => ({ name: r.keyword_text.length > 25 ? r.keyword_text.slice(0, 25) + "…" : r.keyword_text, cost: r.cost }));

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto flex flex-col gap-5 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black bg-gradient-to-br from-brand-500 to-purple-500 bg-clip-text text-transparent">
            Negatives
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            All active negative keywords with historical waste data
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <SummaryCard label="Total negatives"   value={summary?.total_negatives ?? 0}
                     sub={`${summary?.with_history ?? 0} had historical clicks`}
                     Icon={Ban} color="red" />
        <SummaryCard label="Wasted (pre-negate)" value={`$${(summary?.total_wasted ?? 0).toFixed(2)}`}
                     sub={`in last ${days} days before negating`}
                     Icon={DollarSign} color="red" />
        <SummaryCard label="Clicks blocked"    value={(summary?.total_clicks ?? 0).toLocaleString()}
                     sub="historical wasted clicks"
                     Icon={MousePointerClick} color="amber" />
        <SummaryCard label="Protection active" value={summary?.total_negatives ?? 0}
                     sub="won't waste budget again"
                     Icon={ShieldCheck} color="emerald" />
      </div>

      {/* Suggestions section */}
      {suggestions.length > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-5">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <div className="flex items-center gap-3">
              <AlertTriangle size={20} className="text-amber-600 shrink-0" />
              <div>
                <div className="font-bold text-amber-800 dark:text-amber-300">
                  {suggestions.length} terms you should add as negatives
                </div>
                <div className="text-xs text-amber-700 dark:text-amber-400">
                  Currently wasting <strong>${suggTotal.toFixed(2)}</strong> · based on your product profile
                </div>
              </div>
            </div>
            <button onClick={exportSuggCSV}
                    className="px-3 py-2 bg-amber-600 text-white text-xs font-bold rounded-lg hover:bg-amber-700 transition inline-flex items-center gap-1.5">
              <Download size={13} /> Export CSV {selectedSugg.size > 0 ? `(${selectedSugg.size})` : `(all ${suggestions.length})`}
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto bg-white dark:bg-slate-800 rounded-lg border border-amber-200 dark:border-amber-500/30">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 sticky top-0">
                  <th className="py-2 px-3 w-8">
                    <input type="checkbox"
                           checked={selectedSugg.size > 0 && selectedSugg.size === suggestions.length}
                           onChange={toggleAllSugg} className="accent-amber-500" />
                  </th>
                  <th className="text-left py-2 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Search term</th>
                  <th className="text-left py-2 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Why</th>
                  <th className="text-right py-2 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Clicks</th>
                  <th className="text-right py-2 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Wasted $</th>
                  <th className="text-right py-2 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map((s) => (
                  <tr key={s.term} className="border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="py-2 px-3">
                      <input type="checkbox" checked={selectedSugg.has(s.term)}
                             onChange={() => toggleSugg(s.term)} className="accent-amber-500" />
                    </td>
                    <td className="py-2 px-3 font-semibold max-w-[250px] truncate" title={s.term}>{s.term}</td>
                    <td className="py-2 px-3 text-xs text-slate-500">{s.reason}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{s.clicks}</td>
                    <td className="py-2 px-3 text-right tabular-nums font-semibold text-red-500">${s.cost.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right">
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold text-white min-w-[42px]"
                            style={{ background: s.confidence >= 90 ? "#ef4444" : s.confidence >= 70 ? "#f59e0b" : "#eab308" }}>
                        {s.confidence}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top waste chart */}
      {topWaste.length > 0 && (
        <div className="card p-5">
          <h3 className="font-bold text-sm mb-1">Top 10 most expensive negatives</h3>
          <p className="text-xs text-slate-500 mb-3">Before they were blocked</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={topWaste} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 10, fill: "rgb(var(--text-muted))" }} />
              <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 10, fill: "rgb(var(--text-muted))" }} />
              <Tooltip contentStyle={{ background: "rgb(var(--bg-card))", border: "1px solid rgb(var(--border))", borderRadius: 10, fontSize: 12 }}
                       formatter={(v: any) => `$${Number(v).toFixed(2)}`} />
              <Bar dataKey="cost" fill="#ef4444" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 card px-4 py-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search negatives or campaigns..." value={search}
                 onChange={(e) => setSearch(e.target.value)}
                 className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none" />
        </div>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}
                className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 cursor-pointer">
          {[30, 60, 90, 180, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>
        <button onClick={exportNegCSV}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition">
          <Download size={13} /> CSV
        </button>
      </div>

      {/* Grouped table */}
      <div className="card overflow-hidden">
        <h3 className="font-bold text-sm uppercase tracking-wide text-slate-500 px-4 py-3 border-b border-[rgb(var(--border))]">
          Active negatives ({rows.length})
        </h3>
        {grouped.length === 0 ? (
          <div className="p-10 text-center text-slate-400">
            {rows.length === 0
              ? "No negative keywords synced yet."
              : "No matches for current filters."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgb(var(--border))] bg-slate-50 dark:bg-slate-800/50">
                  <th className="w-8"></th>
                  <th className="text-left py-3 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Negative keyword</th>
                  <th className="py-3 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Match</th>
                  <th className="py-3 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Scope</th>
                  <th className="text-left py-3 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Used in</th>
                  <th className="text-right py-3 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Impr.</th>
                  <th className="text-right py-3 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Clicks</th>
                  <th className="text-right py-3 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Wasted $</th>
                  <th className="text-right py-3 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Orders</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map((g) => {
                  const isExpanded = expanded.has(g.key);
                  const count = g.instances.length;
                  return (
                    <React.Fragment key={g.key}>
                      <tr
                        onClick={() => setExpanded((prev) => {
                          const next = new Set(prev);
                          next.has(g.key) ? next.delete(g.key) : next.add(g.key);
                          return next;
                        })}
                        className={cn("border-b border-[rgb(var(--border))] hover:bg-slate-50 dark:hover:bg-slate-800/30",
                          count > 1 && "cursor-pointer")}
                      >
                        <td className="py-2 px-3 align-middle">
                          {count > 1 && (isExpanded
                            ? <ChevronDown size={14} className="text-slate-400" />
                            : <ChevronRight size={14} className="text-slate-400" />)}
                        </td>
                        <td className="py-2 px-3 font-semibold max-w-xs truncate" title={g.keyword_text}>{g.keyword_text}</td>
                        <td className="py-2 px-3">
                          <span className="inline-block px-2 py-0.5 rounded bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400 text-[10px] font-bold">
                            {(g.match_type || "").replace("NEGATIVE_", "").toLowerCase()}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-[11px] text-slate-500">{g.scope}</td>
                        <td className="py-2 px-3">
                          {count === 1 ? (
                            <span className="text-[12px] text-slate-500 truncate block max-w-[200px]" title={g.instances[0].campaign_name}>
                              {g.instances[0].campaign_name}
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded-full bg-brand-100 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 text-[10px] font-bold">
                              {count} campaigns
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">{g.impressions.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{g.clicks.toLocaleString()}</td>
                        <td className={cn("py-2 px-3 text-right tabular-nums font-semibold",
                          g.cost > 5 ? "text-red-500" : g.cost > 1 ? "text-amber-500" : "text-slate-400")}>
                          ${g.cost.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">{g.orders}</td>
                      </tr>
                      {/* Expanded instances */}
                      {isExpanded && count > 1 && g.instances.map((inst) => (
                        <tr key={inst.id} className="border-b border-[rgb(var(--border))] bg-slate-50 dark:bg-slate-800/30">
                          <td></td>
                          <td className="py-1.5 px-3 text-[11px] text-slate-400 italic" colSpan={3}>└ instance</td>
                          <td className="py-1.5 px-3 text-[11px] text-slate-500 truncate max-w-[200px]" title={inst.campaign_name}>{inst.campaign_name}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-slate-400 text-[11px]">{inst.impressions.toLocaleString()}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-slate-400 text-[11px]">{inst.clicks.toLocaleString()}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-slate-400 text-[11px]">${inst.cost.toFixed(2)}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-slate-400 text-[11px]">{inst.orders}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="text-xs text-slate-400 text-right">
        Showing {grouped.length} unique · {rows.length} total instances
      </div>
    </div>
  );
}

function SummaryCard({ label, value, sub, Icon, color }: any) {
  const colorMap: Record<string, string> = {
    red: "from-red-500 to-pink-500",
    amber: "from-amber-500 to-orange-500",
    emerald: "from-emerald-500 to-cyan-500",
  };
  return (
    <div className={cn("relative overflow-hidden rounded-xl p-4 text-white shadow bg-gradient-to-br", colorMap[color])}>
      <div className="absolute -top-3 -right-3 opacity-15">
        <Icon size={70} />
      </div>
      <div className="relative">
        <div className="text-[10px] font-bold tracking-widest opacity-80 uppercase">{label}</div>
        <div className="text-2xl font-black mt-1">{value}</div>
        <div className="text-[11px] opacity-80 mt-0.5">{sub}</div>
      </div>
    </div>
  );
}
