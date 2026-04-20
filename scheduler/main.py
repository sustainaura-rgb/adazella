"""AdPilot multi-tenant scheduler.

Loops over ALL active Amazon connections across ALL workspaces, fetching
each workspace's data independently. Each workspace has its own
refresh_token in the `amazon_connections` table.
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

# ── Env check with clear error messages (so users see typos) ──
def _require_env(name: str) -> str:
    val = os.environ.get(name)
    if not val:
        logger.error("Missing required env var: %s", name)
        logger.error("Check your scheduler/.env file. Expected variable names:")
        logger.error("  DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,")
        logger.error("  AMAZON_ADS_CLIENT_ID, AMAZON_ADS_CLIENT_SECRET")
        raise SystemExit(1)
    return val


DATABASE_URL = _require_env("DATABASE_URL")
AMAZON_CLIENT_ID = _require_env("AMAZON_ADS_CLIENT_ID")
AMAZON_CLIENT_SECRET = _require_env("AMAZON_ADS_CLIENT_SECRET")

# Print diagnostic so user can see what loaded
def _status(name: str) -> str:
    v = os.environ.get(name)
    if not v: return "❌ MISSING"
    if len(v) < 8: return f"⚠️  SHORT ({len(v)} chars)"
    return f"✅ loaded ({v[:4]}...{v[-4:]}, {len(v)} chars)"

logger.info("── Scheduler env check ──")
logger.info("DATABASE_URL             : %s", _status("DATABASE_URL"))
logger.info("AMAZON_ADS_CLIENT_ID     : %s", _status("AMAZON_ADS_CLIENT_ID"))
logger.info("AMAZON_ADS_CLIENT_SECRET : %s", _status("AMAZON_ADS_CLIENT_SECRET"))
logger.info("─────────────────────────")

token_mgr = WorkspaceTokenManager(DATABASE_URL, AMAZON_CLIENT_ID, AMAZON_CLIENT_SECRET)
fetcher = AmazonAdsFetcher(DATABASE_URL, token_mgr)

# Per-workspace lock — so we never run two fetches for the SAME workspace concurrently
_workspace_locks = {}
_locks_mutex = threading.Lock()


def _lock_for_workspace(workspace_id: str) -> threading.Lock:
    with _locks_mutex:
        if workspace_id not in _workspace_locks:
            _workspace_locks[workspace_id] = threading.Lock()
        return _workspace_locks[workspace_id]


# ─────────────────────────────────────────────────────────────
# Helpers to load workspaces with active Amazon connections
# ─────────────────────────────────────────────────────────────
def get_active_connections():
    """Return list of (workspace_id, profile_id) for active connections."""
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
                """UPDATE fetch_logs SET status=%s, records_fetched=%s,
                   error_message=%s, completed_at=NOW() WHERE id=%s""",
                (status, records, (error or "")[:2000], log_id),
            )
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# Jobs — iterate over every active workspace
# ─────────────────────────────────────────────────────────────
def live_fetch_campaigns_all_workspaces():
    """Fetch today's campaign data for every active workspace.

    Each workspace has its own lock so a slow one doesn't block others.
    Runs sequentially per workspace; could parallelize later with threads.
    """
    connections = get_active_connections()
    logger.info("Live campaign fetch starting — %d active connections", len(connections))

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    for ws_id, profile_id in connections:
        lock = _lock_for_workspace(ws_id)
        if not lock.acquire(blocking=False):
            logger.info("Skipping ws=%s — previous run still in progress", ws_id[:8])
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


# ─────────────────────────────────────────────────────────────
# Health HTTP server — required by Render free tier
# ─────────────────────────────────────────────────────────────
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


# ─────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────
def main():
    logger.info("AdPilot scheduler starting")

    # Start health server on separate thread
    threading.Thread(target=_health_server, daemon=True, name="health").start()

    # Schedule the jobs
    # Priority 1: campaigns every 1 min (as fast as Amazon allows per workspace)
    schedule.every(1).minutes.do(live_fetch_campaigns_all_workspaces)
    # TODO: search terms every 60 min, products every 180 min, yesterday overlap window
    # (will port from v1 after Phase 1 is smoke-tested)

    # First run on startup
    live_fetch_campaigns_all_workspaces()

    logger.info("Scheduler running — Ctrl+C to stop")
    while True:
        schedule.run_pending()
        time.sleep(10)


if __name__ == "__main__":
    main()
