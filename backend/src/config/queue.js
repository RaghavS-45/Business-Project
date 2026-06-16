import { Queue } from "bullmq";
import redisConnection, { isRedisAvailable } from "./redis.js";
import logger from "./logger.js";

/**
 * BullMQ Queue Configuration
 *
 * If Redis is unavailable, addJob() will log a warning and skip
 * instead of crashing the server.
 */

// ─── Default Job Options ─────────────────────────────────
const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 2000,
  },
  removeOnComplete: {
    age: 3600,
    count: 1000,
  },
  removeOnFail: {
    age: 86400,
  },
};

// ─── Queue Instances ─────────────────────────────────────
const queues = {};

const QUEUE_NAMES = {
  RECEIPT_GENERATION: "receipt-generation",
  AUDIT_LOG: "audit-log",
  DEAD_LETTER: "dead-letter",
};

const getQueue = (name) => {
  if (!isRedisAvailable()) return null;
  if (!queues[name]) {
    queues[name] = new Queue(name, {
      connection: redisConnection,
      defaultJobOptions,
    });
    logger.info(`BullMQ queue created: ${name}`);
  }
  return queues[name];
};

const addJob = async (queueName, jobName, data, opts = {}) => {
  if (!isRedisAvailable()) {
    logger.warn(`Skipping job (Redis unavailable): ${queueName}/${jobName}`);
    return null;
  }

  const queue = getQueue(queueName);
  if (!queue) return null;

  const job = await queue.add(jobName, data, opts);

  logger.info(`Job enqueued: ${queueName}/${jobName}`, {
    jobId: job.id,
    data: Object.keys(data),
  });

  return job;
};

const closeQueues = async () => {
  const names = Object.keys(queues);
  await Promise.all(names.map((name) => queues[name].close()));
  logger.info(`Closed ${names.length} BullMQ queue(s)`);
};

const moveToDeadLetterQueue = async (job, error, sourceQueue) => {
  if (!isRedisAvailable()) return;
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
      removeOnComplete: false,
      removeOnFail: false,
      attempts: 1,
    });

    logger.warn(`Job moved to DLQ: ${sourceQueue}/${job.name}`, {
      jobId: job.id,
      error: error?.message,
      attemptsMade: job.attemptsMade,
    });
  } catch (dlqError) {
    logger.error("Failed to move job to DLQ", {
      sourceQueue,
      jobId: job?.id,
      originalError: error?.message,
      dlqError: dlqError.message,
    });
  }
};

export { QUEUE_NAMES, addJob, getQueue, closeQueues, moveToDeadLetterQueue };
