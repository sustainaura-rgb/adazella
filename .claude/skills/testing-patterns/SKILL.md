---
name: testing-patterns
description: How to test the Adazella codebase. Covers what to test, what to skip, conventions for unit/integration/e2e tests, mocking patterns, and test data setup. Use when adding tests, fixing flaky tests, or designing test strategy.
---

# Testing Strategy for Adazella

## Current state (be honest)

Adazella has minimal test coverage right now. We rely on:
- TypeScript typecheck (catches ~30% of bugs)
- Manual smoke tests (catches ~50%)
- Production user feedback (catches the other ~20% 🙃)

This works for early stage but won't scale. Tests should grow alongside the codebase.

## What to test (priority)

### 🔴 Must test (write before launching to paying customers)
1. **Auth/authorization boundaries** — multi-tenant data leak prevention
2. **Stripe webhook handlers** — payment processing must be idempotent
3. **Token encryption/decryption** — round-trip correctness
4. **Amazon OAuth flow** — state CSRF protection
5. **Payment tier gating** — Pro features actually blocked for Starter

### 🟠 Should test (ship before public launch)
6. **API endpoint validation** — Zod schemas reject bad input
7. **AI agent output shape** — LLM responses match expected schema
8. **Database migrations** — RLS policies actually enforce
9. **Error handling** — no stack leaks to client

### 🟡 Nice to test (post-revenue)
10. UI component rendering
11. Form interactions
12. Edge cases in formatters (e.g., `formatAcos(NaN)`)

### 🚫 Don't bother
- 100% coverage of CRUD endpoints (low value)
- Trivial getters/setters
- 3rd-party libraries (test our wrapper, not theirs)

## Tech stack

### API (Node.js + TypeScript)
- **Vitest** — fast, ESM-native (better than Jest for our setup)
- **Supertest** — HTTP integration tests
- **MSW** — mock external APIs (Amazon, Stripe, OpenAI)

### Frontend (React + Vite)
- **Vitest** + **@testing-library/react** — component tests
- **Playwright** — E2E (last priority — only when we have ~10 critical paths)

### Scheduler (Python)
- **pytest** — unit tests
- **pytest-mock** — mock psycopg2 + requests

## Test file conventions

### Location
- Co-locate: `routes/campaigns.ts` → `routes/campaigns.test.ts`
- OR centralize: `__tests__/routes/campaigns.test.ts` (we'll pick when we add tests)
- Mark with `.test.ts` suffix (auto-picked up by Vitest)

### Naming
```ts
describe("CampaignsRouter", () => {
  describe("PATCH /:id/budget", () => {
    it("rejects negative budget with 400", () => {});
    it("requires authentication", () => {});
    it("blocks IDOR (different workspace)", () => {});
    it("succeeds for owner", () => {});
    it("writes audit log", () => {});
  });
});
```

## Test patterns for Adazella

### Pattern 1: Auth boundary test (most important!)
```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../server.js";

describe("Multi-tenant isolation", () => {
  it("User A cannot read User B's campaigns", async () => {
    // Setup: 2 workspaces with different campaigns
    const wsA = await createWorkspace("A");
    const wsB = await createWorkspace("B");
    await createCampaign(wsB.id, "secret_campaign_b");
    
    // Sign in as User A
    const tokenA = await signInAs(wsA.owner_user_id);
    
    // Try to read all campaigns
    const res = await request(app)
      .get("/api/campaigns")
      .set("Authorization", `Bearer ${tokenA}`);
    
    expect(res.status).toBe(200);
    
    // Critical assertion: User A should NOT see User B's data
    const campaignNames = res.body.rows.map((r: any) => r.campaign_name);
    expect(campaignNames).not.toContain("secret_campaign_b");
  });
});
```

### Pattern 2: Token encryption round-trip
```ts
import { encrypt, decrypt } from "../lib/crypto.js";

describe("Token encryption", () => {
  it("encrypts and decrypts to original value", () => {
    const original = "Atza|abc123def456...";
    const encrypted = encrypt(original);
    
    expect(encrypted).toMatch(/^enc:v1:/);
    expect(encrypted).not.toContain(original);  // not in plaintext
    
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it("decrypt is backwards-compatible with plaintext", () => {
    const plaintext = "old_value_pre_encryption";
    expect(decrypt(plaintext)).toBe(plaintext);
  });
});
```

### Pattern 3: Stripe webhook idempotency
```ts
describe("Stripe webhook handler", () => {
  it("processes event once even if delivered twice", async () => {
    const event = { id: "evt_123", type: "checkout.session.completed", ... };
    
    await handleWebhook(event);  // first delivery
    await handleWebhook(event);  // duplicate
    
    // Should have created subscription only ONCE
    const { count } = await db.from("subscriptions")
      .select("*", { count: "exact" });
    expect(count).toBe(1);
  });
});
```

### Pattern 4: Mocking external APIs (MSW)
```ts
import { setupServer } from "msw/node";
import { rest } from "msw";

const server = setupServer(
  rest.post("https://api.amazon.com/auth/o2/token", (req, res, ctx) => {
    return res(ctx.json({
      access_token: "mock_access_token",
      refresh_token: "mock_refresh_token",
      expires_in: 3600,
    }));
  }),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("OAuth callback", () => {
  it("exchanges code for tokens and stores encrypted", async () => {
    // Test exchanges with mocked Amazon response
  });
});
```

## Test data setup

### Fixtures
Create `__tests__/fixtures/` with reusable test data:
```ts
// __tests__/fixtures/workspaces.ts
export const seedWorkspace = async (name = "TestWS") => {
  return await db.from("workspaces").insert({
    name,
    owner_user_id: crypto.randomUUID(),
  }).select().single();
};
```

### Database isolation
- Use a test database (separate from dev, NOT production)
- Reset between tests: TRUNCATE all tables in afterEach
- OR use transactions: BEGIN at test start, ROLLBACK at end (faster)

## Anti-patterns to avoid

- ❌ Testing implementation details (private functions)
- ❌ Brittle UI tests (testing CSS classes that change)
- ❌ Slow tests (>1s each — slow tests don't get run)
- ❌ Tests that depend on order (each test self-contained)
- ❌ Mocking everything (over-mocking → tests pass but real code breaks)
- ❌ Skipping flaky tests instead of fixing them

## Coverage target

- 0% (today) → 30% (Q3) → 60% (when team grows) → 80% (mature SaaS)

Focus on critical paths first. Don't chase percent.

## CI integration (when we add GitHub Actions)

```yaml
# .github/workflows/test.yml
on: [pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci
      - run: npm run test --workspace=api
      - run: npm run test --workspace=frontend
      - run: npm run typecheck
```

## When to write a test

- ✅ Found a bug → write test reproducing it BEFORE fixing
- ✅ Adding billing/auth/security feature → tests required
- ✅ Refactoring → write tests before, ensure same behavior after
- 🟡 New feature → integration test of happy path (skip unit tests for now)
- ❌ Trivial UI tweak → don't bother
- ❌ Already covered by similar test → don't duplicate

Tests are an investment. Don't write 50 useless tests; write 5 critical ones.
