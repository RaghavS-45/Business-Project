import User from "../models/User.js";
import RefreshToken from "../models/RefreshToken.js";
import ApiError from "../utils/ApiError.js";
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  parseDuration,
} from "../utils/tokens.js";
import env from "../config/env.js";
import logger from "../config/logger.js";

/**
 * Auth Service — business logic layer.
 *
 * Controllers call these methods; services talk to the database.
 * This separation keeps controllers thin and makes unit testing easier.
 */

class AuthService {
  /**
   * Register a new user.
   * Returns the user document (without password) and a token pair.
   */
  async register({ name, email, password, role }) {
    // Check for existing user
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw ApiError.conflict("Email is already registered");
    }

    const user = await User.create({ name, email, password, role });

    // Generate token pair
    const tokens = await this._createTokenPair(user);

    logger.info(`User registered: ${email} (${role})`);

    return { user, ...tokens };
  }

  /**
   * Authenticate a user with email + password.
   * Returns the user and a fresh token pair.
   */
  async login({ email, password }, { userAgent, ip }) {
    // select("+password") overrides the `select: false` on the schema
    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      throw ApiError.unauthorized("Invalid email or password");
    }

    if (!user.isActive) {
      throw ApiError.forbidden("Account has been deactivated");
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw ApiError.unauthorized("Invalid email or password");
    }

    // Update last login timestamp
    user.lastLogin = new Date();
    await user.save();

    // Generate token pair
    const tokens = await this._createTokenPair(user, { userAgent, ip });

    logger.info(`User logged in: ${email}`);

    return { user, ...tokens };
  }

  /**
   * Refresh the access token using a valid refresh token.
   * The old refresh token is revoked and a new pair is issued (token rotation).
   */
  async refreshAccessToken(rawRefreshToken, { userAgent, ip }) {
    const tokenHash = hashToken(rawRefreshToken);

    // Find the stored token
    const storedToken = await RefreshToken.findOne({ tokenHash });

    if (!storedToken) {
      throw ApiError.unauthorized("Invalid refresh token");
    }

    // Check expiry (belt-and-suspenders with TTL index)
    if (storedToken.expiresAt < new Date()) {
      await storedToken.deleteOne();
      throw ApiError.unauthorized("Refresh token expired");
    }

    // Fetch the user
    const user = await User.findById(storedToken.user);
    if (!user || !user.isActive) {
      await storedToken.deleteOne();
      throw ApiError.unauthorized("User not found or deactivated");
    }

    // Revoke the old refresh token (rotation)
    await storedToken.deleteOne();

    // Issue a new pair
    const tokens = await this._createTokenPair(user, { userAgent, ip });

    logger.info(`Token refreshed for: ${user.email}`);

    return { user, ...tokens };
  }

  /**
   * Logout — revoke a specific refresh token.
   */
  async logout(rawRefreshToken) {
    const tokenHash = hashToken(rawRefreshToken);
    const result = await RefreshToken.findOneAndDelete({ tokenHash });

    if (!result) {
      logger.warn("Logout attempted with invalid/expired refresh token");
    }

    return { message: "Logged out successfully" };
  }

  /**
   * Logout everywhere — revoke all refresh tokens for a user.
   */
  async logoutAll(userId) {
    const result = await RefreshToken.revokeAllForUser(userId);
    logger.info(`All sessions revoked for user ${userId} (${result.deletedCount} tokens)`);
    return { message: `Logged out of ${result.deletedCount} session(s)` };
  }

  /**
   * Internal: generate an access + refresh token pair and persist
   * the hashed refresh token in MongoDB.
   */
  async _createTokenPair(user, meta = {}) {
    const accessToken = generateAccessToken(user);
    const rawRefreshToken = generateRefreshToken();

    const expiresAt = new Date(
      Date.now() + parseDuration(env.JWT_REFRESH_EXPIRES_IN)
    );

    await RefreshToken.create({
      user: user._id,
      tokenHash: hashToken(rawRefreshToken),
      expiresAt,
      userAgent: meta.userAgent || "",
      ipAddress: meta.ip || "",
    });

    return { accessToken, refreshToken: rawRefreshToken };
  }
}

export default new AuthService();
