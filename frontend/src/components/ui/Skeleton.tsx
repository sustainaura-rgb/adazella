import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-md bg-slate-200/70 dark:bg-slate-800/70", className)} />
  );
}

export function SkeletonKPI() {
  return (
    <div className="card p-5">
      <Skeleton className="h-3 w-24 mb-3" />
      <Skeleton className="h-8 w-32 mb-2" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

export function SkeletonKPIRow({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => <SkeletonKPI key={i} />)}
    </div>
  );
}

export function SkeletonChart({ className }: { className?: string }) {
  return (
    <div className={cn("card p-5", className)}>
      <Skeleton className="h-4 w-40 mb-4" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export function PageSkeleton({ showKpis = true, rows = 8, cols = 6 }: { showKpis?: boolean; rows?: number; cols?: number }) {
  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto flex flex-col gap-5">
      <div>
        <Skeleton className="h-7 w-48 mb-2" />
        <Skeleton className="h-4 w-72" />
      </div>
      {showKpis && <SkeletonKPIRow count={4} />}
      <SkeletonTable rows={rows} cols={cols} />
    </div>
  );
}

export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="card overflow-hidden">
      <div className="p-4 border-b border-[rgb(var(--border))]">
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="divide-y divide-[rgb(var(--border))]">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="grid gap-4 p-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className={cn("h-4", c === 0 ? "w-full" : "w-3/4")} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
