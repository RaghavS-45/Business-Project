import { Router } from "express";
import auditController from "../controllers/audit.controller.js";
import authenticate from "../middleware/authenticate.js";
import authorize from "../middleware/authorize.js";

const router = Router();

/**
 * Audit Routes — read-only access to the immutable ledger.
 *
 * All routes require authentication + ADMIN role.
 * No POST/PUT/DELETE endpoints — audit logs are append-only
 * and written internally by other services.
 *
 * GET /api/audit/user/:userId              — Actions by a user
 * GET /api/audit/:entity/:entityId         — Audit trail for a document
 */

// ─── All routes require ADMIN login ──────────────────────
router.use(authenticate);
router.use(authorize("ADMIN"));

// User actions — must come BEFORE /:entity/:entityId to avoid "user" being parsed as entity
router.get("/user/:userId", auditController.getByUser);

// Entity audit trail
router.get("/:entity/:entityId", auditController.getByEntity);

export default router;
