import { useEffect, useMemo, useState } from "react";
import {
  Search, ArrowUpDown, Loader2, Play, Pause, Check, X,
  Activity, AlertTriangle, Archive, Eye, MousePointerClick, DollarSign, ShoppingCart, Percent,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

interface Campaign {
  campaign_id: string;
  campaign_name: string;
  status: string;
  serving_status: string | null;
  daily_budget: number | null;
  impressions: number;
  clicks: number;
  cost: number;
  orders: number;
  sales: number;
  acos: number;
  ctr: number;
  cpc: number;
}

type SortKey = keyof Pick<Campaign, "cost" | "sales" | "clicks" | "impressions" | "orders" | "acos" | "campaign_name">;

export default function CampaignsPage() {
  const [rows, setRows] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("cost");
  const [sortAsc, setSortAsc] = useState(false);
  const [hideEnded, setHideEnded] = useState(true);
  const [enabledOnly, setEnabledOnly] = useState(false);

  async function fetchCampaigns() {
    if (rows.length === 0) setLoading(true);
    try {
      const { data } = await api.get<{ campaigns: Campaign[] }>("/api/campaigns");
      setRows(data.campaigns || []);
    } catch (err) {
      console.error("Failed to load campaigns", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = useMemo(() => {
    const enabled = rows.filter((r) => r.status === "ENABLED").length;
    const outOfBudget = rows.filter((r) => (r.serving_status || "").includes("OUT_OF_BUDGET")).length;
    const ended = rows.filter((r) => (r.serving_status || "").includes("ENDED") || (r.serving_status || "").includes("ARCHIVED")).length;
    const t = rows.reduce((a, r) => ({
      impressions: a.impressions + r.impressions,
      clicks: a.clicks + r.clicks,
      cost: a.cost + r.cost,
      orders: a.orders + r.orders,
      sales: a.sales + r.sales,
    }), { impressions: 0, clicks: 0, cost: 0, orders: 0, sales: 0 });
    return {
      enabled, outOfBudget, ended,
      ...t,
      acos: t.sales > 0 ? (t.cost / t.sales * 100) : 0,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows
      .filter((r) => !hideEnded   || !(r.serving_status || "").includes("ENDED"))
      .filter((r) => !enabledOnly || r.status === "ENABLED")
      .filter((r) => !q || r.campaign_name.toLowerCase().includes(q))
      .sort((a, b) => {
        const av = a[sortKey] ?? 0;
        const bv = b[sortKey] ?? 0;
        if (typeof av === "string") return sortAsc ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
        return sortAsc ? Number(av) - Number(bv) : Number(bv) - Number(av);
      });
  }, [rows, search, sortKey, sortAsc, hideEnded, enabledOnly]);

  function toggleSort(col: SortKey) {
    if (sortKey === col) setSortAsc(!sortAsc);
    else { setSortKey(col); setSortAsc(false); }
  }

  async function toggleStatus(c: Campaign) {
    const next = c.status === "ENABLED" ? "PAUSED" : "ENABLED";
    // Optimistic update
    setRows((rs) => rs.map((r) => r.campaign_id === c.campaign_id ? { ...r, status: next } : r));
    try {
      await api.patch(`/api/campaigns/${c.campaign_id}/status`, { status: next });
    } catch (err) {
      // Revert on failure
      setRows((rs) => rs.map((r) => r.campaign_id === c.campaign_id ? { ...r, status: c.status } : r));
      alert("Failed to update status");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="animate-spin text-brand-500" size={32} />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto flex flex-col gap-5 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black bg-gradient-to-br from-brand-500 to-purple-500 bg-clip-text text-transparent">
            Campaigns
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage and monitor all your campaigns
          </p>
        </div>
      </div>

      {/* KPI summary strip */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        {[
          { lbl: "Active",        v: summary.enabled,                       Icon: Activity,         grad: "from-emerald-500 to-cyan-500" },
          { lbl: "Out of budget", v: summary.outOfBudget,                   Icon: AlertTriangle,    grad: summary.outOfBudget > 0 ? "from-amber-500 to-pink-500" : "from-slate-500 to-slate-600" },
          { lbl: "Ended",         v: summary.ended,                         Icon: Archive,          grad: "from-slate-500 to-slate-700" },
          { lbl: "Impressions",   v: summary.impressions.toLocaleString(),  Icon: Eye,              grad: "from-purple-500 to-pink-500" },
          { lbl: "Clicks",        v: summary.clicks.toLocaleString(),       Icon: MousePointerClick,grad: "from-blue-500 to-indigo-500" },
          { lbl: "Spend",         v: "$" + summary.cost.toFixed(2),         Icon: DollarSign,       grad: "from-red-500 to-amber-500" },
          { lbl: "Sales",         v: "$" + summary.sales.toFixed(2),        Icon: ShoppingCart,     grad: "from-emerald-500 to-cyan-500" },
          { lbl: "ACoS",          v: summary.acos.toFixed(1) + "%",         Icon: Percent,          grad: summary.acos > 30 ? "from-pink-500 to-red-500" : "from-emerald-500 to-cyan-500" },
        ].map((k) => {
          const Icon = k.Icon;
          return (
            <div key={k.lbl} className={`relative overflow-hidden rounded-xl p-4 text-white shadow bg-gradient-to-br ${k.grad}`}>
              <div className="absolute -top-3 -right-3 opacity-10"><Icon size={70} /></div>
              <div className="relative">
                <div className="text-[10px] font-bold tracking-widest opacity-80 uppercase">{k.lbl}</div>
                <div className="text-lg font-black mt-1">{k.v}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 card px-4 py-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search campaigns..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
          <input type="checkbox" checked={hideEnded} onChange={(e) => setHideEnded(e.target.checked)}
                 className="accent-brand-500" />
          Hide ended
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
          <input type="checkbox" checked={enabledOnly} onChange={(e) => setEnabledOnly(e.target.checked)}
                 className="accent-brand-500" />
          Enabled only
        </label>
        <span className="ml-auto text-xs text-slate-400">
          {filtered.length} of {rows.length}
        </span>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-slate-400">
            No campaigns match the filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgb(var(--border))] bg-slate-50 dark:bg-slate-800/50">
                  <th className="text-left py-3 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Status</th>
                  <SortTh label="Campaign" col="campaign_name"  sortKey={sortKey} sortAsc={sortAsc} onClick={() => toggleSort("campaign_name")} />
                  <SortTh label="Impr."    col="impressions"    sortKey={sortKey} sortAsc={sortAsc} onClick={() => toggleSort("impressions")}  right />
                  <SortTh label="Clicks"   col="clicks"         sortKey={sortKey} sortAsc={sortAsc} onClick={() => toggleSort("clicks")}       right />
                  <SortTh label="Spend"    col="cost"           sortKey={sortKey} sortAsc={sortAsc} onClick={() => toggleSort("cost")}         right />
                  <SortTh label="Orders"   col="orders"         sortKey={sortKey} sortAsc={sortAsc} onClick={() => toggleSort("orders")}       right />
                  <SortTh label="Sales"    col="sales"          sortKey={sortKey} sortAsc={sortAsc} onClick={() => toggleSort("sales")}        right />
                  <SortTh label="ACoS"     col="acos"           sortKey={sortKey} sortAsc={sortAsc} onClick={() => toggleSort("acos")}         right />
                  <th className="text-left py-3 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Budget</th>
                  <th className="text-left py-3 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Pacing</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const spent = c.cost;
                  const budget = Number(c.daily_budget || 0);
                  const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
                  const pacingColor = pct >= 95 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
                  const outOfBudget = (c.serving_status || "").includes("OUT_OF_BUDGET");
                  const isEnded = (c.serving_status || "").includes("ENDED") || (c.serving_status || "").includes("ARCHIVED");

                  return (
                    <tr key={c.campaign_id} className="border-b border-[rgb(var(--border))] hover:bg-slate-50 dark:hover:bg-slate-800/30 transition">
                      {/* Status toggle */}
                      <td className="py-2 px-3">
                        <StatusPill
                          enabled={c.status === "ENABLED"}
                          outOfBudget={outOfBudget}
                          ended={isEnded}
                          onClick={() => !isEnded && toggleStatus(c)}
                        />
                      </td>
                      <td className="py-2 px-3">
                        <div className="font-semibold max-w-xs truncate" title={c.campaign_name}>{c.campaign_name}</div>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">{c.impressions.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{c.clicks.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right tabular-nums">${c.cost.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{c.orders}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-semibold text-emerald-600">${c.sales.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        <span className={cn(
                          c.acos > 50 ? "text-red-500" : c.acos > 30 ? "text-amber-500" : "text-emerald-500",
                          "font-semibold"
                        )}>
                          {c.acos.toFixed(1)}%
                        </span>
                      </td>
                      {/* Budget (inline editable) */}
                      <td className="py-2 px-3">
                        <BudgetCell
                          campaignId={c.campaign_id}
                          initialBudget={budget}
                          onUpdated={(nb) => setRows((rs) => rs.map((r) => r.campaign_id === c.campaign_id ? { ...r, daily_budget: nb } : r))}
                        />
                      </td>
                      {/* Pacing */}
                      <td className="py-2 px-3 min-w-[100px]">
                        {budget > 0 ? (
                          <div>
                            <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
                              <span>{pct.toFixed(0)}%</span>
                              <span>${spent.toFixed(0)}/${budget.toFixed(0)}</span>
                            </div>
                            <div className="h-1 bg-slate-200 dark:bg-slate-700 rounded overflow-hidden">
                              <div className={cn("h-full rounded transition-all", pacingColor)} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
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

// ────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────

function SortTh({ label, col, sortKey, sortAsc, onClick, right }: {
  label: string; col: string; sortKey: string; sortAsc: boolean; onClick: () => void; right?: boolean;
}) {
  const active = sortKey === col;
  return (
    <th
      onClick={onClick}
      className={cn(
        "py-3 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500 cursor-pointer hover:text-brand-500",
        right ? "text-right" : "text-left"
      )}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown size={10} className={cn(
          active ? "text-brand-500" : "opacity-40",
          active && sortAsc && "rotate-180"
        )} />
      </span>
    </th>
  );
}

function StatusPill({ enabled, outOfBudget, ended, onClick }: {
  enabled: boolean; outOfBudget: boolean; ended: boolean; onClick: () => void;
}) {
  let label = enabled ? "Enabled" : "Paused";
  let classes = enabled
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30 hover:bg-emerald-200"
    : "bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-400 border border-slate-300 dark:border-slate-500/30 hover:bg-slate-200";
  if (outOfBudget) {
    label = "Out of budget";
    classes = "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30";
  }
  if (ended) {
    label = "Ended";
    classes = "bg-slate-100 text-slate-500 dark:bg-slate-500/10 dark:text-slate-400 border border-slate-300 dark:border-slate-500/30 opacity-60";
  }
  return (
    <button
      onClick={ended ? undefined : onClick}
      disabled={ended}
      className={cn(
        "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide inline-flex items-center gap-1 transition",
        classes,
        !ended && "cursor-pointer"
      )}
      title={ended ? "Ended — cannot modify" : "Click to toggle"}
    >
      {enabled ? <Pause size={9} /> : <Play size={9} />}
      {label}
    </button>
  );
}

function BudgetCell({ campaignId, initialBudget, onUpdated }: {
  campaignId: string;
  initialBudget: number;
  onUpdated: (newBudget: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(initialBudget.toFixed(2)));
  const [saving, setSaving] = useState(false);

  async function save() {
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) {
      alert("Budget must be a positive number");
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/api/campaigns/${campaignId}/budget`, { budget: num });
      onUpdated(num);
      setEditing(false);
    } catch (err: any) {
      alert(err.response?.data?.error || "Failed to update budget");
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setValue(String(initialBudget.toFixed(2)));
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-xs text-slate-400">$</span>
        <input
          type="number" min="1" step="1"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-20 px-2 py-1 text-xs rounded border border-brand-500 bg-white dark:bg-slate-800 outline-none"
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
        />
        <button onClick={save} disabled={saving}
                className="p-1 rounded bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50">
          {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
        </button>
        <button onClick={cancel} className="p-1 rounded bg-slate-300 dark:bg-slate-700 hover:bg-slate-400">
          <X size={11} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-xs text-slate-700 dark:text-slate-300 hover:text-brand-500 hover:underline font-semibold"
      title="Click to edit"
    >
      ${initialBudget.toFixed(2)}
    </button>
  );
}
