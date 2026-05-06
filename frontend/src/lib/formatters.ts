// Display formatters — shared across all pages so behavior is consistent.

const NA = "—";

/**
 * Format ACoS for display.
 * - sales=0 → "—" (no sales = ACoS is undefined, NOT 0%)
 * - cost=0  → "—" (no spend, no ACoS to compute)
 * - else    → "12.3%"
 */
export function formatAcos(acos: number, sales?: number, cost?: number): string {
  if ((sales !== undefined && sales <= 0) || (cost !== undefined && cost <= 0)) return NA;
  if (!Number.isFinite(acos) || acos < 0) return NA;
  return `${acos.toFixed(1)}%`;
}

/**
 * Format CTR for display. 0 impressions → "—".
 */
export function formatCtr(ctr: number, impressions?: number): string {
  if (impressions !== undefined && impressions <= 0) return NA;
  if (!Number.isFinite(ctr) || ctr < 0) return NA;
  return `${ctr.toFixed(2)}%`;
}

/**
 * Format CPC. 0 clicks → "—".
 */
export function formatCpc(cpc: number, clicks?: number): string {
  if (clicks !== undefined && clicks <= 0) return NA;
  if (!Number.isFinite(cpc) || cpc < 0) return NA;
  return `$${cpc.toFixed(2)}`;
}

/**
 * Format currency (USD by default).
 */
export function formatCurrency(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return NA;
  return `$${value.toFixed(decimals)}`;
}

/**
 * Format integer with thousands separator.
 */
export function formatInt(value: number): string {
  if (!Number.isFinite(value)) return NA;
  return Math.round(value).toLocaleString();
}

/**
 * Format percent.
 */
export function formatPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return NA;
  return `${value.toFixed(decimals)}%`;
}

/**
 * Tailwind class for ACoS color based on target.
 * acos < target            → emerald (good)
 * acos < target * 1.5      → amber (warning)
 * acos >= target * 1.5     → red (bad)
 * sales=0 or cost=0        → muted (no signal)
 */
export function acosColorClass(acos: number, sales?: number, cost?: number, targetAcos = 25): string {
  if ((sales !== undefined && sales <= 0) || (cost !== undefined && cost <= 0)) return "text-slate-400";
  if (acos < targetAcos) return "text-emerald-500";
  if (acos < targetAcos * 1.5) return "text-amber-500";
  return "text-red-500";
}
