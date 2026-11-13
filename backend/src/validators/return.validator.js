import { z } from "zod";

const objectId = (label) => z.string().regex(/^[a-fA-F0-9]{24}$/, `${label} must be a valid id`);

/** POST /api/sales/:id/returns */
export const createReturnSchema = z.object({
  items: z
    .array(
      z
        .object({
        // Invoice line (0-based). Or give the product if it's on one line only.
        line: z.coerce.number().int().min(0).optional(),
        product: objectId("product").optional(),
        // Whole numbers unless the line was sold loose (kg, ltr) — checked per line
        quantity: z.coerce
          .number()
          .positive("Quantity must be more than 0")
          .refine((v) => Math.round(v * 1000) / 1000 === v, "Quantity can have at most 3 decimals"),
        // false for damaged goods: don't put them back in stock
        restock: z.boolean().optional().default(true),
      })
        .refine((v) => v.line !== undefined || v.product !== undefined, "Give the invoice line or the product")
    )
    .min(1, "Choose at least one item to return")
    .max(50),
  reason: z
    .string({ required_error: "Reason is required" })
    .trim()
    .min(3, "Reason must be at least 3 characters")
    .max(500, "Reason must be at most 500 characters"),
  refundMethod: z.enum(["CASH", "CARD", "UPI", "OTHER"]).optional(),
});

export const creditNoteQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
