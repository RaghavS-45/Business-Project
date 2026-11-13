import mongoose from "mongoose";

/**
 * CreditNote — a GST credit note issued when goods from a sale are returned.
 *
 * One sale can have several credit notes (partial returns). Amounts are the
 * returned share of each original invoice line, so returning everything
 * across any number of credit notes adds back exactly to the invoice.
 *
 * Seller/buyer/GST details are copied from the original sale: the credit
 * note must mirror the invoice it adjusts.
 */
const creditNoteItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true },
    sku: { type: String, default: "" },
    hsnCode: { type: String, default: "" },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    discountPercent: { type: Number, default: 0 },
    taxPercent: { type: Number, default: 0 },
    taxableValue: { type: Number, default: 0 },
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
    // false for damaged / unsellable goods — stock is not put back
    restocked: { type: Boolean, default: true },
  },
  { _id: false }
);

const creditNoteSchema = new mongoose.Schema(
  {
    creditNoteNumber: { type: String, required: true, unique: true },

    sale: { type: mongoose.Schema.Types.ObjectId, ref: "Sale", required: true },
    invoiceNumber: { type: String, required: true },
    invoiceDate: { type: Date, required: true },

    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    items: {
      type: [creditNoteItemSchema],
      validate: { validator: (a) => a.length > 0, message: "A credit note needs at least one item" },
    },

    // Gross value of the returned units (quantity × rate) before discounts
    subtotal: { type: Number, default: 0 },
    taxableTotal: { type: Number, default: 0 },
    cgstTotal: { type: Number, default: 0 },
    sgstTotal: { type: Number, default: 0 },
    igstTotal: { type: Number, default: 0 },
    taxTotal: { type: Number, default: 0 },
    // Amount refunded / credited to the buyer
    total: { type: Number, required: true, min: 0 },

    reason: { type: String, trim: true, required: true, maxlength: 500 },
    // How the cash part was refunded; ADJUSTED = all of it was knocked off
    // the unpaid invoice, nothing paid back
    refundMethod: {
      type: String,
      enum: ["CASH", "CARD", "UPI", "OTHER", "ADJUSTED"],
      required: true,
    },
    // Part of the total taken off what the customer still owed on the invoice
    adjustedAgainstDue: { type: Number, min: 0, default: 0 },
    // Part of the total paid back to the customer
    cashRefund: { type: Number, min: 0 },

    pricesIncludeTax: { type: Boolean, default: false },
    interState: { type: Boolean, default: false },
    placeOfSupply: {
      code: { type: String, default: "" },
      name: { type: String, default: "" },
    },
    seller: { type: Object, default: {} },
    buyer: { type: Object, default: {} },
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

creditNoteSchema.index({ sale: 1, createdAt: 1 });
creditNoteSchema.index({ createdAt: -1 });

const CreditNote = mongoose.model("CreditNote", creditNoteSchema);
export default CreditNote;
