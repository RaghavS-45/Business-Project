import { z } from "zod";
import { PRODUCT_CATEGORIES, PRODUCT_UNITS } from "../models/Product.js";
import { optionalField } from "./helpers.js";
import { HSN_REGEX } from "../utils/gst.js";
import { DECIMAL_UNITS } from "../utils/unitPricing.js";

const threeDecimals = (v) => Math.round(v * 1000) / 1000 === v;

/** Arrays may arrive as JSON strings when the form is sent as multipart. */
const jsonArray = (schema) => z.preprocess((v) => (typeof v === "string" ? JSON.parse(v) : v), schema);

const nullableMoney = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.coerce.number().min(0, "Price cannot be negative").nullable()
);

/**
 * Zod schemas for Product route validation.
 *
 * Note: image files are handled by Multer, not Zod.
 * These schemas only validate the JSON body fields.
 */

// ─── Create ──────────────────────────────────────────────
const productFields = z.object({
  name: z
    .string({ required_error: "Product name is required" })
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(200, "Name must be at most 200 characters"),

  // Auto-generated if blank or not provided
  sku: optionalField(
    z
      .string()
      .trim()
      .toUpperCase()
      .min(3, "SKU must be at least 3 characters")
      .max(50, "SKU must be at most 50 characters")
  ),

  barcode: optionalField(
    z.string().trim().max(50, "Barcode must be at most 50 characters")
  ),

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

  // Whole numbers, except for loose units (kg, ltr, ...) — checked below
  stock: z.coerce
    .number()
    .min(0, "Stock cannot be negative")
    .refine(threeDecimals, "Stock can have at most 3 decimals")
    .default(0),

  lowStockThreshold: z.coerce
    .number()
    .min(0, "Threshold cannot be negative")
    .refine(threeDecimals, "Threshold can have at most 3 decimals")
    .default(10),

  // Other selling units: [{ name: "carton", size: 12, price?: 5400 }]
  packs: jsonArray(
    z.array(
      z.object({
        name: z.string().trim().toLowerCase().min(1, "Pack name is required").max(30),
        size: z.coerce.number().positive("Pack size must be more than 0").refine(threeDecimals, "Pack size can have at most 3 decimals"),
        price: z.preprocess(
          (v) => (v === "" || v === undefined ? null : v),
          z.coerce.number().min(0, "Pack price cannot be negative").nullable()
        ),
      })
    ).max(10, "At most 10 pack sizes")
  ).optional(),

  // Price per base unit for Wholesale / Distributor customers (null = selling price)
  levelPrices: z
    .preprocess(
      (v) => (typeof v === "string" ? JSON.parse(v) : v),
      z.object({
        wholesale: nullableMoney,
        distributor: nullableMoney,
      })
    )
    .optional(),

  // Bulk prices: [{ minQty: 10, price: 470 }] per base unit
  priceSlabs: jsonArray(
    z.array(
      z.object({
        minQty: z.coerce.number().positive("Slab quantity must be more than 0"),
        price: z.coerce.number().min(0, "Slab price cannot be negative"),
      })
    ).max(10, "At most 10 price slabs")
  ).optional(),

  // GST rate in percent. Any value 0–100 is accepted so new slabs need no code change.
  taxRate: z.coerce
    .number()
    .min(0, "GST rate cannot be negative")
    .max(100, "GST rate cannot exceed 100%")
    .default(0),

  hsnCode: z
    .string()
    .trim()
    .refine((v) => v === "" || HSN_REGEX.test(v), "HSN code must be 4, 6 or 8 digits")
    .optional()
    .default(""),

  vendor: optionalField(
    z.string().regex(/^[a-fA-F0-9]{24}$/, "vendor must be a valid MongoDB ObjectId")
  ),
});

/** Cross-field checks: whole-number stock for counted units, unique packs/slabs. */
const checkProduct = (data, ctx) => {
  const unit = data.unit;
  if (unit && !DECIMAL_UNITS.includes(unit)) {
    for (const key of ["stock", "lowStockThreshold"]) {
      if (data[key] !== undefined && !Number.isInteger(data[key])) {
        ctx.addIssue({ code: "custom", path: [key], message: `${unit} is counted in whole numbers` });
      }
    }
  }
  if (data.packs) {
    const names = data.packs.map((p) => p.name);
    if (new Set(names).size !== names.length) {
      ctx.addIssue({ code: "custom", path: ["packs"], message: "Each pack name can only be used once" });
    }
    if (unit && names.includes(unit)) {
      ctx.addIssue({ code: "custom", path: ["packs"], message: `A pack can't have the same name as the base unit (${unit})` });
    }
  }
  if (data.priceSlabs) {
    const qtys = data.priceSlabs.map((s) => s.minQty);
    if (new Set(qtys).size !== qtys.length) {
      ctx.addIssue({ code: "custom", path: ["priceSlabs"], message: "Each slab needs a different quantity" });
    }
  }
};

export const createProductSchema = productFields.superRefine(checkProduct);

// ─── Update ──────────────────────────────────────────────
// All fields optional — only provided fields are updated
export const updateProductSchema = productFields.partial().superRefine(checkProduct);

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
