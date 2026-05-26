import { Router } from "express";
import customerController from "../controllers/customer.controller.js";
import validate from "../middleware/validate.js";
import authenticate from "../middleware/authenticate.js";
import authorize from "../middleware/authorize.js";
import {
  createCustomerSchema,
  updateCustomerSchema,
  customerQuerySchema,
} from "../validators/customer.validator.js";

const router = Router();

/**
 * Customer Routes
 *
 * POST   /api/customers      — Create customer (ADMIN | MANAGER | CASHIER)
 * GET    /api/customers      — List customers  (authenticated)
 * GET    /api/customers/:id  — Get customer    (authenticated)
 * PUT    /api/customers/:id  — Update customer (ADMIN | MANAGER)
 * DELETE /api/customers/:id  — Soft-delete     (ADMIN)
 *
 * Note: CASHIER can create customers because they need to register
 * walk-in customers quickly at the point of sale.
 */

router.use(authenticate);

router.post(
  "/",
  authorize("ADMIN", "MANAGER", "CASHIER"),
  validate(createCustomerSchema),
  customerController.create
);

router.get(
  "/",
  validate(customerQuerySchema, "query"),
  customerController.list
);

router.get("/:id", customerController.getById);

router.put(
  "/:id",
  authorize("ADMIN", "MANAGER"),
  validate(updateCustomerSchema),
  customerController.update
);

router.delete("/:id", authorize("ADMIN"), customerController.delete);

export default router;
