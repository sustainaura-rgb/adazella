import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabase.js";

// Augment Request with user info after auth succeeds
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
      workspaceId?: string;
      accessToken?: string;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing auth token" });
  }

  const token = authHeader.slice(7);
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: "Invalid token" });
  }

  req.userId = data.user.id;
  req.userEmail = data.user.email;
  req.accessToken = token;

  // Load user's default (owned) workspace — for now, first one
  const { data: ws } = await supabaseAdmin
    .from("workspaces")
    .select("id")
    .eq("owner_user_id", data.user.id)
    .limit(1)
    .single();
  if (ws) req.workspaceId = ws.id;

  next();
}
