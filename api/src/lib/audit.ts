import type { Request } from "express";
import { supabaseAdmin } from "./supabase.js";

// Writes a row to the audit_logs table. Designed to NEVER throw — audit log
// failure should never break the user's actual operation. Catches + logs error
// server-side (via our scrubbed console) and returns.

export interface AuditParams {
  workspaceId: string;
  userId: string | null | undefined;
  action: string;                  // e.g. "campaign.budget_change", "amazon.connect"
  targetType?: string | null;      // e.g. "campaign"
  targetId?: string | null;        // e.g. "123456789"
  before?: unknown;                // any JSON-serializable value
  after?: unknown;
  req?: Request;                   // if passed, we pick up IP + user-agent + requestId
}

export async function writeAudit(p: AuditParams): Promise<void> {
  try {
    await supabaseAdmin.from("audit_logs").insert({
      workspace_id: p.workspaceId,
      user_id: p.userId || null,
      action: p.action,
      target_type: p.targetType || null,
      target_id: p.targetId || null,
      before_value: p.before ?? null,
      after_value: p.after ?? null,
      ip: p.req?.ip || null,
      user_agent: p.req?.headers?.["user-agent"] ? String(p.req.headers["user-agent"]).slice(0, 512) : null,
      request_id: (p.req as any)?.requestId || null,
    });
  } catch (err: any) {
    console.error("[audit] write failed:", err?.message || err);
  }
}
