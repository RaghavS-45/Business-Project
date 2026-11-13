import mongoose from "mongoose";
import { jsonOptions } from "./schemas/documentParts.js";

/**
 * Purchase bill — a supplier's invoice for goods we bought.
 *
 * Numbered PB-YYYYMMDD-NNNN internally; the supplier's own invoice number is
 * kept too (unique per supplier, so the same bill can't be entered twice).
 * Posting a bill adds the stock (unless its purchase order was already
 * received), updates the moving-average cost, and adds what is unpaid to
 * what we owe the supplier (Vendor.outstanding).
 *
 * GST paid here is input tax: CGST + SGST from a supplier in our state,
 * IGST from one in another state.
 */
export const BILL_STATUSES = ["POSTED", "CANCELLED"];

const billLineSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true },
    sku: { type: String, default: "" },
    quantity: { type: Number, required: true, min: 0.001 }, // in `unit`
    unit: { type: String, default: "" },
    unitSize: { type: Number, default: 1 },
    baseUnit: { type: String, default: "" },
    baseQuantity: { type: Number, required: true },
    unitCost: { type: Number, required: true, min: 0 }, // per `unit`, before GST
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

const purchaseBillSchema = new mongoose.Schema(
  {
    billNumber: { type: String, required: true, unique: true },
    supplierInvoiceNo: { type: String, required: true, trim: true, uppercase: true, maxlength: 50 },
    billDate: { type: Date, required: true },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
    supplier: {
      name: { type: String, default: "" },
      gstin: { type: String, default: "" },
      stateCode: { type: String, default: "" },
    },
    purchaseOrder: { type: mongoose.Schema.Types.ObjectId, ref: "PurchaseOrder", default: null },
    poNumber: { type: String, default: "" },
    // false when the PO's goods were already received (stock added then)
    stockAdded: { type: Boolean, default: true },

    items: {
      type: [billLineSchema],
      validate: { validator: (a) => a.length >= 1, message: "A bill needs at least one item" },
    },
    subtotal: { type: Number, default: 0 },
    discountTotal: { type: Number, default: 0 },
    taxableTotal: { type: Number, default: 0 },
    cgstTotal: { type: Number, default: 0 },
    sgstTotal: { type: Number, default: 0 },
    igstTotal: { type: Number, default: 0 },
    taxTotal: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true, min: 0 },
    interState: { type: Boolean, default: false },

    // Payables
    paidAtBill: { type: Number, default: 0 },
    paymentMethod: { type: String, default: "" }, // how paidAtBill was paid
    amountPaid: { type: Number, default: 0 },
    balanceDue: { type: Number, default: 0 },
    dueDate: { type: Date, default: null },
    paymentStatus: { type: String, enum: ["UNPAID", "PARTIAL", "PAID"], default: "UNPAID" },

    status: { type: String, enum: BILL_STATUSES, default: "POSTED" },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, trim: true, maxlength: 300, default: "" },
    notes: { type: String, trim: true, maxlength: 1000, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  jsonOptions
);

// The same supplier invoice can't be posted twice (cancelled ones don't count)
purchaseBillSchema.index(
  { vendor: 1, supplierInvoiceNo: 1 },
  { unique: true, partialFilterExpression: { status: "POSTED" } }
);
purchaseBillSchema.index({ billDate: -1 });
purchaseBillSchema.index({ vendor: 1, balanceDue: 1 });
purchaseBillSchema.index({ purchaseOrder: 1 });

const PurchaseBill = mongoose.model("PurchaseBill", purchaseBillSchema);
export default PurchaseBill;
