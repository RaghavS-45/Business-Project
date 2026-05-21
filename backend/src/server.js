import app from "./app.js";
import env from "./config/env.js";
import connectDB from "./config/db.js";
import logger from "./config/logger.js";

/**
 * Server Entry Point
 *
 * 1. Validate env vars (happens on import of env.js)
 * 2. Connect to MongoDB
 * 3. Start Express server
 * 4. Handle graceful shutdown on SIGTERM/SIGINT
 */

const startServer = async () => {
  // Connect to MongoDB
  await connectDB();

  const server = app.listen(env.PORT, () => {
    logger.info(
      `🚀 Server running on port ${env.PORT} in ${env.NODE_ENV} mode`
    );
  });

  // ─── Graceful Shutdown ────────────────────────────────────
  const shutdown = (signal) => {
    logger.info(`${signal} received — shutting down gracefully…`);
    server.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });

    // Force close after 10 seconds
    setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10_000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Catch unhandled promise rejections
  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled Rejection:", reason);
    shutdown("UNHANDLED_REJECTION");
  });

  // Catch uncaught exceptions
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught Exception:", error);
    shutdown("UNCAUGHT_EXCEPTION");
  });
};

startServer();
