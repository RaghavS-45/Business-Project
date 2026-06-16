import { Worker } from "bullmq";
import { createWorkerConnection } from "../config/redis.js";
import { isRedisAvailable } from "../config/redis.js";
import { QUEUE_NAMES, moveToDeadLetterQueue } from "../config/queue.js";
import auditService from "../services/audit.service.js";
import logger from "../config/logger.js";

/**
 * Audit Log Worker
 *
 * Processes audit-log jobs asynchronously. Skipped if Redis is unavailable.
 */

let auditWorker = null;

const startAuditWorker = () => {
  if (!isRedisAvailable()) {
    logger.warn("Audit worker skipped — Redis unavailable");
    return null;
  }

  const conn = createWorkerConnection();
  if (!conn) return null;

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
      connection: conn,
      concurrency: 5,
    }
  );

  auditWorker.on("completed", (job) => {
    logger.debug(`Audit job completed: ${job.id}`, {
      action: job.data.action,
      entity: job.data.entity,
    });
  });

  auditWorker.on("failed", async (job, err) => {
    logger.error(`Audit job failed: ${job?.id}`, {
      action: job?.data?.action,
      entity: job?.data?.entity,
      error: err.message,
      attemptsMade: job?.attemptsMade,
    });

    if (job && job.attemptsMade >= (job.opts?.attempts ?? 3)) {
      await moveToDeadLetterQueue(job, err, QUEUE_NAMES.AUDIT_LOG);
    }
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
