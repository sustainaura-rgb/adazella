import helmet from "helmet";
import type { Request, Response, NextFunction } from "express";

const frontendOrigins = (process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",").map(s => s.trim());

export const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:", "https:"],
      "font-src": ["'self'", "data:"],
      "connect-src": ["'self'", ...frontendOrigins, "https://*.supabase.co", "https://api.amazon.com", "https://advertising-api.amazon.com"],
      "frame-ancestors": ["'none'"],
      "base-uri": ["'self'"],
      "form-action": ["'self'"],
      "object-src": ["'none'"],
      "upgrade-insecure-requests": [],
    },
  },
  hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: "no-referrer" },
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "same-site" },
});

export function requestSizeGuard(maxBytes = 1_000_000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = Number(req.headers["content-length"] || 0);
    if (contentLength > maxBytes) {
      return res.status(413).json({ error: "Payload too large" });
    }
    next();
  };
}
