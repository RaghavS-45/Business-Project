import mongoose from "mongoose";

/**
 * Vendor Model (Supplier)
 *
 * Represents a business/person that supplies products to the store.
 * Kept separate from Customer to enable clean aggregations:
 *   - Purchase orders, payables, and vendor invoices reference Vendors
 *   - Sales orders and receivables reference Customers
 *
 * Fields like GSTIN and paymentTerms are vendor-specific and would
 * pollute a shared Partner collection.
 */

const addressSchema = new mongoose.Schema(
  {
    street: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "" },
    pincode: { type: String, trim: true, default: "" },
    country: { type: String, trim: true, default: "India" },
  },
  { _id: false }
);

const vendorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Vendor name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [200, "Name must be at most 200 characters"],
    },

    contactPerson: {
      type: String,
      trim: true,
      maxlength: [100, "Contact person name must be at most 100 characters"],
      default: "",
    },

    email: {
      type: String,
      lowercase: true,
      trim: true,
      unique: true,
      sparse: true, // unique only when not null
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
      default: null,
    },

    phone: {
      type: String,
      trim: true,
      match: [/^[+\d\s\-().]{7,20}$/, "Please provide a valid phone number"],
      default: "",
    },

    address: {
      type: addressSchema,
      default: () => ({}),
    },

    // GST Identification Number — unique per registered business in India
    gstin: {
      type: String,
      uppercase: true,
      trim: true,
      unique: true,
      sparse: true,
      match: [
        /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
        "Please provide a valid GSTIN",
      ],
      default: null,
    },

    paymentTerms: {
      type: String,
      trim: true,
      maxlength: [100, "Payment terms must be at most 100 characters"],
      default: "Immediate", // e.g. "Net 30", "Net 60", "50% advance"
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
vendorSchema.index({ name: "text" }); // Search vendors by name
vendorSchema.index({ isActive: 1 });

const Vendor = mongoose.model("Vendor", vendorSchema);
export default Vendor;
