import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";

export const profileRouter = Router();

const ProfileBodySchema = z.object({
  include_keywords:  z.array(z.string().max(80)).max(200).optional(),
  exclude_keywords:  z.array(z.string().max(80)).max(200).optional(),
  competitor_brands: z.array(z.string().max(80)).max(200).optional(),
  target_acos:       z.number().min(1).max(200).optional(),
  notes:             z.string().max(2000).optional(),
});

// ── GET /api/profile ──
profileRouter.get("/", async (req, res) => {
  try {
    const wsId = req.workspaceId;
    if (!wsId) return res.status(500).json({ error: "No workspace" });

    const { data } = await supabaseAdmin
      .from("product_profiles")
      .select("*")
      .eq("workspace_id", wsId)
      .maybeSingle();

    const { data: ws } = await supabaseAdmin
      .from("workspaces")
      .select("target_acos")
      .eq("id", wsId)
      .single();

    res.json({
      workspace_id: wsId,
      include_keywords: data?.include_keywords || [],
      exclude_keywords: data?.exclude_keywords || [],
      competitor_brands: data?.competitor_brands || [],
      notes: data?.notes || null,
      target_acos: ws?.target_acos || 25,
    });
  } catch (err: any) {
    console.error("GET /api/profile error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUT /api/profile ──
profileRouter.put("/", async (req, res) => {
  try {
    const wsId = req.workspaceId;
    if (!wsId) return res.status(500).json({ error: "No workspace" });

    const parsed = ProfileBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid body", detail: parsed.error.issues });

    const clean = (arr?: string[]) => arr
      ? [...new Set(arr.map((s) => s.trim().toLowerCase()).filter(Boolean))]
      : undefined;

    const { include_keywords, exclude_keywords, competitor_brands, notes, target_acos } = parsed.data;

    // Upsert profile
    await supabaseAdmin.from("product_profiles").upsert({
      workspace_id: wsId,
      include_keywords:  clean(include_keywords)  ?? [],
      exclude_keywords:  clean(exclude_keywords)  ?? [],
      competitor_brands: clean(competitor_brands) ?? [],
      notes: notes || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_id" });

    // Update workspace target_acos separately
    if (target_acos !== undefined) {
      await supabaseAdmin.from("workspaces")
        .update({ target_acos, updated_at: new Date().toISOString() })
        .eq("id", wsId);
    }

    // Return updated
    const { data } = await supabaseAdmin
      .from("product_profiles")
      .select("*")
      .eq("workspace_id", wsId)
      .single();

    res.json({ ...data, target_acos });
  } catch (err: any) {
    console.error("PUT /api/profile error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
