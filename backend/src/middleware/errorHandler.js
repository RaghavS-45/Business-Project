import logger from "../config/logger.js";
import env from "../config/env.js";

/**
 * Global error-handling middleware.
 *
 * Catches all errors passed via next(error) and returns a consistent
 * JSON response. Distinguishes between:
 *   - Operational errors (ApiError) — expected, client-facing
 *   - Programming errors — unexpected, logged as critical
 *
 * In development, the full stack trace is included in the response.
 * In production, only the message is sent to the client.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, _next) => {
  // Default values
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal server error";
  let errors = err.errors || [];

  // Mongoose duplicate key error (e.g. duplicate email)
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue)[0];
    message = `${field} already exists`;
    errors = [{ field, message }];
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    statusCode = 400;
    message = "Validation failed";
    errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
  }

  // Mongoose bad ObjectId
  if (err.name === "CastError" && err.kind === "ObjectId") {
    statusCode = 400;
    message = `Invalid ID format: ${err.value}`;
  }

  // Log the error
  if (statusCode >= 500) {
    logger.error(`${statusCode} - ${message}`, {
      error: err.stack,
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userId: req.user?._id,
    });
  } else {
    logger.warn(`${statusCode} - ${message}`, {
      method: req.method,
      url: req.originalUrl,
    });
  }

  const response = {
    success: false,
    message,
    ...(errors.length > 0 && { errors }),
    ...(env.NODE_ENV === "development" && { stack: err.stack }),
  };

  res.status(statusCode).json(response);
};

export default errorHandler;
