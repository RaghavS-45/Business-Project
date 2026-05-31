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
    // Computed: qty * unitPrice * (1 - discount/100) * (1 + tax/100)
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

    grandTotal: {
      type: Number,
      required: true,
      min: 0,
    },

    paymentMethod: {
      type: String,
      required: true,
      enum: {
        values: ["CASH", "CARD", "UPI", "OTHER"],
        message: "Payment method must be one of: CASH, CARD, UPI, OTHER",
      },
    },

    paymentStatus: {
      type: String,
      enum: ["PAID", "PARTIAL", "REFUNDED"],
      default: "PAID",
    },

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

    status: {
      type: String,
      enum: ["COMPLETED", "REFUNDED", "VOID"],
      default: "COMPLETED",
    },
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

const Sale = mongoose.model("Sale", saleSchema);

export default Sale;
