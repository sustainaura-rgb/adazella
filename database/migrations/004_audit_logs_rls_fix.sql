-- 004_audit_logs_rls_fix.sql
-- Fix RLS on audit_logs to support the writeAudit() pattern from api/src/lib/audit.ts
--
-- Issue: original migration 003 only had SELECT policy. INSERT was implicitly denied
--        because there was no INSERT policy AND RLS was enabled.
--        Workaround was service_role bypass — works but is brittle.
--
-- Fix: explicit INSERT policy that matches the SELECT policy (workspace owner can insert)
--      Service role still bypasses RLS for system operations.

-- Verify table exists (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
    RAISE EXCEPTION 'audit_logs table does not exist. Run migration 003 first.';
  END IF;
END $$;

-- Drop old policy if it exists (we're about to recreate)
DROP POLICY IF EXISTS audit_logs_select ON audit_logs;
DROP POLICY IF EXISTS audit_logs_insert ON audit_logs;

-- SELECT: workspace owners can read their own audit logs
CREATE POLICY audit_logs_select ON audit_logs
    FOR SELECT
    USING (
        workspace_id IN (
            SELECT id FROM workspaces WHERE owner_user_id = auth.uid()
        )
    );

-- INSERT: workspace owners can write audit entries for their own workspace
-- (this allows app-side writeAudit() to work even with RLS enabled)
CREATE POLICY audit_logs_insert ON audit_logs
    FOR INSERT
    WITH CHECK (
        workspace_id IN (
            SELECT id FROM workspaces WHERE owner_user_id = auth.uid()
        )
    );

-- UPDATE / DELETE: forbidden — audit log is append-only by design
-- (no policies = denied for non-service-role users)

-- Comment for future readers
COMMENT ON TABLE audit_logs IS 'Append-only audit log. Workspace owners can read+insert their own. Service role can do anything (used by writeAudit()).';
