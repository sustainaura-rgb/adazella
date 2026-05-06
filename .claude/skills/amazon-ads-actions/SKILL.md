---
name: amazon-ads-actions
description: Patterns for WRITING to Amazon Ads API safely — bid changes, campaign status, negative keywords, budget updates. Use when implementing automation features. Read alongside automation-safety SKILL — every write must go through safety officer first.
---

# Amazon Ads Write Actions

This skill covers HOW to write to Amazon Ads. The `automation-safety` skill covers WHEN it's safe to.

## API endpoints reference

| Action | Endpoint | Method | Notes |
|---|---|---|---|
| Update campaign status | `/v2/sp/campaigns` | PUT | Pause / enable / archive |
| Update campaign budget | `/v2/sp/campaigns` | PUT | dailyBudget field |
| Update keyword bid | `/v2/sp/keywords` | PUT | bid field |
| Update keyword status | `/v2/sp/keywords` | PUT | state field |
| Add negative keyword | `/v2/sp/negativeKeywords` | POST | campaign or ad-group level |
| Add bulk operations | `/v2/sp/campaigns/extended` | PUT | for batch updates |

Required headers (same for all):
```
Authorization: Bearer <access_token>
Amazon-Advertising-API-ClientId: <our client id>
Amazon-Advertising-API-Scope: <profile_id>
Content-Type: application/json
```

## Pattern: Bid change

```ts
async function updateKeywordBid(
  workspaceId: string,
  profileId: string,
  keywordId: string,
  newBid: number
): Promise<{ success: boolean; error?: string }> {
  // 1. Validate input
  if (newBid <= 0 || newBid > 100) {
    return { success: false, error: "Bid out of safety range" };
  }

  // 2. Fetch fresh access token
  const accessToken = await getAccessToken(workspaceId, profileId);

  // 3. Make the API call
  try {
    const response = await axios.put(
      "https://advertising-api.amazon.com/v2/sp/keywords",
      [{ keywordId: parseInt(keywordId), bid: newBid }],
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Amazon-Advertising-API-ClientId": process.env.AMAZON_ADS_CLIENT_ID!,
          "Amazon-Advertising-API-Scope": profileId,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    // Amazon returns array of results — check each
    const result = response.data[0];
    if (result.code !== "SUCCESS") {
      return { success: false, error: `Amazon rejected: ${result.code} - ${result.description}` };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.response?.data?.message || err.message };
  }
}
```

## Pattern: Pause campaign

