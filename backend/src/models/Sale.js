import mongoose from "mongoose";

/**
 * Sale Model — Transactional Ledger Entry
 *
 * Represents a completed checkout transaction. Each sale captures:
 *   - WHO processed it (cashier) and WHO bought it (customer)
 *   - WHAT was sold (items[] with snapshots of product data at time of sale)
 *   - HOW MUCH was paid (subtotal, tax, discounts, grandTotal)
 *   - HOW it was paid (paymentMethod)
 *   - Receipt URL (populated asynchronously by the receipt worker)
 *
 * Key design decisions:
 *   - Item names/SKUs/prices are SNAPSHOTTED — product price changes after
 *     the sale don't corrupt historical data. This is standard ledger practice.
 *   - costPrice is stored per line item to enable profit margin reports
 *     without joining to the Products collection.
 *   - invoiceNumber is auto-generated: INV-YYYYMMDD-XXXX (daily sequence)
 *   - Walk-in sales have customer = null
 *
 * Interview talking point: Snapshotting product data in the sale document
 * creates a denormalized but immutable record. In financial systems,
 * you never point to a live product doc because prices and names change.
 */

const saleItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    // Snapshots at time of sale — immutable after creation
    name: { type: String, required: true },
    sku: { type: String, required: true },
    quantity: {
      type: Number,
      required: true,
      min: [1, "Quantity must be at least 1"],
    },
    unitPrice: {
      type: Number,
      required: true,
      min: [0, "Unit price cannot be negative"],
    },
    costPrice: {
      type: Number,
      required: true,
      min: [0, "Cost price cannot be negative"],
    },
    discountPercent: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    taxPercent: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    hsnCode: { type: String, default: "" },
    // Units returned so far (across all credit notes)
    returnedQuantity: { type: Number, min: 0, default: 0 },
    // GST breakdown for the line (rupees). taxableValue is what GST is charged
    // on; cgst+sgst (same state) or igst (other state) add up to the line tax.
    taxableValue: { type: Number, min: 0, default: 0 },
    cgst: { type: Number, min: 0, default: 0 },
    sgst: { type: Number, min: 0, default: 0 },
    igst: { type: Number, min: 0, default: 0 },
    // Computed in utils/pricing.js: qty × price, less item discount, less loyalty, plus tax
    lineTotal: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const saleSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      unique: true,
      required: true,
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null, // null = walk-in customer
    },

    cashier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Cashier is required"],
    },

    items: {
      type: [saleItemSchema],
      required: true,
      validate: {
        validator: (arr) => arr.length > 0,
        message: "Sale must have at least one item",
      },
    },

    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },

    taxTotal: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    discountTotal: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    loyaltyTier: {
    type: String,
    enum: ["Bronze", "Silver", "Gold", "Platinum"],
    default: null,
  },
    loyaltyDiscountPercent: { type: Number, min: 0, max: 100, default: 0 },
    loyaltyDiscountTotal:   { type: Number, min: 0, default: 0 },

    grandTotal: {
      type: Number,
      required: true,
      min: 0,
    },

    // ─── GST ────────────────────────────────────────────────
    taxableTotal: { type: Number, min: 0, default: 0 },
    cgstTotal: { type: Number, min: 0, default: 0 },
    sgstTotal: { type: Number, min: 0, default: 0 },
    igstTotal: { type: Number, min: 0, default: 0 },
    pricesIncludeTax: { type: Boolean, default: false },
    // true → IGST (buyer in another state), false → CGST + SGST
    interState: { type: Boolean, default: false },
    placeOfSupply: {
      code: { type: String, default: "" },
      name: { type: String, default: "" },
    },
    // Snapshots, so editing store/customer details never changes an issued invoice
    seller: {
      legalName: { type: String, default: "" },
      tradeName: { type: String, default: "" },
      gstin: { type: String, default: "" },
      stateCode: { type: String, default: "" },
      address: { type: String, default: "" },
      phone: { type: String, default: "" },
      email: { type: String, default: "" },
      bankDetails: { type: String, default: "" },
      invoiceTerms: { type: String, default: "" },
    },
    buyer: {
      name: { type: String, default: "" },
      gstin: { type: String, default: "" },
      stateCode: { type: String, default: "" },
      address: { type: String, default: "" },
      phone: { type: String, default: "" },
    },

    paymentMethod: {
      type: String,
      required: true,
      enum: {
        // CREDIT = nothing paid at the counter, the whole bill is on credit
        values: ["CASH", "CARD", "UPI", "OTHER", "CREDIT"],
        message: "Payment method must be one of: CASH, CARD, UPI, OTHER, CREDIT",
      },
    },

    paymentStatus: {
      type: String,
      enum: ["PAID", "PARTIAL", "UNPAID", "REFUNDED"],
      default: "PAID",
    },

    // ─── Credit ─────────────────────────────────────────────
    // Paid at the counter when the bill was made
    paidAtSale: { type: Number, min: 0 },
    // Paid so far (at the counter + later payments)
    amountPaid: { type: Number, min: 0 },
    // Still owed by the customer (after payments and returns)
    balanceDue: { type: Number, min: 0, default: 0 },
    dueDate: { type: Date, default: null },

    // Populated asynchronously by the receipt worker
    receiptUrl: {
      type: String,
      default: null,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: [500, "Notes must be at most 500 characters"],
      default: "",
    },

    // COMPLETED → PARTIALLY_RETURNED → REFUNDED (everything returned)
    status: {
      type: String,
      enum: ["COMPLETED", "PARTIALLY_RETURNED", "REFUNDED", "VOID"],
      default: "COMPLETED",
    },

    // Total credited back to the buyer so far (sum of credit notes)
    returnedTotal: { type: Number, min: 0, default: 0 },
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

// ─── Indexes ─────────────────────────────────────────────
// Note: invoiceNumber already has a unique index from the field definition.
saleSchema.index({ customer: 1, createdAt: -1 });
saleSchema.index({ cashier: 1, createdAt: -1 });
saleSchema.index({ createdAt: -1 });
saleSchema.index({ status: 1 });
// Open (unpaid) invoices per customer, oldest first
saleSchema.index({ customer: 1, balanceDue: 1, createdAt: 1 });

/** Sales that count towards revenue (fully refunded ones don't). */
export const REVENUE_STATUSES = ["COMPLETED", "PARTIALLY_RETURNED"];

/** Aggregation expression: what a sale is worth after returns. */
export const NET_SALE_VALUE = {
  $subtract: ["$grandTotal", { $ifNull: ["$returnedTotal", 0] }],
};

const Sale = mongoose.model("Sale", saleSchema);

export default Sale;
