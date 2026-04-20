"""Multi-tenant Amazon Ads fetcher.

All methods accept (workspace_id, profile_id) per call. Data is always
scoped by workspace_id in the DB.
"""
import gzip
import json
import logging
import time

import psycopg2
import psycopg2.extras
import requests

logger = logging.getLogger(__name__)

BASE_URL = "https://advertising-api.amazon.com"

POLL_INTERVAL = 15
POLL_TIMEOUT = 1200
RATE_LIMIT_BACKOFF = 60

# ───────── Report column specs ─────────
CAMPAIGN_COLUMNS = [
    "impressions", "clicks", "cost", "purchases14d", "sales14d",
    "acosClicks14d", "campaignId", "campaignName", "campaignStatus",
]

SEARCH_TERM_COLUMNS = [
    "impressions", "clicks", "cost", "purchases14d", "sales14d",
    "campaignId", "campaignName", "adGroupId", "adGroupName",
    "keyword", "keywordType", "matchType", "searchTerm", "addToList",
]

PRODUCT_COLUMNS = [
    "impressions", "clicks", "cost", "purchases14d", "sales14d",
    "campaignId", "campaignName", "adGroupId", "adGroupName",
    "advertisedAsin", "advertisedSku", "addToList",
]


class AmazonAdsFetcher:
    """Multi-tenant fetcher — use per-call (workspace_id, profile_id)."""

    def __init__(self, db_url: str, token_manager):
        self.db_url = db_url
        self.token_manager = token_manager

    # ─────────────────────────────────────────────
    # Helpers
    # ─────────────────────────────────────────────
    def _headers(self, workspace_id: str, profile_id: str):
        access_token = self.token_manager.get_access_token(workspace_id, profile_id)
        return {
            "Authorization": f"Bearer {access_token}",
            "Amazon-Advertising-API-ClientId": self.token_manager.client_id,
            "Amazon-Advertising-API-Scope": profile_id,
        }

    def _request_report(self, workspace_id: str, profile_id: str, report_spec: dict):
        url = f"{BASE_URL}/reporting/reports"
        headers = {
            **self._headers(workspace_id, profile_id),
            "Content-Type": "application/vnd.createasyncreportrequest.v3+json",
        }
        resp = requests.post(url, headers=headers, json=report_spec, timeout=30)

        if resp.status_code == 425:
            detail = resp.json().get("detail", "")
            logger.warning("425 duplicate report — %s", detail)
            time.sleep(30)
            raise RuntimeError(f"Duplicate report: {detail}")

        if resp.status_code == 429:
            logger.warning("429 rate-limited — sleeping %ds", RATE_LIMIT_BACKOFF)
            time.sleep(RATE_LIMIT_BACKOFF)
            raise RuntimeError("Rate limited on report request")

        resp.raise_for_status()
        return resp.json()["reportId"]

    def _poll_report(self, workspace_id: str, profile_id: str, report_id: str):
        url = f"{BASE_URL}/reporting/reports/{report_id}"
        deadline = time.time() + POLL_TIMEOUT
        while time.time() < deadline:
            resp = requests.get(url, headers=self._headers(workspace_id, profile_id), timeout=30)

            if resp.status_code == 429:
                logger.warning("Poll 429 — sleeping %ds", RATE_LIMIT_BACKOFF)
                time.sleep(RATE_LIMIT_BACKOFF)
                continue

            resp.raise_for_status()
            data = resp.json()
            status = data.get("status")
            logger.info("Report %s [ws=%s]: %s", report_id, workspace_id[:8], status)

            if status == "COMPLETED":
                return data["url"]
            if status == "FAILURE":
                raise RuntimeError(f"Report {report_id} failed: {data.get('statusDetails')}")

            time.sleep(POLL_INTERVAL)

        raise TimeoutError(f"Report {report_id} not ready after {POLL_TIMEOUT}s")

    def _download_report(self, download_url: str):
        resp = requests.get(download_url, timeout=120)
        resp.raise_for_status()
        decompressed = gzip.decompress(resp.content)
        return json.loads(decompressed)

    def touch_last_fetch(self, workspace_id: str, profile_id: str):
        conn = psycopg2.connect(self.db_url)
        try:
            with conn, conn.cursor() as cur:
                cur.execute(
                    """UPDATE amazon_connections
                       SET last_fetch_at = NOW()
                       WHERE workspace_id = %s AND profile_id = %s""",
                    (workspace_id, profile_id),
                )
        finally:
            conn.close()

    # ─────────────────────────────────────────────
    # Campaigns list sync
    # ─────────────────────────────────────────────
    def sync_campaigns(self, workspace_id: str, profile_id: str):
        url = f"{BASE_URL}/sp/campaigns/list"
        headers = {
            **self._headers(workspace_id, profile_id),
            "Accept": "application/vnd.spCampaign.v3+json",
            "Content-Type": "application/vnd.spCampaign.v3+json",
        }
        resp = requests.post(url, headers=headers, json={}, timeout=30)
        resp.raise_for_status()
        campaigns = resp.json().get("campaigns", [])

        conn = psycopg2.connect(self.db_url)
        try:
            with conn, conn.cursor() as cur:
                psycopg2.extras.execute_batch(
                    cur,
                    """INSERT INTO campaigns
                       (workspace_id, campaign_id, campaign_name, campaign_type,
                        status, serving_status, daily_budget, portfolio_id, updated_at)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
                       ON CONFLICT (workspace_id, campaign_id) DO UPDATE SET
                         campaign_name  = EXCLUDED.campaign_name,
                         status         = EXCLUDED.status,
                         serving_status = EXCLUDED.serving_status,
                         daily_budget   = EXCLUDED.daily_budget,
                         portfolio_id   = EXCLUDED.portfolio_id,
                         updated_at     = NOW()""",
                    [
                        (
                            workspace_id,
                            str(c["campaignId"]),
                            c.get("name", ""),
                            "SP",
                            c.get("state", "").upper(),
                            (c.get("extendedData") or {}).get("servingStatus"),
                            (c.get("budget") or {}).get("budget"),
                            c.get("portfolioId"),
                        )
                        for c in campaigns
                    ],
                    page_size=500,
                )
        finally:
            conn.close()
        logger.info("Synced %d campaigns for ws=%s", len(campaigns), workspace_id[:8])
        return len(campaigns)

    # ─────────────────────────────────────────────
    # Campaign performance report
    # ─────────────────────────────────────────────
    def fetch_campaigns(self, workspace_id: str, profile_id: str, report_date: str):
        spec = {
            "name": f"campaigns-{report_date}",
            "startDate": report_date,
            "endDate": report_date,
            "configuration": {
                "adProduct": "SPONSORED_PRODUCTS",
                "groupBy": ["campaign"],
                "columns": CAMPAIGN_COLUMNS,
                "reportTypeId": "spCampaigns",
                "timeUnit": "DAILY",
                "format": "GZIP_JSON",
            },
        }
        report_id = self._request_report(workspace_id, profile_id, spec)
        download_url = self._poll_report(workspace_id, profile_id, report_id)
        rows = self._download_report(download_url)
        return self._save_campaign_performance(workspace_id, rows, report_date)

    def _save_campaign_performance(self, workspace_id: str, rows, report_date: str):
        if not rows:
            return 0
        conn = psycopg2.connect(self.db_url)
        try:
            with conn, conn.cursor() as cur:
                psycopg2.extras.execute_batch(
                    cur,
                    """INSERT INTO daily_performance
                       (workspace_id, campaign_id, report_date, impressions, clicks,
                        cost, orders, sales, acos, ctr, cpc, updated_at)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                       ON CONFLICT (workspace_id, campaign_id, report_date) DO UPDATE SET
                         impressions = EXCLUDED.impressions,
                         clicks      = EXCLUDED.clicks,
                         cost        = EXCLUDED.cost,
                         orders      = EXCLUDED.orders,
                         sales       = EXCLUDED.sales,
                         acos        = EXCLUDED.acos,
                         ctr         = EXCLUDED.ctr,
                         cpc         = EXCLUDED.cpc,
                         updated_at  = NOW()""",
                    [
                        (
                            workspace_id,
                            str(r["campaignId"]),
                            report_date,
                            int(r.get("impressions", 0) or 0),
                            int(r.get("clicks", 0) or 0),
                            float(r.get("cost", 0) or 0),
                            int(r.get("purchases14d", 0) or 0),
                            float(r.get("sales14d", 0) or 0),
                            float(r.get("acosClicks14d", 0) or 0),
                            (float(r["clicks"]) / r["impressions"]) if r.get("impressions") else 0,
                            (float(r["cost"]) / r["clicks"]) if r.get("clicks") else 0,
                        )
                        for r in rows
                    ],
                    page_size=500,
                )
                logger.info("Upserted %d campaign rows for ws=%s date=%s",
                            len(rows), workspace_id[:8], report_date)
                return len(rows)
        finally:
            conn.close()

    # ─────────────────────────────────────────────
    # Search term report
    # ─────────────────────────────────────────────
    def fetch_search_terms(self, workspace_id: str, profile_id: str, report_date: str):
        spec = {
            "name": f"search-terms-{report_date}",
            "startDate": report_date,
            "endDate": report_date,
            "configuration": {
                "adProduct": "SPONSORED_PRODUCTS",
                "groupBy": ["searchTerm"],
                "columns": SEARCH_TERM_COLUMNS,
                "reportTypeId": "spSearchTerm",
                "timeUnit": "DAILY",
                "format": "GZIP_JSON",
            },
        }
        report_id = self._request_report(workspace_id, profile_id, spec)
        download_url = self._poll_report(workspace_id, profile_id, report_id)
        rows = self._download_report(download_url)
        return self._save_search_terms(workspace_id, rows, report_date)

    def _save_search_terms(self, workspace_id: str, rows, report_date: str):
        if not rows:
            return 0
        conn = psycopg2.connect(self.db_url)
        try:
            with conn, conn.cursor() as cur:
                psycopg2.extras.execute_batch(
                    cur,
                    """INSERT INTO search_term_performance
                       (workspace_id, campaign_id, campaign_name, ad_group_id, ad_group_name,
                        keyword, match_type, search_term, report_date,
                        impressions, clicks, cost, orders, sales, add_to_cart,
                        acos, ctr, cpc)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                       ON CONFLICT (workspace_id, campaign_id, search_term, report_date) DO UPDATE SET
                         impressions = EXCLUDED.impressions,
                         clicks = EXCLUDED.clicks,
                         cost = EXCLUDED.cost,
                         orders = EXCLUDED.orders,
                         sales = EXCLUDED.sales,
                         add_to_cart = EXCLUDED.add_to_cart""",
                    [
                        (
                            workspace_id,
                            str(r.get("campaignId", "")),
                            r.get("campaignName", ""),
                            str(r.get("adGroupId", "")),
                            r.get("adGroupName", ""),
                            r.get("keyword", ""),
                            r.get("matchType", ""),
                            r.get("searchTerm", ""),
                            report_date,
                            int(r.get("impressions", 0) or 0),
                            int(r.get("clicks", 0) or 0),
                            float(r.get("cost", 0) or 0),
                            int(r.get("purchases14d", 0) or 0),
                            float(r.get("sales14d", 0) or 0),
                            int(r.get("addToList", 0) or 0),
                            float(r["cost"]) / float(r["sales14d"]) * 100 if r.get("sales14d") else 0,
                            float(r["clicks"]) / float(r["impressions"]) if r.get("impressions") else 0,
                            float(r["cost"]) / float(r["clicks"]) if r.get("clicks") else 0,
                        )
                        for r in rows
                    ],
                    page_size=500,
                )
                logger.info("Upserted %d search term rows for ws=%s date=%s",
                            len(rows), workspace_id[:8], report_date)
                return len(rows)
        finally:
            conn.close()

    # ─────────────────────────────────────────────
    # Product (ASIN) report
    # ─────────────────────────────────────────────
    def fetch_products(self, workspace_id: str, profile_id: str, report_date: str):
        spec = {
            "name": f"products-{report_date}",
            "startDate": report_date,
            "endDate": report_date,
            "configuration": {
                "adProduct": "SPONSORED_PRODUCTS",
                "groupBy": ["advertiser"],
                "columns": PRODUCT_COLUMNS,
                "reportTypeId": "spAdvertisedProduct",
                "timeUnit": "DAILY",
                "format": "GZIP_JSON",
            },
        }
        report_id = self._request_report(workspace_id, profile_id, spec)
        download_url = self._poll_report(workspace_id, profile_id, report_id)
        rows = self._download_report(download_url)
        return self._save_products(workspace_id, rows, report_date)

    def _save_products(self, workspace_id: str, rows, report_date: str):
        if not rows:
            return 0
        conn = psycopg2.connect(self.db_url)
        try:
            with conn, conn.cursor() as cur:
                psycopg2.extras.execute_batch(
                    cur,
                    """INSERT INTO product_performance
                       (workspace_id, campaign_id, campaign_name, ad_group_id, ad_group_name,
                        asin, sku, report_date,
                        impressions, clicks, cost, orders, sales, add_to_cart,
                        acos, ctr, cpc)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                       ON CONFLICT (workspace_id, campaign_id, asin, report_date) DO UPDATE SET
                         impressions = EXCLUDED.impressions,
                         clicks = EXCLUDED.clicks,
                         cost = EXCLUDED.cost,
                         orders = EXCLUDED.orders,
                         sales = EXCLUDED.sales,
                         add_to_cart = EXCLUDED.add_to_cart""",
                    [
                        (
                            workspace_id,
                            str(r.get("campaignId", "")),
                            r.get("campaignName", ""),
                            str(r.get("adGroupId", "")),
                            r.get("adGroupName", ""),
                            r.get("advertisedAsin", ""),
                            r.get("advertisedSku", ""),
                            report_date,
                            int(r.get("impressions", 0) or 0),
                            int(r.get("clicks", 0) or 0),
                            float(r.get("cost", 0) or 0),
                            int(r.get("purchases14d", 0) or 0),
                            float(r.get("sales14d", 0) or 0),
                            int(r.get("addToList", 0) or 0),
                            float(r["cost"]) / float(r["sales14d"]) * 100 if r.get("sales14d") else 0,
                            float(r["clicks"]) / float(r["impressions"]) if r.get("impressions") else 0,
                            float(r["cost"]) / float(r["clicks"]) if r.get("clicks") else 0,
                        )
                        for r in rows
                    ],
                    page_size=500,
                )
                logger.info("Upserted %d product rows for ws=%s date=%s",
                            len(rows), workspace_id[:8], report_date)
                return len(rows)
        finally:
            conn.close()

    # ─────────────────────────────────────────────
    # Keyword list sync (targeted keywords)
    # ─────────────────────────────────────────────
    def sync_keywords(self, workspace_id: str, profile_id: str):
        url = f"{BASE_URL}/sp/keywords/list"
        headers = {
            **self._headers(workspace_id, profile_id),
            "Accept": "application/vnd.spKeyword.v3+json",
            "Content-Type": "application/vnd.spKeyword.v3+json",
        }
        all_keywords = []
        next_token = None
        while True:
            body = {"maxResults": 1000}
            if next_token:
                body["nextToken"] = next_token
            resp = requests.post(url, headers=headers, json=body, timeout=30)
            if resp.status_code == 429:
                logger.warning("sync_keywords 429 — sleeping %ds", RATE_LIMIT_BACKOFF)
                time.sleep(RATE_LIMIT_BACKOFF)
                continue
            resp.raise_for_status()
            data = resp.json()
            all_keywords.extend(data.get("keywords", []))
            next_token = data.get("nextToken")
            if not next_token:
                break

        if not all_keywords:
            return 0

        conn = psycopg2.connect(self.db_url)
        try:
            with conn, conn.cursor() as cur:
                psycopg2.extras.execute_batch(
                    cur,
                    """INSERT INTO campaign_keywords
                       (workspace_id, keyword_id, campaign_id, ad_group_id,
                        keyword_text, match_type, state, bid, updated_at)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
                       ON CONFLICT (workspace_id, keyword_id) DO UPDATE SET
                         campaign_id = EXCLUDED.campaign_id,
                         ad_group_id = EXCLUDED.ad_group_id,
                         keyword_text = EXCLUDED.keyword_text,
                         match_type = EXCLUDED.match_type,
                         state = EXCLUDED.state,
                         bid = EXCLUDED.bid,
                         updated_at = NOW()""",
                    [
                        (
                            workspace_id,
                            str(k["keywordId"]),
                            str(k.get("campaignId", "")),
                            str(k.get("adGroupId", "")) or None,
                            k.get("keywordText", ""),
                            k.get("matchType", ""),
                            k.get("state", "ENABLED"),
                            k.get("bid"),
                        )
                        for k in all_keywords
                    ],
                    page_size=500,
                )
        finally:
            conn.close()
        logger.info("Synced %d keywords for ws=%s", len(all_keywords), workspace_id[:8])
        return len(all_keywords)

    # ─────────────────────────────────────────────
    # Campaign-level negative keywords sync
    # ─────────────────────────────────────────────
    def sync_negative_keywords(self, workspace_id: str, profile_id: str):
        url = f"{BASE_URL}/sp/campaignNegativeKeywords/list"
        headers = {
            **self._headers(workspace_id, profile_id),
            "Accept": "application/vnd.spCampaignNegativeKeyword.v3+json",
            "Content-Type": "application/vnd.spCampaignNegativeKeyword.v3+json",
        }
        all_negatives = []
        next_token = None
        while True:
            body = {"maxResults": 1000}
            if next_token:
                body["nextToken"] = next_token
            resp = requests.post(url, headers=headers, json=body, timeout=30)
            if resp.status_code == 429:
                logger.warning("sync_negatives 429 — sleeping %ds", RATE_LIMIT_BACKOFF)
                time.sleep(RATE_LIMIT_BACKOFF)
                continue
            resp.raise_for_status()
            data = resp.json()
            all_negatives.extend(data.get("campaignNegativeKeywords", []))
            next_token = data.get("nextToken")
            if not next_token:
                break

        return self._save_negatives(workspace_id, all_negatives)

    # ─────────────────────────────────────────────
    # Ad-group level negatives
    # ─────────────────────────────────────────────
    def sync_ad_group_negatives(self, workspace_id: str, profile_id: str):
        url = f"{BASE_URL}/sp/negativeKeywords/list"
        headers = {
            **self._headers(workspace_id, profile_id),
            "Accept": "application/vnd.spNegativeKeyword.v3+json",
            "Content-Type": "application/vnd.spNegativeKeyword.v3+json",
        }
        all_negatives = []
        next_token = None
        while True:
            body = {"maxResults": 1000}
            if next_token:
                body["nextToken"] = next_token
            try:
                resp = requests.post(url, headers=headers, json=body, timeout=30)
            except requests.exceptions.RequestException:
                break
            if resp.status_code == 404:
                # Some accounts don't have this endpoint
                break
            if resp.status_code == 429:
                time.sleep(RATE_LIMIT_BACKOFF)
                continue
            resp.raise_for_status()
            data = resp.json()
            all_negatives.extend(data.get("negativeKeywords", []))
            next_token = data.get("nextToken")
            if not next_token:
                break

        return self._save_negatives(workspace_id, all_negatives)

    def _save_negatives(self, workspace_id: str, negatives):
        if not negatives:
            return 0
        conn = psycopg2.connect(self.db_url)
        try:
            with conn, conn.cursor() as cur:
                psycopg2.extras.execute_batch(
                    cur,
                    """INSERT INTO campaign_negative_keywords
                       (workspace_id, keyword_id, campaign_id, ad_group_id,
                        keyword_text, match_type, state)
                       VALUES (%s, %s, %s, %s, %s, %s, %s)
                       ON CONFLICT (workspace_id, keyword_id) DO UPDATE SET
                         campaign_id   = EXCLUDED.campaign_id,
                         ad_group_id   = EXCLUDED.ad_group_id,
                         keyword_text  = EXCLUDED.keyword_text,
                         match_type    = EXCLUDED.match_type,
                         state         = EXCLUDED.state""",
                    [
                        (
                            workspace_id,
                            str(k["keywordId"]),
                            str(k.get("campaignId", "")),
                            str(k.get("adGroupId", "")) or None,
                            k.get("keywordText", ""),
                            k.get("matchType", ""),
                            k.get("state", "ENABLED"),
                        )
                        for k in negatives
                    ],
                    page_size=500,
                )
        finally:
            conn.close()
        logger.info("Synced %d negatives for ws=%s", len(negatives), workspace_id[:8])
        return len(negatives)
