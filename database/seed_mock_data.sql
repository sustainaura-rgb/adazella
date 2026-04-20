-- ==========================================================
-- Mock data seeder — realistic fake Amazon Ads data for testing
--
-- HOW TO USE:
-- 1. First, find your workspace_id:
--      SELECT id, name FROM workspaces WHERE owner_user_id = auth.uid();
--    Or if running as admin:
--      SELECT id, name, owner_user_id FROM workspaces;
--
-- 2. Copy your workspace_id and paste it below in the WORKSPACE_ID line.
-- 3. Run this entire script in Supabase SQL Editor.
-- 4. Refresh your dashboard at http://localhost:5173/dashboard — you'll see the fake data.
--
-- To clear fake data later, run:
--   DELETE FROM daily_performance WHERE workspace_id = '<your-id>';
--   DELETE FROM search_term_performance WHERE workspace_id = '<your-id>';
--   DELETE FROM product_performance WHERE workspace_id = '<your-id>';
--   DELETE FROM campaigns WHERE workspace_id = '<your-id>';
-- ==========================================================

DO $$
DECLARE
    -- ⚠️ REPLACE THIS with your actual workspace_id
    ws_id UUID := '00000000-0000-0000-0000-000000000000';

    campaign_names TEXT[] := ARRAY[
        'SP - Auto - Brand',
        'SP - Manual - Exact - Winners',
        'SP - Manual - Broad - Discovery',
        'SP - Manual - Phrase - Mid-funnel',
        'SP - Product Targeting - Competitors',
        'SP - Manual - Exact - Long Tail',
        'SP - Auto - Research',
        'SP - Defensive - Own Brand',
        'SP - Seasonal - Q4',
        'SP - Clearance - Bottom Funnel'
    ];
    campaign_budgets NUMERIC[] := ARRAY[50, 100, 75, 60, 80, 40, 30, 35, 150, 25];
    campaign_statuses TEXT[] := ARRAY['ENABLED', 'ENABLED', 'ENABLED', 'PAUSED', 'ENABLED',
                                      'ENABLED', 'ENABLED', 'ENABLED', 'PAUSED', 'ENABLED'];
    serving_statuses TEXT[] := ARRAY['CAMPAIGN_STATUS_ENABLED', 'CAMPAIGN_STATUS_ENABLED',
                                     'CAMPAIGN_OUT_OF_BUDGET', 'CAMPAIGN_PAUSED',
                                     'CAMPAIGN_STATUS_ENABLED', 'CAMPAIGN_STATUS_ENABLED',
                                     'CAMPAIGN_STATUS_ENABLED', 'CAMPAIGN_STATUS_ENABLED',
                                     'CAMPAIGN_ARCHIVED', 'CAMPAIGN_STATUS_ENABLED'];

    search_terms TEXT[] := ARRAY[
        'shower curtain liner', 'shower curtain', 'shower liner', 'bathroom curtain',
        'frosted shower curtain', 'heavy duty shower liner', 'clear shower curtain liner',
        'mildew resistant shower curtain', 'shower curtain liner magnets', 'long shower curtain',
        'shower curtain 72x72', 'fabric shower curtain', 'shower curtain set',
        'bathroom shower liner', 'plastic shower curtain liner', 'waterproof shower curtain',
        'shower liner 84 inches', 'hotel shower curtain', 'shower curtain with hooks',
        'natural shower curtain liner'
    ];
    match_types TEXT[] := ARRAY['EXACT', 'BROAD', 'PHRASE'];
    asins TEXT[] := ARRAY[
        'B0CCXSY6PQ', 'B07WGCKKW7', 'B09K3LRTNF', 'B08MVBMTXB', 'B07R4Q1VGN',
        'B00SF1TAKI', 'B07T8KVQV6', 'B09NM2C9Z7', 'B08L8F25QM', 'B07V6ZP4PS'
    ];
    skus TEXT[] := ARRAY[
        'SA-SCL-72-FR', 'SA-SCL-72-CL', 'SA-SCL-84-FR', 'SA-SCL-84-CL', 'SA-SCL-MAG-72',
        'SA-SCL-HD-72', 'SA-SCL-HD-84', 'SA-SCL-PV-72', 'SA-SCL-KID-72', 'SA-SCL-LUX-72'
    ];

    cid TEXT;
    cname TEXT;
    cbudget NUMERIC;
    cstatus TEXT;
    sstatus TEXT;
    ag_id TEXT;
    ag_name TEXT;
    report_date DATE;
    day_offset INT;
    impressions INT;
    clicks INT;
    cost NUMERIC;
    orders INT;
    sales NUMERIC;
    i INT;
    j INT;
    rand_factor NUMERIC;
