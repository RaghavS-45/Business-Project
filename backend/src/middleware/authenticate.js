import { verifyAccessToken } from "../utils/tokens.js";
import ApiError from "../utils/ApiError.js";
import User from "../models/User.js";
import logger from "../config/logger.js";

/**
 * Authentication middleware.
 *
 * Extracts the Bearer token from the Authorization header,
 * verifies it, and attaches the full user document to req.user.
 *
 * Also checks that the user account is still active — a deactivated
 * user's existing JWTs should be rejected.
 */
const authenticate = async (req, _res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw ApiError.unauthorized("Missing or malformed Authorization header");
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyAccessToken(token);

    // Fetch the user to ensure they still exist and are active
    const user = await User.findById(decoded.userId);

    if (!user) {
      throw ApiError.unauthorized("User no longer exists");
    }

    if (!user.isActive) {
      throw ApiError.forbidden("Account has been deactivated");
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return next(ApiError.unauthorized("Access token expired"));
    }
    if (error.name === "JsonWebTokenError") {
      return next(ApiError.unauthorized("Invalid access token"));
    }
    next(error);
  }
};

export default authenticate;
