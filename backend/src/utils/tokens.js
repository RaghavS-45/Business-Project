import jwt from "jsonwebtoken";
import crypto from "crypto";
import env from "../config/env.js";

/**
 * Token utilities for the access + refresh token flow.
 *
 * Access token  — short-lived (15m), sent in Authorization header
 * Refresh token — long-lived (7d), hashed before storage in MongoDB
 */

/**
 * Generate a short-lived JWT access token.
 * Payload includes userId and role for authorization middleware.
 */
export const generateAccessToken = (user) => {
  return jwt.sign(
    { userId: user._id, role: user.role },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN }
  );
};

/**
 * Generate a cryptographically random refresh token (not a JWT).
 * This gets hashed (SHA-256) before being stored in MongoDB.
 */
export const generateRefreshToken = () => {
  return crypto.randomBytes(40).toString("hex");
};

/**
 * Hash a refresh token using SHA-256 for secure storage.
 * We never store the raw token — only the hash.
 */
export const hashToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

/**
 * Verify and decode a JWT access token.
 * Throws if expired or invalid.
 */
export const verifyAccessToken = (token) => {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
};

/**
 * Parse a duration string like "7d" or "15m" into milliseconds.
 * Used to calculate refresh token expiry dates.
 */
export const parseDuration = (duration) => {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid duration format: ${duration}`);

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const multipliers = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };

  return value * multipliers[unit];
};
