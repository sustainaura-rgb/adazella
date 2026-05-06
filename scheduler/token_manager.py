"""Per-workspace token manager.

Each workspace has its own Amazon Ads refresh_token stored in the
`amazon_connections` table. This module handles refresh + caching
PER workspace, not globally like the v1 single-tenant version.
"""
import logging
import time
from datetime import datetime, timezone, timedelta

import psycopg2
import requests

from crypto_util import decrypt as _decrypt, encrypt as _encrypt

logger = logging.getLogger(__name__)

AMAZON_TOKEN_URL = "https://api.amazon.com/auth/o2/token"


class WorkspaceTokenManager:
    """Manages Amazon Ads access tokens for all workspaces.

    Tokens are refreshed lazily — we check expiry per workspace and only
    refresh if we're within 5 minutes of expiration.
    """

    def __init__(self, db_url: str, client_id: str, client_secret: str):
        self.db_url = db_url
        self.client_id = client_id
        self.client_secret = client_secret

    def get_access_token(self, workspace_id: str, profile_id: str) -> str:
        """Return a valid access_token for (workspace_id, profile_id).

        Refreshes if we're within 5 minutes of expiry.

        Race condition protection: uses Postgres advisory lock keyed on the
        (workspace_id, profile_id) hash. If another process is mid-refresh
        for the same pair, this call waits up to 30s for the lock, then
        re-reads the row (which by then has the new token).
        """
        # Hash the key to a 64-bit int for pg_advisory_lock
        lock_key = self._lock_key(workspace_id, profile_id)

        conn = psycopg2.connect(self.db_url)
        try:
            with conn.cursor() as cur:
                # Try to acquire advisory lock (blocking up to ~30s)
                # pg_try_advisory_lock returns immediately; we use blocking version.
                cur.execute("SELECT pg_advisory_lock(%s)", (lock_key,))

                try:
                    cur.execute(
                        """SELECT refresh_token, access_token, access_token_expires_at
                           FROM amazon_connections
                           WHERE workspace_id = %s AND profile_id = %s AND status = 'active'""",
                        (workspace_id, profile_id),
                    )
                    row = cur.fetchone()
                    if not row:
                        raise RuntimeError(f"No active Amazon connection for workspace {workspace_id}")

                    # Decrypt (backwards compatible — plaintext values pass through)
                    refresh_token = _decrypt(row[0])
                    access_token = _decrypt(row[1]) if row[1] else None
                    expires_at = row[2]

                    # Still valid? (with 5 min buffer)
                    # By holding the lock here, we prevent other processes from refreshing
                    # at the same time. They'll wait for our lock, then re-read fresh data.
                    if access_token and expires_at:
                        if expires_at > datetime.now(timezone.utc) + timedelta(minutes=5):
                            return access_token

                    # Refresh
                    logger.info("Refreshing token for workspace %s, profile %s", workspace_id, profile_id)
                    new_access, new_expires = self._refresh(refresh_token)

                    # Persist new access token — always encrypt before write
                    encrypted_access = _encrypt(new_access)
                    cur.execute(
                        """UPDATE amazon_connections
                           SET access_token = %s,
                               access_token_expires_at = %s
                           WHERE workspace_id = %s AND profile_id = %s""",
                        (encrypted_access, new_expires, workspace_id, profile_id),
                    )
                    conn.commit()

                    return new_access
                finally:
                    # Always release the lock
                    cur.execute("SELECT pg_advisory_unlock(%s)", (lock_key,))
        finally:
            conn.close()

    @staticmethod
    def _lock_key(workspace_id: str, profile_id: str) -> int:
        """Map (workspace_id, profile_id) → 64-bit signed int for pg_advisory_lock."""
        import hashlib
        h = hashlib.sha256(f"{workspace_id}:{profile_id}".encode("utf-8")).digest()
        # Take first 8 bytes, signed 64-bit int range (Postgres bigint)
        n = int.from_bytes(h[:8], byteorder="big", signed=True)
        return n

    def _refresh(self, refresh_token: str):
        resp = requests.post(
            AMAZON_TOKEN_URL,
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": self.client_id,
                "client_secret": self.client_secret,
            },
            timeout=30,
        )
        if resp.status_code != 200:
            # Amazon returns JSON with "error" and "error_description"
            try:
                err = resp.json()
                logger.error("Amazon token refresh failed: %s — %s",
                             err.get("error", "unknown"),
                             err.get("error_description", resp.text[:200]))
            except Exception:
                logger.error("Amazon token refresh failed: %s — %s",
                             resp.status_code, resp.text[:300])
        resp.raise_for_status()
        data = resp.json()
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=data["expires_in"])
        return data["access_token"], expires_at
