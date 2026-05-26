import mongoose from "mongoose";

/**
 * Product Model
 *
 * Central entity of the Inventory & POS system.
 *
 * Key design decisions:
 *   - SKU is auto-generated if not provided (format: PRD-XXXXXX)
 *   - Images stored as [{url, publicId}] — publicId needed to delete from Cloudinary
 *   - lowStockThreshold is the ML hook for Phase 5 restock predictions
 *   - Soft-delete via isActive flag (preserves sales history references)
 *   - costPrice vs sellingPrice enables profit margin calculations
 */

export const PRODUCT_CATEGORIES = [
  "Electronics",
  "Clothing",
  "Food & Beverage",
  "Household",
  "Stationery",
  "Health & Beauty",
  "Toys & Games",
  "Sports & Outdoors",
  "Automotive",
  "Other",
];

export const PRODUCT_UNITS = [
  "pcs",   // pieces
  "kg",    // kilograms
  "g",     // grams
  "ltr",   // litres
  "ml",    // millilitres
  "m",     // metres
  "box",   // box
  "pack",  // pack
  "dozen", // dozen (12)
  "pair",  // pair
];

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true }, // Cloudinary public_id for deletion
  },
  { _id: false } // No separate _id for sub-documents
);

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [200, "Name must be at most 200 characters"],
    },

    sku: {
      type: String,
      unique: true,
      uppercase: true,
      trim: true,
      // Auto-generated in pre-validate hook if not provided
    },

    barcode: {
      type: String,
      unique: true,
      sparse: true, // unique index only applies to non-null values
      trim: true,
    },

    description: {
      type: String,
      trim: true,
      maxlength: [2000, "Description must be at most 2000 characters"],
      default: "",
    },

    category: {
      type: String,
      required: [true, "Category is required"],
      enum: {
        values: PRODUCT_CATEGORIES,
        message: "Invalid category: {VALUE}",
      },
    },

    unit: {
      type: String,
      required: [true, "Unit is required"],
      enum: {
        values: PRODUCT_UNITS,
        message: "Invalid unit: {VALUE}",
      },
      default: "pcs",
    },

    costPrice: {
      type: Number,
      required: [true, "Cost price is required"],
      min: [0, "Cost price cannot be negative"],
    },

    sellingPrice: {
      type: Number,
      required: [true, "Selling price is required"],
      min: [0, "Selling price cannot be negative"],
    },

    stock: {
      type: Number,
      required: true,
      min: [0, "Stock cannot be negative"],
      default: 0,
    },

    // ─── ML Hook (Phase 5) ──────────────────────────────────
    // When stock falls to or below this value, trigger a restock alert.
    // Used by the ML model to predict optimal reorder points.
    lowStockThreshold: {
      type: Number,
      min: [0, "Low stock threshold cannot be negative"],
      default: 10,
    },

    // ─── Cloudinary Images ──────────────────────────────────
    images: {
      type: [imageSchema],
      default: [],
      validate: {
        validator: (arr) => arr.length <= 5,
        message: "A product can have at most 5 images",
      },
    },

    // ─── Vendor Reference ───────────────────────────────────
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      default: null,
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
// Note: sku and barcode already have unique indexes from field definitions above.
productSchema.index({ category: 1 });
productSchema.index({ isActive: 1 });
productSchema.index({ stock: 1 }); // For low-stock queries: stock <= threshold
productSchema.index({ name: "text", description: "text" }); // Full-text search

// ─── Pre-validate: Auto-generate SKU ─────────────────────
productSchema.pre("validate", async function (next) {
  if (!this.sku) {
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.sku = `PRD-${random}`;
  }
  next();
});

// ─── Virtual: isLowStock ─────────────────────────────────
productSchema.virtual("isLowStock").get(function () {
  return this.stock <= this.lowStockThreshold;
});

// ─── Virtual: marginPercent ──────────────────────────────
productSchema.virtual("marginPercent").get(function () {
  if (this.costPrice === 0) return null;
  return (((this.sellingPrice - this.costPrice) / this.costPrice) * 100).toFixed(2);
});

const Product = mongoose.model("Product", productSchema);

export default Product;
