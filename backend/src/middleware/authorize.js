import ApiError from "../utils/ApiError.js";

/**
 * Role-based authorization middleware.
 *
 * Usage:  router.get("/admin-only", authenticate, authorize("ADMIN"), handler)
 *         router.get("/managers",   authenticate, authorize("ADMIN", "MANAGER"), handler)
 *
 * Must be used AFTER the authenticate middleware (needs req.user).
 */
const authorize = (...allowedRoles) => {
  return (req, _res, next) => {
    if (!req.user) {
      return next(
        ApiError.unauthorized("Authentication required before authorization")
      );
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        ApiError.forbidden(
          `Role '${req.user.role}' is not authorized to access this resource`
        )
      );
    }

    next();
  };
};

export default authorize;
