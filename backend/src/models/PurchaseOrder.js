import mongoose from "mongoose";

/**
 * PurchaseOrder Model
 *
 * Represents an admin-initiated order from a vendor to restock inventory.
 *
 * Lifecycle:
 *   pending → approved → received  (inventory auto-updated on "received")
 *   pending → rejected             (no inventory change)
 *
 * When status transitions to "received", the service layer increments
 * Product.stock for each line item using $inc (atomic, no race conditions).
 *
 * poNumber format: PO-YYYYMMDD-XXXX (auto-generated in pre-validate hook)
 */

export const PO_STATUSES = ["pending", "approved", "received", "rejected"];

const lineItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Product reference is required"],
    },
    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [1, "Quantity must be at least 1"],
    },
    unitCost: {
      type: Number,
      required: [true, "Unit cost is required"],
      min: [0, "Unit cost cannot be negative"],
    },
    // Snapshot of product name at time of PO creation — preserves history
    // even if product name changes later
    productName: {
      type: String,
      trim: true,
      default: "",
    },
    // Snapshot of SKU at creation time
    productSku: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: true }
);

// Virtual: subtotal per line item
lineItemSchema.virtual("subtotal").get(function () {
  return this.quantity * this.unitCost;
});

const purchaseOrderSchema = new mongoose.Schema(
  {
    poNumber: {
      type: String,
      unique: true,
      uppercase: true,
      trim: true,
      // Auto-generated in pre-validate hook if not provided
    },

    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: [true, "Vendor is required"],
    },

    items: {
      type: [lineItemSchema],
      validate: {
        validator: (arr) => arr.length >= 1,
        message: "A purchase order must have at least one item",
      },
    },

    status: {
      type: String,
      enum: {
        values: PO_STATUSES,
        message: "Invalid status: {VALUE}",
      },
      default: "pending",
    },

    notes: {
      type: String,
      trim: true,
      maxlength: [1000, "Notes must be at most 1000 characters"],
      default: "",
    },

    // Who created this PO
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Who approved/rejected
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    // When the physical goods were received and inventory was updated
    receivedAt: {
      type: Date,
      default: null,
    },

    expectedDelivery: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// ─── Indexes ─────────────────────────────────────────────
purchaseOrderSchema.index({ vendor: 1 });
purchaseOrderSchema.index({ status: 1 });
purchaseOrderSchema.index({ createdAt: -1 });
purchaseOrderSchema.index({ "items.product": 1 });

// ─── Virtual: totalAmount ────────────────────────────────
purchaseOrderSchema.virtual("totalAmount").get(function () {
  return this.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
});

// ─── Pre-validate: Auto-generate PO number ───────────────
purchaseOrderSchema.pre("validate", async function (next) {
  if (!this.poNumber) {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.poNumber = `PO-${dateStr}-${random}`;
  }
  next();
});

const PurchaseOrder = mongoose.model("PurchaseOrder", purchaseOrderSchema);
export default PurchaseOrder;