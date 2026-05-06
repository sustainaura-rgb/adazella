---
name: automation-safety
description: Patterns for SAFELY automating Amazon Ads actions — approval workflows, spending caps, sanity checks, reversibility, audit trails. Use when designing any feature that writes to Amazon Ads (bid changes, pauses, negatives, budget adjustments). Read alongside automation-safety-officer agent.
---

# Automation Safety Patterns

The single biggest risk for an AI-powered Amazon Ads SaaS: **a buggy automation costs a customer money**. This skill documents the patterns that prevent that.

## Core principles

1. **Default to human-in-the-loop** — first 30 days, ALL actions need approval
2. **Reversibility above efficiency** — every action stores undo data
3. **Limits everywhere** — caps on magnitude, frequency, scope
4. **Audit everything** — never trust automation logs from production
5. **Fail closed** — when in doubt, refuse to act

## The approval workflow pattern (recommended for ALL automations initially)

```
ml-agent generates suggestion
    ↓
automation-safety-officer reviews
    ↓
verdict?
├── APPROVE → execute via api-agent → audit log → notify user
├── ESCALATE → save to agent_insights table → user sees card → user decides
└── REJECT → log warning + reason → notify user (passive)
```

### DB schema for pending automations

```sql
CREATE TABLE pending_automations (
    id BIGSERIAL PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    proposed_by TEXT NOT NULL,           -- 'ml-agent.ppc_waste_detector'
    action_type TEXT NOT NULL,           -- 'bid_change', 'pause_campaign', etc.
    target_type TEXT NOT NULL,           -- 'campaign', 'keyword', 'campaign_bulk'
    target_ids JSONB NOT NULL,           -- array of affected resource IDs
    proposed_change JSONB NOT NULL,      -- { from: ..., to: ... }
    estimated_impact JSONB,              -- { revenue_delta_usd: +12, confidence: 0.85 }
    safety_verdict TEXT,                 -- APPROVE / ESCALATE_TO_USER / REJECT
    safety_reasoning TEXT,
    user_decision TEXT,                  -- APPROVED / REJECTED / SKIPPED / NULL
    user_decided_at TIMESTAMPTZ,
    executed_at TIMESTAMPTZ,
    rollback_data JSONB,                 -- enough to undo
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Reversibility pattern

Every automation MUST store enough data to undo it within 24h.

### Example: bid change
```ts
async function proposeBidChange(keywordId: string, oldBid: number, newBid: number) {
  return await db.from("pending_automations").insert({
    action_type: "bid_change",
    target_type: "keyword",
    target_ids: [keywordId],
    proposed_change: { from: oldBid, to: newBid },
    rollback_data: { keyword_id: keywordId, restore_bid: oldBid },
    // ...
  });
}

// Undo function — works for 24h
async function rollbackAutomation(automationId: string) {
  const { data } = await db.from("pending_automations")
    .select("*")
    .eq("id", automationId)
    .eq("user_decision", "APPROVED")
    .gt("executed_at", new Date(Date.now() - 86400000).toISOString())  // within 24h
    .single();
  
  if (!data) throw new Error("Automation not found or out of rollback window");
  
  // Apply the rollback
  if (data.action_type === "bid_change") {
    await applyBidChange(data.rollback_data.keyword_id, data.rollback_data.restore_bid);
  }
  // ... other action types ...
  
  await db.from("automation_rollbacks").insert({
    original_automation_id: automationId,
    rolled_back_at: new Date(),
  });
}
```

## Spending cap pattern

Every workspace has a "max acceptable change" customers configure during onboarding:

```sql
ALTER TABLE workspaces ADD COLUMN automation_settings JSONB DEFAULT '{
  "auto_apply_threshold": "review",  -- "review" | "low" | "medium" | "high"
  "max_daily_budget_change_usd": 50,
  "max_bid_change_percent": 25,
  "max_actions_per_day": 20,
  "require_approval_above_usd": 10
}'::jsonb;
```

Before ANY automation:
```python
def is_within_caps(workspace, proposed):
    settings = workspace.automation_settings
    
    if proposed.estimated_impact_usd > settings["require_approval_above_usd"]:
        return False  # Will need ESCALATE
    
    if proposed.action_type == "budget_change":
        delta = abs(proposed.new_value - proposed.old_value)
        if delta > settings["max_daily_budget_change_usd"]:
            return False
    
    if proposed.action_type == "bid_change":
        pct_change = abs(proposed.new_value - proposed.old_value) / proposed.old_value
        if pct_change > settings["max_bid_change_percent"] / 100:
            return False
    
    return True
