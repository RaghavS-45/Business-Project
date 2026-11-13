import { z } from "zod";
import { optionalField } from "./helpers.js";
import { GSTIN_REGEX, STATE_CODES, stateFromGstin } from "../utils/gst.js";

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
const customerFields = z.object({
  name: z
    .string({ required_error: "Customer name is required" })
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(200, "Name must be at most 200 characters"),

  email: optionalField(
    z.string().trim().email("Invalid email address").toLowerCase()
  ),

  phone: optionalField(
    z.string().trim().regex(/^[+\d\s\-().]{7,20}$/, "Please provide a valid phone number")
  ),

  address: addressSchema,

  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || GSTIN_REGEX.test(v), "Enter a valid 15-character GSTIN")
    .optional(),

  stateCode: z
    .string()
    .trim()
    .refine((v) => v === "" || STATE_CODES.includes(v), "Choose a valid state")
    .optional(),

  // null / "" = no credit limit, 0 = cash only
  creditLimit: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v === null ? null : Number(v)),
    z.number().min(0, "Credit limit cannot be negative").nullable().optional()
  ),

  paymentTermsDays: z.coerce
    .number()
    .int("Payment terms must be whole days")
    .min(0)
    .max(365, "Payment terms can be at most 365 days")
    .optional(),

  notes: z
    .string()
    .trim()
    .max(1000, "Notes must be at most 1000 characters")
    .optional()
    .default(""),
});

/** A GSTIN fixes the buyer's state: fill it in, and reject a mismatch. */
const withGstState = (schema) =>
  schema
    .transform((data) => {
      const fromGstin = stateFromGstin(data.gstin);
      return fromGstin && !data.stateCode ? { ...data, stateCode: fromGstin } : data;
    })
    .refine(
      (data) => !data.gstin || !data.stateCode || stateFromGstin(data.gstin) === data.stateCode,
      { message: "State does not match the GSTIN (its first two digits are the state code)", path: ["stateCode"] }
    );

export const createCustomerSchema = withGstState(customerFields);

// ─── Update ──────────────────────────────────────────────
export const updateCustomerSchema = withGstState(customerFields.partial());

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
