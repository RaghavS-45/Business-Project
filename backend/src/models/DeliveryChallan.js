import mongoose from "mongoose";
import { pricedLineSchema, partySchema, sellerSchema, totalsFields, jsonOptions } from "./schemas/documentParts.js";

/**
 * Delivery challan — goods sent to a buyer before (or without) an invoice.
 *
 * Numbered DC-YYYYMMDD-NNNN. Stock leaves when the challan is made, so an
 * invoice raised from it does not take stock again. Lifecycle:
 *   OPEN → INVOICED  (one invoice per challan)
 *   OPEN → CANCELLED (goods came back; stock restored)
 * Lines carry their value at today's prices, as the e-way bill needs it.
 */
export const CHALLAN_STATUSES = ["OPEN", "INVOICED", "CANCELLED"];

const challanSchema = new mongoose.Schema(
  {
    challanNumber: { type: String, required: true, unique: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
    buyer: { type: partySchema, default: () => ({}) },
    seller: { type: sellerSchema, default: () => ({}) },
    items: {
      type: [pricedLineSchema],
      validate: { validator: (a) => a.length >= 1, message: "A challan needs at least one item" },
    },
    ...totalsFields,
    status: { type: String, enum: CHALLAN_STATUSES, default: "OPEN" },
    deliveryAddress: { type: String, trim: true, maxlength: 300, default: "" },
    vehicleNumber: { type: String, trim: true, uppercase: true, maxlength: 20, default: "" },
    transporter: { type: String, trim: true, maxlength: 100, default: "" },
    quotation: { type: mongoose.Schema.Types.ObjectId, ref: "Quotation", default: null },
    quoteNumber: { type: String, default: "" },
    sale: { type: mongoose.Schema.Types.ObjectId, ref: "Sale", default: null },
    invoiceNumber: { type: String, default: "" },
    invoicedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, trim: true, maxlength: 300, default: "" },
    notes: { type: String, trim: true, maxlength: 1000, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  jsonOptions
);

challanSchema.index({ createdAt: -1 });
challanSchema.index({ customer: 1, status: 1 });
challanSchema.index({ status: 1 });

const DeliveryChallan = mongoose.model("DeliveryChallan", challanSchema);
export default DeliveryChallan;