```

## Daily quota pattern

```sql
CREATE OR REPLACE VIEW automation_quota_used AS
SELECT 
    workspace_id,
    DATE(executed_at) AS day,
    COUNT(*) AS actions_today
FROM pending_automations
WHERE executed_at >= CURRENT_DATE
  AND user_decision = 'APPROVED'
GROUP BY workspace_id, DATE(executed_at);
```

Before executing:
```ts
const { data } = await db.from("automation_quota_used")
  .select("actions_today")
  .eq("workspace_id", workspaceId)
  .eq("day", today)
  .single();

const used = data?.actions_today || 0;
const cap = TIER_QUOTAS[workspace.tier];

if (used >= cap) {
  return { verdict: "REJECT", reason: "Daily automation quota reached" };
}
```

## Audit trail pattern (CRITICAL — store EVERYTHING)

For every automation, log:
- Who proposed (ml-agent name + version)
- What was proposed (full state diff)
- Why (reasoning text from LLM)
- Safety verdict + reasoning
- User decision + timestamp
- Execution result (success / API error / partial)
- Result metrics (after 24h, did the change actually help?)

```sql
INSERT INTO audit_logs (
    workspace_id, user_id, action,
    target_type, target_id,
    before_value, after_value,
    request_id  -- so we can trace back
) VALUES (...);
```

## Sanity check examples

These are the absolute "never auto-approve" rules:

```python
ABSOLUTE_REJECTS = [
    # Bid changes
    lambda a: a.type == "bid_change" and a.new_value > 100,  # bid > $100
    lambda a: a.type == "bid_change" and a.new_value <= 0,   # bid <= 0
    lambda a: a.type == "bid_change" and (a.new_value / max(a.old_value, 0.01)) > 10,  # 10x change
    
    # Budget changes
    lambda a: a.type == "budget_change" and a.new_value > 10000,  # daily > $10k
    lambda a: a.type == "budget_change" and a.new_value < 0,
    
    # Bulk actions
    lambda a: a.type.endswith("_bulk") and len(a.target_ids) > 100,
    
    # Pause/archive on profitable campaigns
    lambda a: a.type == "pause_campaign" and a.target.last_30d_acos < 25,  # ACoS < 25% = profitable
]
```

## "Review mode" vs "Auto mode" UI

```
Settings → Automation Mode

🛡️ Review Mode (recommended for first 30 days)
   - All AI suggestions appear as cards
   - You approve each one before it applies
   - Safest option

⚡ Smart Auto Mode
   - Small changes (< 20%) apply automatically
   - Larger changes still require approval
   - Recommended after 30 days

🚀 Full Auto Mode (advanced, with caps)
   - All changes within your configured caps apply automatically
   - Email summary at end of day
   - Use only if you trust your caps
```

## Customer onboarding flow

First time using automation features, force user through:

1. **Welcome screen**: explain risks honestly
2. **Set caps**: max bid change %, max budget change $, daily action limit
3. **Set mode**: review (default) / smart-auto / full-auto
4. **Acknowledge**: "I understand Adazella may make mistakes; I'll review the audit log weekly"

## Insurance + ToS implications

Your Terms of Service MUST include:
- Liability cap (typically 12 months of fees)
- "Use at your own risk for automation features"
- Customer responsible for setting their own caps
- Adazella not liable for ad spend resulting from automated actions

When you have $5k+ MRR, get E&O (Errors & Omissions) insurance — $100-200/mo, covers automation mistakes.

## When to push back

Reject any feature request that says:
- "Auto-pause all underperforming campaigns" (without thresholds)
- "Auto-rebalance budget across campaigns" (cascading effects)
- "AI takes over completely" (defeats trust)
- "Give the AI a budget to spend on its own" (regulatory + insurance nightmare)

You can always ENABLE these later. You can NEVER undo a customer trust loss.

Ship safety first. Ship speed second.
