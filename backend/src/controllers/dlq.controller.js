import { getQueue, QUEUE_NAMES, addJob } from "../config/queue.js";
import logger from "../config/logger.js";

/**
 * Dead Letter Queue Controller
 *
 * Provides admin endpoints to inspect and manage permanently failed jobs.
 * These jobs have exhausted all retry attempts and were moved to the DLQ
 * for manual review.
 *
 * Endpoints:
 *   GET  /api/admin/dlq       — List DLQ jobs (with pagination)
 *   GET  /api/admin/dlq/stats — Queue health statistics
 *   POST /api/admin/dlq/:id/retry — Replay a DLQ job back to its original queue
 *   DELETE /api/admin/dlq/:id — Remove a DLQ job permanently
 */

class DlqController {
  /**
   * List jobs currently in the DLQ.
   * Supports pagination via ?start=0&end=19 (defaults to first 20).
   */
  async listJobs(req, res) {
    const queue = getQueue(QUEUE_NAMES.DEAD_LETTER);
    const start = parseInt(req.query.start) || 0;
    const end = parseInt(req.query.end) || 19;

    // Get jobs in all states — DLQ jobs are marked "completed" by the DLQ queue
    const [waiting, completed, failed] = await Promise.all([
      queue.getWaiting(start, end),
      queue.getCompleted(start, end),
      queue.getFailed(start, end),
    ]);

    const jobs = [...waiting, ...completed, ...failed]
      .sort((a, b) => b.timestamp - a.timestamp)
      .map((job) => ({
        id: job.id,
        name: job.name,
        data: job.data,
        timestamp: new Date(job.timestamp).toISOString(),
        processedOn: job.processedOn ? new Date(job.processedOn).toISOString() : null,
      }));

    res.json({
      success: true,
      count: jobs.length,
      jobs,
    });
  }

  /**
   * Get DLQ and worker queue health statistics.
   */
  async getStats(_req, res) {
    const dlq = getQueue(QUEUE_NAMES.DEAD_LETTER);
    const receiptQueue = getQueue(QUEUE_NAMES.RECEIPT_GENERATION);
    const auditQueue = getQueue(QUEUE_NAMES.AUDIT_LOG);

    const [dlqCounts, receiptCounts, auditCounts] = await Promise.all([
      dlq.getJobCounts("waiting", "completed", "failed", "delayed", "active"),
      receiptQueue.getJobCounts("waiting", "completed", "failed", "delayed", "active"),
      auditQueue.getJobCounts("waiting", "completed", "failed", "delayed", "active"),
    ]);

    res.json({
      success: true,
      queues: {
        deadLetter: dlqCounts,
        receiptGeneration: receiptCounts,
        auditLog: auditCounts,
      },
    });
  }

  /**
   * Replay a DLQ job — re-enqueue it to its original queue.
   */
  async retryJob(req, res) {
    const queue = getQueue(QUEUE_NAMES.DEAD_LETTER);
    const job = await queue.getJob(req.params.id);

    if (!job) {
      return res.status(404).json({ success: false, message: "DLQ job not found" });
    }

    const { originalQueue, originalJobName, payload } = job.data;

    if (!originalQueue || !payload) {
      return res.status(400).json({
        success: false,
        message: "Job data is missing originalQueue or payload — cannot replay",
      });
    }

    // Re-enqueue to the original queue
    await addJob(originalQueue, originalJobName || "replayed-job", payload);

    // Remove from DLQ after successful re-enqueue
    await job.remove();

    logger.info(`DLQ job replayed: ${job.id} → ${originalQueue}/${originalJobName}`);

    res.json({
      success: true,
      message: `Job replayed to ${originalQueue}`,
      originalJobName,
    });
  }

  /**
   * Permanently remove a DLQ job (acknowledging it was reviewed).
   */
  async removeJob(req, res) {
    const queue = getQueue(QUEUE_NAMES.DEAD_LETTER);
    const job = await queue.getJob(req.params.id);

    if (!job) {
      return res.status(404).json({ success: false, message: "DLQ job not found" });
    }

    await job.remove();

    logger.info(`DLQ job removed: ${job.id}`);

    res.json({
      success: true,
      message: "Job removed from dead-letter queue",
    });
  }
}

export default new DlqController();
