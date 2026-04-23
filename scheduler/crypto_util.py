"""AES-256-GCM encrypt/decrypt compatible with api/src/lib/crypto.ts.

Format: "enc:v1:<iv_b64>:<ciphertext_b64>:<authtag_b64>"
Key source: DB_ENCRYPTION_KEY env var — 32 bytes, base64-encoded (same key as Node side).

Backwards-compatible decrypt: if the value doesn't start with "enc:v1:",
it's treated as already-plaintext (allows gradual DB migration).
"""
import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

PREFIX = "enc:v1:"
IV_LEN = 12
TAG_LEN = 16


def _get_key() -> bytes:
    b64 = os.environ.get("DB_ENCRYPTION_KEY", "")
    if not b64:
        raise RuntimeError(
            "DB_ENCRYPTION_KEY env var not set. Generate with: "
            "python -c \"import base64, os; print(base64.b64encode(os.urandom(32)).decode())\""
        )
    key = base64.b64decode(b64)
    if len(key) != 32:
        raise RuntimeError(f"DB_ENCRYPTION_KEY must decode to 32 bytes (got {len(key)}).")
    return key


def is_encrypted(value):
    return isinstance(value, str) and value.startswith(PREFIX)


def encrypt(plaintext: str) -> str:
    if plaintext is None:
        raise ValueError("cannot encrypt None")
    key = _get_key()
    iv = os.urandom(IV_LEN)
    aes = AESGCM(key)
    # AESGCM.encrypt returns ciphertext || tag — we split to match Node format
    ct_and_tag = aes.encrypt(iv, plaintext.encode("utf-8"), None)
    ct = ct_and_tag[:-TAG_LEN]
    tag = ct_and_tag[-TAG_LEN:]
    return (
        PREFIX
        + base64.b64encode(iv).decode()
        + ":"
        + base64.b64encode(ct).decode()
        + ":"
        + base64.b64encode(tag).decode()
    )


def decrypt(value):
    """Accepts both encrypted (enc:v1:...) and plaintext values for backward compat."""
    if value is None:
        raise ValueError("cannot decrypt None")
    if not is_encrypted(value):
        return value
    rest = value[len(PREFIX):]
    parts = rest.split(":")
    if len(parts) != 3:
        raise ValueError("Malformed encrypted value")
    iv_b64, ct_b64, tag_b64 = parts
    iv = base64.b64decode(iv_b64)
    ct = base64.b64decode(ct_b64)
    tag = base64.b64decode(tag_b64)
    if len(iv) != IV_LEN:
        raise ValueError("Bad IV length")
    if len(tag) != TAG_LEN:
        raise ValueError("Bad auth tag length")
    aes = AESGCM(_get_key())
    pt = aes.decrypt(iv, ct + tag, None)
    return pt.decode("utf-8")
