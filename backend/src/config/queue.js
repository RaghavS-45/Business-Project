import { Queue } from "bullmq";
import redisConnection from "./redis.js";
import logger from "./logger.js";

/**
 * BullMQ Queue Configuration
 *
 * Defines named queues for background job processing.
 * Each queue handles a specific type of async work:
 *
 *   receipt-generation — Generate PDF receipts after checkout
 *   audit-log          — Write audit log entries asynchronously
 *
 * Default job options:
 *   - 3 retry attempts with exponential backoff
 *   - Remove completed jobs after 1 hour (keeps Redis clean)
 *   - Remove failed jobs after 24 hours (for debugging)
 *
 * Interview talking point: Using BullMQ decouples heavy operations
 * from the request/response cycle. The checkout API returns immediately
 * while receipt generation happens in the background. This pattern
 * is essential for any system that needs to stay responsive under load.
 */

// ─── Default Job Options ─────────────────────────────────
const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 2000, // 2s, 4s, 8s
  },
  removeOnComplete: {
    age: 3600, // Keep completed jobs for 1 hour
    count: 1000,
  },
  removeOnFail: {
    age: 86400, // Keep failed jobs for 24 hours
  },
};

// ─── Queue Instances ─────────────────────────────────────
const queues = {};

const QUEUE_NAMES = {
  RECEIPT_GENERATION: "receipt-generation",
  AUDIT_LOG: "audit-log",
  DEAD_LETTER: "dead-letter",
};

/**
 * Get or create a queue by name.
 * Queues are lazily instantiated and cached.
 */
const getQueue = (name) => {
  if (!queues[name]) {
    queues[name] = new Queue(name, {
      connection: redisConnection,
      defaultJobOptions,
    });
    logger.info(`BullMQ queue created: ${name}`);
  }
  return queues[name];
};

/**
 * Add a job to a named queue.
 *
 * @param {string} queueName - Queue name (use QUEUE_NAMES constants)
 * @param {string} jobName   - Job identifier (e.g. "generate-receipt")
 * @param {Object} data      - Job payload
 * @param {Object} [opts]    - Override default job options
 * @returns {Promise<Job>}   - The enqueued BullMQ Job instance
 */
const addJob = async (queueName, jobName, data, opts = {}) => {
  const queue = getQueue(queueName);
  const job = await queue.add(jobName, data, opts);

  logger.info(`Job enqueued: ${queueName}/${jobName}`, {
    jobId: job.id,
    data: Object.keys(data),
  });

  return job;
};

/**
 * Close all queue instances gracefully.
 * Called during server shutdown.
 */
const closeQueues = async () => {
  const names = Object.keys(queues);
  await Promise.all(names.map((name) => queues[name].close()));
  logger.info(`Closed ${names.length} BullMQ queue(s)`);
};

/**
 * Move a permanently failed job to the dead-letter queue.
 *
 * Called by workers when a job exhausts all retry attempts.
 * Preserves the original job data, queue name, error, and attempt
 * metadata so an admin can inspect and replay later.
 *
 * @param {Object} job     - The failed BullMQ job
 * @param {Error}  error   - The final error
 * @param {string} sourceQueue - Name of the queue the job originated from
 */
const moveToDeadLetterQueue = async (job, error, sourceQueue) => {
  try {
    await addJob(QUEUE_NAMES.DEAD_LETTER, "dead-letter-entry", {
      originalQueue: sourceQueue,
      originalJobName: job.name,
      originalJobId: job.id,
      payload: job.data,
      error: error?.message || "Unknown error",
      stack: error?.stack || null,
      attemptsMade: job.attemptsMade,
      failedAt: new Date().toISOString(),
    }, {
      // DLQ jobs should not auto-expire — keep indefinitely for review
      removeOnComplete: false,
      removeOnFail: false,
      attempts: 1, // Don't retry DLQ writes
    });

    logger.warn(`Job moved to DLQ: ${sourceQueue}/${job.name}`, {
      jobId: job.id,
      error: error?.message,
      attemptsMade: job.attemptsMade,
    });
  } catch (dlqError) {
    // Last resort — if even the DLQ write fails, log everything
    logger.error("Failed to move job to DLQ", {
      sourceQueue,
      jobId: job?.id,
      originalError: error?.message,
      dlqError: dlqError.message,
    });
  }
};

export { QUEUE_NAMES, addJob, getQueue, closeQueues, moveToDeadLetterQueue };
