import app from "./app.js";
import env from "./config/env.js";
import connectDB from "./config/db.js";
import logger from "./config/logger.js";
import redisConnection from "./config/redis.js";
import { closeQueues } from "./config/queue.js";
import { startAuditWorker, stopAuditWorker } from "./workers/audit.worker.js";
import { startReceiptWorker, stopReceiptWorker } from "./workers/receipt.worker.js";

/**
 * Server Entry Point
 *
 * 1. Validate env vars (happens on import of env.js)
 * 2. Connect to MongoDB
 * 3. Connect to Redis + start BullMQ workers
 * 4. Start Express server
 * 5. Handle graceful shutdown on SIGTERM/SIGINT
 */

const startServer = async () => {
  // Connect to MongoDB
  await connectDB();

  // Start BullMQ workers (Redis connects automatically on import)
  startAuditWorker();
  startReceiptWorker();
  logger.info("BullMQ workers started");

  const server = app.listen(env.PORT, () => {
    logger.info(
      `🚀 Server running on port ${env.PORT} in ${env.NODE_ENV} mode`
    );
  });

  // ─── Graceful Shutdown ────────────────────────────────────
  const shutdown = async (signal) => {
    logger.info(`${signal} received — shutting down gracefully…`);

    // 1. Stop accepting new HTTP connections
    server.close(() => {
      logger.info("HTTP server closed");
    });

    try {
      // 2. Stop BullMQ workers (finish current jobs, reject new ones)
      await stopAuditWorker();
      await stopReceiptWorker();

      // 3. Close BullMQ queues
      await closeQueues();

      // 4. Close Redis connection
      await redisConnection.quit();
      logger.info("Redis connection closed");
    } catch (err) {
      logger.error("Error during shutdown", { error: err.message });
    }

    process.exit(0);
  };

  // Force close after 15 seconds
  const forceShutdown = (signal) => {
    shutdown(signal);
    setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 15_000);
  };

  process.on("SIGTERM", () => forceShutdown("SIGTERM"));
  process.on("SIGINT", () => forceShutdown("SIGINT"));

  // Catch unhandled promise rejections
  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled Rejection:", reason);
    forceShutdown("UNHANDLED_REJECTION");
  });

  // Catch uncaught exceptions
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught Exception:", error);
    forceShutdown("UNCAUGHT_EXCEPTION");
  });
};

startServer();

