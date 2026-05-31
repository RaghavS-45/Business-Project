import IORedis from "ioredis";
import env from "./env.js";
import logger from "./logger.js";

/**
 * Redis Connection
 *
 * Used by BullMQ for job queues. Connection options:
 *   - maxRetriesPerRequest: null → required by BullMQ (it handles retries internally)
 *   - enableReadyCheck: false → speeds up initial connection
 *   - lazyConnect: false → connect immediately on import
 *
 * The connection instance is shared across all queues and workers
 * to avoid opening duplicate TCP connections.
 */

const redisConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 5000);
    logger.warn(`Redis reconnecting — attempt ${times}, delay ${delay}ms`);
    return delay;
  },
});

redisConnection.on("connect", () => {
  logger.info("Redis connected");
});

redisConnection.on("error", (err) => {
  logger.error("Redis connection error", { error: err.message });
});

redisConnection.on("close", () => {
  logger.warn("Redis connection closed");
});

/**
 * Create a duplicate connection for BullMQ workers.
 * BullMQ requires separate connections for Queue and Worker instances
 * to avoid blocking issues with blpop/brpop commands.
 */
export const createWorkerConnection = () => {
  return new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 5000);
      return delay;
    },
  });
};

export default redisConnection;
