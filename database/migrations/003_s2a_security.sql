-- 003_s2a_security.sql
-- Phase S2A: audit log table (proper schema, replaces the fetch_logs hack)
-- Refresh tokens stay in existing amazon_connections.refresh_token column
-- but are now stored encrypted (format prefix: "enc:v1:").

CREATE TABLE IF NOT EXISTS audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    workspace_id    UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id         UUID        REFERENCES auth.users(id),
    action          TEXT        NOT NULL,              -- e.g. "campaign.budget_change", "amazon.connect"
    target_type     TEXT,                              -- "campaign", "amazon_connection", "profile"
    target_id       TEXT,                              -- free-form ID of affected resource
    before_value    JSONB,
    after_value     JSONB,
    ip              TEXT,
    user_agent      TEXT,
    request_id      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace_time
    ON audit_logs (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_time
    ON audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action
    ON audit_logs (action, created_at DESC);

-- RLS on audit_logs — users can only read their own workspace's logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_select ON audit_logs;
CREATE POLICY audit_logs_select ON audit_logs
    FOR SELECT
    USING (
        workspace_id IN (
            SELECT id FROM workspaces WHERE owner_user_id = auth.uid()
        )
    );

-- Service role bypasses RLS (so the API can always write + read)
-- No INSERT policy → only service role can write, which is what we want.
