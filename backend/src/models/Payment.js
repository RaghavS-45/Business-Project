import mongoose from "mongoose";

/**
 * Payment — money received from a customer against their unpaid invoices.
 *
 * Numbered RCPT-YYYYMMDD-NNNN. `allocations` records which invoices the
 * money settled (oldest first unless chosen), so every rupee is traceable.
 */
const allocationSchema = new mongoose.Schema(
  {
    sale: { type: mongoose.Schema.Types.ObjectId, ref: "Sale", required: true },
    invoiceNumber: { type: String, required: true },
    amount: { type: Number, required: true, min: 0.01 },
  },
  { _id: false }
);

const paymentSchema = new mongoose.Schema(
  {
    receiptNumber: { type: String, required: true, unique: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
    amount: { type: Number, required: true, min: 0.01 },
    method: {
      type: String,
      enum: ["CASH", "UPI", "CARD", "BANK", "CHEQUE", "OTHER"],
      required: true,
    },
    // UTR / cheque number / transaction id
    reference: { type: String, trim: true, default: "", maxlength: 100 },
    receivedAt: { type: Date, required: true },
    notes: { type: String, trim: true, default: "", maxlength: 500 },
    allocations: { type: [allocationSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

paymentSchema.index({ customer: 1, receivedAt: 1 });

const Payment = mongoose.model("Payment", paymentSchema);
export default Payment;
