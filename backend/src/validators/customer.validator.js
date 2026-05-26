import { z } from "zod";

/**
 * Zod schemas for Customer route validation.
 */

const addressSchema = z
  .object({
    street: z.string().trim().max(200).optional().default(""),
    city: z.string().trim().max(100).optional().default(""),
    state: z.string().trim().max(100).optional().default(""),
    pincode: z.string().trim().max(10).optional().default(""),
  })
  .optional()
  .default({});

// ─── Create ──────────────────────────────────────────────
export const createCustomerSchema = z.object({
  name: z
    .string({ required_error: "Customer name is required" })
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(200, "Name must be at most 200 characters"),

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
    .nullable()
    .default(null),

  address: addressSchema,

  notes: z
    .string()
    .trim()
    .max(1000, "Notes must be at most 1000 characters")
    .optional()
    .default(""),
});

// ─── Update ──────────────────────────────────────────────
export const updateCustomerSchema = createCustomerSchema.partial();

// ─── List / Query ────────────────────────────────────────
export const customerQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  isActive: z
    .string()
    .transform((v) => v !== "false")
    .default("true"),
  sortBy: z.enum(["name", "totalPurchases", "loyaltyPoints", "createdAt"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});
