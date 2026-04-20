"""Multi-tenant Amazon Ads fetcher.

Accepts a workspace_id + profile_id per operation. Each workspace has its
own OAuth tokens (managed by WorkspaceTokenManager) and data is always
scoped by workspace_id in the DB.
"""
import gzip
import json
import logging
import time
from datetime import datetime, timezone, timedelta

import psycopg2
import psycopg2.extras
import requests

logger = logging.getLogger(__name__)

BASE_URL = "https://advertising-api.amazon.com"

POLL_INTERVAL = 15       # seconds between status checks
POLL_TIMEOUT = 1200      # 20 min max wait
RATE_LIMIT_BACKOFF = 60  # seconds to sleep on 429
MAX_RETRIES = 3

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
    """Multi-tenant fetcher. Use per-call (workspace_id, profile_id)."""

    def __init__(self, db_url: str, token_manager):
        self.db_url = db_url
        self.token_manager = token_manager

    # ─────────────────────────────────────────────────────────
    # Helper: HTTP request with Amazon headers for a workspace
    # ─────────────────────────────────────────────────────────
    def _headers(self, workspace_id: str, profile_id: str):
        access_token = self.token_manager.get_access_token(workspace_id, profile_id)
        return {
            "Authorization": f"Bearer {access_token}",
            "Amazon-Advertising-API-ClientId": self.token_manager.client_id,
            "Amazon-Advertising-API-Scope": profile_id,
        }

    # ─────────────────────────────────────────────────────────
    # Report pipeline (request → poll → download)
    # ─────────────────────────────────────────────────────────
    def _request_report(self, workspace_id: str, profile_id: str, report_spec: dict):
        url = f"{BASE_URL}/reporting/reports"
        headers = {
            **self._headers(workspace_id, profile_id),
            "Content-Type": "application/vnd.createasyncreportrequest.v3+json",
        }
        resp = requests.post(url, headers=headers, json=report_spec, timeout=30)
        if resp.status_code == 425:
            # Duplicate — extract existing report_id from error message if present
            detail = resp.json().get("detail", "")
            logger.warning("425 duplicate — %s", detail)
            time.sleep(30)
            raise RuntimeError(f"Duplicate report: {detail}")
        if resp.status_code == 429:
            logger.warning("429 on report request — sleeping %ds", RATE_LIMIT_BACKOFF)
            time.sleep(RATE_LIMIT_BACKOFF)
            raise RuntimeError("Rate limited")
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

    # ─────────────────────────────────────────────────────────
    # Campaign report → hourly_performance + daily rollup
    # ─────────────────────────────────────────────────────────
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

    # ─────────────────────────────────────────────────────────
    # Campaigns list sync
    # ─────────────────────────────────────────────────────────
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

    # Update last_fetch_at on successful fetch
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
