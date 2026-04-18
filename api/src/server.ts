import "dotenv/config";
import express from "express";
import cors from "cors";
import { healthRouter } from "./routes/health.js";
import { meRouter } from "./routes/me.js";
import { amazonOAuthRouter } from "./routes/amazon-oauth.js";
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
app.use("/api/oauth/amazon", amazonOAuthRouter);   // OAuth callback is public

// ── Authenticated routes ──
app.use("/api/me", requireAuth, meRouter);

// ── Error handler ──
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`🚀 AdPilot API listening on http://localhost:${port}`);
});
