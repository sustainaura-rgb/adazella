-- ==========================================================
-- AdPilot v2 — Initial schema
-- Multi-tenant from day 1. Every table scoped by workspace_id.
-- RLS enabled on all tables.
-- ==========================================================

-- ---------- Extensions ----------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================================
-- 1. Workspaces (billing entity — one per paying customer)
-- ==========================================================
CREATE TABLE workspaces (
    id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name                      TEXT NOT NULL,
    plan                      TEXT NOT NULL DEFAULT 'trial'
                                CHECK (plan IN ('trial', 'starter', 'pro', 'agency')),
    stripe_customer_id        TEXT UNIQUE,
    stripe_subscription_id    TEXT UNIQUE,
    trial_ends_at             TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
    target_acos               NUMERIC(5,2) NOT NULL DEFAULT 25.00,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workspaces_owner ON workspaces(owner_user_id);
CREATE INDEX idx_workspaces_stripe_cust ON workspaces(stripe_customer_id);

-- ==========================================================
-- 2. Workspace members (team collaboration, Pro+ feature)
-- ==========================================================
CREATE TABLE workspace_members (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role            TEXT NOT NULL DEFAULT 'admin'
                        CHECK (role IN ('admin', 'member', 'viewer')),
    invited_at      TIMESTAMPTZ DEFAULT NOW(),
    accepted_at     TIMESTAMPTZ,
    UNIQUE(workspace_id, user_id)
);

CREATE INDEX idx_wsm_user ON workspace_members(user_id);
CREATE INDEX idx_wsm_workspace ON workspace_members(workspace_id);

-- ==========================================================
-- 3. Amazon connections (OAuth tokens per workspace)
-- Tokens ENCRYPTED at rest using pgcrypto.
-- ==========================================================
CREATE TABLE amazon_connections (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    profile_id          TEXT NOT NULL,
    marketplace_id      TEXT NOT NULL,
    account_name        TEXT,
    country_code        TEXT,
    currency_code       TEXT,
    -- Tokens stored encrypted — decrypt in application layer
    refresh_token_enc   BYTEA NOT NULL,
    access_token_enc    BYTEA,
    access_token_expires_at TIMESTAMPTZ,
    connected_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_fetch_at       TIMESTAMPTZ,
    status              TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'disconnected', 'error')),
    last_error          TEXT,
    UNIQUE(workspace_id, profile_id)
);

CREATE INDEX idx_amazon_conn_workspace ON amazon_connections(workspace_id);
CREATE INDEX idx_amazon_conn_status ON amazon_connections(status) WHERE status = 'active';

-- ==========================================================
-- 4. Campaigns (scoped by workspace)
-- ==========================================================
CREATE TABLE campaigns (
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    campaign_id     TEXT NOT NULL,
    campaign_name   TEXT NOT NULL,
    campaign_type   TEXT,                          -- SP, SB, SD
    status          TEXT,                          -- ENABLED, PAUSED, ARCHIVED
    serving_status  TEXT,
    daily_budget    NUMERIC(10,2),
    portfolio_id    TEXT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (workspace_id, campaign_id)
);

CREATE INDEX idx_campaigns_workspace ON campaigns(workspace_id);

-- ==========================================================
-- 5. Daily performance
-- ==========================================================
CREATE TABLE daily_performance (
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    campaign_id     TEXT NOT NULL,
    report_date     DATE NOT NULL,
    impressions     INT DEFAULT 0,
    clicks          INT DEFAULT 0,
    cost            NUMERIC(12,4) DEFAULT 0,
    orders          INT DEFAULT 0,
    sales           NUMERIC(12,4) DEFAULT 0,
    acos            NUMERIC(8,2),
    ctr             NUMERIC(10,6),
    cpc             NUMERIC(10,4),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (workspace_id, campaign_id, report_date)
);

CREATE INDEX idx_daily_perf_workspace_date ON daily_performance(workspace_id, report_date);

-- ==========================================================
-- 6. Search term performance
-- ==========================================================
CREATE TABLE search_term_performance (
    id              BIGSERIAL PRIMARY KEY,
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    campaign_id     TEXT NOT NULL,
    campaign_name   TEXT,
    ad_group_id     TEXT,
    ad_group_name   TEXT,
    keyword         TEXT,
    match_type      TEXT,
    search_term     TEXT NOT NULL,
    report_date     DATE NOT NULL,
    impressions     INT DEFAULT 0,
    clicks          INT DEFAULT 0,
    cost            NUMERIC(12,4) DEFAULT 0,
    orders          INT DEFAULT 0,
    sales           NUMERIC(12,4) DEFAULT 0,
    add_to_cart     INT DEFAULT 0,
    acos            NUMERIC(8,2),
    ctr             NUMERIC(10,6),
    cpc             NUMERIC(10,4),
    UNIQUE(workspace_id, campaign_id, search_term, report_date)
);

CREATE INDEX idx_stp_workspace_date ON search_term_performance(workspace_id, report_date);
CREATE INDEX idx_stp_term ON search_term_performance(workspace_id, LOWER(search_term));

