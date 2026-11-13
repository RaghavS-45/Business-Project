import { z } from "zod";
import { GSTIN_REGEX, STATE_CODES, stateFromGstin } from "../utils/gst.js";

const text = (max) => z.string().trim().max(max).optional();

/**
 * Store settings update. Blank GSTIN is allowed (unregistered business);
 * when a GSTIN is given, the state is taken from it and must agree with
 * any state code sent alongside.
 */
export const updateStoreSettingsSchema = z
  .object({
    legalName: text(200),
    tradeName: text(200),
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
    address: text(500),
    phone: text(30),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .refine((v) => v === "" || z.string().email().safeParse(v).success, "Enter a valid email")
      .optional(),
    pricesIncludeTax: z.boolean().optional(),
    bankDetails: text(500),
    invoiceTerms: text(1000),
  })
  .transform((data) => {
    const fromGstin = stateFromGstin(data.gstin);
    return fromGstin && !data.stateCode ? { ...data, stateCode: fromGstin } : data;
  })
  .refine(
    (data) => !data.gstin || !data.stateCode || stateFromGstin(data.gstin) === data.stateCode,
    { message: "State does not match the GSTIN (its first two digits are the state code)", path: ["stateCode"] }
  );
