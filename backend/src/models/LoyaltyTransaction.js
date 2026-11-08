import mongoose from "mongoose";

const loyaltyTransactionSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
    sale:     { type: mongoose.Schema.Types.ObjectId, ref: "Sale", required: true },
    points:   { type: Number, required: true }, // earn = +, reverse = -
    type:     { type: String, enum: ["earn", "reverse", "redeem"], required: true },
  },
  { timestamps: true }
);

loyaltyTransactionSchema.index({ sale: 1, type: 1 }, { unique: true });
loyaltyTransactionSchema.index({ customer: 1, createdAt: -1 });

export default mongoose.model("LoyaltyTransaction", loyaltyTransactionSchema);