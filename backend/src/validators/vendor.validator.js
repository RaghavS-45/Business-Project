import { z } from "zod";

/**
 * Zod schemas for Vendor route validation.
 */

const addressSchema = z
  .object({
    street: z.string().trim().max(200).optional().default(""),
    city: z.string().trim().max(100).optional().default(""),
    state: z.string().trim().max(100).optional().default(""),
    pincode: z.string().trim().max(10).optional().default(""),
    country: z.string().trim().max(100).optional().default("India"),
  })
  .optional()
  .default({});

// ─── Create ──────────────────────────────────────────────
export const createVendorSchema = z.object({
  name: z
    .string({ required_error: "Vendor name is required" })
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(200, "Name must be at most 200 characters"),

  contactPerson: z
    .string()
    .trim()
    .max(100, "Contact person name must be at most 100 characters")
    .optional()
    .default(""),

  email: z
    .string()
    .trim()
    .email("Invalid email address")
    .toLowerCase()
    .optional()
    .nullable()
    .default(null),

  phone: z
    .string()
    .trim()
    .regex(/^[+\d\s\-().]{7,20}$/, "Please provide a valid phone number")
    .optional()
    .default(""),

  address: addressSchema,

  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
      "Please provide a valid GSTIN"
    )
    .optional()
    .nullable()
    .default(null),

  paymentTerms: z
    .string()
    .trim()
    .max(100, "Payment terms must be at most 100 characters")
    .optional()
    .default("Immediate"),

  notes: z
    .string()
    .trim()
    .max(1000, "Notes must be at most 1000 characters")
    .optional()
    .default(""),
});

// ─── Update ──────────────────────────────────────────────
export const updateVendorSchema = createVendorSchema.partial();

// ─── List / Query ────────────────────────────────────────
export const vendorQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  isActive: z
    .string()
    .transform((v) => v !== "false")
    .default("true"),
  sortBy: z.enum(["name", "createdAt"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});
