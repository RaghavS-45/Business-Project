import rateLimit from "express-rate-limit";
import env from "../config/env.js";

/**
 * Rate Limiters
 *
 * loginLimiter     — per IP+email (normalised) — prevents targeted account brute-force
 * loginIpLimiter   — per IP only — prevents brute-force by rotating email addresses
 * apiLimiter       — general API throttle (200 req/15 min)
 *
 * NOTE: app.set('trust proxy', 1) in app.js is required for req.ip to reflect
 * the real client address behind Render/Nginx. Without it, all traffic shares
 * one rate-limit bucket.
 */

/**
 * Per IP+email login limiter.
 * Max 5 attempts per 15-minute window (configurable via env).
 */
export const loginLimiter = rateLimit({
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MS,
  max: env.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts — please try again after 15 minutes",
  },
  keyGenerator: (req) => {
    // Normalise email to lowercase so "Admin@x.com" and "admin@x.com"
    // share the same bucket and can't bypass the limit by varying case.
    const email = (req.body?.email || "").toLowerCase().trim();
    return `login:${req.ip}:${email}`;
  },
});

/**
 * Per-IP login limiter — secondary guard.
 * Caps total login attempts per IP regardless of email, so an attacker
 * cannot bypass the per-account limit by rotating email addresses.
 */
export const loginIpLimiter = rateLimit({
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MS,
  max: env.LOGIN_RATE_LIMIT_MAX * 3, // slightly more generous than per-account
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts from this IP — please try again later",
  },
  keyGenerator: (req) => `login-ip:${req.ip}`,
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
  keyGenerator: (req) => req.ip, // explicit — uses the trust-proxy-corrected IP
});

