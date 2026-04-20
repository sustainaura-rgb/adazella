import "dotenv/config";
import express from "express";
import cors from "cors";
import { healthRouter } from "./routes/health.js";
import { meRouter } from "./routes/me.js";
import { amazonOAuthRouter, amazonOAuthCallback } from "./routes/amazon-oauth.js";
import { overviewRouter } from "./routes/overview.js";
import { campaignsRouter } from "./routes/campaigns.js";
import { searchTermsRouter } from "./routes/search-terms.js";
import { profileRouter } from "./routes/profile.js";
import { requireAuth } from "./middleware/auth.js";

const app = express();

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

app.use(express.json({ limit: "1mb" }));

// ── Public routes ──
app.use("/api/health", healthRouter);
app.use("/api/oauth/amazon", amazonOAuthRouter);   // OAuth start + disconnect (callback also available here for backward-compat)
app.get("/callback", amazonOAuthCallback);         // Matches Amazon LWA "Allowed Return URL" of http://localhost:3000/callback

// ── Authenticated routes ──
app.use("/api/me", requireAuth, meRouter);
app.use("/api/overview", requireAuth, overviewRouter);   // /api/overview + /api/overview/alerts
app.use("/api/campaigns", requireAuth, campaignsRouter); // GET / + PATCH :id/status + PATCH :id/budget
app.use("/api/search-terms", requireAuth, searchTermsRouter);
app.use("/api/profile", requireAuth, profileRouter);

// ── Error handler ──
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ── Startup diagnostics — safely show which env vars loaded ──
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
