"""AdPilot multi-tenant scheduler.

Loops over ALL active Amazon connections across ALL workspaces, fetching
each workspace's data independently with per-workspace locks.

Schedule priorities (identical to v1 after user feedback):
  • Campaigns (today):    every  1 min    — PRIMARY: impressions/clicks/spend
  • Search terms (today): every 60 min    — medium priority
  • Products (today):     every 180 min   — low priority (slowest on Amazon)
  • Yesterday (full):     every 30 min    — but only UTC 00:00–12:00 (PT overlap)
  • Keywords sync:        daily at 04:00 UTC
  • Backfill last 10d:    daily at 03:00 UTC
"""
import logging
import os
import threading
import time
from datetime import datetime, timezone, timedelta
from http.server import BaseHTTPRequestHandler, HTTPServer

import psycopg2
import schedule
from dotenv import load_dotenv

load_dotenv()

from fetcher import AmazonAdsFetcher  # noqa: E402
from token_manager import WorkspaceTokenManager  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────
# Env check with clear errors
# ─────────────────────────────────────────────
def _require_env(name: str) -> str:
    val = os.environ.get(name)
    if not val:
        logger.error("Missing required env var: %s", name)
        raise SystemExit(1)
    return val


DATABASE_URL = _require_env("DATABASE_URL")
AMAZON_CLIENT_ID = _require_env("AMAZON_ADS_CLIENT_ID")
AMAZON_CLIENT_SECRET = _require_env("AMAZON_ADS_CLIENT_SECRET")

token_mgr = WorkspaceTokenManager(DATABASE_URL, AMAZON_CLIENT_ID, AMAZON_CLIENT_SECRET)
fetcher = AmazonAdsFetcher(DATABASE_URL, token_mgr)


# ─────────────────────────────────────────────
# Per-workspace-per-job locks. One lock PER (workspace, job_type).
# Prevents overlapping fetches of the same type for the same workspace,
# but allows different job types to run in parallel for the same workspace.
# ─────────────────────────────────────────────
_locks: dict[tuple[str, str], threading.Lock] = {}
_locks_mutex = threading.Lock()


def _lock_for(workspace_id: str, job_type: str) -> threading.Lock:
    key = (workspace_id, job_type)
    with _locks_mutex:
        if key not in _locks:
            _locks[key] = threading.Lock()
        return _locks[key]


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────
def get_active_connections():
    """Return list of (workspace_id, profile_id) for active Amazon connections."""
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT workspace_id, profile_id
                   FROM amazon_connections
                   WHERE status = 'active'"""
            )
            return [(str(r[0]), r[1]) for r in cur.fetchall()]
    finally:
        conn.close()


def _log_start(workspace_id: str, fetch_type: str) -> int:
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                """INSERT INTO fetch_logs (workspace_id, fetch_type, status)
                   VALUES (%s, %s, 'RUNNING') RETURNING id""",
                (workspace_id, fetch_type),
            )
            return cur.fetchone()[0]
    finally:
        conn.close()


def _log_finish(log_id: int, status: str, records: int = 0, error: str = None):
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                """UPDATE fetch_logs
                   SET status=%s, records_fetched=%s,
                       error_message=%s, completed_at=NOW()
                   WHERE id=%s""",
                (status, records, (error or "")[:2000], log_id),
            )
    finally:
        conn.close()


# ═════════════════════════════════════════════════════════════
# JOBS — each iterates over all active workspace connections
# ═════════════════════════════════════════════════════════════

def live_fetch_campaigns_all():
    """Priority 1: fetch today's campaign data (every 1 min) — the hot path."""
    connections = get_active_connections()
    if not connections:
        return
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    for ws_id, profile_id in connections:
        lock = _lock_for(ws_id, "campaigns")
        if not lock.acquire(blocking=False):
            continue

        log_id = _log_start(ws_id, f"live_campaigns_{today}")
        try:
            fetcher.sync_campaigns(ws_id, profile_id)
            count = fetcher.fetch_campaigns(ws_id, profile_id, today)
            fetcher.touch_last_fetch(ws_id, profile_id)
            _log_finish(log_id, "SUCCESS", records=count)
        except Exception as exc:
            logger.exception("Campaign fetch failed for ws=%s", ws_id[:8])
            _log_finish(log_id, "FAILED", error=str(exc))
        finally:
            lock.release()


def live_fetch_search_terms_all():
    """Priority 4: search terms (every 60 min)."""
    connections = get_active_connections()
    if not connections:
        return
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    for ws_id, profile_id in connections:
        lock = _lock_for(ws_id, "search_terms")
        if not lock.acquire(blocking=False):
            continue

        log_id = _log_start(ws_id, f"live_search_terms_{today}")
        try:
            count = fetcher.fetch_search_terms(ws_id, profile_id, today)
            _log_finish(log_id, "SUCCESS", records=count)
        except Exception as exc:
            logger.exception("Search terms fetch failed for ws=%s", ws_id[:8])
            _log_finish(log_id, "FAILED", error=str(exc))
        finally:
            lock.release()


