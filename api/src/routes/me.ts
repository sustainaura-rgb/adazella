import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase.js";

export const meRouter = Router();

// GET /api/me — current user + their workspace + Amazon connection status
meRouter.get("/", async (req, res) => {
  if (!req.userId || !req.workspaceId) return res.status(500).json({ error: "Missing auth context" });

  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("id, name, plan, trial_ends_at, target_acos, stripe_subscription_id")
    .eq("id", req.workspaceId)
    .single();

  const { data: conn } = await supabaseAdmin
    .from("amazon_connections")
    .select("id, profile_id, marketplace_id, account_name, status, last_fetch_at")
    .eq("workspace_id", req.workspaceId)
    .eq("status", "active")
    .maybeSingle();

  res.json({
    user: { id: req.userId, email: req.userEmail },
    workspace: ws,
    amazon_connection: conn,
  });
});
