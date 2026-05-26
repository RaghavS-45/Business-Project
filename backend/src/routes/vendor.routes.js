import { Router } from "express";
import vendorController from "../controllers/vendor.controller.js";
import validate from "../middleware/validate.js";
import authenticate from "../middleware/authenticate.js";
import authorize from "../middleware/authorize.js";
import {
  createVendorSchema,
  updateVendorSchema,
  vendorQuerySchema,
} from "../validators/vendor.validator.js";

const router = Router();

/**
 * Vendor Routes
 *
 * POST   /api/vendors      — Create vendor (ADMIN | MANAGER)
 * GET    /api/vendors      — List vendors  (authenticated)
 * GET    /api/vendors/:id  — Get vendor    (authenticated)
 * PUT    /api/vendors/:id  — Update vendor (ADMIN | MANAGER)
 * DELETE /api/vendors/:id  — Soft-delete   (ADMIN)
 */

router.use(authenticate);

router.post(
  "/",
  authorize("ADMIN", "MANAGER"),
  validate(createVendorSchema),
  vendorController.create
);

router.get(
  "/",
  validate(vendorQuerySchema, "query"),
  vendorController.list
);

router.get("/:id", vendorController.getById);

router.put(
  "/:id",
  authorize("ADMIN", "MANAGER"),
  validate(updateVendorSchema),
  vendorController.update
);

router.delete("/:id", authorize("ADMIN"), vendorController.delete);

export default router;