-- ==========================================================
-- 7. Product performance
-- ==========================================================
CREATE TABLE product_performance (
    id              BIGSERIAL PRIMARY KEY,
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    campaign_id     TEXT NOT NULL,
    campaign_name   TEXT,
    ad_group_id     TEXT,
    ad_group_name   TEXT,
    asin            TEXT NOT NULL,
    sku             TEXT,
    report_date     DATE NOT NULL,
    impressions     INT DEFAULT 0,
    clicks          INT DEFAULT 0,
    cost            NUMERIC(12,4) DEFAULT 0,
    orders          INT DEFAULT 0,
    sales           NUMERIC(12,4) DEFAULT 0,
    add_to_cart     INT DEFAULT 0,
    acos            NUMERIC(8,2),
    ctr             NUMERIC(10,6),
    cpc             NUMERIC(10,4),
    UNIQUE(workspace_id, campaign_id, asin, report_date)
);

CREATE INDEX idx_prodperf_workspace_date ON product_performance(workspace_id, report_date);

-- ==========================================================
-- 8. Keywords (targeted)
-- ==========================================================
CREATE TABLE campaign_keywords (
    id              BIGSERIAL PRIMARY KEY,
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    keyword_id      TEXT NOT NULL,
    campaign_id     TEXT NOT NULL,
    ad_group_id     TEXT,
    keyword_text    TEXT NOT NULL,
    match_type      TEXT NOT NULL,
    state           TEXT NOT NULL DEFAULT 'ENABLED',
    bid             NUMERIC(10,4),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workspace_id, keyword_id)
);

CREATE INDEX idx_ck_workspace ON campaign_keywords(workspace_id);
CREATE INDEX idx_ck_text ON campaign_keywords(workspace_id, LOWER(keyword_text));

-- ==========================================================
-- 9. Negative keywords
-- ==========================================================
CREATE TABLE campaign_negative_keywords (
    id              BIGSERIAL PRIMARY KEY,
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    keyword_id      TEXT NOT NULL,
    campaign_id     TEXT NOT NULL,
    ad_group_id     TEXT,
    keyword_text    TEXT NOT NULL,
    match_type      TEXT NOT NULL,   -- NEGATIVE_EXACT, NEGATIVE_PHRASE
    state           TEXT NOT NULL DEFAULT 'ENABLED',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workspace_id, keyword_id)
);

CREATE INDEX idx_cnk_workspace ON campaign_negative_keywords(workspace_id);
CREATE INDEX idx_cnk_text ON campaign_negative_keywords(workspace_id, LOWER(keyword_text));

