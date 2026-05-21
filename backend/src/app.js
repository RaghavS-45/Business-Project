import express from "express";
import cors from "cors";
import helmet from "helmet";
import env from "./config/env.js";
import { apiLimiter } from "./middleware/rateLimiter.js";
import errorHandler from "./middleware/errorHandler.js";
import logger from "./config/logger.js";

// ─── Route Imports ────────────────────────────────────────
import authRoutes from "./routes/auth.routes.js";

/**
 * Express Application
 *
 * Security layers (applied in order):
 *   1. Helmet — sets security-related HTTP headers (CSP, HSTS, etc.)
 *   2. CORS — whitelist allowed origins
 *   3. Rate limiter — general API throttle (200 req/15min)
 *   4. Body parsers — JSON + URL-encoded with size limits
 *
 * Routes are mounted under /api/<resource>.
 * Global error handler sits at the bottom of the middleware stack.
 */

const app = express();

// ─── Security Middleware ──────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  })
);
app.use(apiLimiter);

// ─── Body Parsers ─────────────────────────────────────────
app.use(express.json({ limit: "10kb" })); // prevent large payload attacks
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// ─── Request Logging ──────────────────────────────────────
app.use((req, _res, next) => {
  logger.http(`${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  });
  next();
});

// ─── Health Check ─────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is healthy",
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  });
});

// ─── API Routes ───────────────────────────────────────────
app.use("/api/auth", authRoutes);

// ─── 404 Handler ──────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// ─── Global Error Handler (must be last) ──────────────────
app.use(errorHandler);

export default app;
