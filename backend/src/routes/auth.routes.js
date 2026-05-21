import { Router } from "express";
import authController from "../controllers/auth.controller.js";
import validate from "../middleware/validate.js";
import authenticate from "../middleware/authenticate.js";
import authorize from "../middleware/authorize.js";
import { loginLimiter } from "../middleware/rateLimiter.js";
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
} from "../validators/auth.validator.js";

const router = Router();

/**
 * Auth Routes
 *
 * POST /api/auth/register    — Create a new user (ADMIN only in production)
 * POST /api/auth/login       — Authenticate & get token pair
 * POST /api/auth/refresh     — Rotate refresh token & get new access token
 * POST /api/auth/logout      — Revoke a single refresh token
 * POST /api/auth/logout-all  — Revoke all refresh tokens (all devices)
 * GET  /api/auth/me          — Get current user profile
 */

// ─── Public Routes ────────────────────────────────────────

// Register — only ADMINs can create new users (after initial seed)
// During development you can temporarily remove the auth middleware
router.post(
  "/register",
  authenticate,
  authorize("ADMIN"),
  validate(registerSchema),
  authController.register
);

// Login — rate limited (max 5 attempts per 15 min per IP+email)
router.post(
  "/login",
  loginLimiter,
  validate(loginSchema),
  authController.login
);

// Refresh — public but requires valid refresh token in body
router.post(
  "/refresh",
  validate(refreshTokenSchema),
  authController.refresh
);

// ─── Protected Routes ─────────────────────────────────────

// Logout — revoke the provided refresh token
router.post(
  "/logout",
  authenticate,
  validate(refreshTokenSchema),
  authController.logout
);

// Logout all — revoke all sessions for the authenticated user
router.post("/logout-all", authenticate, authController.logoutAll);

// Me — get the authenticated user's profile
router.get("/me", authenticate, authController.me);

export default router;
