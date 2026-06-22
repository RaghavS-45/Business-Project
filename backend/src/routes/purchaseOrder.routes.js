import { Router } from "express";
import purchaseOrderController from "../controllers/purchaseOrder.controller.js";
import validate from "../middleware/validate.js";
import authenticate from "../middleware/authenticate.js";
import authorize from "../middleware/authorize.js";
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
 * GET    /api/purchase-orders/:id          — Get PO               (authenticated)
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

router.get("/:id", purchaseOrderController.getById);

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