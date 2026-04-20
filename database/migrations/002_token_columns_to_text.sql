-- ==========================================================
-- Migration 002 — Change token columns from BYTEA → TEXT
--
-- Supabase's REST API (used by supabase-js) doesn't round-trip Buffer/bytea
-- reliably — it serializes Node Buffers as JSON objects instead of raw bytes.
-- The Python scheduler then can't decode them as UTF-8.
--
-- Switching to TEXT columns stores OAuth tokens as plain strings. Encryption
-- can be added later at the application layer (e.g., with libsodium) — but
-- for now, plain text is fine since the DB itself is protected by RLS +
-- Supabase's managed Postgres.
-- ==========================================================

-- Drop old bytea columns (existing tokens are garbage anyway)
ALTER TABLE amazon_connections
    DROP COLUMN IF EXISTS refresh_token_enc,
    DROP COLUMN IF EXISTS access_token_enc;

-- Add new TEXT columns
ALTER TABLE amazon_connections
    ADD COLUMN IF NOT EXISTS refresh_token TEXT,
    ADD COLUMN IF NOT EXISTS access_token  TEXT;

-- Mark all current connections as disconnected so the user reconnects
-- (and we store tokens in the new columns)
UPDATE amazon_connections SET status = 'disconnected' WHERE status = 'active';
