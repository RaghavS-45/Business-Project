import mongoose from "mongoose";

/**
 * Counter — named sequences that are incremented atomically.
 *
 * Used for invoice numbers: one document per store day, e.g.
 *   { _id: "invoice-20261113", seq: 42 }
 *
 * Incrementing with $inc inside the checkout transaction means two cashiers
 * can never be handed the same number, and a checkout that rolls back also
 * rolls back its increment (no gaps).
 */
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { versionKey: false }
);

const Counter = mongoose.model("Counter", counterSchema);
export default Counter;
