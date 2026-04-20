import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";

export const overviewRouter = Router();

/**
 * GET /api/overview
 * Returns everything needed for the Overview dashboard page:
 *  - KPIs for the selected period (with comparison to previous period)
 *  - Daily trend for chart
 *  - Top campaigns by sales
 *  - Spend distribution by campaign
 *
 * Query params:
 *   - start_date, end_date (YYYY-MM-DD) — optional, defaults to last 7 days
 *   - days — alternate to start/end, e.g. ?days=30 (used for trend chart length)
 */
overviewRouter.get("/", async (req, res) => {
  try {
    const wsId = req.workspaceId;
    if (!wsId) return res.status(500).json({ error: "No workspace" });

    const today = new Date().toISOString().slice(0, 10);
    const days = Math.min(parseInt((req.query.days as string) || "", 10) || 30, 90);
    const startDate = (req.query.start_date as string) || today;
    const endDate = (req.query.end_date as string) || today;

    // Compute previous period bounds (same length, immediately before)
    const s = new Date(startDate + "T00:00:00Z");
    const e = new Date(endDate + "T00:00:00Z");
    const rangeDays = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
    const prevEnd = new Date(s.getTime() - 86400000).toISOString().slice(0, 10);
    const prevStart = new Date(s.getTime() - rangeDays * 86400000).toISOString().slice(0, 10);

    // KPI query (runs twice — current + previous)
    const kpiSelect = `
      impressions.sum(), clicks.sum(), cost.sum(), orders.sum(), sales.sum()
    `;

    // Current-period KPIs
    const { data: curData } = await supabaseAdmin
      .from("daily_performance")
      .select("impressions, clicks, cost, orders, sales")
      .eq("workspace_id", wsId)
      .gte("report_date", startDate)
      .lte("report_date", endDate);

    const { data: prevData } = await supabaseAdmin
      .from("daily_performance")
      .select("impressions, clicks, cost, orders, sales")
      .eq("workspace_id", wsId)
      .gte("report_date", prevStart)
      .lte("report_date", prevEnd);

    function aggregate(rows: any[] | null) {
      const r = rows || [];
      const sum = r.reduce(
        (a, x) => ({
          impressions: a.impressions + Number(x.impressions || 0),
          clicks: a.clicks + Number(x.clicks || 0),
          cost: a.cost + Number(x.cost || 0),
          orders: a.orders + Number(x.orders || 0),
          sales: a.sales + Number(x.sales || 0),
        }),
        { impressions: 0, clicks: 0, cost: 0, orders: 0, sales: 0 }
      );
      return {
        ...sum,
        acos: sum.sales > 0 ? (sum.cost / sum.sales) * 100 : 0,
        ctr: sum.impressions > 0 ? (sum.clicks / sum.impressions) * 100 : 0,
        cpc: sum.clicks > 0 ? sum.cost / sum.clicks : 0,
      };
    }

    // Daily trend (last N days from today)
    const trendStart = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
    const { data: trendData } = await supabaseAdmin
      .from("daily_performance")
      .select("report_date, impressions, clicks, cost, orders, sales")
      .eq("workspace_id", wsId)
      .gte("report_date", trendStart)
      .lte("report_date", today)
      .order("report_date", { ascending: true });

    // Group by date (since we may have multiple campaigns per day)
    const trendMap = new Map<string, any>();
    for (const row of trendData || []) {
      const key = row.report_date;
      const existing = trendMap.get(key) || { date: key, impressions: 0, clicks: 0, cost: 0, orders: 0, sales: 0 };
      existing.impressions += Number(row.impressions || 0);
      existing.clicks += Number(row.clicks || 0);
      existing.cost += Number(row.cost || 0);
      existing.orders += Number(row.orders || 0);
      existing.sales += Number(row.sales || 0);
      trendMap.set(key, existing);
    }
    const trend = Array.from(trendMap.values()).map((t) => ({
      ...t,
      cost: Number(t.cost.toFixed(2)),
      sales: Number(t.sales.toFixed(2)),
      acos: t.sales > 0 ? Number((t.cost / t.sales * 100).toFixed(2)) : 0,
    }));

    // Top 10 campaigns by sales in current period
    const { data: campaignData } = await supabaseAdmin
      .from("daily_performance")
      .select("campaign_id, impressions, clicks, cost, orders, sales")
      .eq("workspace_id", wsId)
      .gte("report_date", startDate)
      .lte("report_date", endDate);

    const campMap = new Map<string, any>();
    for (const row of campaignData || []) {
      const key = row.campaign_id;
      const existing = campMap.get(key) || { campaign_id: key, impressions: 0, clicks: 0, cost: 0, orders: 0, sales: 0 };
      existing.impressions += Number(row.impressions || 0);
      existing.clicks += Number(row.clicks || 0);
      existing.cost += Number(row.cost || 0);
      existing.orders += Number(row.orders || 0);
      existing.sales += Number(row.sales || 0);
      campMap.set(key, existing);
    }

    // Enrich with campaign_name + status from campaigns table
    const campIds = Array.from(campMap.keys());
    const { data: campaignMeta } = campIds.length > 0
      ? await supabaseAdmin
          .from("campaigns")
          .select("campaign_id, campaign_name, status")
          .eq("workspace_id", wsId)
          .in("campaign_id", campIds)
      : { data: [] };

    const metaMap = new Map((campaignMeta || []).map((m) => [m.campaign_id, m]));
    const allCampaigns = Array.from(campMap.values()).map((c) => ({
      ...c,
      campaign_name: metaMap.get(c.campaign_id)?.campaign_name || "Unknown",
      status: metaMap.get(c.campaign_id)?.status || "UNKNOWN",
      cost: Number(c.cost.toFixed(2)),
      sales: Number(c.sales.toFixed(2)),
      acos: c.sales > 0 ? Number((c.cost / c.sales * 100).toFixed(2)) : 0,
    }));

    const topCampaigns = [...allCampaigns]
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 10);

    const spendDistribution = [...allCampaigns]
      .filter((c) => c.cost > 0)
      .sort((a, b) => b.cost - a.cost)
      .map((c) => ({ name: c.campaign_name, cost: c.cost }));

    res.json({
      start_date: startDate,
      end_date: endDate,
      prev_start_date: prevStart,
      prev_end_date: prevEnd,
      today: aggregate(curData),
      yesterday: aggregate(prevData),  // "yesterday" is legacy name; actually previous period
      trend,
      top_campaigns: topCampaigns,
      spend_distribution: spendDistribution,
    });
  } catch (err: any) {
    console.error("GET /api/overview error:", err);
    res.status(500).json({ error: "Internal server error", detail: err.message });
  }
});

