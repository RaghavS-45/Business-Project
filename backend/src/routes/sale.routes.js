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

import returnService from "../services/return.service.js";
import { createReturnSchema } from "../validators/return.validator.js";

const router = Router();

/**
 * Sale Routes
 *
 * All routes require authentication.
 * Checkout is available to all roles (ADMIN, MANAGER, CASHIER).
 * Listing, summary, and refund are restricted to ADMIN/MANAGER.
 *
 * POST   /api/sales/checkout         — Process a checkout
 * GET    /api/sales                  — List sales (paginated)
 * GET    /api/sales/summary/daily    — Daily sales summary
 * GET    /api/sales/:id              — Get sale details
 * GET    /api/sales/:id/receipt      — Get a short-lived signed receipt URL
 * POST   /api/sales/:id/refund       — Process a refund
 *
 * NOTE: /checkout, /summary/daily, and /:id/receipt are registered BEFORE /:id
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

// ─── Get signed receipt URL (short-lived, private) ───────
router.get("/:id/receipt", saleController.getReceipt);

// ─── GST tax invoice PDF (generated on demand) ───────────
router.get("/:id/invoice", saleController.getInvoicePdf);

// ─── Returns (partial or full) → credit note ─────────────
router.post(
  "/:id/returns",
  authorize("ADMIN", "MANAGER"),
  validate(createReturnSchema),
  async (req, res, next) => {
    try {
      const { creditNote, sale } = await returnService.createReturn(req.params.id, req.body, req.user._id);
      res.status(201).json({
        success: true,
        message: `Credit note ${creditNote.creditNoteNumber} issued`,
        data: { creditNote, sale },
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get("/:id/returns", authorize("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const creditNotes = await returnService.listForSale(req.params.id);
    res.json({ success: true, data: { creditNotes } });
  } catch (error) {
    next(error);
  }
});

// ─── Refund ──────────────────────────────────────────────
router.post(
  "/:id/refund",
  authorize("ADMIN", "MANAGER"),
  validate(refundSchema),
  saleController.refund
);

export default router;

