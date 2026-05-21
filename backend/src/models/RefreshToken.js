import mongoose from "mongoose";

/**
 * RefreshToken Model
 *
 * Stores hashed refresh tokens in MongoDB (never the raw token).
 * Each document links to a user and has an explicit expiresAt date,
 * which enables:
 *   - Proper logout (delete the token document)
 *   - Token revocation (delete by user or by specific token)
 *   - Automatic cleanup via MongoDB TTL index
 *
 * The TTL index on expiresAt means MongoDB automatically deletes
 * expired tokens — no cron job needed for cleanup.
 */
const refreshTokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    userAgent: {
      type: String,
      default: "",
    },
    ipAddress: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// ─── TTL Index: auto-delete expired tokens ────────────────
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ─── Static: revoke all tokens for a user (force logout everywhere) ─
refreshTokenSchema.statics.revokeAllForUser = async function (userId) {
  return this.deleteMany({ user: userId });
};

const RefreshToken = mongoose.model("RefreshToken", refreshTokenSchema);
export default RefreshToken;
