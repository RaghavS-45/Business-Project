import { z } from "zod";

/**
 * Zod schemas for Sale route validation.
 *
 * checkoutSchema  — validates the cart + payment info for a checkout
 * saleQuerySchema — validates pagination and filter params for listing sales
 * refundSchema    — validates the reason for a refund
 */

// ─── Checkout ────────────────────────────────────────────
const cartItemSchema = z.object({
  product: z
    .string({ required_error: "Product ID is required" })
    .regex(/^[a-fA-F0-9]{24}$/, "product must be a valid MongoDB ObjectId"),
  quantity: z.coerce
    .number({ required_error: "Quantity is required" })
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1"),
  discountPercent: z.coerce
    .number()
    .min(0, "Discount cannot be negative")
    .max(100, "Discount cannot exceed 100%")
    .default(0),
  taxPercent: z.coerce
    .number()
    .min(0, "Tax cannot be negative")
    .max(100, "Tax cannot exceed 100%")
    .default(0),
});

export const checkoutSchema = z.object({
  items: z
    .array(cartItemSchema, {
      required_error: "Cart items are required",
    })
    .min(1, "Cart must have at least one item")
    .max(50, "Cart cannot have more than 50 items"),
  customerId: z
    .string()
    .regex(/^[a-fA-F0-9]{24}$/, "customerId must be a valid MongoDB ObjectId")
    .optional()
    .nullable(),
  paymentMethod: z.enum(["CASH", "CARD", "UPI", "OTHER"], {
    errorMap: () => ({
      message: "Payment method must be one of: CASH, CARD, UPI, OTHER",
    }),
  }),
  notes: z
    .string()
    .trim()
    .max(500, "Notes must be at most 500 characters")
    .optional()
    .default(""),
});

// ─── List / Query ────────────────────────────────────────
export const saleQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["COMPLETED", "REFUNDED", "VOID"]).optional(),
  paymentMethod: z.enum(["CASH", "CARD", "UPI", "OTHER"]).optional(),
  customerId: z
    .string()
    .regex(/^[a-fA-F0-9]{24}$/)
    .optional(),
  cashierId: z
    .string()
    .regex(/^[a-fA-F0-9]{24}$/)
    .optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  sortBy: z
    .enum(["createdAt", "grandTotal", "invoiceNumber"])
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

// ─── Refund ──────────────────────────────────────────────
export const refundSchema = z.object({
  reason: z
    .string({ required_error: "Refund reason is required" })
    .trim()
    .min(5, "Reason must be at least 5 characters")
    .max(500, "Reason must be at most 500 characters"),
});
