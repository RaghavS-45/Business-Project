import { Worker } from "bullmq";
import { createWorkerConnection } from "../config/redis.js";
import { QUEUE_NAMES } from "../config/queue.js";
import auditService from "../services/audit.service.js";
import logger from "../config/logger.js";

/**
 * Audit Log Worker
 *
 * Processes audit-log jobs asynchronously. This decouples audit writes
 * from the hot path — the main business operation (e.g. product update)
 * completes immediately and the audit entry is written in the background.
 *
 * Job payload:
 *   { action, entity, entityId, userId, before, after, metadata }
 *
 * On failure: retried 3x with exponential backoff, then logged as error.
 */

let auditWorker = null;

const startAuditWorker = () => {
  auditWorker = new Worker(
    QUEUE_NAMES.AUDIT_LOG,
    async (job) => {
      const { action, entity, entityId, userId, before, after, metadata } =
        job.data;

      await auditService.log(action, entity, entityId, userId, {
        before,
        after,
        metadata,
      });

      return { success: true, auditAction: action, entity, entityId };
    },
    {
      connection: createWorkerConnection(),
      concurrency: 5, // Process up to 5 audit writes in parallel
    }
  );

  auditWorker.on("completed", (job) => {
    logger.debug(`Audit job completed: ${job.id}`, {
      action: job.data.action,
      entity: job.data.entity,
    });
  });

  auditWorker.on("failed", (job, err) => {
    logger.error(`Audit job failed: ${job?.id}`, {
      action: job?.data?.action,
      entity: job?.data?.entity,
      error: err.message,
      attemptsMade: job?.attemptsMade,
    });
  });

  logger.info("Audit worker started");
  return auditWorker;
};

const stopAuditWorker = async () => {
  if (auditWorker) {
    await auditWorker.close();
    logger.info("Audit worker stopped");
  }
};

export { startAuditWorker, stopAuditWorker };
