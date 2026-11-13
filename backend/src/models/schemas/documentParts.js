import mongoose from "mongoose";

/**
 * Pieces shared by quotations and delivery challans — the same line and
 * party snapshots a Sale stores, so a quote or challan prints exactly like
 * the invoice it becomes.
 */

export const pricedLineSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true },
    sku: { type: String, default: "" },
    quantity: { type: Number, required: true, min: 0.001 },
    unit: { type: String, default: "" },
    unitSize: { type: Number, default: 1 },
    baseUnit: { type: String, default: "" },
    baseQuantity: { type: Number, default: 0 },
    priceSource: { type: String, default: "" },
    unitPrice: { type: Number, min: 0, default: 0 },
    discountPercent: { type: Number, min: 0, max: 100, default: 0 },
    taxPercent: { type: Number, min: 0, max: 100, default: 0 },
    hsnCode: { type: String, default: "" },
    taxableValue: { type: Number, min: 0, default: 0 },
    cgst: { type: Number, min: 0, default: 0 },
    sgst: { type: Number, min: 0, default: 0 },
    igst: { type: Number, min: 0, default: 0 },
    lineTotal: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

export const partySchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    gstin: { type: String, default: "" },
    stateCode: { type: String, default: "" },
    address: { type: String, default: "" },
    phone: { type: String, default: "" },
  },
  { _id: false }
);

export const sellerSchema = new mongoose.Schema(
  {
    legalName: String,
    tradeName: String,
    gstin: String,
    stateCode: String,
    address: String,
    phone: String,
    email: String,
    bankDetails: String,
    invoiceTerms: String,
  },
  { _id: false }
);

/** Totals block, identical in meaning to the Sale's. */
export const totalsFields = {
  subtotal: { type: Number, default: 0 },
  discountTotal: { type: Number, default: 0 },
  loyaltyTier: { type: String, default: null },
  loyaltyDiscountPercent: { type: Number, default: 0 },
  loyaltyDiscountTotal: { type: Number, default: 0 },
  taxableTotal: { type: Number, default: 0 },
  taxTotal: { type: Number, default: 0 },
  cgstTotal: { type: Number, default: 0 },
  sgstTotal: { type: Number, default: 0 },
  igstTotal: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 },
  pricesIncludeTax: { type: Boolean, default: false },
  interState: { type: Boolean, default: false },
  placeOfSupply: { code: { type: String, default: "" }, name: { type: String, default: "" } },
};

export const jsonOptions = {
  timestamps: true,
  toJSON: {
    transform(_doc, ret) {
      delete ret.__v;
      return ret;
    },
  },
};
