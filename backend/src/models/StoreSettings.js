import mongoose from "mongoose";

/**
 * StoreSettings — the business's own details, printed on every tax invoice.
 *
 * A single document with _id "store". Each sale keeps a snapshot of the
 * seller details at the time of sale, so editing these later never changes
 * invoices that were already issued.
 */
const storeSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "store" },

    legalName: { type: String, trim: true, default: "" },
    tradeName: { type: String, trim: true, default: "" },
    gstin: { type: String, trim: true, uppercase: true, default: "" },
    stateCode: { type: String, trim: true, default: "" }, // e.g. "07" for Delhi

    address: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, lowercase: true, default: "" },

    // Wholesale/B2B prices are quoted before GST, so tax is added on top.
    // Switch on for MRP-style retail where the shelf price includes GST.
    pricesIncludeTax: { type: Boolean, default: false },

    bankDetails: { type: String, trim: true, default: "" }, // printed for payment
    invoiceTerms: { type: String, trim: true, default: "" },
  },
  { timestamps: true, versionKey: false }
);

const StoreSettings = mongoose.model("StoreSettings", storeSettingsSchema);
export default StoreSettings;
