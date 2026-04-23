// Console log-scrubbing wrapper.
// Redacts secrets (bearer tokens, DB URLs, JSON password/secret fields)
// from all console.log/error/warn output. Import this file once at boot.

const SENSITIVE_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._-]+/gi,                       // JWT / access tokens in logs
  /postgres(?:ql)?:\/\/[^\s"']+/gi,                    // DB connection strings
  /(?:["']?(?:password|pwd|secret|token|refresh_token|access_token|api[_-]?key|authorization)["']?\s*[:=]\s*)["']?[^"'\s,}]+/gi,
  /enc:v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+/g,   // our own encrypted column values
];

function scrub(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value !== "string") {
    try { value = JSON.stringify(value); }
    catch { return "[unserializable]"; }
  }
  let out = value as string;
  for (const re of SENSITIVE_PATTERNS) {
    out = out.replace(re, (match) => {
      // Preserve the key name for JSON-like patterns so logs remain readable,
      // but swap the value for [REDACTED]
      const eq = match.match(/["']?(?:password|pwd|secret|token|refresh_token|access_token|api[_-]?key|authorization)["']?\s*[:=]\s*/i);
      if (eq) return `${eq[0]}[REDACTED]`;
      return "[REDACTED]";
    });
  }
  return out;
}

// Install once. Idempotent.
let installed = false;
export function installLogScrubber() {
  if (installed) return;
  installed = true;
  const { log: origLog, error: origErr, warn: origWarn, info: origInfo } = console;
  console.log   = (...args: unknown[]) => origLog.call(console, ...args.map(scrub));
  console.error = (...args: unknown[]) => origErr.call(console, ...args.map(scrub));
  console.warn  = (...args: unknown[]) => origWarn.call(console, ...args.map(scrub));
  console.info  = (...args: unknown[]) => origInfo.call(console, ...args.map(scrub));
}

// Install immediately on import (side-effect)
installLogScrubber();
