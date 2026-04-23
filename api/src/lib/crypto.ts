import crypto from "crypto";

// AES-256-GCM encryption for sensitive column values (Amazon refresh tokens).
// Key source: DB_ENCRYPTION_KEY env var — 32 bytes, base64-encoded.
// Format: "enc:v1:<iv_b64>:<ciphertext_b64>:<authtag_b64>"
//
// Design goals:
// - Cross-language compatible (Python scheduler can decrypt with same key + standard lib)
// - Authenticated encryption (GCM tag prevents tampering)
// - Fresh IV per encryption (no IV reuse — GCM requires unique nonce per key)
// - Backwards compatible: decrypt() accepts both encrypted (enc:v1:) and plaintext values
//   so existing DB rows keep working during rollout.

const ALGO = "aes-256-gcm";
const PREFIX = "enc:v1:";
const IV_LEN = 12;    // GCM standard — 96 bits
const TAG_LEN = 16;   // GCM authentication tag — 128 bits

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const b64 = process.env.DB_ENCRYPTION_KEY || "";
  if (!b64) {
    throw new Error("DB_ENCRYPTION_KEY env var not set. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"");
  }
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error(`DB_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}). Re-generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`);
  }
  cachedKey = key;
  return key;
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function encrypt(plaintext: string): string {
  if (plaintext == null) throw new Error("cannot encrypt null");
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${ct.toString("base64")}:${tag.toString("base64")}`;
}

export function decrypt(value: string | null | undefined): string {
  if (value == null) throw new Error("cannot decrypt null");
  // Backwards compat: if not prefixed, treat as already-plaintext
  if (!isEncrypted(value)) return value;
  const rest = value.slice(PREFIX.length);
  const parts = rest.split(":");
  if (parts.length !== 3) throw new Error("Malformed encrypted value");
  const [ivB64, ctB64, tagB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  if (iv.length !== IV_LEN) throw new Error("Bad IV length");
  if (tag.length !== TAG_LEN) throw new Error("Bad auth tag length");
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

// Safe-encrypt: returns original value if key is not configured yet (dev mode).
// Logs a warning so we notice. Prod should always have the key set.
export function encryptOrPassThrough(plaintext: string): string {
  try {
    return encrypt(plaintext);
  } catch (e: any) {
    console.warn("[crypto] encryption failed — storing plaintext:", e.message);
    return plaintext;
  }
}
