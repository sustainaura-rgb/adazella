import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";

export const campaignsRouter = Router();

// ────────────────────────────────────────────────
// Zod schemas — input validation for mutations
// ────────────────────────────────────────────────
const CampaignIdParamSchema = z.object({
  campaignId: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/, "Invalid campaign_id format"),
});

const StatusBodySchema = z.object({
  status: z.enum(["ENABLED", "PAUSED"]),
});

const BudgetBodySchema = z.object({
  budget: z.number().positive().max(100000, "Budget suspiciously high").finite(),
});

const DateRangeSchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search:     z.string().max(200).optional(),
});

// ────────────────────────────────────────────────
// Helper: assert campaign exists AND belongs to workspace
// (prevents IDOR — one user modifying another's campaign)
// ────────────────────────────────────────────────
async function assertCampaignOwnership(workspaceId: string, campaignId: string) {
  const { data, error } = await supabaseAdmin
    .from("campaigns")
    .select("campaign_id, workspace_id, campaign_name, status, daily_budget")
    .eq("workspace_id", workspaceId)
    .eq("campaign_id", campaignId)
    .single();
  if (error || !data) {
    return null;
  }
  return data;
}

// ────────────────────────────────────────────────
// Audit log helper
// ────────────────────────────────────────────────
async function writeAuditLog(
  workspaceId: string,
  userId: string,
  action: string,
  targetType: string,
  targetId: string,
  before: any,
  after: any
) {
  try {
    await supabaseAdmin.from("fetch_logs").insert({
      workspace_id: workspaceId,
      fetch_type: `audit:${action}`,
      status: "SUCCESS",
      records_fetched: 0,
      error_message: JSON.stringify({ user_id: userId, target_type: targetType, target_id: targetId, before, after }).slice(0, 1800),
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });
  } catch {
    // Audit log failure should never break the actual operation
  }
}

