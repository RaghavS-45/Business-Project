import { Worker } from "bullmq";
import { createWorkerConnection } from "../config/redis.js";
import { QUEUE_NAMES, moveToDeadLetterQueue } from "../config/queue.js";
import logger from "../config/logger.js";

/**
 * Receipt Generation Worker
 *
 * Processes receipt-generation jobs after checkout.
 * Flow: checkout completes → job enqueued → worker picks it up →
 *       generate PDF → upload to Cloudinary → update Sale.receiptUrl
 *
 * The receipt.service.js is imported dynamically to avoid circular
 * dependency issues during initial module loading.
 *
 * Job payload:
 *   { saleId }
 *
 * On success: Sale document is updated with receiptUrl.
 * On failure: retried 3x. If all retries exhaust, the job is moved to
 *             the dead-letter queue. The sale is still valid — receipt
 *             can be regenerated manually from the DLQ.
 */

let receiptWorker = null;

const startReceiptWorker = () => {
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
      connection: createWorkerConnection(),
      concurrency: 3, // Limit PDF generation concurrency (CPU-bound)
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

    // Move to DLQ when all retries are exhausted
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
