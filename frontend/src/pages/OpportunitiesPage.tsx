import { useEffect, useMemo, useState } from "react";
import { Download, Sparkles, Ban, TrendingUp, CheckSquare, Square } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";

type Mode = "harvest" | "negatives" | "upgrades";

const MODES: Array<{ key: Mode; label: string; desc: string; Icon: any; color: string }> = [
  { key: "harvest",   label: "Harvest",   desc: "Search terms driving orders — add as EXACT",               Icon: Sparkles,    color: "emerald" },
  { key: "negatives", label: "Negatives", desc: "Search terms wasting spend — block with negative keywords", Icon: Ban,         color: "red" },
  { key: "upgrades",  label: "Upgrades",  desc: "Broad/phrase keywords performing well — promote to EXACT",   Icon: TrendingUp,  color: "indigo" },
];

export default function OpportunitiesPage() {
  const [mode, setMode] = useState<Mode>("harvest");
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      if (rows.length === 0) setLoading(true);
      setSelected(new Set());
      try {
        const { data } = await api.get<{ rows: any[] }>(`/api/opportunities/${mode}`, {
          params: { days, limit: 500 },
        });
        setRows(data.rows || []);
      } catch (err) {
        console.error(err);
        setRows([]);
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, days]);

  const totalImpact = useMemo(() => {
    if (mode === "harvest")   return rows.reduce((s, r) => s + Number(r.sales || 0), 0);
    if (mode === "negatives") return rows.reduce((s, r) => s + Number(r.cost || 0), 0);
    if (mode === "upgrades")  return rows.reduce((s, r) => s + Number(r.sales || 0), 0);
    return 0;
  }, [rows, mode]);

  function toggleRow(key: string) {
    const next = new Set(selected);
    next.has(key) ? next.delete(key) : next.add(key);
    setSelected(next);
  }

  function toggleAll() {
    const keys = rowKeys();
    if (selected.size === keys.length) setSelected(new Set());
    else setSelected(new Set(keys));
  }

  function rowKeys() {
    return rows.map((r) => r.term || r.keyword);
  }

  function exportCSV() {
    const toExport = selected.size > 0
      ? rows.filter((r) => selected.has(r.term || r.keyword))
      : rows;
    if (!toExport.length) return;

    const header = ["Product", "Entity", "Operation", "Campaign Id", "Ad Group Id", "Keyword Text", "Match Type", "Bid", "State"].join(",");
    const body = toExport.map((r) => {
      const kw = r.term || r.keyword;
      const matchType = mode === "negatives" ? "negativeExact" : "exact";
      const entity = mode === "negatives" ? "Negative Keyword" : "Keyword";
      return [
        "Sponsored Products", entity, "Create",
        r.campaign_id || "", "",
        `"${(kw || "").replace(/"/g, '""')}"`,
        matchType,
        mode === "negatives" ? "" : "1.00",  // default bid for new exact
        "enabled",
      ].join(",");
    }).join("\n");

    const blob = new Blob([header + "\n" + body], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `opportunities_${mode}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  const currentMode = MODES.find((m) => m.key === mode)!;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto flex flex-col gap-5 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black bg-gradient-to-br from-brand-500 to-purple-500 bg-clip-text text-transparent">
            Opportunities
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            AI-powered suggestions to improve your PPC performance
          </p>
        </div>
      </div>

      {/* Mode switcher */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        {MODES.map((m) => {
          const active = mode === m.key;
          const Icon = m.Icon;
          const colorMap: Record<string, string> = {
            emerald: "from-emerald-500 to-cyan-500 border-emerald-500",
            red: "from-red-500 to-pink-500 border-red-500",
            indigo: "from-indigo-500 to-purple-500 border-indigo-500",
          };
          return (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={cn(
                "p-4 rounded-xl border-2 text-left transition-all",
                active
                  ? `bg-gradient-to-br ${colorMap[m.color]} text-white shadow-lg`
                  : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-brand-300"
              )}
            >
              <Icon size={20} className={active ? "text-white" : `text-${m.color}-500`} />
              <div className="mt-2 font-bold text-base">{m.label}</div>
              <div className={cn("text-xs mt-0.5", active ? "text-white/90" : "text-slate-500")}>
                {m.desc}
              </div>
            </button>
          );
        })}
      </div>

      {/* Impact summary */}
      <div className="card p-5 flex justify-between items-center flex-wrap gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            {mode === "negatives" ? "Total wasted spend" : "Total sales opportunity"}
          </div>
          <div className="text-3xl font-black mt-1"
               style={{ color: mode === "negatives" ? "#ef4444" : "#10b981" }}>
            ${totalImpact.toFixed(2)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {rows.length} {mode === "negatives" ? "terms to negate" : "opportunities"} · last {days} days
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}
                  className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 cursor-pointer">
            {[14, 30, 60, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}
          </select>
          <button onClick={exportCSV} disabled={!rows.length}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition disabled:opacity-50">
            <Download size={13} />
            Export CSV {selected.size > 0 ? `(${selected.size})` : `(all ${rows.length})`}
          </button>
        </div>
      </div>

      {/* Explanation banner for current mode */}
      <div className="card p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-sm">
        <div className="flex items-start gap-3">
          <currentMode.Icon size={18} className={`text-${currentMode.color}-500 shrink-0 mt-0.5`} />
          <div>
            <div className="font-bold mb-0.5">{currentMode.label}</div>
            <div className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed">
              {mode === "harvest" && (
                <>These search terms drove orders via auto or broad match, but you don't have them as EXACT keywords yet. Add them as EXACT in a manual campaign for better bid control and lower CPC. Also add them as negatives in your auto campaigns to stop self-competition.</>
              )}
              {mode === "negatives" && (
                <>These search terms accumulated clicks but zero orders — pure waste. Adding them as negative keywords will stop your ads from showing for these queries, immediately saving budget.</>
              )}
              {mode === "upgrades" && (
                <>These keywords are on broad/phrase match and converting well. Adding them as EXACT match gives you precise bid control. Keep the broader versions running — they'll discover new variations.</>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className={cn("overflow-hidden", !loading && rows.length > 0 && "card")}>
        {loading ? (
          <SkeletonTable rows={8} cols={6} />
        ) : rows.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={Sparkles}
              title={`No ${mode} opportunities`}
              description={`We didn't find any ${mode} suggestions in the last ${days} days. Try expanding the date range or wait for more data to accumulate.`}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgb(var(--border))] bg-slate-50 dark:bg-slate-800/50">
                  <th className="py-3 px-3 w-8">
                    <button onClick={toggleAll} className="text-slate-400 hover:text-brand-500">
                      {selected.size === rowKeys().length && rows.length > 0
                        ? <CheckSquare size={14} />
                        : <Square size={14} />}
                    </button>
                  </th>
                  <th className="text-left py-3 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    {mode === "upgrades" ? "Keyword" : "Search term"}
                  </th>
                  <th className="text-left py-3 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Campaign</th>
                  {mode === "upgrades" && (
                    <th className="text-left py-3 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Current match</th>
                  )}
                  <th className="text-right py-3 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Impr.</th>
                  <th className="text-right py-3 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Clicks</th>
                  <th className="text-right py-3 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Spend</th>
                  {mode !== "negatives" && <>
                    <th className="text-right py-3 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Orders</th>
                    <th className="text-right py-3 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Sales</th>
                    <th className="text-right py-3 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">ACoS</th>
                  </>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const key = r.term || r.keyword;
                  const checked = selected.has(key);
                  return (
                    <tr key={i} onClick={() => toggleRow(key)}
                        className={cn("border-b border-[rgb(var(--border))] cursor-pointer transition",
                          checked ? "bg-brand-50 dark:bg-brand-500/5" : "hover:bg-slate-50 dark:hover:bg-slate-800/30")}>
                      <td className="py-2 px-3">
                        <input type="checkbox" checked={checked} onChange={() => toggleRow(key)}
                               onClick={(e) => e.stopPropagation()}
                               className="accent-brand-500" />
                      </td>
                      <td className="py-2 px-3 font-semibold max-w-[280px] truncate" title={key}>{key}</td>
                      <td className="py-2 px-3 text-xs text-slate-500 max-w-[200px] truncate" title={r.campaign_name}>{r.campaign_name}</td>
                      {mode === "upgrades" && (
                        <td className="py-2 px-3">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold">
                            {r.current_match_type}
                          </span>
                        </td>
                      )}
                      <td className="py-2 px-3 text-right tabular-nums">{Number(r.impressions || 0).toLocaleString()}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{r.clicks}</td>
                      <td className="py-2 px-3 text-right tabular-nums">${Number(r.cost || 0).toFixed(2)}</td>
                      {mode !== "negatives" && <>
                        <td className="py-2 px-3 text-right tabular-nums">{r.orders}</td>
                        <td className="py-2 px-3 text-right tabular-nums font-semibold text-emerald-600">${Number(r.sales || 0).toFixed(2)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">
                          <span className={cn(
                            (r.acos || 0) > 50 ? "text-red-500" : (r.acos || 0) > 30 ? "text-amber-500" : "text-emerald-500",
                            "font-semibold"
                          )}>
                            {(r.acos || 0).toFixed(1)}%
                          </span>
                        </td>
                      </>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
