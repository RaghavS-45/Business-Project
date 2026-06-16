import { Worker } from "bullmq";
import { createWorkerConnection, isRedisAvailable } from "../config/redis.js";
import { QUEUE_NAMES, moveToDeadLetterQueue } from "../config/queue.js";
import logger from "../config/logger.js";

/**
 * Receipt Generation Worker
 *
 * Processes receipt-generation jobs after checkout. Skipped if Redis is unavailable.
 */

let receiptWorker = null;

const startReceiptWorker = () => {
  if (!isRedisAvailable()) {
    logger.warn("Receipt worker skipped — Redis unavailable");
    return null;
  }

  const conn = createWorkerConnection();
  if (!conn) return null;

  receiptWorker = new Worker(
    QUEUE_NAMES.RECEIPT_GENERATION,
    async (job) => {
      const { saleId } = job.data;

      logger.info(`Generating receipt for sale: ${saleId}`, {
        jobId: job.id,
      });

      // Dynamic import to avoid circular dependencies
      const { default: receiptService } = await import(
        "../services/receipt.service.js"
      );

      const receiptUrl = await receiptService.generateAndUpload(saleId);

      return { success: true, saleId, receiptUrl };
    },
    {
      connection: conn,
      concurrency: 3,
    }
  );

  receiptWorker.on("completed", (job, result) => {
    logger.info(`Receipt generated: ${result.saleId}`, {
      jobId: job.id,
      receiptUrl: result.receiptUrl,
    });
  });

  receiptWorker.on("failed", async (job, err) => {
    logger.error(`Receipt generation failed: ${job?.id}`, {
      saleId: job?.data?.saleId,
      error: err.message,
      attemptsMade: job?.attemptsMade,
    });

    if (job && job.attemptsMade >= (job.opts?.attempts ?? 3)) {
      await moveToDeadLetterQueue(job, err, QUEUE_NAMES.RECEIPT_GENERATION);
    }
  });

  logger.info("Receipt worker started");
  return receiptWorker;
};

const stopReceiptWorker = async () => {
  if (receiptWorker) {
    await receiptWorker.close();
    logger.info("Receipt worker stopped");
  }
};

export { startReceiptWorker, stopReceiptWorker };
