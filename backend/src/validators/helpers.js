import { z } from "zod";

/**
 * Treat "", whitespace-only strings and null as "not provided".
 *
 * Forms send empty inputs as "" (or the client maps them to null). Storing
 * those values breaks unique+sparse indexes — MongoDB indexes null and ""
 * like any other value, so a second record with a blank email/GSTIN/phone
 * fails with a duplicate-key error. Mapping blanks to undefined means the
 * field is simply left off the document.
 */
export const optionalField = (schema) =>
  z.preprocess(
    (v) => (v === null || (typeof v === "string" && v.trim() === "") ? undefined : v),
    schema.optional()
  );

/**
 * Accepts a plain date ("2026-11-20", as sent by <input type="date">)
 * or a full ISO datetime.
 */
export const dateString = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date format");
