import mongoose from "mongoose";

/**
 * Customer Model (Buyer)
 *
 * Represents a person or business that purchases from the POS.
 * Kept separate from Vendor to enable clean sales aggregations:
 *   - loyaltyPoints, totalPurchases, and purchase history are customer-specific
 *   - The sales/invoice module will reference Customer, not Vendor
 *
 * Walk-in customers can be handled by a single default "WALK-IN" customer
 * document — the cashier does not need to fill in all fields for every sale.
 */

const addressSchema = new mongoose.Schema(
  {
    street: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "" },
    pincode: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Customer name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [200, "Name must be at most 200 characters"],
    },

    email: {
      type: String,
      lowercase: true,
      trim: true,
      unique: true,
      sparse: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
    },

    phone: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      match: [/^[+\d\s\-().]{7,20}$/, "Please provide a valid phone number"],
    },

    address: {
      type: addressSchema,
      default: () => ({}),
    },

    // ─── Loyalty / Analytics (Phase 5 hooks) ─────────────
    loyaltyPoints: {
      type: Number,
      min: [0, "Loyalty points cannot be negative"],
      default: 0,
    },

    // Running total in ₹ — updated by the Sales module on each completed sale
    totalPurchases: {
      type: Number,
      min: [0, "Total purchases cannot be negative"],
      default: 0,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: [1000, "Notes must be at most 1000 characters"],
      default: "",
    },

    isActive: {
      type: Boolean,
      default: true,
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
customerSchema.index({ name: "text" }); // Search customers by name
customerSchema.index({ isActive: 1 });
customerSchema.index({ loyaltyPoints: -1 }); // Sort by top loyalty members

const Customer = mongoose.model("Customer", customerSchema);
export default Customer;
