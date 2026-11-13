import { z } from "zod";
import { optionalField, dateString } from "./helpers.js";

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
  // Whole numbers, or up to 3 decimals for loose units (checked per product)
  quantity: z.coerce
    .number({ required_error: "Quantity is required" })
    .positive("Quantity must be more than 0")
    .refine((v) => Math.round(v * 1000) / 1000 === v, "Quantity can have at most 3 decimals"),
  // Base unit (default) or one of the product's packs
  unit: z.string().trim().toLowerCase().max(30).optional(),
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

  expectedDelivery: optionalField(dateString),
});

// ─── Update (partial, but items still validated if present) ──
// Items and vendor can only change while the PO is pending.
export const updatePurchaseOrderSchema = z.object({
  vendor: objectId.optional(),
  items: z.array(lineItemSchema).min(1, "At least one item is required").optional(),

  notes: z
    .string()
    .trim()
    .max(1000, "Notes must be at most 1000 characters")
    .optional(),

  // null clears the date; blank / omitted leaves it unchanged
  expectedDelivery: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.union([dateString, z.null()]).optional()
  ),
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
  search: z.string().trim().max(100).optional(),
  sortBy: z.enum(["createdAt", "totalAmount", "status"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});