import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";

export const searchTermsRouter = Router();

const QuerySchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  campaign_id: z.string().max(64).optional(),
  limit:      z.coerce.number().int().min(1).max(2000).default(500),
  sort:       z.enum(["clicks", "impressions", "cost", "orders", "sales"]).default("clicks"),
});

// ════════════════════════════════════════════════
// GET /api/search-terms
// Returns aggregated search terms across the date range.
// ════════════════════════════════════════════════
searchTermsRouter.get("/", async (req, res) => {
  try {
    const wsId = req.workspaceId;
    if (!wsId) return res.status(500).json({ error: "No workspace" });

    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid query", detail: parsed.error.issues });

    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
    const startDate = parsed.data.start_date || weekAgo;
    const endDate = parsed.data.end_date || today;

    let query = supabaseAdmin
      .from("search_term_performance")
      .select("campaign_id, campaign_name, ad_group_name, keyword, match_type, search_term, impressions, clicks, cost, orders, sales, add_to_cart")
      .eq("workspace_id", wsId)
      .gte("report_date", startDate)
      .lte("report_date", endDate);

    if (parsed.data.campaign_id) {
      query = query.eq("campaign_id", parsed.data.campaign_id);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Aggregate across date range by (search_term + campaign + keyword + match_type)
    const map = new Map<string, any>();
    for (const r of data || []) {
      const key = `${r.search_term}||${r.campaign_id}||${r.keyword}||${r.match_type}`;
      const existing = map.get(key) || {
        search_term: r.search_term,
        campaign_id: r.campaign_id,
        campaign_name: r.campaign_name,
        ad_group_name: r.ad_group_name,
        keyword: r.keyword,
        match_type: r.match_type,
        impressions: 0, clicks: 0, cost: 0, orders: 0, sales: 0, add_to_cart: 0,
      };
      existing.impressions += Number(r.impressions || 0);
      existing.clicks      += Number(r.clicks || 0);
      existing.cost        += Number(r.cost || 0);
      existing.orders      += Number(r.orders || 0);
      existing.sales       += Number(r.sales || 0);
      existing.add_to_cart += Number(r.add_to_cart || 0);
      map.set(key, existing);
    }

    const rows = Array.from(map.values()).map((r) => ({
      ...r,
      cost: Number(r.cost.toFixed(2)),
      sales: Number(r.sales.toFixed(2)),
      acos: r.sales > 0 ? Number((r.cost / r.sales * 100).toFixed(2)) : 0,
      ctr: r.impressions > 0 ? Number((r.clicks / r.impressions * 100).toFixed(3)) : 0,
      cpc: r.clicks > 0 ? Number((r.cost / r.clicks).toFixed(2)) : 0,
    }));

    // Sort by requested column, desc
    rows.sort((a, b) => Number(b[parsed.data.sort]) - Number(a[parsed.data.sort]));

    res.json({
      start_date: startDate,
      end_date: endDate,
      count: rows.length,
      rows: rows.slice(0, parsed.data.limit),
    });
  } catch (err: any) {
    console.error("GET /api/search-terms error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
