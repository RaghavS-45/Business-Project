import mongoose from "mongoose";
import { jsonOptions } from "./schemas/documentParts.js";

/**
 * Money paid to a supplier against their bills. Numbered PAY-YYYYMMDD-NNNN.
 * `allocations` records which bills it settled (oldest due first unless
 * chosen).
 */
const allocationSchema = new mongoose.Schema(
  {
    bill: { type: mongoose.Schema.Types.ObjectId, ref: "PurchaseBill", required: true },
    billNumber: { type: String, required: true },
    supplierInvoiceNo: { type: String, default: "" },
    amount: { type: Number, required: true, min: 0.01 },
  },
  { _id: false }
);

const supplierPaymentSchema = new mongoose.Schema(
  {
    paymentNumber: { type: String, required: true, unique: true },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
    amount: { type: Number, required: true, min: 0.01 },
    method: { type: String, enum: ["CASH", "UPI", "CARD", "BANK", "CHEQUE", "OTHER"], required: true },
    reference: { type: String, trim: true, default: "", maxlength: 100 },
    paidAt: { type: Date, required: true },
    notes: { type: String, trim: true, default: "", maxlength: 500 },
    allocations: { type: [allocationSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  jsonOptions
);

supplierPaymentSchema.index({ vendor: 1, paidAt: 1 });

const SupplierPayment = mongoose.model("SupplierPayment", supplierPaymentSchema);
export default SupplierPayment;