// ════════════════════════════════════════════════
// GET /api/campaigns?start_date&end_date&search
// ════════════════════════════════════════════════
campaignsRouter.get("/", async (req, res) => {
  try {
    const wsId = req.workspaceId;
    if (!wsId) return res.status(500).json({ error: "No workspace" });

    const parsed = DateRangeSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid query", detail: parsed.error.issues });

    const today = new Date().toISOString().slice(0, 10);
    const startDate = parsed.data.start_date || today;
    const endDate = parsed.data.end_date || today;
    const searchTerm = parsed.data.search?.toLowerCase() || "";

    // Fetch campaigns metadata
    const { data: campaigns, error: cErr } = await supabaseAdmin
      .from("campaigns")
      .select("campaign_id, campaign_name, campaign_type, status, serving_status, daily_budget, portfolio_id")
      .eq("workspace_id", wsId);
    if (cErr) throw cErr;

    // Fetch performance for the date range
    const { data: perf, error: pErr } = await supabaseAdmin
      .from("daily_performance")
      .select("campaign_id, impressions, clicks, cost, orders, sales")
      .eq("workspace_id", wsId)
      .gte("report_date", startDate)
      .lte("report_date", endDate);
    if (pErr) throw pErr;

    // Aggregate performance per campaign
    const perfMap = new Map<string, any>();
    for (const r of perf || []) {
      const existing = perfMap.get(r.campaign_id) || { impressions: 0, clicks: 0, cost: 0, orders: 0, sales: 0 };
      existing.impressions += Number(r.impressions || 0);
      existing.clicks      += Number(r.clicks || 0);
      existing.cost        += Number(r.cost || 0);
      existing.orders      += Number(r.orders || 0);
      existing.sales       += Number(r.sales || 0);
      perfMap.set(r.campaign_id, existing);
    }

    // Merge + filter
    let rows = (campaigns || []).map((c) => {
      const p = perfMap.get(c.campaign_id) || { impressions: 0, clicks: 0, cost: 0, orders: 0, sales: 0 };
      return {
        ...c,
        impressions: p.impressions,
        clicks: p.clicks,
        cost: Number(p.cost.toFixed(2)),
        orders: p.orders,
        sales: Number(p.sales.toFixed(2)),
        acos: p.sales > 0 ? Number((p.cost / p.sales * 100).toFixed(2)) : 0,
        ctr: p.impressions > 0 ? Number((p.clicks / p.impressions * 100).toFixed(3)) : 0,
        cpc: p.clicks > 0 ? Number((p.cost / p.clicks).toFixed(2)) : 0,
      };
    });

    if (searchTerm) {
      rows = rows.filter((c) => c.campaign_name.toLowerCase().includes(searchTerm));
    }

    rows.sort((a, b) => b.cost - a.cost);

    res.json({
      start_date: startDate,
      end_date: endDate,
      count: rows.length,
      campaigns: rows,
    });
  } catch (err: any) {
    console.error("GET /api/campaigns error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════════════
// PATCH /api/campaigns/:campaignId/status
// Security:
//  - Zod validates campaignId + body
//  - assertCampaignOwnership verifies campaign belongs to this workspace
//  - Audit log written with user_id before + after values
// ════════════════════════════════════════════════
campaignsRouter.patch("/:campaignId/status", async (req, res) => {
  try {
    const wsId = req.workspaceId;
    const userId = req.userId;
    if (!wsId || !userId) return res.status(500).json({ error: "No workspace" });

    const paramCheck = CampaignIdParamSchema.safeParse(req.params);
    if (!paramCheck.success) return res.status(400).json({ error: "Invalid campaign_id" });

    const bodyCheck = StatusBodySchema.safeParse(req.body);
    if (!bodyCheck.success) return res.status(400).json({ error: "Invalid body", detail: bodyCheck.error.issues });

    const { campaignId } = paramCheck.data;
    const { status } = bodyCheck.data;

    // IDOR protection — does this campaign belong to this workspace?
    const owned = await assertCampaignOwnership(wsId, campaignId);
    if (!owned) return res.status(404).json({ error: "Campaign not found" });

    // Update local DB first
    const { data: updated, error } = await supabaseAdmin
      .from("campaigns")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("workspace_id", wsId)
      .eq("campaign_id", campaignId)
      .select()
      .single();
    if (error) throw error;

    // TODO: if Amazon connection exists, propagate to Amazon Ads API
    // (left for future phase — with mock data, only local update matters)

    // Audit log
    await writeAuditLog(wsId, userId, "status_change", "campaign", campaignId,
      { status: owned.status || null }, { status });

    res.json({ campaign: updated });
  } catch (err: any) {
    console.error("PATCH /api/campaigns/:id/status error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════════════
// PATCH /api/campaigns/:campaignId/budget
// ════════════════════════════════════════════════
campaignsRouter.patch("/:campaignId/budget", async (req, res) => {
  try {
    const wsId = req.workspaceId;
    const userId = req.userId;
    if (!wsId || !userId) return res.status(500).json({ error: "No workspace" });

    const paramCheck = CampaignIdParamSchema.safeParse(req.params);
    if (!paramCheck.success) return res.status(400).json({ error: "Invalid campaign_id" });

    const bodyCheck = BudgetBodySchema.safeParse(req.body);
    if (!bodyCheck.success) return res.status(400).json({ error: "Invalid body", detail: bodyCheck.error.issues });

    const { campaignId } = paramCheck.data;
    const { budget } = bodyCheck.data;

    const owned = await assertCampaignOwnership(wsId, campaignId);
    if (!owned) return res.status(404).json({ error: "Campaign not found" });

    const { data: before } = await supabaseAdmin
      .from("campaigns")
      .select("daily_budget")
      .eq("workspace_id", wsId).eq("campaign_id", campaignId).single();

    const { data: updated, error } = await supabaseAdmin
      .from("campaigns")
      .update({ daily_budget: budget, updated_at: new Date().toISOString() })
      .eq("workspace_id", wsId)
      .eq("campaign_id", campaignId)
      .select()
      .single();
    if (error) throw error;

    await writeAuditLog(wsId, userId, "budget_change", "campaign", campaignId,
      { daily_budget: before?.daily_budget }, { daily_budget: budget });

    res.json({ campaign: updated });
  } catch (err: any) {
    console.error("PATCH /api/campaigns/:id/budget error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