def live_fetch_products_all():
    """Priority 5: product/ASIN performance (every 180 min)."""
    connections = get_active_connections()
    if not connections:
        return
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    for ws_id, profile_id in connections:
        lock = _lock_for(ws_id, "products")
        if not lock.acquire(blocking=False):
            continue

        log_id = _log_start(ws_id, f"live_products_{today}")
        try:
            count = fetcher.fetch_products(ws_id, profile_id, today)
            _log_finish(log_id, "SUCCESS", records=count)
        except Exception as exc:
            logger.exception("Products fetch failed for ws=%s", ws_id[:8])
            _log_finish(log_id, "FAILED", error=str(exc))
        finally:
            lock.release()


def live_fetch_yesterday_all():
    """Priority 3: yesterday's full pipeline (every 30 min during PT overlap)."""
    now_utc = datetime.now(timezone.utc)
    # Skip outside the UTC 00:00-12:00 window (data stable after PT midnight settles)
    if now_utc.hour >= 12:
        return

    connections = get_active_connections()
    if not connections:
        return
    yesterday = (now_utc - timedelta(days=1)).strftime("%Y-%m-%d")

    for ws_id, profile_id in connections:
        lock = _lock_for(ws_id, "yesterday")
        if not lock.acquire(blocking=False):
            continue

        log_id = _log_start(ws_id, f"live_yesterday_{yesterday}")
        try:
            fetcher.fetch_campaigns(ws_id, profile_id, yesterday)
            try:
                fetcher.fetch_search_terms(ws_id, profile_id, yesterday)
            except Exception:
                logger.exception("Yesterday search_terms failed for ws=%s", ws_id[:8])
            try:
                fetcher.fetch_products(ws_id, profile_id, yesterday)
            except Exception:
                logger.exception("Yesterday products failed for ws=%s", ws_id[:8])
            _log_finish(log_id, "SUCCESS")
        except Exception as exc:
            logger.exception("Yesterday fetch failed for ws=%s", ws_id[:8])
            _log_finish(log_id, "FAILED", error=str(exc))
        finally:
            lock.release()


def daily_keyword_sync_all():
    """Sync targeted keywords + negative keywords (nightly at 04:00 UTC)."""
    connections = get_active_connections()
    for ws_id, profile_id in connections:
        lock = _lock_for(ws_id, "keywords")
        if not lock.acquire(blocking=False):
            continue

        log_id = _log_start(ws_id, "keyword_sync")
        try:
            n_kw = fetcher.sync_keywords(ws_id, profile_id)
            n_neg = fetcher.sync_negative_keywords(ws_id, profile_id)
            n_ag = 0
            try:
                n_ag = fetcher.sync_ad_group_negatives(ws_id, profile_id)
            except Exception:
                logger.exception("Ad-group negatives sync failed for ws=%s", ws_id[:8])
            _log_finish(log_id, "SUCCESS", records=n_kw + n_neg + n_ag)
        except Exception as exc:
            logger.exception("Keyword sync failed for ws=%s", ws_id[:8])
            _log_finish(log_id, "FAILED", error=str(exc))
        finally:
            lock.release()


def daily_backfill_all():
    """Backfill last 10 days (nightly at 03:00 UTC) to fill any gaps."""
    connections = get_active_connections()
    if not connections:
        return

    for i in range(10, 0, -1):
        report_date = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d")
        for ws_id, profile_id in connections:
            log_id = _log_start(ws_id, f"backfill_{report_date}")
            try:
                fetcher.fetch_campaigns(ws_id, profile_id, report_date)
                _log_finish(log_id, "SUCCESS")
            except Exception as exc:
                logger.exception("Backfill %s failed for ws=%s", report_date, ws_id[:8])
                _log_finish(log_id, "FAILED", error=str(exc))
        time.sleep(5)


# ─────────────────────────────────────────────
# Health HTTP server (required by Render free tier)
# ─────────────────────────────────────────────
class _HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(b"ok")

    def do_HEAD(self):
        self.send_response(200)
        self.end_headers()

    def log_message(self, *_a, **_kw):
        pass


def _health_server():
    port = int(os.environ.get("PORT", "10000"))
    srv = HTTPServer(("0.0.0.0", port), _HealthHandler)
    logger.info("Health HTTP on port %d", port)
    srv.serve_forever()


# ─────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────
def main():
    logger.info("─────────────────────────")
    logger.info("AdPilot multi-tenant scheduler starting")
    logger.info("─────────────────────────")

    # Health server on separate thread
    threading.Thread(target=_health_server, daemon=True, name="health").start()

    # Schedule all jobs
    schedule.every(1).minutes.do(live_fetch_campaigns_all)
    schedule.every(60).minutes.do(live_fetch_search_terms_all)
    schedule.every(180).minutes.do(live_fetch_products_all)
    schedule.every(30).minutes.do(live_fetch_yesterday_all)

    schedule.every().day.at("03:00").do(daily_backfill_all)
    schedule.every().day.at("04:00").do(daily_keyword_sync_all)

    # First run on startup (fire-and-forget — don't block the main loop)
    threading.Thread(target=live_fetch_campaigns_all, daemon=True).start()

    logger.info("Scheduler running — Ctrl+C to stop")
    while True:
        schedule.run_pending()
        time.sleep(10)


if __name__ == "__main__":
    main()