/**
 * GET /api/alerts
 * Auto-generated notifications: out-of-budget campaigns, high ACoS, wasted spend, etc.
 */
overviewRouter.get("/alerts", async (req, res) => {
  try {
    const wsId = req.workspaceId;
    if (!wsId) return res.status(500).json({ error: "No workspace" });

    const today = new Date().toISOString().slice(0, 10);
    const alerts: { type: string; icon: string; message: string }[] = [];

    // 1. Campaigns out of budget
    const { data: oob } = await supabaseAdmin
      .from("campaigns")
      .select("campaign_name")
      .eq("workspace_id", wsId)
      .eq("status", "ENABLED")
      .ilike("serving_status", "%OUT_OF_BUDGET%");

    for (const r of oob || []) {
      alerts.push({
        type: "warning",
        icon: "budget",
        message: `${r.campaign_name} ran out of daily budget.`,
      });
    }

    // 2. Campaigns with high ACoS today (>50%)
    const { data: highAcos } = await supabaseAdmin
      .from("daily_performance")
      .select("campaign_id, acos, cost")
      .eq("workspace_id", wsId)
      .eq("report_date", today)
      .gt("acos", 50)
      .gt("cost", 1)
      .order("acos", { ascending: false })
      .limit(5);

    if ((highAcos || []).length > 0) {
      const cids = (highAcos || []).map((r) => r.campaign_id);
      const { data: names } = await supabaseAdmin
        .from("campaigns")
        .select("campaign_id, campaign_name")
        .eq("workspace_id", wsId)
        .in("campaign_id", cids);
      const nameMap = new Map((names || []).map((n) => [n.campaign_id, n.campaign_name]));
      for (const r of highAcos || []) {
        alerts.push({
          type: "warning",
          icon: "acos",
          message: `${nameMap.get(r.campaign_id) || "Campaign"} has ${Number(r.acos).toFixed(1)}% ACoS today.`,
        });
      }
    }

    // 3. Search terms with $5+ spend and 0 orders today (waste)
    const { data: waste } = await supabaseAdmin
      .from("search_term_performance")
      .select("search_term, cost, clicks")
      .eq("workspace_id", wsId)
      .eq("report_date", today)
      .eq("orders", 0)
      .gt("cost", 5)
      .order("cost", { ascending: false })
      .limit(5);

    for (const r of waste || []) {
      alerts.push({
        type: "danger",
        icon: "waste",
        message: `"${r.search_term}" spent $${Number(r.cost).toFixed(2)} with 0 orders today.`,
      });
    }

    res.json({ alerts, generated_at: new Date().toISOString() });
  } catch (err: any) {
    console.error("GET /api/alerts error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
