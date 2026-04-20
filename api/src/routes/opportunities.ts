import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";

export const opportunitiesRouter = Router();

const BaseQuery = z.object({
  days:  z.coerce.number().int().min(1).max(180).default(30),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});

// ════════════════════════════════════════════════════
// GET /api/opportunities/harvest
// Search terms driving orders but NOT already in the keyword list.
// → Recommend adding as EXACT match for bid control.
// ════════════════════════════════════════════════════
const HarvestQuery = BaseQuery.extend({
  min_orders: z.coerce.number().int().min(1).max(50).default(1),
});

opportunitiesRouter.get("/harvest", async (req, res) => {
  try {
    const wsId = req.workspaceId;
    if (!wsId) return res.status(500).json({ error: "No workspace" });
    const parsed = HarvestQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid query" });
    const { days, limit, min_orders } = parsed.data;
    const windowStart = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

    // Aggregate search terms
    const { data: terms } = await supabaseAdmin
      .from("search_term_performance")
      .select("search_term, campaign_id, campaign_name, impressions, clicks, cost, orders, sales")
      .eq("workspace_id", wsId)
      .gte("report_date", windowStart);

    const agg = new Map<string, any>();
    for (const r of terms || []) {
      const key = (r.search_term || "").toLowerCase().trim();
      if (!key) continue;
      const ex = agg.get(key) || {
        term: key, campaign_id: r.campaign_id, campaign_name: r.campaign_name,
        impressions: 0, clicks: 0, cost: 0, orders: 0, sales: 0,
      };
      ex.impressions += Number(r.impressions || 0);
      ex.clicks      += Number(r.clicks || 0);
      ex.cost        += Number(r.cost || 0);
      ex.orders      += Number(r.orders || 0);
      ex.sales       += Number(r.sales || 0);
      agg.set(key, ex);
    }

    // Existing EXACT keywords (so we don't suggest adding what's already there)
    const { data: keywords } = await supabaseAdmin
      .from("campaign_keywords")
      .select("keyword_text")
      .eq("workspace_id", wsId)
      .eq("state", "ENABLED")
      .eq("match_type", "EXACT");
    const existingExact = new Set((keywords || []).map((k) => (k.keyword_text || "").toLowerCase().trim()));

    // Existing negatives (exclude these too)
    const { data: negs } = await supabaseAdmin
      .from("campaign_negative_keywords")
      .select("keyword_text")
      .eq("workspace_id", wsId)
      .eq("state", "ENABLED");
    const negSet = new Set((negs || []).map((n) => (n.keyword_text || "").toLowerCase().trim()));

    // Filter: orders >= min_orders, not in existing exact, not in negatives
    const rows = Array.from(agg.values())
      .filter((a) => a.orders >= min_orders)
      .filter((a) => !existingExact.has(a.term))
      .filter((a) => !negSet.has(a.term))
      .map((a) => ({
        term: a.term,
        campaign_id: a.campaign_id,
        campaign_name: a.campaign_name,
        impressions: a.impressions,
        clicks: a.clicks,
        cost: Number(a.cost.toFixed(2)),
        orders: a.orders,
        sales: Number(a.sales.toFixed(2)),
        acos: a.sales > 0 ? Number((a.cost / a.sales * 100).toFixed(2)) : 0,
        avg_cpc: a.clicks > 0 ? Number((a.cost / a.clicks).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.sales - a.sales || b.orders - a.orders)
      .slice(0, limit);

    res.json({ days, count: rows.length, rows });
  } catch (err: any) {
    console.error("GET /api/opportunities/harvest error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════════════════
// GET /api/opportunities/negatives
// Search terms with clicks but 0 orders → waste → suggest adding as negative
// ════════════════════════════════════════════════════
const NegOpQuery = BaseQuery.extend({
  min_clicks: z.coerce.number().int().min(1).max(50).default(5),
});

opportunitiesRouter.get("/negatives", async (req, res) => {
  try {
    const wsId = req.workspaceId;
    if (!wsId) return res.status(500).json({ error: "No workspace" });
    const parsed = NegOpQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid query" });
    const { days, limit, min_clicks } = parsed.data;
    const windowStart = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

    const { data: terms } = await supabaseAdmin
      .from("search_term_performance")
      .select("search_term, campaign_id, campaign_name, impressions, clicks, cost, orders, sales")
      .eq("workspace_id", wsId)
      .gte("report_date", windowStart);

    const agg = new Map<string, any>();
    for (const r of terms || []) {
      const key = (r.search_term || "").toLowerCase().trim();
      if (!key) continue;
      const ex = agg.get(key) || {
        term: key, campaign_id: r.campaign_id, campaign_name: r.campaign_name,
        impressions: 0, clicks: 0, cost: 0, orders: 0, sales: 0,
      };
      ex.impressions += Number(r.impressions || 0);
      ex.clicks      += Number(r.clicks || 0);
      ex.cost        += Number(r.cost || 0);
      ex.orders      += Number(r.orders || 0);
      ex.sales       += Number(r.sales || 0);
      agg.set(key, ex);
    }

    const { data: negs } = await supabaseAdmin
      .from("campaign_negative_keywords")
      .select("keyword_text")
      .eq("workspace_id", wsId)
      .eq("state", "ENABLED");
    const negSet = new Set((negs || []).map((n) => (n.keyword_text || "").toLowerCase().trim()));

    const rows = Array.from(agg.values())
      .filter((a) => a.clicks >= min_clicks)
      .filter((a) => a.orders === 0)
      .filter((a) => !negSet.has(a.term))
      .map((a) => ({
        term: a.term,
        campaign_id: a.campaign_id,
        campaign_name: a.campaign_name,
        impressions: a.impressions,
        clicks: a.clicks,
        cost: Number(a.cost.toFixed(2)),
      }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, limit);

    res.json({ days, count: rows.length, rows });
  } catch (err: any) {
    console.error("GET /api/opportunities/negatives error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════════════════
// GET /api/opportunities/upgrades
// Broad/phrase keywords with good performance → suggest adding as EXACT
// ════════════════════════════════════════════════════
const UpgradeQuery = BaseQuery.extend({
  min_orders: z.coerce.number().int().min(1).max(50).default(2),
});

opportunitiesRouter.get("/upgrades", async (req, res) => {
  try {
    const wsId = req.workspaceId;
    if (!wsId) return res.status(500).json({ error: "No workspace" });
    const parsed = UpgradeQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid query" });
    const { days, limit, min_orders } = parsed.data;
    const windowStart = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

    // Find broad/phrase keywords that are driving orders
    const { data: stpRows } = await supabaseAdmin
      .from("search_term_performance")
      .select("keyword, match_type, campaign_id, campaign_name, impressions, clicks, cost, orders, sales")
      .eq("workspace_id", wsId)
      .gte("report_date", windowStart)
      .in("match_type", ["BROAD", "PHRASE"]);

    const agg = new Map<string, any>();
    for (const r of stpRows || []) {
      const kw = (r.keyword || "").toLowerCase().trim();
      if (!kw) continue;
      const key = `${kw}||${r.match_type}||${r.campaign_id}`;
      const ex = agg.get(key) || {
        keyword: kw, match_type: r.match_type,
        campaign_id: r.campaign_id, campaign_name: r.campaign_name,
        impressions: 0, clicks: 0, cost: 0, orders: 0, sales: 0,
      };
      ex.impressions += Number(r.impressions || 0);
      ex.clicks      += Number(r.clicks || 0);
      ex.cost        += Number(r.cost || 0);
      ex.orders      += Number(r.orders || 0);
      ex.sales       += Number(r.sales || 0);
      agg.set(key, ex);
    }

    // Exclude keywords already in EXACT
    const { data: keywords } = await supabaseAdmin
      .from("campaign_keywords")
      .select("keyword_text")
      .eq("workspace_id", wsId)
      .eq("match_type", "EXACT")
      .eq("state", "ENABLED");
    const existingExact = new Set((keywords || []).map((k) => (k.keyword_text || "").toLowerCase().trim()));

    const rows = Array.from(agg.values())
      .filter((a) => a.orders >= min_orders)
      .filter((a) => !existingExact.has(a.keyword))
      .map((a) => ({
        keyword: a.keyword,
        current_match_type: a.match_type,
        campaign_id: a.campaign_id,
        campaign_name: a.campaign_name,
        impressions: a.impressions,
        clicks: a.clicks,
        cost: Number(a.cost.toFixed(2)),
        orders: a.orders,
        sales: Number(a.sales.toFixed(2)),
        acos: a.sales > 0 ? Number((a.cost / a.sales * 100).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.orders - a.orders || b.sales - a.sales)
      .slice(0, limit);

    res.json({ days, count: rows.length, rows });
  } catch (err: any) {
    console.error("GET /api/opportunities/upgrades error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
