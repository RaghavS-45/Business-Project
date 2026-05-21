import ApiError from "../utils/ApiError.js";

/**
 * Zod validation middleware factory.
 *
 * Creates Express middleware that validates req.body against a Zod schema.
 * On failure, returns a 400 with structured field-level errors.
 *
 * Usage:
 *   import { loginSchema } from "../validators/auth.validator.js";
 *   router.post("/login", validate(loginSchema), controller.login);
 *
 * Can validate body, query, or params by passing the `source` option.
 */
const validate = (schema, source = "body") => {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const fieldErrors = result.error.errors.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));

      return next(
        ApiError.badRequest("Validation failed", fieldErrors)
      );
    }

    // Replace the source with the parsed (and potentially transformed) data
    req[source] = result.data;
    next();
  };
};

export default validate;
