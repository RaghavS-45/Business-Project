import { z } from "zod";
import { PRODUCT_CATEGORIES, PRODUCT_UNITS } from "../models/Product.js";

/**
 * Zod schemas for Product route validation.
 *
 * Note: image files are handled by Multer, not Zod.
 * These schemas only validate the JSON body fields.
 */

// ─── Create ──────────────────────────────────────────────
export const createProductSchema = z.object({
  name: z
    .string({ required_error: "Product name is required" })
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(200, "Name must be at most 200 characters"),

  sku: z
    .string()
    .trim()
    .toUpperCase()
    .min(3, "SKU must be at least 3 characters")
    .max(50, "SKU must be at most 50 characters")
    .optional(), // Auto-generated if not provided

  barcode: z
    .string()
    .trim()
    .min(1)
    .max(50, "Barcode must be at most 50 characters")
    .optional(),

  description: z
    .string()
    .trim()
    .max(2000, "Description must be at most 2000 characters")
    .optional()
    .default(""),

  category: z.enum(PRODUCT_CATEGORIES, {
    errorMap: () => ({ message: `Category must be one of: ${PRODUCT_CATEGORIES.join(", ")}` }),
  }),

  unit: z
    .enum(PRODUCT_UNITS, {
      errorMap: () => ({ message: `Unit must be one of: ${PRODUCT_UNITS.join(", ")}` }),
    })
    .default("pcs"),

  costPrice: z.coerce
    .number({ required_error: "Cost price is required" })
    .min(0, "Cost price cannot be negative"),

  sellingPrice: z.coerce
    .number({ required_error: "Selling price is required" })
    .min(0, "Selling price cannot be negative"),

  stock: z.coerce
    .number()
    .int("Stock must be a whole number")
    .min(0, "Stock cannot be negative")
    .default(0),

  lowStockThreshold: z.coerce
    .number()
    .int("Low stock threshold must be a whole number")
    .min(0, "Threshold cannot be negative")
    .default(10),

  vendor: z
    .string()
    .regex(/^[a-fA-F0-9]{24}$/, "vendor must be a valid MongoDB ObjectId")
    .optional(),
});

// ─── Update ──────────────────────────────────────────────
// All fields optional — only provided fields are updated
export const updateProductSchema = createProductSchema.partial();

// ─── List / Query ────────────────────────────────────────
export const productQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category: z.enum(PRODUCT_CATEGORIES).optional(),
  search: z.string().trim().max(100).optional(),
  lowStock: z
    .string()
    .transform((v) => v === "true")
    .optional(),
  isActive: z
    .string()
    .transform((v) => v !== "false") // default true, pass isActive=false to see inactive
    .default("true"),
  sortBy: z.enum(["name", "stock", "sellingPrice", "createdAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
