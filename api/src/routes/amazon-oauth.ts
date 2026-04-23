import { Router, Request, Response } from "express";
import axios from "axios";
import crypto from "crypto";
import { supabaseAdmin } from "../lib/supabase.js";
import { encryptOrPassThrough } from "../lib/crypto.js";
import { writeAudit } from "../lib/audit.js";
import { requireAuth } from "../middleware/auth.js";

export const amazonOAuthRouter = Router();

// State tokens — short-lived map of state → userId to prevent CSRF
// In production use Redis; for now in-memory is fine for low volume.
const stateStore = new Map<string, { userId: string; workspaceId: string; exp: number }>();

// Clean up expired states every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of stateStore) if (v.exp < now) stateStore.delete(k);
}, 5 * 60 * 1000);

const AMAZON_AUTHORIZE_URL = "https://www.amazon.com/ap/oa";
const AMAZON_TOKEN_URL = "https://api.amazon.com/auth/o2/token";
const SCOPE = "advertising::campaign_management";

// GET /api/oauth/amazon/start — returns URL to redirect user to Amazon
amazonOAuthRouter.get("/start", requireAuth, (req, res) => {
  if (!req.userId || !req.workspaceId) return res.status(500).json({ error: "Missing auth" });

  const state = crypto.randomBytes(32).toString("hex");
  stateStore.set(state, {
    userId: req.userId,
    workspaceId: req.workspaceId,
    exp: Date.now() + 10 * 60 * 1000, // 10 min
  });

  const params = new URLSearchParams({
    client_id: process.env.AMAZON_ADS_CLIENT_ID!,
    scope: SCOPE,
    response_type: "code",
    redirect_uri: process.env.AMAZON_ADS_REDIRECT_URI!,
    state,
  });

  res.json({ url: `${AMAZON_AUTHORIZE_URL}?${params.toString()}` });
});

// Shared callback handler — can be mounted at ANY path matching the LWA profile's
// Allowed Return URL (e.g. "/callback" or "/api/oauth/amazon/callback").
export async function amazonOAuthCallback(req: Request, res: Response) {
  const { code, state, error } = req.query as Record<string, string>;

  const frontend = process.env.FRONTEND_URL || "http://localhost:5173";

  if (error) {
    return res.redirect(`${frontend}/dashboard?amazon_error=${encodeURIComponent(error)}`);
  }
  if (!code || !state) {
    return res.redirect(`${frontend}/dashboard?amazon_error=missing_params`);
  }

  const stateData = stateStore.get(state);
  if (!stateData) {
    return res.redirect(`${frontend}/dashboard?amazon_error=invalid_state`);
  }
  stateStore.delete(state);

  try {
    // Exchange code for tokens
    const tokenRes = await axios.post(AMAZON_TOKEN_URL, new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.AMAZON_ADS_REDIRECT_URI!,
      client_id: process.env.AMAZON_ADS_CLIENT_ID!,
      client_secret: process.env.AMAZON_ADS_CLIENT_SECRET!,
    }).toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const { access_token, refresh_token, expires_in } = tokenRes.data;

    // Fetch Amazon Ads profiles (user may have multiple marketplace profiles)
    const profilesRes = await axios.get("https://advertising-api.amazon.com/v2/profiles", {
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Amazon-Advertising-API-ClientId": process.env.AMAZON_ADS_CLIENT_ID!,
      },
    });

    const profiles: any[] = profilesRes.data;
    if (!profiles.length) {
      return res.redirect(`${frontend}/dashboard?amazon_error=no_profiles`);
    }

    // Store connection for each profile. Tokens encrypted at-rest with AES-256-GCM
    // (format: "enc:v1:..."). Python scheduler decrypts using the same DB_ENCRYPTION_KEY.
    const encryptedRefresh = encryptOrPassThrough(refresh_token);
    const encryptedAccess  = encryptOrPassThrough(access_token);
    for (const p of profiles) {
      await supabaseAdmin.from("amazon_connections").upsert({
        workspace_id: stateData.workspaceId,
        profile_id: String(p.profileId),
        marketplace_id: p.accountInfo?.marketplaceStringId || "",
        account_name: p.accountInfo?.name || null,
        country_code: p.countryCode || null,
        currency_code: p.currencyCode || null,
        refresh_token: encryptedRefresh,
        access_token: encryptedAccess,
        access_token_expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
        status: "active",
      }, { onConflict: "workspace_id,profile_id" });
    }

    // Audit log — record the Amazon connect event (no token values in log)
    await writeAudit({
      workspaceId: stateData.workspaceId,
      userId: stateData.userId,
      action: "amazon.connect",
      targetType: "amazon_connection",
      targetId: profiles.map(p => String(p.profileId)).join(","),
      after: { profile_count: profiles.length, account_names: profiles.map(p => p.accountInfo?.name).filter(Boolean) },
      req,
    });

    res.redirect(`${frontend}/dashboard?amazon_connected=1`);
  } catch (err: any) {
    console.error("Amazon OAuth exchange failed:", err.response?.data || err.message);
    res.redirect(`${frontend}/dashboard?amazon_error=token_exchange_failed`);
  }
}

// Also expose at /api/oauth/amazon/callback for backward compatibility
amazonOAuthRouter.get("/callback", amazonOAuthCallback);

// POST /api/oauth/amazon/disconnect
amazonOAuthRouter.post("/disconnect", requireAuth, async (req, res) => {
  if (!req.workspaceId || !req.userId) return res.status(500).json({ error: "No workspace" });
  await supabaseAdmin
    .from("amazon_connections")
    .update({ status: "disconnected" })
    .eq("workspace_id", req.workspaceId);
  await writeAudit({
    workspaceId: req.workspaceId,
    userId: req.userId,
    action: "amazon.disconnect",
    targetType: "amazon_connection",
    req,
  });
  res.json({ status: "disconnected" });
});
