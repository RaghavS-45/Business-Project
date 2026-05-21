import rateLimit from "express-rate-limit";
import env from "../config/env.js";

/**
 * Rate limiter for the /login route.
 *
 * Max 5 attempts per 15-minute window (configurable via env).
 * Returns a standardised JSON error instead of the default HTML.
 * Uses the default in-memory store — swap to redis-store in production
 * if running multiple server instances behind a load balancer.
 */
export const loginLimiter = rateLimit({
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MS,
  max: env.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: true, // RateLimit-* headers
  legacyHeaders: false,  // disable X-RateLimit-*
  message: {
    success: false,
    message: "Too many login attempts — please try again after 15 minutes",
  },
  keyGenerator: (req) => {
    // Rate limit by IP + email to prevent locking out shared IPs
    return `${req.ip}-${req.body?.email || "unknown"}`;
  },
});

/**
 * General API rate limiter — generous limits for normal endpoints.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests — please slow down",
  },
});
