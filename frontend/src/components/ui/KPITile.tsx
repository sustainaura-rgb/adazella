import { ReactNode } from "react";
import { TrendingUp, TrendingDown, Minus, LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { PremiumCard } from "./PremiumCard";

interface KPITileProps {
  label: string;
  value: string | number;
  delta?: number;        // Percentage change vs previous period (positive = up, negative = down)
  inverse?: boolean;     // For metrics where down is good (e.g., ACoS, Cost)
  icon?: LucideIcon;
  iconGradient?: string; // Tailwind gradient classes, e.g. "from-brand-500 to-purple-500"
  sparkline?: ReactNode; // Optional small chart inline
  loading?: boolean;
  className?: string;
}

export function KPITile({
  label,
  value,
  delta,
  inverse = false,
  icon: Icon,
  iconGradient = "from-brand-500 to-purple-500",
  sparkline,
  loading = false,
  className,
}: KPITileProps) {
  if (loading) {
    return (
      <PremiumCard variant="premium" className={cn("relative", className)}>
        <div className="space-y-3">
          <div className="h-4 w-24 shimmer rounded" />
          <div className="h-10 w-32 shimmer rounded" />
          <div className="h-3 w-16 shimmer rounded" />
        </div>
      </PremiumCard>
    );
  }

  // Determine delta color
  // - positive delta + not inverse = good (green)
  // - positive delta + inverse = bad (red)
  // - delta = 0 or null = neutral (slate)
  let deltaColor = "text-slate-400";
  let DeltaIcon = Minus;

  if (delta !== undefined && delta !== null && Number.isFinite(delta)) {
    if (delta > 0.1) {
      DeltaIcon = TrendingUp;
      deltaColor = inverse ? "text-rose-500" : "text-emerald-500";
    } else if (delta < -0.1) {
      DeltaIcon = TrendingDown;
      deltaColor = inverse ? "text-emerald-500" : "text-rose-500";
    }
  }

  const deltaText = delta !== undefined && delta !== null && Number.isFinite(delta)
    ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`
    : "—";

  return (
    <PremiumCard variant="premium" className={cn("relative group", className)}>
      {/* Subtle gradient accent on hover */}
      <div className={cn(
        "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none",
        "bg-gradient-to-br from-brand-500/5 via-transparent to-purple-500/5"
      )} />

      <div className="relative flex flex-col gap-3">
        {/* Header: label + icon */}
        <div className="flex items-start justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--text-secondary))]">
            {label}
          </span>
          {Icon && (
            <div className={cn(
              "w-9 h-9 rounded-xl flex items-center justify-center",
              "bg-gradient-to-br shadow-inner-soft",
              iconGradient
            )}>
              <Icon size={16} className="text-white" strokeWidth={2.5} />
            </div>
          )}
        </div>

        {/* Hero number */}
        <div className="text-hero text-[rgb(var(--text-primary))]">
          {value}
        </div>

        {/* Footer: delta + optional sparkline */}
        <div className="flex items-center justify-between">
          <div className={cn("flex items-center gap-1.5 text-xs font-semibold", deltaColor)}>
            <DeltaIcon size={12} strokeWidth={2.5} />
            <span className="tabular-nums">{deltaText}</span>
            <span className="text-[rgb(var(--text-muted))] font-normal">vs prev</span>
          </div>
          {sparkline && <div className="h-8 w-20">{sparkline}</div>}
        </div>
      </div>
    </PremiumCard>
  );
}