```ts
async function pauseCampaign(
  workspaceId: string,
  profileId: string,
  campaignId: string
): Promise<{ success: boolean; previousState?: string; error?: string }> {
  const accessToken = await getAccessToken(workspaceId, profileId);

  // Fetch current state first (for rollback)
  const currentRes = await axios.get(
    `https://advertising-api.amazon.com/v2/sp/campaigns/${campaignId}`,
    { headers: ... }
  );
  const previousState = currentRes.data.state;  // 'enabled' | 'paused' | 'archived'

  if (previousState === "paused") {
    return { success: true, previousState };  // already paused, no-op
  }

  // Apply pause
  const response = await axios.put(
    "https://advertising-api.amazon.com/v2/sp/campaigns",
    [{ campaignId: parseInt(campaignId), state: "paused" }],
    { headers: ... }
  );

  if (response.data[0].code !== "SUCCESS") {
    return { success: false, error: response.data[0].description };
  }

  return { success: true, previousState };  // store previousState in rollback_data
}
```

## Pattern: Add negative keywords (bulk)

```ts
async function addNegativeKeywords(
  workspaceId: string,
  profileId: string,
  campaignId: string,
  keywords: { keywordText: string; matchType: "negativeExact" | "negativePhrase" }[]
): Promise<{ success: boolean; addedIds: number[]; errors: string[] }> {
  const accessToken = await getAccessToken(workspaceId, profileId);

  const payload = keywords.map(k => ({
    campaignId: parseInt(campaignId),
    keywordText: k.keywordText,
    matchType: k.matchType,
    state: "enabled",
  }));

  const response = await axios.post(
    "https://advertising-api.amazon.com/v2/sp/negativeKeywords",
    payload,
    { headers: ... }
  );

  const addedIds: number[] = [];
  const errors: string[] = [];

  for (const result of response.data) {
    if (result.code === "SUCCESS") {
      addedIds.push(result.keywordId);
    } else {
      errors.push(`${result.keywordText}: ${result.description}`);
    }
  }

  return { success: errors.length === 0, addedIds, errors };
}
```

## Critical: Rate limits

Amazon Ads API enforces:
- ~2 requests/second per profile
- ~100 requests/minute total per app
- 429 response if exceeded

Always:
- Wait min 500ms between writes to same profile
- Use bulk endpoints when possible (1 request for 100 changes vs 100 requests)
- Implement exponential backoff on 429

```ts
const writeRateLimiter = pLimit(2);  // 2 concurrent writes max
async function rateLimitedWrite(fn: () => Promise<any>) {
  return writeRateLimiter(async () => {
    await sleep(500);  // 500ms between calls
    return fn();
  });
}
```

## Error codes from Amazon (handle these specifically)

| Code | Meaning | Action |
|---|---|---|
| `SUCCESS` | Action applied | Update DB to match |
| `RATE_LIMIT_EXCEEDED` | Too many requests | Backoff + retry once |
| `AUTHORIZATION_ERROR` | Token expired | Refresh token + retry |
| `VALIDATION_ERROR` | Invalid input | Don't retry, show user error |
| `NOT_FOUND` | Resource doesn't exist | Sync from Amazon, mark stale |
| `THROTTLED` | Account-level throttle | Defer for 5 minutes |
| `INTERNAL_ERROR` | Amazon down | Retry after backoff |

## Always update local DB AFTER successful API write

```ts
async function applyAndPersist(action: ProposedAction) {
  // 1. Call Amazon API
  const result = await callAmazonApi(action);
  
  if (!result.success) {
    // Log failure, do NOT update local DB
    await db.from("automation_executions").insert({
      ...action,
      status: "failed",
      error: result.error,
    });
    return result;
  }
  
  // 2. Update local DB to match Amazon's new state
  await db.from("campaigns")
    .update({ status: action.new_value, updated_at: new Date() })
    .eq("workspace_id", action.workspace_id)
    .eq("campaign_id", action.target_id);
  
  // 3. Audit log
  await writeAudit({
    workspaceId: action.workspace_id,
    userId: action.user_id,
    action: `automation.${action.type}`,
    targetType: action.target_type,
    targetId: action.target_id,
    before: { status: action.old_value },
    after: { status: action.new_value },
  });
  
  // 4. Mark automation as executed
  await db.from("pending_automations")
    .update({ executed_at: new Date() })
    .eq("id", action.id);
  
  return { success: true };
}
```

## Test mode (CRITICAL — always offer)

Before going live, customer should test in "dry-run mode":
```ts
async function executeAction(action: ProposedAction, dryRun = false) {
  if (dryRun) {
    // Don't actually call Amazon API
    return {
      success: true,
      dryRun: true,
      wouldHaveCalled: { url, method, body },
    };
  }
  // Real execution
  return await callAmazonApi(action);
}
```

UI shows: "🧪 Dry Run Result: This would update bid on keyword X from $1.50 to $2.10. No changes were made."

## Anti-patterns to avoid

- ❌ Writing to Amazon WITHOUT going through automation-safety-officer review
- ❌ Updating local DB before API call succeeds (creates drift)
- ❌ Not storing rollback data (no undo)
- ❌ Bulk actions without per-item error handling (one failure shouldn't break all)
- ❌ Real-time UI calls to Amazon Ads write API (slow, rate-limited — queue instead)
- ❌ Forgetting audit log
- ❌ Hardcoded retry without backoff (creates 429 storms)

## Useful Amazon Ads API docs

- Sponsored Products v3: https://advertising.amazon.com/API/docs/en-us/sponsored-products/3-0
- Amazon Ads API status: https://advertising.amazon.com/API/docs/en-us/status
- Rate limits: https://advertising.amazon.com/API/docs/en-us/getting-started/rate-limits
- Error codes: https://advertising.amazon.com/API/docs/en-us/reference/2/common
