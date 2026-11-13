import { Router } from "express";
import purchaseOrderController from "../controllers/purchaseOrder.controller.js";
import validate from "../middleware/validate.js";
import authenticate from "../middleware/authenticate.js";
import authorize from "../middleware/authorize.js";
import purchaseOrderService from "../services/purchaseOrder.service.js";
import settingsService from "../services/settings.service.js";
import { renderPurchaseOrderPdf } from "../services/purchaseOrderPdf.service.js";
import {
  createPurchaseOrderSchema,
  updatePurchaseOrderSchema,
  updateStatusSchema,
  purchaseOrderQuerySchema,
} from "../validators/purchaseOrder.validator.js";

const router = Router();

/**
 * Purchase Order Routes
 *
 * POST   /api/purchase-orders              — Create PO            (ADMIN | MANAGER)
 * GET    /api/purchase-orders              — List POs             (authenticated)
 * GET    /api/purchase-orders/stats        — Dashboard stats      (ADMIN | MANAGER)
 * GET    /api/purchase-orders/reorder-suggestions — Low stock, less what's on order (ADMIN | MANAGER)
 * GET    /api/purchase-orders/:id          — Get PO               (authenticated)
 * GET    /api/purchase-orders/:id/pdf      — PDF to send the supplier (ADMIN | MANAGER)
 * PUT    /api/purchase-orders/:id          — Update notes/date    (ADMIN | MANAGER)
 * PATCH  /api/purchase-orders/:id/status   — Transition status    (ADMIN | MANAGER)
 * DELETE /api/purchase-orders/:id          — Delete pending PO    (ADMIN)
 *
 * Status transitions (enforced in service layer):
 *   pending  → approved   (ADMIN | MANAGER)
 *   pending  → rejected   (ADMIN | MANAGER)
 *   approved → received   (ADMIN) — triggers automatic inventory update
 */

router.use(authenticate);

router.post(
  "/",
  authorize("ADMIN", "MANAGER"),
  validate(createPurchaseOrderSchema),
  purchaseOrderController.create
);

router.get(
  "/",
  validate(purchaseOrderQuerySchema, "query"),
  purchaseOrderController.list
);

// Must be before /:id to avoid "stats" being treated as an ObjectId
router.get(
  "/stats",
  authorize("ADMIN", "MANAGER"),
  purchaseOrderController.stats
);

router.get("/reorder-suggestions", authorize("ADMIN", "MANAGER"), async (_req, res, next) => {
  try {
    res.json({ success: true, data: { suggestions: await purchaseOrderService.reorderSuggestions() } });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", purchaseOrderController.getById);

router.get("/:id/pdf", authorize("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const [po, store] = await Promise.all([purchaseOrderService.getById(req.params.id), settingsService.get()]);
    const pdf = await renderPurchaseOrderPdf(po, store);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${po.poNumber}.pdf"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(pdf);
  } catch (error) {
    next(error);
  }
});

router.put(
  "/:id",
  authorize("ADMIN", "MANAGER"),
  validate(updatePurchaseOrderSchema),
  purchaseOrderController.update
);

router.patch(
  "/:id/status",
  authorize("ADMIN", "MANAGER"),
  validate(updateStatusSchema),
  purchaseOrderController.updateStatus
);

router.delete("/:id", authorize("ADMIN"), purchaseOrderController.delete);

export default router;