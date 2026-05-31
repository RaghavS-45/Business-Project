import { Router } from "express";
import dlqController from "../controllers/dlq.controller.js";
import authenticate from "../middleware/authenticate.js";
import authorize from "../middleware/authorize.js";

const router = Router();

/**
 * Dead Letter Queue Admin Routes
 *
 * All routes require ADMIN role — DLQ inspection is a sensitive operation.
 *
 * GET    /api/admin/dlq           — List DLQ jobs
 * GET    /api/admin/dlq/stats     — Queue health statistics
 * POST   /api/admin/dlq/:id/retry — Replay a failed job to its original queue
 * DELETE /api/admin/dlq/:id       — Permanently remove a DLQ job
 */

router.use(authenticate);
router.use(authorize("ADMIN"));

router.get("/", dlqController.listJobs);
router.get("/stats", dlqController.getStats);
router.post("/:id/retry", dlqController.retryJob);
router.delete("/:id", dlqController.removeJob);

export default router;
