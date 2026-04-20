import { useEffect, useMemo, useState } from "react";
import { Search, Download, Loader2, ArrowUpDown, ExternalLink } from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

const PALETTE = ["#6366f1", "#a855f7", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#3b82f6", "#ef4444"];

interface Product {
  asin: string;
  sku: string | null;
  campaign_id: string;
  campaign_name: string;
  ad_group_name: string;
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

type SortKey = "impressions" | "clicks" | "cost" | "orders" | "sales" | "acos";

// Amazon displays thumbnails from this CDN
const AMAZON_IMG = (asin: string) =>
  `https://ws-na.amazon-adsystem.com/widgets/q?_encoding=UTF8&ASIN=${asin}&Format=_SL80_&ID=AsinImage`;

export default function ProductsPage() {
  const [rows, setRows] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("clicks");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    async function load() {
      if (rows.length === 0) setLoading(true);
      try {
        const { data } = await api.get<{ rows: Product[] }>("/api/products", {
          params: { sort: sortKey, limit: 500 },
        });
        setRows(data.rows || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortKey]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows
      .filter((r) => !q ||
        r.asin.toLowerCase().includes(q) ||
        (r.sku || "").toLowerCase().includes(q) ||
        r.campaign_name.toLowerCase().includes(q))
      .sort((a, b) => {
        const av = Number(a[sortKey] ?? 0);
        const bv = Number(b[sortKey] ?? 0);
        return sortAsc ? av - bv : bv - av;
      });
  }, [rows, search, sortKey, sortAsc]);

  // Aggregate per-ASIN for charts
  const chartData = useMemo(() => {
    const byAsin = new Map<string, { asin: string; sales: number; cost: number; orders: number; clicks: number }>();
    for (const r of rows) {
      const key = r.asin || "unknown";
      const existing = byAsin.get(key) || { asin: key, sales: 0, cost: 0, orders: 0, clicks: 0 };
      existing.sales += r.sales;
      existing.cost  += r.cost;
      existing.orders += r.orders;
      existing.clicks += r.clicks;
      byAsin.set(key, existing);
    }
    const all = Array.from(byAsin.values());
    return {
      topSales: [...all].sort((a, b) => b.sales - a.sales).slice(0, 10),
      ordersPie: [...all].filter((x) => x.orders > 0).sort((a, b) => b.orders - a.orders).slice(0, 6),
    };
  }, [rows]);

  function toggleSort(col: SortKey) {
    if (sortKey === col) setSortAsc(!sortAsc);
    else { setSortKey(col); setSortAsc(false); }
  }

  function exportCSV() {
    if (!filtered.length) return;
    const cols = ["asin", "sku", "campaign_name", "impressions", "clicks", "cost", "orders", "sales", "add_to_cart", "acos"];
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
    a.download = `products_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="animate-spin text-brand-500" size={32} /></div>;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto flex flex-col gap-5 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black bg-gradient-to-br from-brand-500 to-purple-500 bg-clip-text text-transparent">
            Products
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Track performance per ASIN — which products convert, which are burning budget
          </p>
        </div>
      </div>

      {/* Charts */}
      {rows.length > 0 && (
        <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))" }}>
          <div className="card p-5">
            <h3 className="font-bold text-sm mb-3">Top 10 ASINs by sales</h3>
            {chartData.topSales.length === 0 ? (
              <div className="text-slate-400 text-center py-10 text-sm">No ASIN data.</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData.topSales.map((x) => ({
                  asin: x.asin.length > 10 ? x.asin.slice(0, 10) : x.asin,
                  sales: Number(x.sales.toFixed(2)),
                  cost: Number(x.cost.toFixed(2)),
                }))} margin={{ top: 5, right: 10, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
                  <XAxis dataKey="asin" tick={{ fontSize: 10, fill: "rgb(var(--text-muted))" }} angle={-30} textAnchor="end" />
                  <YAxis tick={{ fontSize: 10, fill: "rgb(var(--text-muted))" }} />
                  <Tooltip contentStyle={{ background: "rgb(var(--bg-card))", border: "1px solid rgb(var(--border))", borderRadius: 10, fontSize: 12 }}
                           formatter={(v: any) => `$${Number(v).toFixed(2)}`} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="sales" fill="#10b981" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="cost"  fill="#ef4444" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="card p-5">
            <h3 className="font-bold text-sm mb-3">Orders per ASIN (top 6)</h3>
            {chartData.ordersPie.length === 0 ? (
              <div className="text-slate-400 text-center py-10 text-sm">No orders yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={chartData.ordersPie} dataKey="orders" nameKey="asin" cx="50%" cy="50%"
                       innerRadius={50} outerRadius={85} paddingAngle={2}>
                    {chartData.ordersPie.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "rgb(var(--bg-card))", border: "1px solid rgb(var(--border))", borderRadius: 10, fontSize: 12 }} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 card px-4 py-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search ASIN, SKU, campaigns..." value={search}
                 onChange={(e) => setSearch(e.target.value)}
                 className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none" />
        </div>
        <button onClick={exportCSV}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition">
          <Download size={13} /> CSV
        </button>
        <span className="text-xs text-slate-400">{filtered.length} products</span>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-slate-400">No products match the filter.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgb(var(--border))] bg-slate-50 dark:bg-slate-800/50">
                  <th className="text-left py-3 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">ASIN</th>
                  <th className="text-left py-3 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">SKU</th>
                  <th className="text-left py-3 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Campaign</th>
                  <SortTh label="Impr."   col="impressions" sortKey={sortKey} sortAsc={sortAsc} onClick={() => toggleSort("impressions")} />
                  <SortTh label="Clicks"  col="clicks"      sortKey={sortKey} sortAsc={sortAsc} onClick={() => toggleSort("clicks")} />
                  <SortTh label="Spend"   col="cost"        sortKey={sortKey} sortAsc={sortAsc} onClick={() => toggleSort("cost")} />
                  <SortTh label="Orders"  col="orders"      sortKey={sortKey} sortAsc={sortAsc} onClick={() => toggleSort("orders")} />
                  <SortTh label="Sales"   col="sales"       sortKey={sortKey} sortAsc={sortAsc} onClick={() => toggleSort("sales")} />
                  <th className="text-right py-3 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Cart</th>
                  <SortTh label="ACoS"    col="acos"        sortKey={sortKey} sortAsc={sortAsc} onClick={() => toggleSort("acos")} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={i} className="border-b border-[rgb(var(--border))] hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="py-2 px-3">
                      <a href={`https://www.amazon.com/dp/${r.asin}`} target="_blank" rel="noopener noreferrer"
                         className="flex items-center gap-2 text-brand-600 hover:underline font-semibold text-xs">
                        <img src={AMAZON_IMG(r.asin)} alt="" className="w-8 h-8 rounded bg-white object-contain"
                             onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        {r.asin}
                        <ExternalLink size={10} className="opacity-50" />
                      </a>
                    </td>
                    <td className="py-2 px-3 text-xs text-slate-500">{r.sku || "—"}</td>
                    <td className="py-2 px-3 text-xs text-slate-500 max-w-[180px] truncate" title={r.campaign_name}>{r.campaign_name}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{r.impressions.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{r.clicks}</td>
                    <td className="py-2 px-3 text-right tabular-nums">${r.cost.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{r.orders}</td>
                    <td className="py-2 px-3 text-right tabular-nums font-semibold text-emerald-600">${r.sales.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{r.add_to_cart}</td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      <span className={cn(
                        r.acos > 50 ? "text-red-500" : r.acos > 30 ? "text-amber-500" : r.acos > 0 ? "text-emerald-500" : "text-slate-400",
                        "font-semibold"
                      )}>
                        {r.acos.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
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
