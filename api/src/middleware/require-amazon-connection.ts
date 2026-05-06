import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabase.js";

// Augment Request type
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      amazonProfileId?: string;
      amazonAccountName?: string | null;
    }
  }
}

/**
 * Middleware that requires the workspace to have at least ONE active Amazon connection.
 * If not, returns 412 Precondition Required so the frontend can prompt user to connect.
 *
 * Use on data routes that depend on having Amazon data (Overview, Campaigns, etc).
 * Skip on routes that work without Amazon (Settings, Profile).
 */
export async function requireAmazonConnection(req: Request, res: Response, next: NextFunction) {
  if (!req.workspaceId) {
    return res.status(500).json({ error: "No workspace context" });
  }

  const { data, error } = await supabaseAdmin
    .from("amazon_connections")
    .select("profile_id, account_name, status")
    .eq("workspace_id", req.workspaceId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[require-amazon-connection] DB error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }

  if (!data) {
    // 412 Precondition Required — frontend should redirect to connect flow
    return res.status(412).json({
      error: "Amazon Ads account not connected",
      action: "connect_amazon",
      message: "Please connect your Amazon Ads account before viewing this data",
    });
  }

  // Stash for use by downstream handlers
  req.amazonProfileId = data.profile_id;
  req.amazonAccountName = data.account_name;
  next();
}
