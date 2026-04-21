import rateLimit from "express-rate-limit";

const tooMany = { error: "Too many requests. Please try again shortly." };

// Global read limiter — applied to all /api routes
export const readLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: tooMany,
});

// Mutation limiter — applied to PATCH/POST/DELETE paths
export const mutationLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: tooMany,
});

// Auth limiter — applied to OAuth start + callback (prevents brute-force / abuse)
export const authLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: tooMany,
});
