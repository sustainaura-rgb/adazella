-- ==========================================================
-- Seed mock targeted keywords (run AFTER seed_mock_data.sql)
-- Makes harvest + upgrades suggestions realistic by simulating
-- an existing keyword list the seller already has.
-- ==========================================================

DO $$
DECLARE
    -- ⚠️ REPLACE THIS with your actual workspace_id
    ws_id UUID := 'ca241cff-fd9e-4f84-9fa3-2988207bfd6c';

    v_keywords TEXT[] := ARRAY[
        'shower curtain liner',
        'shower curtain',
        'shower liner',
        'frosted shower curtain',
        'clear shower curtain',
        'heavy duty shower liner'
    ];
    v_match_types TEXT[] := ARRAY['EXACT', 'BROAD', 'PHRASE'];
    v_kw TEXT;
    v_match TEXT;
    v_cid TEXT;
    i INT;
    j INT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM workspaces WHERE id = ws_id) THEN
        RAISE EXCEPTION 'Workspace % not found.', ws_id;
    END IF;

    -- Add keywords across campaigns
    FOR i IN 1..array_length(v_keywords, 1) LOOP
        v_kw := v_keywords[i];

        FOR j IN 1..3 LOOP
            v_cid := 'mock_campaign_' || ((i + j) % 10 + 1)::TEXT;
            v_match := v_match_types[((i + j) % 3) + 1];

            INSERT INTO campaign_keywords (
                workspace_id, keyword_id, campaign_id, ad_group_id,
                keyword_text, match_type, state, bid, updated_at
            )
            VALUES (
                ws_id,
                'mock_kw_' || i || '_' || j,
                v_cid,
                'mock_ag_' || v_cid,
                v_kw,
                v_match,
                'ENABLED',
                0.75 + (random() * 0.75),
                NOW()
            )
            ON CONFLICT (workspace_id, keyword_id) DO NOTHING;
        END LOOP;
    END LOOP;

    RAISE NOTICE '✅ Mock keywords seeded — ~18 keyword rows';
END $$;
