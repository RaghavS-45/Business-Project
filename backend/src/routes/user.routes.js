import { Router } from "express";
import userController from "../controllers/user.controller.js";
import authenticate from "../middleware/authenticate.js";
import authorize from "../middleware/authorize.js";
import validate from "../middleware/validate.js";
import { createUserSchema, updateUserSchema } from "../validators/user.validator.js";

const router = Router();

// ── Self-service: any authenticated user ──────────────────────────────────────
// Must come BEFORE the admin-only router.use() below

/**
 * PATCH /api/users/me/password
 * Change the authenticated user's own password.
 * Body: { oldPassword, newPassword }
 */
router.patch(
  "/me/password",
  authenticate,
  userController.changePassword
);

// ── Admin-only: user management ───────────────────────────────────────────────
router.use(authenticate, authorize("ADMIN"));

router.get("/", userController.getAll);
router.post("/", validate(createUserSchema), userController.create);
router.patch("/:id", validate(updateUserSchema), userController.update);
router.delete("/:id", userController.remove);

export default router;