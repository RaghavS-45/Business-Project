import { z } from "zod";

const objectId = (label) => z.string().regex(/^[a-fA-F0-9]{24}$/, `${label} must be a valid id`);

/** POST /api/payments */
export const createPaymentSchema = z.object({
  customer: objectId("customer"),
  amount: z.coerce.number().positive("Amount must be more than ₹0"),
  method: z.enum(["CASH", "UPI", "CARD", "BANK", "CHEQUE", "OTHER"]),
  reference: z.string().trim().max(100).optional().default(""),
  receivedAt: z.coerce
    .date()
    .refine((d) => d.getTime() <= Date.now() + 86_400_000, "Payment date can't be in the future")
    .optional(),
  notes: z.string().trim().max(500).optional().default(""),
  // Leave out to apply the payment to the oldest invoices first
  allocations: z
    .array(z.object({ sale: objectId("sale"), amount: z.coerce.number().positive() }))
    .max(100)
    .optional(),
});

export const paymentQuerySchema = z.object({
  customer: objectId("customer").optional(),
});

export const ledgerQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
