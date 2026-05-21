import mongoose from "mongoose";
import bcrypt from "bcrypt";

/**
 * User Model
 *
 * Roles:
 *   ADMIN   — full system access, can manage users & view all reports
 *   MANAGER — can manage products, partners, and view reports
 *   CASHIER — can only operate the POS view and process sales
 *
 * Password is hashed with bcrypt (12 salt rounds) before save.
 * The comparePassword instance method is used during login.
 */

const ROLES = ["ADMIN", "MANAGER", "CASHIER"];
const SALT_ROUNDS = 12;

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 8,
      select: false, // never returned in queries by default
    },
    role: {
      type: String,
      enum: ROLES,
      default: "CASHIER",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
    toJSON: {
      transform(doc, ret) {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// ─── Indexes ──────────────────────────────────────────────
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });

// ─── Pre-save: hash password if modified ──────────────────
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
  next();
});

// ─── Instance method: compare password ────────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model("User", userSchema);

export { ROLES };
export default User;
