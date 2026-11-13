import mongoose from "mongoose";
import { pricedLineSchema, partySchema, sellerSchema, totalsFields, jsonOptions } from "./schemas/documentParts.js";

/**
 * Quotation — a priced offer to a buyer. Moves no stock and no money.
 *
 * Numbered QT-YYYYMMDD-NNNN. Lifecycle:
 *   OPEN → ACCEPTED / DECLINED
 *   OPEN | ACCEPTED → CONVERTED (billed at the POS, or sent as a delivery challan)
 * A quote past its validUntil date is shown as expired but keeps its status.
 */
export const QUOTATION_STATUSES = ["OPEN", "ACCEPTED", "DECLINED", "CONVERTED"];

const quotationSchema = new mongoose.Schema(
  {
    quoteNumber: { type: String, required: true, unique: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", default: null },
    buyer: { type: partySchema, default: () => ({}) },
    seller: { type: sellerSchema, default: () => ({}) },
    items: {
      type: [pricedLineSchema],
      validate: { validator: (a) => a.length >= 1, message: "A quotation needs at least one item" },
    },
    ...totalsFields,
    validUntil: { type: Date, required: true },
    status: { type: String, enum: QUOTATION_STATUSES, default: "OPEN" },
    // What it turned into
    convertedTo: {
      kind: { type: String, enum: ["SALE", "CHALLAN", null], default: null },
      id: { type: mongoose.Schema.Types.ObjectId, default: null },
      number: { type: String, default: "" },
      at: { type: Date, default: null },
    },
    notes: { type: String, trim: true, maxlength: 1000, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  jsonOptions
);

quotationSchema.index({ createdAt: -1 });
quotationSchema.index({ customer: 1, createdAt: -1 });
quotationSchema.index({ status: 1 });

const Quotation = mongoose.model("Quotation", quotationSchema);
export default Quotation;
