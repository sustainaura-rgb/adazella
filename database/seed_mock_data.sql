-- ==========================================================
-- Mock data seeder — realistic fake Amazon Ads data for testing
--
-- HOW TO USE:
-- 1. Find your workspace_id:
--      SELECT id, name FROM workspaces;
--
-- 2. Replace the UUID on line 26 below with your workspace_id.
-- 3. Run this entire script in Supabase SQL Editor.
-- 4. Refresh your dashboard at http://localhost:5173/dashboard — you'll see the fake data.
--
-- To clear fake data later, run:
--   DELETE FROM daily_performance WHERE workspace_id = '<your-id>';
--   DELETE FROM search_term_performance WHERE workspace_id = '<your-id>';
--   DELETE FROM product_performance WHERE workspace_id = '<your-id>';
--   DELETE FROM campaigns WHERE workspace_id = '<your-id>';
--
-- Note: all local variables are prefixed with `v_` to avoid ambiguity with
-- table columns (Postgres throws error if a local var has the same name as
-- a column used in INSERT...VALUES).
-- ==========================================================

DO $$
DECLARE
    -- ⚠️ REPLACE THIS with your actual workspace_id
    ws_id UUID := 'ca241cff-fd9e-4f84-9fa3-2988207bfd6c';

    v_campaign_names TEXT[] := ARRAY[
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
    v_campaign_budgets NUMERIC[] := ARRAY[50, 100, 75, 60, 80, 40, 30, 35, 150, 25];
    v_campaign_statuses TEXT[] := ARRAY['ENABLED', 'ENABLED', 'ENABLED', 'PAUSED', 'ENABLED',
                                        'ENABLED', 'ENABLED', 'ENABLED', 'PAUSED', 'ENABLED'];
    v_serving_statuses TEXT[] := ARRAY['CAMPAIGN_STATUS_ENABLED', 'CAMPAIGN_STATUS_ENABLED',
                                       'CAMPAIGN_OUT_OF_BUDGET', 'CAMPAIGN_PAUSED',
                                       'CAMPAIGN_STATUS_ENABLED', 'CAMPAIGN_STATUS_ENABLED',
                                       'CAMPAIGN_STATUS_ENABLED', 'CAMPAIGN_STATUS_ENABLED',
                                       'CAMPAIGN_ARCHIVED', 'CAMPAIGN_STATUS_ENABLED'];

    v_search_terms TEXT[] := ARRAY[
        'shower curtain liner', 'shower curtain', 'shower liner', 'bathroom curtain',
        'frosted shower curtain', 'heavy duty shower liner', 'clear shower curtain liner',
        'mildew resistant shower curtain', 'shower curtain liner magnets', 'long shower curtain',
        'shower curtain 72x72', 'fabric shower curtain', 'shower curtain set',
        'bathroom shower liner', 'plastic shower curtain liner', 'waterproof shower curtain',
        'shower liner 84 inches', 'hotel shower curtain', 'shower curtain with hooks',
        'natural shower curtain liner'
    ];
    v_match_types TEXT[] := ARRAY['EXACT', 'BROAD', 'PHRASE'];
    v_asins TEXT[] := ARRAY[
        'B0CCXSY6PQ', 'B07WGCKKW7', 'B09K3LRTNF', 'B08MVBMTXB', 'B07R4Q1VGN',
        'B00SF1TAKI', 'B07T8KVQV6', 'B09NM2C9Z7', 'B08L8F25QM', 'B07V6ZP4PS'
    ];
    v_skus TEXT[] := ARRAY[
        'SA-SCL-72-FR', 'SA-SCL-72-CL', 'SA-SCL-84-FR', 'SA-SCL-84-CL', 'SA-SCL-MAG-72',
        'SA-SCL-HD-72', 'SA-SCL-HD-84', 'SA-SCL-PV-72', 'SA-SCL-KID-72', 'SA-SCL-LUX-72'
    ];

    v_cid TEXT;
    v_cname TEXT;
    v_cstatus TEXT;
    v_sstatus TEXT;
    v_ag_id TEXT;
    v_ag_name TEXT;
    v_report_date DATE;
    v_day_offset INT;
    v_impressions INT;
    v_clicks INT;
    v_cost NUMERIC;
    v_orders INT;
    v_sales NUMERIC;
    i INT;
    j INT;
    v_rand_factor NUMERIC;
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
        v_cid := 'mock_campaign_' || i::TEXT;
        v_cname := v_campaign_names[i];
        v_cstatus := v_campaign_statuses[i];
        v_sstatus := v_serving_statuses[i];

        INSERT INTO campaigns (workspace_id, campaign_id, campaign_name, campaign_type,
                              status, serving_status, daily_budget)
        VALUES (ws_id, v_cid, v_cname, 'SP', v_cstatus, v_sstatus, v_campaign_budgets[i])
        ON CONFLICT (workspace_id, campaign_id) DO UPDATE SET
            campaign_name = EXCLUDED.campaign_name,
            status = EXCLUDED.status,
            serving_status = EXCLUDED.serving_status,
            daily_budget = EXCLUDED.daily_budget;
    END LOOP;

    -- ════════════════════════════════
    -- 2. Daily performance (30 days x 10 campaigns)
    -- ════════════════════════════════
    FOR v_day_offset IN 0..29 LOOP
        v_report_date := CURRENT_DATE - v_day_offset;

        FOR i IN 1..10 LOOP
            v_cid := 'mock_campaign_' || i::TEXT;

            -- Skip paused campaigns for recent days
            IF v_campaign_statuses[i] = 'PAUSED' AND v_day_offset < 7 THEN
                CONTINUE;
            END IF;

            v_rand_factor := 0.5 + random();
            v_impressions := GREATEST(0, (i * 500 + (i * i * 100))::INT);
            v_impressions := (v_impressions * v_rand_factor)::INT;

            v_clicks := (v_impressions * (0.005 + random() * 0.015))::INT;
            v_cost := v_clicks * (0.50 + random() * 1.0);

            IF i IN (2, 3, 6) THEN
                v_orders := (v_clicks * (0.05 + random() * 0.10))::INT;
            ELSIF i IN (1, 7) THEN
                v_orders := (v_clicks * (0.01 + random() * 0.05))::INT;
            ELSE
                v_orders := (v_clicks * random() * 0.08)::INT;
            END IF;

            v_sales := v_orders * (15 + random() * 20);

            INSERT INTO daily_performance (workspace_id, campaign_id, report_date,
                                          impressions, clicks, cost, orders, sales,
                                          acos, ctr, cpc)
            VALUES (
                ws_id, v_cid, v_report_date,
                v_impressions, v_clicks, ROUND(v_cost, 2), v_orders, ROUND(v_sales, 2),
                CASE WHEN v_sales > 0 THEN ROUND(v_cost / v_sales * 100, 2) ELSE 0 END,
                CASE WHEN v_impressions > 0 THEN ROUND(v_clicks::NUMERIC / v_impressions, 4) ELSE 0 END,
                CASE WHEN v_clicks > 0 THEN ROUND(v_cost / v_clicks, 2) ELSE 0 END
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
    -- 3. Search terms (20 terms x 7 days)
    -- ════════════════════════════════
    FOR v_day_offset IN 0..6 LOOP
        v_report_date := CURRENT_DATE - v_day_offset;

        FOR j IN 1..20 LOOP
            FOR i IN 1..3 LOOP
                v_cid := 'mock_campaign_' || ((j + i) % 10 + 1)::TEXT;
                v_cname := v_campaign_names[(j + i) % 10 + 1];
                v_ag_id := 'mock_ag_' || v_cid;
                v_ag_name := 'Default Ad Group';

                v_impressions := (20 + random() * 500)::INT;
                v_clicks := (v_impressions * (0.01 + random() * 0.04))::INT;
                v_cost := v_clicks * (0.40 + random() * 0.90);
                v_orders := CASE
                    WHEN random() > 0.7 THEN (random() * 3)::INT
                    ELSE 0
                END;
                v_sales := v_orders * (15 + random() * 20);

                INSERT INTO search_term_performance (
                    workspace_id, campaign_id, campaign_name, ad_group_id, ad_group_name,
                    keyword, match_type, search_term, report_date,
                    impressions, clicks, cost, orders, sales, add_to_cart,
                    acos, ctr, cpc
                )
                VALUES (
                    ws_id, v_cid, v_cname, v_ag_id, v_ag_name,
                    v_search_terms[j], v_match_types[(i % 3) + 1], v_search_terms[j], v_report_date,
                    v_impressions, v_clicks, ROUND(v_cost, 2), v_orders, ROUND(v_sales, 2),
                    v_orders + (random() * 2)::INT,
                    CASE WHEN v_sales > 0 THEN ROUND(v_cost / v_sales * 100, 2) ELSE 0 END,
                    CASE WHEN v_impressions > 0 THEN ROUND(v_clicks::NUMERIC / v_impressions, 4) ELSE 0 END,
                    CASE WHEN v_clicks > 0 THEN ROUND(v_cost / v_clicks, 2) ELSE 0 END
                )
                ON CONFLICT (workspace_id, campaign_id, search_term, report_date) DO NOTHING;
            END LOOP;
        END LOOP;
    END LOOP;

    -- ════════════════════════════════
    -- 4. Product performance (10 ASINs x 7 days)
    -- ════════════════════════════════
    FOR v_day_offset IN 0..6 LOOP
        v_report_date := CURRENT_DATE - v_day_offset;

        FOR j IN 1..10 LOOP
            v_cid := 'mock_campaign_' || ((j % 10) + 1)::TEXT;
            v_cname := v_campaign_names[(j % 10) + 1];
            v_ag_id := 'mock_ag_' || v_cid;
            v_ag_name := 'Default Ad Group';

            v_impressions := (100 + random() * 2000)::INT;
            v_clicks := (v_impressions * (0.008 + random() * 0.02))::INT;
            v_cost := v_clicks * (0.55 + random() * 0.85);
            v_orders := CASE
                WHEN j <= 3 THEN (v_clicks * (0.05 + random() * 0.10))::INT
                WHEN j <= 6 THEN (v_clicks * (0.02 + random() * 0.05))::INT
                ELSE (v_clicks * random() * 0.03)::INT
            END;
            v_sales := v_orders * (15 + random() * 20);

            INSERT INTO product_performance (
                workspace_id, campaign_id, campaign_name, ad_group_id, ad_group_name,
                asin, sku, report_date,
                impressions, clicks, cost, orders, sales, add_to_cart,
                acos, ctr, cpc
            )
            VALUES (
                ws_id, v_cid, v_cname, v_ag_id, v_ag_name,
                v_asins[j], v_skus[j], v_report_date,
                v_impressions, v_clicks, ROUND(v_cost, 2), v_orders, ROUND(v_sales, 2),
                v_orders + (random() * 3)::INT,
                CASE WHEN v_sales > 0 THEN ROUND(v_cost / v_sales * 100, 2) ELSE 0 END,
                CASE WHEN v_impressions > 0 THEN ROUND(v_clicks::NUMERIC / v_impressions, 4) ELSE 0 END,
                CASE WHEN v_clicks > 0 THEN ROUND(v_cost / v_clicks, 2) ELSE 0 END
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