BEGIN
    RAISE NOTICE 'Seeding mock data for workspace: %', ws_id;

    -- Verify workspace exists
    IF NOT EXISTS (SELECT 1 FROM workspaces WHERE id = ws_id) THEN
        RAISE EXCEPTION 'Workspace % not found! Please replace ws_id with your actual workspace_id at the top of this script.', ws_id;
    END IF;

    -- ════════════════════════════════
    -- 1. Campaigns (10 fake campaigns)
    -- ════════════════════════════════
    FOR i IN 1..10 LOOP
        cid := 'mock_campaign_' || i::TEXT;
        cname := campaign_names[i];
        cbudget := campaign_budgets[i];
        cstatus := campaign_statuses[i];
        sstatus := serving_statuses[i];

        INSERT INTO campaigns (workspace_id, campaign_id, campaign_name, campaign_type,
                              status, serving_status, daily_budget)
        VALUES (ws_id, cid, cname, 'SP', cstatus, sstatus, cbudget)
        ON CONFLICT (workspace_id, campaign_id) DO UPDATE SET
            campaign_name = EXCLUDED.campaign_name,
            status = EXCLUDED.status,
            serving_status = EXCLUDED.serving_status,
            daily_budget = EXCLUDED.daily_budget;
    END LOOP;

    -- ════════════════════════════════
    -- 2. Daily performance (30 days x 10 campaigns)
    -- Each campaign has different performance profile
    -- ════════════════════════════════
    FOR day_offset IN 0..29 LOOP
        report_date := CURRENT_DATE - day_offset;

        FOR i IN 1..10 LOOP
            cid := 'mock_campaign_' || i::TEXT;

            -- Skip paused/archived campaigns
            IF campaign_statuses[i] = 'PAUSED' AND day_offset < 7 THEN
                CONTINUE;
            END IF;

            -- Random daily variation: 0.5x - 1.5x baseline
            rand_factor := 0.5 + random();

            -- Each campaign has different base performance
            impressions := GREATEST(0, (i * 500 + (i * i * 100))::INT);
            impressions := (impressions * rand_factor)::INT;

            clicks := (impressions * (0.005 + random() * 0.015))::INT;  -- 0.5-2% CTR
            cost := clicks * (0.50 + random() * 1.0);                    -- $0.50 - $1.50 CPC

            -- Orders: some campaigns convert better
            IF i IN (2, 3, 6) THEN
                orders := (clicks * (0.05 + random() * 0.10))::INT;     -- 5-15% CVR (winners)
            ELSIF i IN (1, 7) THEN
                orders := (clicks * (0.01 + random() * 0.05))::INT;     -- 1-6% CVR (auto)
            ELSE
                orders := (clicks * random() * 0.08)::INT;               -- 0-8% CVR (rest)
            END IF;

            sales := orders * (15 + random() * 20);                      -- $15-$35 AOV

            INSERT INTO daily_performance (workspace_id, campaign_id, report_date,
                                          impressions, clicks, cost, orders, sales,
                                          acos, ctr, cpc)
            VALUES (
                ws_id, cid, report_date,
                impressions, clicks, ROUND(cost, 2), orders, ROUND(sales, 2),
                CASE WHEN sales > 0 THEN ROUND(cost / sales * 100, 2) ELSE 0 END,
                CASE WHEN impressions > 0 THEN ROUND(clicks::NUMERIC / impressions, 4) ELSE 0 END,
                CASE WHEN clicks > 0 THEN ROUND(cost / clicks, 2) ELSE 0 END
            )
            ON CONFLICT (workspace_id, campaign_id, report_date) DO UPDATE SET
                impressions = EXCLUDED.impressions,
                clicks = EXCLUDED.clicks,
                cost = EXCLUDED.cost,
                orders = EXCLUDED.orders,
                sales = EXCLUDED.sales,
                acos = EXCLUDED.acos,
                ctr = EXCLUDED.ctr,
                cpc = EXCLUDED.cpc;
        END LOOP;
    END LOOP;

    -- ════════════════════════════════
    -- 3. Search terms (20 terms x 7 days x mixed campaigns)
    -- ════════════════════════════════
    FOR day_offset IN 0..6 LOOP
        report_date := CURRENT_DATE - day_offset;

        FOR j IN 1..20 LOOP
            -- Pick 2-3 campaigns per search term
            FOR i IN 1..3 LOOP
                cid := 'mock_campaign_' || ((j + i) % 10 + 1)::TEXT;
                cname := campaign_names[(j + i) % 10 + 1];
                ag_id := 'mock_ag_' || cid;
                ag_name := 'Default Ad Group';

                impressions := (20 + random() * 500)::INT;
                clicks := (impressions * (0.01 + random() * 0.04))::INT;
                cost := clicks * (0.40 + random() * 0.90);
                orders := CASE
                    WHEN random() > 0.7 THEN (random() * 3)::INT
                    ELSE 0
                END;
                sales := orders * (15 + random() * 20);

                INSERT INTO search_term_performance (
                    workspace_id, campaign_id, campaign_name, ad_group_id, ad_group_name,
                    keyword, match_type, search_term, report_date,
                    impressions, clicks, cost, orders, sales, add_to_cart,
                    acos, ctr, cpc
                )
                VALUES (
                    ws_id, cid, cname, ag_id, ag_name,
                    search_terms[j], match_types[(i % 3) + 1], search_terms[j], report_date,
                    impressions, clicks, ROUND(cost, 2), orders, ROUND(sales, 2),
                    orders + (random() * 2)::INT,
                    CASE WHEN sales > 0 THEN ROUND(cost / sales * 100, 2) ELSE 0 END,
                    CASE WHEN impressions > 0 THEN ROUND(clicks::NUMERIC / impressions, 4) ELSE 0 END,
                    CASE WHEN clicks > 0 THEN ROUND(cost / clicks, 2) ELSE 0 END
                )
                ON CONFLICT (workspace_id, campaign_id, search_term, report_date) DO NOTHING;
            END LOOP;
        END LOOP;
    END LOOP;

    -- ════════════════════════════════
    -- 4. Product performance (10 ASINs x 7 days)
    -- ════════════════════════════════
    FOR day_offset IN 0..6 LOOP
        report_date := CURRENT_DATE - day_offset;

        FOR j IN 1..10 LOOP
            cid := 'mock_campaign_' || ((j % 10) + 1)::TEXT;
            cname := campaign_names[(j % 10) + 1];
            ag_id := 'mock_ag_' || cid;
            ag_name := 'Default Ad Group';

            impressions := (100 + random() * 2000)::INT;
            clicks := (impressions * (0.008 + random() * 0.02))::INT;
            cost := clicks * (0.55 + random() * 0.85);
            orders := CASE
                WHEN j <= 3 THEN (clicks * (0.05 + random() * 0.10))::INT  -- Top performers
                WHEN j <= 6 THEN (clicks * (0.02 + random() * 0.05))::INT  -- Mid
                ELSE (clicks * random() * 0.03)::INT                         -- Rest
            END;
            sales := orders * (15 + random() * 20);

            INSERT INTO product_performance (
                workspace_id, campaign_id, campaign_name, ad_group_id, ad_group_name,
                asin, sku, report_date,
                impressions, clicks, cost, orders, sales, add_to_cart,
                acos, ctr, cpc
            )
            VALUES (
                ws_id, cid, cname, ag_id, ag_name,
                asins[j], skus[j], report_date,
                impressions, clicks, ROUND(cost, 2), orders, ROUND(sales, 2),
                orders + (random() * 3)::INT,
                CASE WHEN sales > 0 THEN ROUND(cost / sales * 100, 2) ELSE 0 END,
                CASE WHEN impressions > 0 THEN ROUND(clicks::NUMERIC / impressions, 4) ELSE 0 END,
                CASE WHEN clicks > 0 THEN ROUND(cost / clicks, 2) ELSE 0 END
            )
            ON CONFLICT (workspace_id, campaign_id, asin, report_date) DO NOTHING;
        END LOOP;
    END LOOP;

    -- ════════════════════════════════
    -- 5. Product profile (for negativity scoring)
    -- ════════════════════════════════
    INSERT INTO product_profiles (workspace_id, include_keywords, exclude_keywords, competitor_brands)
    VALUES (
        ws_id,
        ARRAY['shower curtain', 'shower liner', 'bathroom', 'frosted', 'clear', 'heavy duty', 'magnet'],
        ARRAY['fabric', 'vinyl', 'cotton', 'kids', 'floral', 'round', 'snap in', '72x78', '78 inch'],
        ARRAY['bigfoot', 'clorox', 'amazon basics', 'mdesign', 'liba']
    )
    ON CONFLICT (workspace_id) DO UPDATE SET
        include_keywords = EXCLUDED.include_keywords,
        exclude_keywords = EXCLUDED.exclude_keywords,
        competitor_brands = EXCLUDED.competitor_brands;

    RAISE NOTICE '✅ Mock data seeded successfully for workspace %!', ws_id;
    RAISE NOTICE '   - 10 campaigns';
    RAISE NOTICE '   - 30 days of daily performance';
    RAISE NOTICE '   - 7 days of search terms (~400 rows)';
    RAISE NOTICE '   - 7 days of product performance (~70 rows)';
    RAISE NOTICE '   - Product profile seeded with shower curtain keywords';
END $$;
