---
name: postgres-rls
description: Postgres Row-Level Security patterns for multi-tenant SaaS. Use when designing new tables, debugging "user can see other workspace's data" bugs, or auditing security. Covers RLS policies, service-role bypass, and per-user JWT-scoped queries.
---

# Postgres RLS for Adazella Multi-Tenancy

Adazella has THOUSANDS of customers (eventually) sharing one Postgres database. RLS is the line of defense between customers seeing only their own data vs catastrophic data leak.

## How RLS works

When RLS is enabled on a table:
- Every SELECT/UPDATE/DELETE/INSERT is filtered through your policies
- Policies are SQL expressions that evaluate to TRUE/FALSE per row
- If FALSE, the row is invisible to that user (even via `SELECT *`)

**Critical**: RLS is bypassed by the `service_role` key. Use it carefully.

## Your two query modes

### Mode A: User-scoped (RLS enforces, safer)
Frontend → API endpoint → `supabaseForUser(jwt)` client → DB
- Uses anon key + user JWT
- RLS policies filter rows automatically
- Even if your code has bugs, RLS catches multi-tenant leaks

### Mode B: Admin-scoped (service role, RLS bypassed)
API → `supabaseAdmin` client → DB
- Bypasses RLS entirely
- Use only when you NEED to read across workspaces (system-wide ops)
- App code MUST filter by workspace_id manually

**Default to Mode A. Only use Mode B with a clear comment explaining why.**

## RLS policy patterns

### Pattern 1: Owner-only access (most common)
```sql
ALTER TABLE my_feature ENABLE ROW LEVEL SECURITY;

CREATE POLICY my_feature_select ON my_feature
    FOR SELECT
    USING (
        workspace_id IN (
            SELECT id FROM workspaces WHERE owner_user_id = auth.uid()
        )
    );

CREATE POLICY my_feature_insert ON my_feature
    FOR INSERT
    WITH CHECK (
        workspace_id IN (
            SELECT id FROM workspaces WHERE owner_user_id = auth.uid()
        )
    );

CREATE POLICY my_feature_update ON my_feature
    FOR UPDATE
    USING (
        workspace_id IN (
            SELECT id FROM workspaces WHERE owner_user_id = auth.uid()
        )
    );

CREATE POLICY my_feature_delete ON my_feature
    FOR DELETE
    USING (
        workspace_id IN (
            SELECT id FROM workspaces WHERE owner_user_id = auth.uid()
        )
    );
```

### Pattern 2: Read-only for all members of a workspace (when you add team plans)
```sql
CREATE POLICY my_feature_select ON my_feature
    FOR SELECT
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    );

-- Mutations only for owners
CREATE POLICY my_feature_modify ON my_feature
    FOR ALL  -- INSERT/UPDATE/DELETE
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members 
            WHERE user_id = auth.uid() AND role = 'owner'
        )
    );
```

### Pattern 3: Public-readable (rare, e.g., feature flags)
```sql
CREATE POLICY public_read ON feature_flags
    FOR SELECT
    USING (true);
```

### Pattern 4: Service-role write only (audit logs)
```sql
-- Users can read their own audit logs
CREATE POLICY audit_logs_select ON audit_logs
    FOR SELECT
    USING (
        workspace_id IN (
            SELECT id FROM workspaces WHERE owner_user_id = auth.uid()
        )
    );

-- No INSERT policy → only service_role can write (which is what we want)
-- Audit log integrity: users can't fake entries
```

## Common mistakes

### Mistake 1: Forgetting to enable RLS after creating policies
```sql
-- WRONG: policies don't matter if RLS is off
CREATE POLICY my_feature_select ON my_feature ...;

-- RIGHT: must enable explicitly
ALTER TABLE my_feature ENABLE ROW LEVEL SECURITY;
CREATE POLICY my_feature_select ON my_feature ...;
```

### Mistake 2: Service role + missing app-side workspace filter
```ts
// WRONG: returns ALL workspaces' campaigns!
const { data } = await supabaseAdmin
  .from("campaigns")
  .select("*");
// (This returned a customer their COMPETITOR'S data in a real bug I've seen.)

// RIGHT: always filter by workspace_id when using service role
const { data } = await supabaseAdmin
  .from("campaigns")
  .select("*")
  .eq("workspace_id", req.workspaceId);
```

### Mistake 3: Slow RLS due to subquery on every row
The `workspace_id IN (SELECT id FROM workspaces ...)` subquery runs PER ROW. For tables with millions of rows, this is slow.

**Fix**: Add an index on `workspace_id`:
```sql
CREATE INDEX idx_my_feature_workspace_id ON my_feature (workspace_id);
```

Or use a function:
```sql
CREATE OR REPLACE FUNCTION current_user_workspaces()
RETURNS SETOF UUID
LANGUAGE SQL STABLE  -- STABLE = result cached per query
AS $$
    SELECT id FROM workspaces WHERE owner_user_id = auth.uid()
$$;

-- Then policies use the function
CREATE POLICY my_feature_select ON my_feature
    FOR SELECT
    USING (workspace_id IN (SELECT current_user_workspaces()));
```

## Testing RLS

### Test 1: Pretend to be a user, run query
```sql
-- Set the JWT claims to impersonate user X
SET request.jwt.claim.sub TO '<user-id-of-test-user>';

-- Now query as that user
SELECT * FROM campaigns;
-- Should only see rows where workspace_id matches their workspaces

-- Reset
RESET request.jwt.claim.sub;
```

### Test 2: Check if policies exist
```sql
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename;
```

### Test 3: Check if RLS is enabled
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'campaigns';
-- rowsecurity should be 't'
```

## Adazella's RLS audit checklist

Before launching any new table to production:
- [ ] RLS enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)
- [ ] SELECT policy exists for owner-only access
- [ ] INSERT policy with WITH CHECK clause (so users can't insert rows for OTHER workspaces)
- [ ] UPDATE/DELETE policies if mutations expected
- [ ] Index on `workspace_id` for query performance
- [ ] Foreign key cascade behavior set (`ON DELETE CASCADE` usually)
- [ ] Audit logged via `writeAudit()` for all mutations

## When in doubt

ASK YOURSELF: "If a malicious customer tried `SELECT * FROM <table>` via direct DB access (impossible) OR via a hacked admin client, would RLS protect us?"

If yes → policies are correct.
If no → fix RLS before launch.

## Test patterns for RLS

In `api/src/__tests__/rls.test.ts` (when we add tests):
```ts
// Sign in as User A → query → should only see workspace A data
// Sign in as User B → query → should only see workspace B data  
// Use service_role → query → should see all (and that's intentional)
```

RLS is your security FOUNDATION. Get this right.
