// Negativity scoring — pure function used to highlight bad search terms.
// 0 = perfect match (keep). 100 = should definitely be a negative.

export interface ProductProfile {
  include_keywords: string[];
  exclude_keywords: string[];
  competitor_brands: string[];
}

export function scoreSearchTerm(term: string, profile: ProductProfile | null): { score: number; reason: string } {
  if (!term || !profile) return { score: 0, reason: "no profile" };
  const t = term.toLowerCase();
  const tokens = new Set(t.split(/\s+/));

  // Competitor brand = definite negative
  for (const b of profile.competitor_brands || []) {
    if (b && t.includes(b.toLowerCase())) {
      return { score: 100, reason: `Competitor brand: "${b}"` };
    }
  }

  let score = 0;
  const reasons: string[] = [];

  // Exclude words add 40 points each
  for (const w of profile.exclude_keywords || []) {
    if (w && (tokens.has(w.toLowerCase()) || t.includes(` ${w.toLowerCase()} `) || t.startsWith(`${w.toLowerCase()} `) || t.endsWith(` ${w.toLowerCase()}`) || t === w.toLowerCase())) {
      score += 40;
      reasons.push(`excludes "${w}"`);
    }
  }

  // Include words reduce score by 15 each (cap at 0)
  for (const w of profile.include_keywords || []) {
    if (w && t.includes(w.toLowerCase())) {
      score -= 15;
    }
  }

  score = Math.max(0, Math.min(100, score));
  return {
    score,
    reason: reasons.length > 0 ? reasons.join(", ") : (score === 0 ? "matches include words" : "neutral"),
  };
}

export function negativityColor(score: number): string {
  if (score >= 90) return "text-red-600 bg-red-100 dark:bg-red-500/10 dark:text-red-400";
  if (score >= 60) return "text-orange-600 bg-orange-100 dark:bg-orange-500/10 dark:text-orange-400";
  if (score >= 30) return "text-amber-600 bg-amber-100 dark:bg-amber-500/10 dark:text-amber-400";
  return "text-emerald-600 bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400";
}

// Categorize a search term based on performance — Helium 10 style buckets
export function categorizeTerm(row: { clicks: number; orders: number; acos: number }): "winner" | "wasted" | "review" | "low" {
  if (row.clicks < 1) return "low";
  if (row.orders >= 1 && row.acos > 0 && row.acos < 50) return "winner";
  if (row.clicks >= 5 && row.orders === 0) return "wasted";
  return "review";
}
