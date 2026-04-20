-- ==========================================================
-- Seed mock negative keywords (run AFTER seed_mock_data.sql)
--
-- HOW TO USE:
-- 1. Replace the UUID on line 10 with your workspace_id.
-- 2. Run this script in Supabase SQL Editor.
-- ==========================================================

DO $$
DECLARE
    -- ⚠️ REPLACE THIS with your actual workspace_id
    ws_id UUID := 'ca241cff-fd9e-4f84-9fa3-2988207bfd6c';

    v_terms TEXT[] := ARRAY[
        'fabric shower curtain',         -- competitor — excludes "fabric"
        'vinyl shower liner',            -- excludes "vinyl"
        'cotton shower curtain',         -- excludes "cotton"
        'kids shower curtain',           -- excludes "kids"
        'bigfoot shower curtain liner',  -- competitor brand
        'clorox shower curtain',         -- competitor brand
        'shower curtains for hotels',    -- high-waste historical
        'long shower curtain',           -- phrase negative
        'floral shower curtain liner',   -- excludes "floral"
        'round shower curtain',          -- excludes "round"
        'snap in shower curtain',        -- excludes "snap in"
        '72x78 shower curtain',          -- excludes sizes we don't sell
        'amazon basics shower curtain',  -- competitor: amazon basics
        'mdesign shower curtain',        -- competitor: mdesign
        'vinyl pvc shower curtain',      -- excludes "pvc"
        'polyester shower curtain',      -- excludes "polyester"
        'waffle weave shower curtain',   -- excludes "waffle weave"
        'curtain for shower',            -- generic junk
        'bathroom stall curtain',        -- not our product
        'hotel shower curtain rod'       -- not our product
    ];
    v_match_types TEXT[] := ARRAY['NEGATIVE_EXACT', 'NEGATIVE_PHRASE'];
    v_term TEXT;
    v_match TEXT;
    v_cid TEXT;
    i INT;
    j INT;
BEGIN
    RAISE NOTICE 'Seeding negatives for workspace: %', ws_id;

    IF NOT EXISTS (SELECT 1 FROM workspaces WHERE id = ws_id) THEN
        RAISE EXCEPTION 'Workspace % not found.', ws_id;
    END IF;

    -- Add negatives to multiple campaigns (simulating real seller who adds negatives
    -- across multiple ad groups/campaigns, causing duplicates)
    FOR i IN 1..array_length(v_terms, 1) LOOP
        v_term := v_terms[i];

        -- Add the same term to 2-4 different campaigns (realistic scenario)
        FOR j IN 1..(2 + (i % 3)) LOOP
            v_cid := 'mock_campaign_' || ((i + j) % 10 + 1)::TEXT;
            v_match := v_match_types[((i + j) % 2) + 1];

            INSERT INTO campaign_negative_keywords (
                workspace_id, keyword_id, campaign_id, ad_group_id,
                keyword_text, match_type, state, created_at
            )
            VALUES (
                ws_id,
                'mock_neg_' || i || '_' || j,
                v_cid,
                'mock_ag_' || v_cid,
                v_term,
                v_match,
                'ENABLED',
                NOW() - (random() * 30 || ' days')::INTERVAL  -- random age up to 30 days
            )
            ON CONFLICT (workspace_id, keyword_id) DO NOTHING;
        END LOOP;
    END LOOP;

    RAISE NOTICE '✅ Mock negatives seeded — ~50 rows (with duplicates across campaigns)';
END $$;
