import { z } from "zod";
import { optionalField } from "./helpers.js";

/**
 * Quotations, delivery challans, purchase bills and supplier payments.
 */

const objectId = (label) => z.string().regex(/^[a-fA-F0-9]{24}$/, `${label} must be a valid id`);

const quantity = z.coerce
  .number({ required_error: "Quantity is required" })
  .positive("Quantity must be more than 0")
  .refine((v) => Math.round(v * 1000) / 1000 === v, "Quantity can have at most 3 decimals");

const unit = z.string().trim().toLowerCase().max(30).optional();
const percent = (label) => z.coerce.number().min(0, `${label} can't be negative`).max(100, `${label} can't exceed 100%`);
const pastOrToday = z.coerce
  .date()
  .refine((d) => d.getTime() <= Date.now() + 86_400_000, "Date can't be in the future");

const sellLine = z.object({
  product: objectId("product"),
  quantity,
  unit,
  discountPercent: percent("Discount").default(0),
});

const paging = {
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
};

// ─── Quotations ──────────────────────────────────────────
export const createQuotationSchema = z
  .object({
    customer: optionalField(objectId("customer")),
    partyName: optionalField(z.string().trim().max(200)),
    partyPhone: optionalField(z.string().trim().max(20)),
    items: z.array(sellLine).min(1, "Add at least one item").max(50),
    validDays: z.coerce.number().int().min(1).max(180).default(15),
    notes: z.string().trim().max(1000).optional().default(""),
  })
  .refine((v) => v.customer || v.partyName, { message: "Choose a customer or enter a name", path: ["partyName"] });

export const quotationStatusSchema = z.object({
  status: z.enum(["OPEN", "ACCEPTED", "DECLINED"]),
});

export const quotationQuerySchema = z.object({
  ...paging,
  status: z.enum(["OPEN", "ACCEPTED", "DECLINED", "CONVERTED", "EXPIRED"]).optional(),
  customer: objectId("customer").optional(),
});

// ─── Delivery challans ───────────────────────────────────
export const createChallanSchema = z
  .object({
    customer: optionalField(objectId("customer")),
    quotation: optionalField(objectId("quotation")),
    items: z.array(sellLine).max(50).optional(),
    deliveryAddress: z.string().trim().max(300).optional().default(""),
    vehicleNumber: z.string().trim().max(20).optional().default(""),
    transporter: z.string().trim().max(100).optional().default(""),
    notes: z.string().trim().max(1000).optional().default(""),
  })
  .refine((v) => v.quotation || (v.customer && v.items?.length), {
    message: "Choose a customer and add items, or make it from a quotation",
    path: ["items"],
  });

export const invoiceChallanSchema = z.object({
  paymentMethod: z.enum(["CASH", "CARD", "UPI", "OTHER", "CREDIT"]),
  amountPaid: z.coerce.number().min(0).optional(),
  notes: z.string().trim().max(500).optional().default(""),
});

export const cancelSchema = z.object({
  reason: z.string().trim().min(3, "Give a short reason").max(300),
});

export const challanQuerySchema = z.object({
  ...paging,
  status: z.enum(["OPEN", "INVOICED", "CANCELLED"]).optional(),
  customer: objectId("customer").optional(),
});

// ─── Purchase bills ──────────────────────────────────────
export const createBillSchema = z.object({
  vendor: objectId("supplier"),
  supplierInvoiceNo: z.string().trim().min(1, "Enter the supplier's invoice number").max(50),
  billDate: pastOrToday.optional(),
  dueDate: optionalField(z.coerce.date()),
  purchaseOrder: optionalField(objectId("purchase order")),
  items: z
    .array(
      z.object({
        product: objectId("product"),
        quantity,
        unit,
        unitCost: z.coerce.number().min(0, "Cost can't be negative"),
        discountPercent: percent("Discount").default(0),
        taxPercent: percent("GST").optional(),
      })
    )
    .min(1, "Add at least one item")
    .max(100),
  amountPaid: z.coerce.number().min(0).optional().default(0),
  paymentMethod: z.enum(["CASH", "UPI", "CARD", "BANK", "CHEQUE", "OTHER", ""]).optional().default(""),
  notes: z.string().trim().max(1000).optional().default(""),
});

export const billQuerySchema = z.object({
  ...paging,
  vendor: objectId("supplier").optional(),
  status: z.enum(["POSTED", "CANCELLED"]).optional(),
  paymentStatus: z.enum(["UNPAID", "PARTIAL", "PAID"]).optional(),
});

// ─── Supplier payments ───────────────────────────────────
export const supplierPaymentSchema = z.object({
  vendor: objectId("supplier"),
  amount: z.coerce.number().positive("Amount must be more than ₹0"),
  method: z.enum(["CASH", "UPI", "CARD", "BANK", "CHEQUE", "OTHER"]),
  reference: z.string().trim().max(100).optional().default(""),
  paidAt: pastOrToday.optional(),
  notes: z.string().trim().max(500).optional().default(""),
  allocations: z
    .array(z.object({ bill: objectId("bill"), amount: z.coerce.number().positive() }))
    .max(100)
    .optional(),
});

export const supplierPaymentQuerySchema = z.object({
  vendor: objectId("supplier").optional(),
});
