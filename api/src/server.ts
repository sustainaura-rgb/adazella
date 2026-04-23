import "dotenv/config";
import "./lib/logger.js";  // Installs console scrubber on import (side-effect)
import crypto from "crypto";
import express from "express";
import cors from "cors";
import { healthRouter } from "./routes/health.js";
import { meRouter } from "./routes/me.js";
import { amazonOAuthRouter, amazonOAuthCallback } from "./routes/amazon-oauth.js";
import { overviewRouter } from "./routes/overview.js";
import { campaignsRouter } from "./routes/campaigns.js";
import { searchTermsRouter } from "./routes/search-terms.js";
import { productsRouter } from "./routes/products.js";
import { negativesRouter } from "./routes/negatives.js";
import { opportunitiesRouter } from "./routes/opportunities.js";
import { profileRouter } from "./routes/profile.js";
import { requireAuth } from "./middleware/auth.js";
import { securityHeaders, requestSizeGuard } from "./middleware/security.js";
import { readLimiter, mutationLimiter, authLimiter } from "./middleware/rate-limit.js";

const app = express();

// Render / Netlify sit behind a proxy — trust it so rate-limit sees real client IPs
app.set("trust proxy", 1);

// ── Security headers (Helmet + CSP + HSTS + referrer policy) ──
app.use(securityHeaders);

// ── CORS ──
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",").map(s => s.trim());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));

// ── Request ID tagging (for log correlation + error response surfacing) ──
app.use((req, _res, next) => {
  (req as any).requestId = crypto.randomBytes(8).toString("hex");
  next();
});

// ── Body parsing + request size cap ──
app.use(express.json({ limit: "1mb" }));
app.use(requestSizeGuard(1_000_000));

// ── Global rate limit on all /api traffic ──
app.use("/api", readLimiter);

// ── Mutation rate limit (stricter) on write methods ──
app.use("/api", (req, res, next) => {
  if (req.method === "PATCH" || req.method === "POST" || req.method === "DELETE" || req.method === "PUT") {
    return mutationLimiter(req, res, next);
  }
  next();
});

// ── Public routes ──
app.use("/api/health", healthRouter);
app.use("/api/oauth/amazon", authLimiter, amazonOAuthRouter);   // OAuth start + disconnect
app.get("/callback", authLimiter, amazonOAuthCallback);         // Legacy callback path

// ── Authenticated routes ──
app.use("/api/me", requireAuth, meRouter);
app.use("/api/overview", requireAuth, overviewRouter);
app.use("/api/campaigns", requireAuth, campaignsRouter);
app.use("/api/search-terms", requireAuth, searchTermsRouter);
app.use("/api/products", requireAuth, productsRouter);
app.use("/api/negatives", requireAuth, negativesRouter);
app.use("/api/opportunities", requireAuth, opportunitiesRouter);
app.use("/api/profile", requireAuth, profileRouter);

// ── Global error handler — sanitized responses, no stack leaks ──
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const requestId = (req as any).requestId || crypto.randomBytes(4).toString("hex");
  // Full detail server-side (already scrubbed by console wrapper)
  console.error(`[${requestId}] ${req.method} ${req.path} →`, err.stack || err.message || err);
  if (!res.headersSent) {
    res.status((err as any).status || 500).json({ error: "Internal server error", requestId });
  }
});

// ── Startup diagnostics ──
function envStatus(name: string): string {
  const v = process.env[name];
  if (!v) return "❌ MISSING";
  if (v.length < 8) return `⚠️  SHORT (${v.length} chars)`;
  return `✅ loaded (${v.slice(0, 4)}...${v.slice(-4)}, ${v.length} chars)`;
}

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`🚀 AdPilot API listening on http://localhost:${port}`);
  console.log("── Env check ──");
  console.log("SUPABASE_URL              :", envStatus("SUPABASE_URL"));
  console.log("SUPABASE_ANON_KEY         :", envStatus("SUPABASE_ANON_KEY"));
  console.log("SUPABASE_SERVICE_ROLE_KEY :", envStatus("SUPABASE_SERVICE_ROLE_KEY"));
  console.log("AMAZON_ADS_CLIENT_ID      :", envStatus("AMAZON_ADS_CLIENT_ID"));
  console.log("AMAZON_ADS_CLIENT_SECRET  :", envStatus("AMAZON_ADS_CLIENT_SECRET"));
  console.log("AMAZON_ADS_REDIRECT_URI   :", process.env.AMAZON_ADS_REDIRECT_URI || "❌ MISSING");
  console.log("───────────────");
});