-- ==========================================================
-- 10. Campaign schedules (dayparting)
-- ==========================================================
CREATE TABLE campaign_schedules (
    id              BIGSERIAL PRIMARY KEY,
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    campaign_id     TEXT NOT NULL,
    days_of_week    INT[] NOT NULL,              -- 0=Sun..6=Sat
    start_time      TIME NOT NULL,
    end_time        TIME NOT NULL,
    timezone        TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_schedules_workspace ON campaign_schedules(workspace_id);
CREATE INDEX idx_schedules_enabled ON campaign_schedules(workspace_id) WHERE enabled = TRUE;

-- ==========================================================
-- 11. Product profile (include/exclude words for scoring)
-- ==========================================================
CREATE TABLE product_profiles (
    workspace_id         UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    include_keywords     TEXT[] DEFAULT ARRAY[]::TEXT[],
    exclude_keywords     TEXT[] DEFAULT ARRAY[]::TEXT[],
    competitor_brands    TEXT[] DEFAULT ARRAY[]::TEXT[],
    notes                TEXT,
    updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================
-- 12. Automation rules (killer feature)
-- ==========================================================
CREATE TABLE automation_rules (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    enabled           BOOLEAN NOT NULL DEFAULT TRUE,
    -- Rule definition as JSON for flexibility
    -- Example: {"when": {"metric":"acos","op":">","value":40,"days":7},
    --          "then": {"action":"reduce_bid","value":10,"unit":"pct"}}
    condition         JSONB NOT NULL,
    action            JSONB NOT NULL,
    scope             JSONB DEFAULT '{"type":"all"}'::JSONB,   -- all / campaigns[] / keywords[]
    last_run_at       TIMESTAMPTZ,
    last_fire_count   INT DEFAULT 0,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rules_workspace ON automation_rules(workspace_id);
CREATE INDEX idx_rules_enabled ON automation_rules(workspace_id) WHERE enabled = TRUE;

-- ==========================================================
-- 13. Rule fire log (audit trail)
-- ==========================================================
CREATE TABLE automation_rule_fires (
    id             BIGSERIAL PRIMARY KEY,
    workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    rule_id        UUID NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
    target_type    TEXT NOT NULL,                 -- campaign, keyword, negative
    target_id      TEXT NOT NULL,
    action_taken   TEXT NOT NULL,
    before_value   JSONB,
    after_value    JSONB,
    fired_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rule_fires_workspace ON automation_rule_fires(workspace_id, fired_at DESC);
CREATE INDEX idx_rule_fires_rule ON automation_rule_fires(rule_id, fired_at DESC);

-- ==========================================================
-- 14. Profit tracking (COGS + fees per SKU)
-- ==========================================================
CREATE TABLE product_costs (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    asin              TEXT,
    sku               TEXT,
    cost_per_unit     NUMERIC(10,2) NOT NULL,     -- COGS
    amazon_referral_pct NUMERIC(5,2) DEFAULT 15.00,
    fba_fee_per_unit  NUMERIC(10,2) DEFAULT 0,
    shipping_per_unit NUMERIC(10,2) DEFAULT 0,
    updated_at        TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workspace_id, asin)
);

-- ==========================================================
-- 15. Alerts (for email + in-app notifications)
-- ==========================================================
CREATE TABLE alerts (
    id              BIGSERIAL PRIMARY KEY,
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    type            TEXT NOT NULL,          -- budget_exhausted, high_acos, zero_orders_spend, etc.
    severity        TEXT NOT NULL DEFAULT 'info'
                        CHECK (severity IN ('info', 'warning', 'danger')),
    title           TEXT NOT NULL,
    message         TEXT NOT NULL,
    context         JSONB,                  -- related data (campaign_id, term, etc.)
    read_at         TIMESTAMPTZ,
    emailed_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alerts_workspace_unread ON alerts(workspace_id, created_at DESC) WHERE read_at IS NULL;

-- ==========================================================
-- 16. Fetch logs (observability)
-- ==========================================================
CREATE TABLE fetch_logs (
    id                BIGSERIAL PRIMARY KEY,
    workspace_id      UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    fetch_type        TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'RUNNING'
                          CHECK (status IN ('RUNNING', 'SUCCESS', 'FAILED')),
    records_fetched   INT DEFAULT 0,
    duration_ms       INT,
    error_message     TEXT,
    started_at        TIMESTAMPTZ DEFAULT NOW(),
    completed_at      TIMESTAMPTZ
);

CREATE INDEX idx_fetch_logs_workspace ON fetch_logs(workspace_id, started_at DESC);

-- ==========================================================
-- 17. Row-Level Security (CRITICAL for multi-tenancy)
-- ==========================================================
ALTER TABLE workspaces                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members            ENABLE ROW LEVEL SECURITY;
ALTER TABLE amazon_connections           ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_performance            ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_term_performance      ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_performance          ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_keywords            ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_negative_keywords   ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_schedules           ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules             ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rule_fires        ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_costs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE fetch_logs                   ENABLE ROW LEVEL SECURITY;

-- Helper function: which workspaces does the current user belong to?
CREATE OR REPLACE FUNCTION user_workspace_ids()
RETURNS SETOF UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
    SELECT workspace_id FROM workspace_members
    WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    UNION
    SELECT id FROM workspaces WHERE owner_user_id = auth.uid();
$$;

-- Policy template: users can only see data for workspaces they belong to
CREATE POLICY "workspace_members_access" ON workspaces
    USING (id IN (SELECT user_workspace_ids()));

CREATE POLICY "wsm_self_read" ON workspace_members
    FOR SELECT USING (workspace_id IN (SELECT user_workspace_ids()));

-- Apply to all data tables (same pattern)
CREATE POLICY "ws_access" ON amazon_connections
    USING (workspace_id IN (SELECT user_workspace_ids()));
CREATE POLICY "ws_access" ON campaigns
    USING (workspace_id IN (SELECT user_workspace_ids()));
CREATE POLICY "ws_access" ON daily_performance
    USING (workspace_id IN (SELECT user_workspace_ids()));
CREATE POLICY "ws_access" ON search_term_performance
    USING (workspace_id IN (SELECT user_workspace_ids()));
CREATE POLICY "ws_access" ON product_performance
    USING (workspace_id IN (SELECT user_workspace_ids()));
CREATE POLICY "ws_access" ON campaign_keywords
    USING (workspace_id IN (SELECT user_workspace_ids()));
CREATE POLICY "ws_access" ON campaign_negative_keywords
    USING (workspace_id IN (SELECT user_workspace_ids()));
CREATE POLICY "ws_access" ON campaign_schedules
    USING (workspace_id IN (SELECT user_workspace_ids()));
CREATE POLICY "ws_access" ON product_profiles
    USING (workspace_id IN (SELECT user_workspace_ids()));
CREATE POLICY "ws_access" ON automation_rules
    USING (workspace_id IN (SELECT user_workspace_ids()));
CREATE POLICY "ws_access" ON automation_rule_fires
    USING (workspace_id IN (SELECT user_workspace_ids()));
CREATE POLICY "ws_access" ON product_costs
    USING (workspace_id IN (SELECT user_workspace_ids()));
CREATE POLICY "ws_access" ON alerts
    USING (workspace_id IN (SELECT user_workspace_ids()));
CREATE POLICY "ws_access" ON fetch_logs
    USING (workspace_id IN (SELECT user_workspace_ids()));

-- ==========================================================
-- 18. Trigger: auto-create workspace on user signup
-- ==========================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO workspaces (owner_user_id, name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', 'My Workspace'));
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();
