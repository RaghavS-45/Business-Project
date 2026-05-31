import { Router } from "express";
import saleController from "../controllers/sale.controller.js";
import validate from "../middleware/validate.js";
import authenticate from "../middleware/authenticate.js";
import authorize from "../middleware/authorize.js";
import {
  checkoutSchema,
  saleQuerySchema,
  refundSchema,
} from "../validators/sale.validator.js";

const router = Router();

/**
 * Sale Routes
 *
 * All routes require authentication.
 * Checkout is available to all roles (ADMIN, MANAGER, CASHIER).
 * Listing, summary, and refund are restricted to ADMIN/MANAGER.
 *
 * POST   /api/sales/checkout       — Process a checkout
 * GET    /api/sales                — List sales (paginated)
 * GET    /api/sales/summary/daily  — Daily sales summary
 * GET    /api/sales/:id            — Get sale details
 * POST   /api/sales/:id/refund     — Process a refund
 *
 * NOTE: /checkout and /summary/daily are registered BEFORE /:id
 * to prevent Express treating "checkout" or "summary" as an ObjectId.
 */

// ─── All routes require login ─────────────────────────────
router.use(authenticate);

// ─── Checkout (all authenticated users) ──────────────────
router.post(
  "/checkout",
  validate(checkoutSchema),
  saleController.checkout
);

// ─── Summary (must come before /:id) ────────────────────
router.get(
  "/summary/daily",
  authorize("ADMIN", "MANAGER"),
  saleController.dailySummary
);

// ─── List sales ──────────────────────────────────────────
router.get(
  "/",
  authorize("ADMIN", "MANAGER"),
  validate(saleQuerySchema, "query"),
  saleController.list
);

// ─── Get single sale ─────────────────────────────────────
router.get("/:id", saleController.getById);

// ─── Refund ──────────────────────────────────────────────
router.post(
  "/:id/refund",
  authorize("ADMIN", "MANAGER"),
  validate(refundSchema),
  saleController.refund
);

export default router;
