import { Router } from "express";
import productController from "../controllers/product.controller.js";
import validate from "../middleware/validate.js";
import authenticate from "../middleware/authenticate.js";
import authorize from "../middleware/authorize.js";
import upload from "../config/multer.js";
import {
  createProductSchema,
  updateProductSchema,
  productQuerySchema,
} from "../validators/product.validator.js";

const router = Router();

/**
 * Product Routes
 *
 * All routes require authentication.
 * Write operations (create, update, delete) require ADMIN or MANAGER role.
 *
 * POST   /api/products                    — Create product (+ image upload)
 * GET    /api/products                    — List products (paginated, filterable)
 * GET    /api/products/sku/:sku           — Barcode scanner lookup by SKU/barcode
 * GET    /api/products/barcode/:sku       — Get barcode PNG image
 * GET    /api/products/:id               — Get single product by ID
 * PUT    /api/products/:id               — Update product (+ optional new images)
 * DELETE /api/products/:id/images/:publicId — Remove one image
 * DELETE /api/products/:id               — Soft-delete product
 *
 * NOTE: /sku/:sku and /barcode/:sku must be registered BEFORE /:id
 * to prevent Express treating "sku" and "barcode" as ObjectId values.
 */

// ─── All routes require login ─────────────────────────────
router.use(authenticate);

// ─── Special lookup routes (before /:id) ─────────────────

// Barcode scanner: find product by SKU string or barcode value
router.get("/sku/:sku", productController.getBySku);

// Barcode image generator: returns PNG
router.get("/barcode/:sku", productController.getBarcodePng);

// ─── Standard CRUD ───────────────────────────────────────

router.post(
  "/",
  authorize("ADMIN", "MANAGER"),
  upload.array("images", 5),      // Multer: accept up to 5 files in "images" field
  validate(createProductSchema),  // Zod: validate the text fields in req.body
  productController.create
);

router.get(
  "/",
  validate(productQuerySchema, "query"),
  productController.list
);

router.get("/:id", productController.getById);

router.put(
  "/:id",
  authorize("ADMIN", "MANAGER"),
  upload.array("images", 5),
  validate(updateProductSchema),
  productController.update
);

router.delete(
  "/:id/images/:publicId",
  authorize("ADMIN", "MANAGER"),
  productController.deleteImage
);

router.delete(
  "/:id",
  authorize("ADMIN", "MANAGER"),
  productController.delete
);

export default router;
