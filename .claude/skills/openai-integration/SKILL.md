---
name: openai-integration
description: OpenAI API patterns — model choice, prompt engineering, cost optimization, structured output, error handling. Use when integrating GPT-4o for AI features (PPC Waste Detector, Listing Doctor, Bid Optimizer). Covers Node.js + Python clients.
---

# OpenAI Integration for Adazella AI Features

## Account setup
- API key from https://platform.openai.com/api-keys
- Add billing alerts ($20, $50, $100)
- Enable usage limits in account settings (failsafe)
- Store key in Render env (now) → AWS Secrets Manager (post-migration)

## Model selection

| Model | Cost (input/output per 1M tokens) | Use for |
|---|---|---|
| **gpt-4o-mini** | $0.15 / $0.60 | Default for analytical features, summaries, classification |
| **gpt-4o** | $2.50 / $10.00 | High-stakes content (Listing Doctor, ad copy generation) |
| **gpt-3.5-turbo** | $0.50 / $1.50 | Legacy — generally avoid (worse than mini for similar price) |

**Rule**: start with mini. Upgrade only if quality is bad.

## Cost math for Adazella

Estimating monthly LLM bill at 100 customers:

```
Daily Insights features (PPC Waste, Search Term Harvester):
  ~10 LLM calls per workspace per day × 100 workspaces × 30 days = 30k calls/month
  Avg 200 input + 200 output tokens per call
  = 6M input tokens × $0.15 + 6M output × $0.60
  = $0.90 + $3.60 = $4.50/month

Listing Doctor (on-demand, premium feature):
  ~5 calls per workspace per month × 50 Pro/Business workspaces  
  = 250 calls × 1500 input + 1500 output = 375k tokens each side
  Using gpt-4o: $0.94 input + $3.75 output = $4.69/month
```

Total at 100 customers: **~$10/month**. Negligible.

## Node.js integration

### Setup
```bash
npm install openai
```

### Client (api/src/lib/openai.ts)
```ts
import OpenAI from "openai";

let client: OpenAI | null = null;
export function getOpenAI(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}
```

### Structured output (recommended pattern)
```ts
import { getOpenAI } from "@/lib/openai.js";
import { z } from "zod";

// Define what you expect back
const InsightSchema = z.object({
  severity: z.enum(["info", "warning", "critical"]),
  title: z.string().max(80),
  description: z.string().max(500),
  action_label: z.string().max(40),
});

export async function generateInsight(context: object): Promise<z.infer<typeof InsightSchema>> {
  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 400,
    messages: [
      {
        role: "system",
        content: `You are an Amazon Ads strategist. Output ONLY valid JSON matching:
{
  "severity": "info" | "warning" | "critical",
  "title": "1-line summary, max 80 chars",
  "description": "2-3 sentences explaining + suggesting action, max 500 chars",
  "action_label": "verb-first action (e.g. 'Add as negative'), max 40 chars"
}`,
      },
      {
        role: "user",
        content: `Analyze this campaign data and generate one insight:\n${JSON.stringify(context)}`,
      },
    ],
  });

  const raw = completion.choices[0].message.content || "{}";
  const parsed = JSON.parse(raw);
  return InsightSchema.parse(parsed);  // Throws if shape wrong
}
```

## Python integration (for scheduler)

### Setup
```bash
pip install openai
# Add to requirements.txt: openai>=1.0.0
```

### Client
```python
import os
from openai import OpenAI

_client = None

def get_openai():
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return _client
```

### Insight generation
```python
import json

SYSTEM_PROMPT = """You are an Amazon Ads strategist. Output ONLY valid JSON:
{"severity": "info|warning|critical", "title": "...", "description": "...", "action_label": "..."}
"""

def generate_insight(context: dict) -> dict:
    client = get_openai()
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        response_format={"type": "json_object"},
        temperature=0.3,
        max_tokens=400,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Analyze:\n{json.dumps(context)}"},
        ],
    )
    return json.loads(resp.choices[0].message.content)
```

## Prompt engineering tips

### For analytical features (low temperature)
- Use temperature 0.2-0.3 (more deterministic)
- Specify EXACT output format
- Provide 1-2 example outputs in system prompt
- Include relevant context but trim noise

### For creative content (Listing Doctor, ad copy)
- Use temperature 0.7-0.9 (more varied)
- Give brand voice examples
- List CONSTRAINTS (max chars, prohibited words)
- Ask for multiple options ("Generate 3 versions")

## Cost optimization techniques

### Technique 1: Caching
```ts
import crypto from "crypto";

async function getCachedOrFetch(input: object): Promise<string> {
  const key = crypto.createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
  
  // Try DB cache (24h TTL)
  const cached = await db.from("llm_cache").select("response")
    .eq("input_hash", key)
    .gt("expires_at", new Date().toISOString())
    .single();
  
  if (cached.data) return cached.data.response;
  
  // Fetch fresh
  const response = await callOpenAI(input);
  
  // Cache for 24h
  await db.from("llm_cache").insert({
    input_hash: key,
    response,
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  });
  
  return response;
}
```

### Technique 2: Batching
Instead of 10 separate LLM calls, send 10 items in one prompt:
```ts
// Bad: 10 separate calls = 10× overhead
for (const kw of keywords) {
  await analyzeKeyword(kw);
}

// Good: 1 call with all keywords
await analyzeKeywordsBatch(keywords);  // returns array of insights
```

### Technique 3: Pre-filter with SQL/stats
Don't send EVERY keyword to GPT — use SQL to find candidates first:
```sql
-- Find top 10 wasteful keywords (deterministic, free)
SELECT keyword_id, sum(cost) as total_cost
FROM search_term_performance
WHERE workspace_id = $1 AND orders = 0
GROUP BY keyword_id
ORDER BY total_cost DESC
LIMIT 10;

-- Then only those 10 go to GPT for explanation generation
```

## Error handling

```ts
try {
  const insight = await generateInsight(context);
  return insight;
} catch (err: any) {
  if (err.status === 429) {
    // Rate limited — backoff and retry once
    await sleep(2000);
    return generateInsight(context);
  }
  if (err.status === 500 || err.status === 502) {
    // OpenAI down — log and skip (don't break the user's flow)
    console.error("OpenAI temporary failure:", err.message);
    return null;
  }
  if (err.status === 401) {
    // Bad API key — alert immediately
    console.error("OPENAI_API_KEY invalid!");
    throw err;
  }
  throw err;
}
```

## Anti-patterns

- ❌ Using gpt-4o when mini works (10× more expensive)
- ❌ No `max_tokens` (LLM can blow up costs in single bad response)
- ❌ Sending entire DB tables (truncate to <1000 tokens)
- ❌ Free-form output (always use structured JSON)
- ❌ Caching without TTL (keys go stale, results outdated)
- ❌ Real-time UI calls to LLM (slow + expensive — pre-compute in scheduler)

## Useful docs

- API ref: https://platform.openai.com/docs/api-reference
- Cookbook: https://cookbook.openai.com/
- Pricing: https://openai.com/api/pricing/
- Best practices: https://platform.openai.com/docs/guides/prompt-engineering
