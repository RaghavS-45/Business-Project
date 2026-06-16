import IORedis from "ioredis";
import env from "./env.js";
import logger from "./logger.js";

/**
 * Redis Connection
 *
 * Used by BullMQ for job queues. If Redis is unavailable, the server
 * will still start — background jobs (receipts, audit) will be skipped.
 */

let redisAvailable = false;

const redisConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
  lazyConnect: true, // Don't connect immediately — we'll try manually
  retryStrategy(times) {
    if (times > 3) {
      logger.warn("Redis unavailable — background jobs will be disabled");
      return null; // Stop retrying after 3 attempts
    }
    const delay = Math.min(times * 500, 3000);
    logger.warn(`Redis reconnecting — attempt ${times}, delay ${delay}ms`);
    return delay;
  },
});

redisConnection.on("connect", () => {
  redisAvailable = true;
  logger.info("Redis connected");
});

redisConnection.on("error", (err) => {
  redisAvailable = false;
  // Only log once, not on every retry
  if (err.code === "ECONNREFUSED") {
    logger.warn("Redis not available (ECONNREFUSED) — background jobs disabled");
  } else {
    logger.error("Redis connection error", { error: err.message });
  }
});

redisConnection.on("close", () => {
  redisAvailable = false;
});

/**
 * Attempt to connect to Redis. Does not throw if unavailable.
 */
export const connectRedis = async () => {
  try {
    await redisConnection.connect();
    redisAvailable = true;
  } catch {
    redisAvailable = false;
    logger.warn("⚠️  Redis unavailable — server will run without background jobs (receipts, audit logs)");
  }
};

export const isRedisAvailable = () => redisAvailable;

/**
 * Create a duplicate connection for BullMQ workers.
 */
export const createWorkerConnection = () => {
  if (!redisAvailable) return null;
  return new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times) {
      if (times > 3) return null;
      return Math.min(times * 500, 3000);
    },
  });
};

export default redisConnection;
