import { z } from "zod";

/**
 * Zod schemas for PurchaseOrder route validation.
 * Follows the same patterns as vendor.validator.js
 */

const objectId = z
  .string({ required_error: "ID is required" })
  .regex(/^[a-f\d]{24}$/i, "Invalid MongoDB ObjectId");

// ─── Line Item ────────────────────────────────────────────
const lineItemSchema = z.object({
  product: objectId,
  quantity: z.coerce
    .number({ required_error: "Quantity is required" })
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1"),
  unitCost: z.coerce
    .number({ required_error: "Unit cost is required" })
    .min(0, "Unit cost cannot be negative"),
});

// ─── Create ──────────────────────────────────────────────
export const createPurchaseOrderSchema = z.object({
  vendor: objectId,

  items: z
    .array(lineItemSchema, { required_error: "Items are required" })
    .min(1, "At least one item is required"),

  notes: z
    .string()
    .trim()
    .max(1000, "Notes must be at most 1000 characters")
    .optional()
    .default(""),

  expectedDelivery: z
    .string()
    .datetime({ offset: true, message: "Invalid date format" })
    .optional()
    .nullable()
    .default(null),
});

// ─── Update (partial, but items still validated if present) ──
export const updatePurchaseOrderSchema = z.object({
  notes: z
    .string()
    .trim()
    .max(1000, "Notes must be at most 1000 characters")
    .optional(),

  expectedDelivery: z
    .string()
    .datetime({ offset: true, message: "Invalid date format" })
    .optional()
    .nullable(),
});

// ─── Status transition ────────────────────────────────────
export const updateStatusSchema = z.object({
  status: z.enum(["approved", "rejected", "received"], {
    required_error: "Status is required",
    invalid_type_error: "Status must be approved, rejected, or received",
  }),
});

// ─── List / Query ─────────────────────────────────────────
export const purchaseOrderQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["pending", "approved", "received", "rejected"]).optional(),
  vendor: objectId.optional(),
  sortBy: z.enum(["createdAt", "totalAmount", "status"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});