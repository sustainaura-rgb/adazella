import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";

export const negativesRouter = Router();

const NegativesQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(90),
});

// ════════════════════════════════════════════════
// GET /api/negatives
// Returns active negatives with historical waste (before they were added).
// Waste is calculated by matching keyword_text against search_term_performance.
// ════════════════════════════════════════════════
negativesRouter.get("/", async (req, res) => {
  try {
    const wsId = req.workspaceId;
    if (!wsId) return res.status(500).json({ error: "No workspace" });

    const parsed = NegativesQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid query" });
    const days = parsed.data.days;

    const windowStart = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

    // Load active negatives
    const { data: negatives, error: negErr } = await supabaseAdmin
      .from("campaign_negative_keywords")
      .select("id, keyword_id, keyword_text, match_type, state, campaign_id, ad_group_id, created_at")
      .eq("workspace_id", wsId)
      .eq("state", "ENABLED");
    if (negErr) throw negErr;

    // Load campaign names for enrichment
    const campIds = [...new Set((negatives || []).map((n) => n.campaign_id))];
    const { data: campaigns } = campIds.length > 0
      ? await supabaseAdmin
          .from("campaigns")
          .select("campaign_id, campaign_name")
          .eq("workspace_id", wsId)
          .in("campaign_id", campIds)
      : { data: [] };
    const campNameMap = new Map((campaigns || []).map((c) => [c.campaign_id, c.campaign_name]));

    // Load historical search term performance for the window, aggregated by lowered term
    const { data: histRows } = await supabaseAdmin
      .from("search_term_performance")
      .select("search_term, impressions, clicks, cost, orders, sales")
      .eq("workspace_id", wsId)
      .gte("report_date", windowStart);

    const histMap = new Map<string, any>();
    for (const r of histRows || []) {
      const key = (r.search_term || "").toLowerCase().trim();
      if (!key) continue;
      const ex = histMap.get(key) || { impressions: 0, clicks: 0, cost: 0, orders: 0, sales: 0 };
      ex.impressions += Number(r.impressions || 0);
      ex.clicks      += Number(r.clicks || 0);
      ex.cost        += Number(r.cost || 0);
      ex.orders      += Number(r.orders || 0);
      ex.sales       += Number(r.sales || 0);
      histMap.set(key, ex);
    }

    // Enrich negatives with historical waste + scope label
    const rows = (negatives || []).map((n) => {
      const h = histMap.get((n.keyword_text || "").toLowerCase().trim()) || { impressions: 0, clicks: 0, cost: 0, orders: 0, sales: 0 };
      return {
        id: n.id,
        keyword_id: n.keyword_id,
        keyword_text: n.keyword_text,
        match_type: n.match_type,
        state: n.state,
        campaign_id: n.campaign_id,
        ad_group_id: n.ad_group_id,
        campaign_name: campNameMap.get(n.campaign_id) || "-",
        scope: n.ad_group_id ? "Ad Group" : "Campaign",
        impressions: h.impressions,
        clicks: h.clicks,
        cost: Number(h.cost.toFixed(2)),
        orders: h.orders,
        sales: Number(h.sales.toFixed(2)),
        created_at: n.created_at,
      };
    });

    // Summary totals
    const totalWasted = rows.reduce((s, r) => s + r.cost, 0);
    const totalClicks = rows.reduce((s, r) => s + r.clicks, 0);
    const withHistory = rows.filter((r) => r.clicks > 0).length;

    res.json({
      days,
      count: rows.length,
      summary: {
        total_negatives: rows.length,
        with_history: withHistory,
        total_wasted: Number(totalWasted.toFixed(2)),
        total_clicks: totalClicks,
      },
      rows,
    });
  } catch (err: any) {
    console.error("GET /api/negatives error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════════════
// GET /api/negatives/suggestions
// Smart suggestions based on product profile + waste detection
// ════════════════════════════════════════════════
const SuggestionsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(180).default(60),
  min_clicks: z.coerce.number().int().min(0).max(50).default(1),
});

negativesRouter.get("/suggestions", async (req, res) => {
  try {
    const wsId = req.workspaceId;
    if (!wsId) return res.status(500).json({ error: "No workspace" });

    const parsed = SuggestionsQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid query" });

    const { days, min_clicks } = parsed.data;
    const windowStart = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

    // Load profile
    const { data: profile } = await supabaseAdmin
      .from("product_profiles")
      .select("include_keywords, exclude_keywords, competitor_brands")
      .eq("workspace_id", wsId)
      .maybeSingle();

    const prof = profile || { include_keywords: [], exclude_keywords: [], competitor_brands: [] };

    // Already-negated terms
    const { data: existingNegs } = await supabaseAdmin
      .from("campaign_negative_keywords")
      .select("keyword_text")
      .eq("workspace_id", wsId)
      .eq("state", "ENABLED");
    const negSet = new Set((existingNegs || []).map((n) => (n.keyword_text || "").toLowerCase().trim()));

    // Aggregate search terms with enough clicks
    const { data: terms } = await supabaseAdmin
      .from("search_term_performance")
      .select("search_term, campaign_id, campaign_name, impressions, clicks, cost, orders, sales")
      .eq("workspace_id", wsId)
      .gte("report_date", windowStart);

    const aggMap = new Map<string, any>();
    for (const r of terms || []) {
      const key = (r.search_term || "").toLowerCase().trim();
      if (!key) continue;
      const ex = aggMap.get(key) || {
        term: key,
        campaign_id: r.campaign_id, campaign_name: r.campaign_name,
        impressions: 0, clicks: 0, cost: 0, orders: 0, sales: 0,
      };
      ex.impressions += Number(r.impressions || 0);
      ex.clicks      += Number(r.clicks || 0);
      ex.cost        += Number(r.cost || 0);
      ex.orders      += Number(r.orders || 0);
      ex.sales       += Number(r.sales || 0);
      aggMap.set(key, ex);
    }

    const suggestions: any[] = [];
    let totalWasted = 0;

    for (const agg of aggMap.values()) {
      if (agg.clicks < min_clicks) continue;
      if (negSet.has(agg.term)) continue;

      const t = agg.term;
      const tokens = new Set(t.split(/\s+/));
      let reason: string | null = null;
      let confidence = 0;

      // Check competitor brand (100% confidence)
      for (const b of prof.competitor_brands || []) {
        if (b && t.includes(b.toLowerCase())) {
          reason = `Competitor brand: "${b}"`;
          confidence = 100;
          break;
        }
      }

      // Check exclude words (85% confidence)
      if (!reason) {
        for (const w of prof.exclude_keywords || []) {
          if (w && (tokens.has(w.toLowerCase()) || t.includes(` ${w.toLowerCase()} `) ||
                    t.startsWith(`${w.toLowerCase()} `) || t.endsWith(` ${w.toLowerCase()}`) || t === w.toLowerCase())) {
            reason = `Excluded word: "${w}"`;
            confidence = 85;
            break;
          }
        }
      }

      // High waste pattern (60% confidence) — 5+ clicks, 0 orders
      if (!reason && agg.clicks >= 5 && agg.orders === 0) {
        reason = `High waste: ${agg.clicks} clicks, 0 orders`;
        confidence = 60;
      }

      if (reason) {
        suggestions.push({
          term: agg.term,
          campaign_id: agg.campaign_id,
          campaign_name: agg.campaign_name,
          clicks: agg.clicks,
          cost: Number(agg.cost.toFixed(2)),
          orders: agg.orders,
          reason,
          confidence,
        });
        totalWasted += agg.cost;
      }
    }

    // Sort by confidence desc then cost desc
    suggestions.sort((a, b) => (b.confidence - a.confidence) || (b.cost - a.cost));

    res.json({
      total_wasted: Number(totalWasted.toFixed(2)),
      count: suggestions.length,
      rows: suggestions.slice(0, 500),
    });
  } catch (err: any) {
    console.error("GET /api/negatives/suggestions error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
