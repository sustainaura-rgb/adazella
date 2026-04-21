import { useEffect, useState, useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, Legend,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Eye, MousePointerClick, DollarSign, ShoppingCart, Percent,
  ArrowUp, ArrowDown, Package, AlertTriangle, Bell, XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";

const PALETTE = ["#6366f1", "#a855f7", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#3b82f6", "#ef4444"];
const DAYS_OPTIONS = [7, 14, 30, 60, 90];

interface OverviewData {
  start_date: string;
  end_date: string;
  today: { impressions: number; clicks: number; cost: number; orders: number; sales: number; acos: number; ctr: number; cpc: number };
  yesterday: { impressions: number; clicks: number; cost: number; orders: number; sales: number; acos: number; ctr: number; cpc: number };
  trend: Array<{ date: string; impressions: number; clicks: number; cost: number; orders: number; sales: number; acos: number }>;
  top_campaigns: Array<{ campaign_id: string; campaign_name: string; status: string; impressions: number; clicks: number; cost: number; orders: number; sales: number; acos: number }>;
  spend_distribution: Array<{ name: string; cost: number }>;
}

interface Alert { type: "info" | "warning" | "danger"; icon: string; message: string }

function formatDelta(current: number, previous: number) {
  if (!previous) return { text: current > 0 ? "new" : "—", up: current > 0, pct: null as number | null };
  const pct = ((current - previous) / previous) * 100;
  return { text: `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`, up: pct > 0, pct };
}

export default function OverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [trendMetric, setTrendMetric] = useState<"sales" | "cost" | "clicks" | "impressions" | "orders" | "acos">("sales");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Don't blank the UI on refetch
      if (!data) setLoading(true);
      try {
        const [ovRes, alRes] = await Promise.all([
          api.get<OverviewData>("/api/overview", { params: { days } }),
          api.get<{ alerts: Alert[] }>("/api/overview/alerts").catch(() => ({ data: { alerts: [] as Alert[] } })),
        ]);
        if (!cancelled) {
          setData(ovRes.data);
          setAlerts(alRes.data.alerts || []);
        }
      } catch (err) {
        console.error("Failed to load overview", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const kpis = useMemo(() => {
    if (!data) return [];
    const t = data.today;
    const y = data.yesterday;
    return [
      { label: "Spend",       value: `$${t.cost.toFixed(2)}`,       delta: formatDelta(t.cost, y.cost),
        Icon: DollarSign,     gradient: "from-indigo-500 to-purple-500" },
      { label: "Sales",       value: `$${t.sales.toFixed(2)}`,      delta: formatDelta(t.sales, y.sales),
        Icon: ShoppingCart,   gradient: "from-emerald-500 to-cyan-500" },
      { label: "Orders",      value: t.orders,                       delta: formatDelta(t.orders, y.orders),
        Icon: Package,        gradient: "from-amber-500 to-pink-500" },
      { label: "ACoS",        value: `${t.acos.toFixed(1)}%`,       delta: formatDelta(t.acos, y.acos), inverse: true,
        Icon: Percent,        gradient: "from-pink-500 to-red-500" },
      { label: "Clicks",      value: t.clicks.toLocaleString(),     delta: formatDelta(t.clicks, y.clicks),
        Icon: MousePointerClick, gradient: "from-blue-500 to-indigo-500" },
      { label: "Impressions", value: t.impressions.toLocaleString(),delta: formatDelta(t.impressions, y.impressions),
        Icon: Eye,            gradient: "from-purple-500 to-pink-500" },
    ];
  }, [data]);

  if (loading && !data) {
    return <PageSkeleton rows={6} cols={5} />;
  }

  if (!data) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto">
        <EmptyState
          icon={Bell}
          title="No data yet"
          description="Start the scheduler or connect your Amazon Ads account to populate your dashboard with live performance data."
        />
      </div>
    );
  }

  const visibleAlerts = alerts.filter((_, i) => !dismissed.has(i));

  // Donut data — top 6 + "Other"
  const donutData = (() => {
    const dist = data.spend_distribution;
    if (dist.length <= 6) return dist;
    const top = dist.slice(0, 6);
    const other = dist.slice(6).reduce((s, x) => s + Number(x.cost || 0), 0);
    return [...top, { name: "Other campaigns", cost: Number(other.toFixed(2)) }];
  })();

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto flex flex-col gap-5 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black bg-gradient-to-br from-brand-500 to-purple-500 bg-clip-text text-transparent">
            Overview
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Today's snapshot with {days}-day trends
          </p>
        </div>
      </div>

      {/* Alerts banner */}
      {visibleAlerts.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Bell size={14} className="text-amber-500" />
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
              Alerts ({visibleAlerts.length})
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {alerts.map((a, i) => dismissed.has(i) ? null : (
              <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${
                a.type === "danger"  ? "bg-red-50 border border-red-200 text-red-700 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30" :
                a.type === "warning" ? "bg-amber-50 border border-amber-200 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30" :
                                       "bg-blue-50 border border-blue-200 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/30"
              }`}>
                <AlertTriangle size={13} className="shrink-0" />
                <span className="flex-1">{a.message}</span>
                <button onClick={() => setDismissed(new Set([...dismissed, i]))}
                        className="opacity-70 hover:opacity-100">
                  <XCircle size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        {kpis.map((k, idx) => {
          const Icon = k.Icon;
          const up = k.delta.up;
          const DeltaIcon = up ? ArrowUp : ArrowDown;
          return (
            <div key={k.label} className={`relative overflow-hidden rounded-2xl p-5 text-white shadow-lg bg-gradient-to-br ${k.gradient} hover:scale-[1.02] transition cursor-default`}
                 style={{ animation: `slideUp 0.4s cubic-bezier(0.4,0,0.2,1) ${idx * 0.05}s both` }}>
              {/* Decorative icon */}
              <div className="absolute -top-4 -right-4 opacity-10">
                <Icon size={110} />
              </div>
              {/* Shine overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
              {/* Content */}
              <div className="relative">
                <div className="text-[10px] font-bold tracking-widest opacity-80 uppercase">{k.label}</div>
                <div className="text-2xl font-black mt-1.5 tracking-tight">{k.value}</div>
                {k.delta.pct !== null && (
                  <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 bg-black/20 backdrop-blur rounded-full text-[11px] font-bold">
                    <DeltaIcon size={11} />
                    {k.delta.text}
                    <span className="opacity-70 ml-1">vs prev</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Conversion funnel */}
      <div className="card p-6">
        <h3 className="font-bold mb-4">Conversion funnel (today)</h3>
        <div className="flex items-center justify-center gap-0 flex-wrap">
          {(() => {
            const t = data.today;
            const steps = [
              { label: "Impressions",  value: t.impressions, color: "#a855f7" },
              { label: "Clicks",       value: t.clicks,      color: "#3b82f6" },
              { label: "Orders",       value: t.orders,      color: "#10b981" },
            ];
            const max = Math.max(steps[0].value, 1);
            return steps.map((s, i) => {
              const pct = Math.max((s.value / max) * 100, 15);
              const rate = i > 0 && steps[i - 1].value > 0
                ? ((s.value / steps[i - 1].value) * 100).toFixed(1) + "%"
                : null;
              return (
                <div key={s.label} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div className="rounded-xl py-3.5 px-5 text-white text-center font-bold shadow-lg"
                         style={{ background: s.color, width: `${pct}%`, minWidth: 90, maxWidth: 180,
                                  boxShadow: `0 8px 24px ${s.color}40` }}>
                      <div className="text-xl font-black">{s.value.toLocaleString()}</div>
                      <div className="text-[9px] opacity-90 tracking-widest uppercase mt-0.5">{s.label}</div>
                    </div>
                  </div>
                  {i < steps.length - 1 && (
                    <div className="px-3 text-xs font-bold text-slate-400 whitespace-nowrap">
                      {rate ? `${rate} →` : "→"}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* Trend chart */}
      <div className="card p-6">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
          <div>
            <h3 className="font-bold">Performance trend</h3>
            <p className="text-xs text-slate-500">Last {days} days</p>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 cursor-pointer">
              {DAYS_OPTIONS.map((d) => <option key={d} value={d}>Last {d} days</option>)}
            </select>
            {[
              { k: "sales",       l: "Sales",       c: "#10b981" },
              { k: "cost",        l: "Spend",       c: "#ef4444" },
              { k: "clicks",      l: "Clicks",      c: "#3b82f6" },
              { k: "impressions", l: "Impressions", c: "#a855f7" },
              { k: "orders",      l: "Orders",      c: "#f59e0b" },
              { k: "acos",        l: "ACoS",        c: "#ec4899" },
            ].map((m) => (
              <button
                key={m.k}
                onClick={() => setTrendMetric(m.k as any)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                  trendMetric === m.k
                    ? "text-white border-transparent"
                    : "text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
                style={trendMetric === m.k ? { background: m.c } : {}}
              >
                {m.l}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data.trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "rgb(var(--text-muted))" }}
                   tickFormatter={(d: string) => d?.slice(5) || ""} />
            <YAxis tick={{ fontSize: 11, fill: "rgb(var(--text-muted))" }} />
            <Tooltip contentStyle={{ background: "rgb(var(--bg-card))", border: "1px solid rgb(var(--border))", borderRadius: 10, fontSize: 12 }}
                     formatter={(v: any) => trendMetric === "cost" || trendMetric === "sales"
                       ? `$${Number(v).toFixed(2)}`
                       : trendMetric === "acos" ? `${Number(v).toFixed(1)}%` : Number(v).toLocaleString()} />
            <Area type="monotone" dataKey={trendMetric} stroke="#6366f1" strokeWidth={2.5} fill="url(#tg)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Two-column: spend donut + top campaigns bar */}
      <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))" }}>
        <div className="card p-6">
          <h3 className="font-bold mb-1">Spend distribution</h3>
          <p className="text-xs text-slate-500 mb-4">Where your budget went</p>
          {donutData.length === 0 ? (
            <div className="text-slate-400 text-sm text-center py-10">No spend data.</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={donutData} dataKey="cost" nameKey="name" cx="50%" cy="50%"
                     innerRadius={60} outerRadius={100} paddingAngle={2}>
                  {donutData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "rgb(var(--bg-card))", border: "1px solid rgb(var(--border))", borderRadius: 10, fontSize: 12 }}
                         formatter={(v: any) => `$${Number(v).toFixed(2)}`} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11, paddingTop: 10 }}
                        formatter={(v: any) => v.length > 24 ? v.slice(0, 24) + "…" : v} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card p-6">
          <h3 className="font-bold mb-1">Top 10 campaigns by sales</h3>
          <p className="text-xs text-slate-500 mb-4">Best performers in this period</p>
          {data.top_campaigns.length === 0 ? (
            <div className="text-slate-400 text-sm text-center py-10">No sales yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.top_campaigns.map((c) => ({
                name: c.campaign_name.length > 20 ? c.campaign_name.slice(0, 20) + "…" : c.campaign_name,
                sales: c.sales, cost: c.cost,
              }))} layout="vertical" margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 10, fill: "rgb(var(--text-muted))" }} />
                <YAxis type="category" dataKey="name" width={130}
                       tick={{ fontSize: 10, fill: "rgb(var(--text-muted))" }} />
                <Tooltip contentStyle={{ background: "rgb(var(--bg-card))", border: "1px solid rgb(var(--border))", borderRadius: 10, fontSize: 12 }}
                         formatter={(v: any) => `$${Number(v).toFixed(2)}`} />
                <Bar dataKey="sales" fill="#10b981" radius={[0, 6, 6, 0]} />
                <Bar dataKey="cost"  fill="#ef4444" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top performers table */}
      <div className="card p-6">
        <h3 className="font-bold mb-4">Top performers</h3>
        {data.top_campaigns.length === 0 ? (
          <div className="text-slate-400 text-sm text-center py-8">No performing campaigns yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgb(var(--border))]">
                  <th className="text-left py-2 px-3 text-xs font-bold uppercase tracking-wide text-slate-500">Campaign</th>
                  <th className="py-2 px-3 text-xs font-bold uppercase tracking-wide text-slate-500">Status</th>
                  <th className="py-2 px-3 text-xs font-bold uppercase tracking-wide text-slate-500 text-right">Impr.</th>
                  <th className="py-2 px-3 text-xs font-bold uppercase tracking-wide text-slate-500 text-right">Clicks</th>
                  <th className="py-2 px-3 text-xs font-bold uppercase tracking-wide text-slate-500 text-right">Spend</th>
                  <th className="py-2 px-3 text-xs font-bold uppercase tracking-wide text-slate-500 text-right">Orders</th>
                  <th className="py-2 px-3 text-xs font-bold uppercase tracking-wide text-slate-500 text-right">Sales</th>
                  <th className="py-2 px-3 text-xs font-bold uppercase tracking-wide text-slate-500 text-right">ACoS</th>
                </tr>
              </thead>
              <tbody>
                {data.top_campaigns.map((c, i) => {
                  const maxSales = Math.max(...data.top_campaigns.map((x) => x.sales));
                  const pct = maxSales > 0 ? (c.sales / maxSales) * 100 : 0;
                  return (
                    <tr key={c.campaign_id} className="border-b border-[rgb(var(--border))] hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-2 px-3 font-semibold relative">
                        <div className="absolute inset-y-0 left-0 opacity-10 pointer-events-none"
                             style={{ width: `${pct}%`, background: PALETTE[i % PALETTE.length] }} />
                        <span className="relative">{c.campaign_name}</span>
                      </td>
                      <td className="py-2 px-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          c.status === "ENABLED"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                            : "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                        }`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">{c.impressions.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{c.clicks.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right tabular-nums">${c.cost.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{c.orders}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-semibold text-emerald-600">${c.sales.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        <span className={c.acos > 50 ? "text-red-500" : c.acos > 30 ? "text-amber-500" : "text-emerald-500"}>
                          {c.acos.toFixed(1)}%
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
    </div>
  );
}
