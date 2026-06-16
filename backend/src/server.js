import app from "./app.js";
import env from "./config/env.js";
import connectDB from "./config/db.js";
import logger from "./config/logger.js";
import redisConnection, { connectRedis, isRedisAvailable } from "./config/redis.js";
import { closeQueues } from "./config/queue.js";
import { startAuditWorker, stopAuditWorker } from "./workers/audit.worker.js";
import { startReceiptWorker, stopReceiptWorker } from "./workers/receipt.worker.js";

/**
 * Server Entry Point
 *
 * 1. Connect to MongoDB
 * 2. Try to connect to Redis (optional — server works without it)
 * 3. Start BullMQ workers if Redis is available
 * 4. Start Express server
 * 5. Handle graceful shutdown
 */

const startServer = async () => {
  // Connect to MongoDB
  await connectDB();

  // Try connecting to Redis (non-blocking — server starts regardless)
  await connectRedis();

  if (isRedisAvailable()) {
    startAuditWorker();
    startReceiptWorker();
    logger.info("BullMQ workers started");
  } else {
    logger.warn("⚠️  Running without Redis — receipt generation and audit logging are disabled");
    logger.warn("   Install Redis: brew install redis && brew services start redis");
  }

  const server = app.listen(env.PORT, () => {
    logger.info(
      `🚀 Server running on port ${env.PORT} in ${env.NODE_ENV} mode`
    );
  });

  // ─── Graceful Shutdown ────────────────────────────────────
  const shutdown = async (signal) => {
    logger.info(`${signal} received — shutting down gracefully…`);

    server.close(() => {
      logger.info("HTTP server closed");
    });

    try {
      await stopAuditWorker();
      await stopReceiptWorker();
      await closeQueues();

      if (isRedisAvailable()) {
        await redisConnection.quit();
        logger.info("Redis connection closed");
      }
    } catch (err) {
      logger.error("Error during shutdown", { error: err.message });
    }

    process.exit(0);
  };

  const forceShutdown = (signal) => {
    shutdown(signal);
    setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 15_000);
  };

  process.on("SIGTERM", () => forceShutdown("SIGTERM"));
  process.on("SIGINT", () => forceShutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled Rejection:", reason);
    forceShutdown("UNHANDLED_REJECTION");
  });

  process.on("uncaughtException", (error) => {
    logger.error("Uncaught Exception:", error);
    forceShutdown("UNCAUGHT_EXCEPTION");
  });
};

startServer();
