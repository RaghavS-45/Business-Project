import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/User.js";
import logger from "../config/logger.js";

dotenv.config();

/**
 * Seed Script — creates the first ADMIN user.
 *
 * Run with:  npm run seed
 *
 * Credentials are read from ADMIN_EMAIL and ADMIN_PASSWORD env vars.
 * This is idempotent — exits cleanly if an ADMIN already exists.
 *
 * Example:
 *   ADMIN_EMAIL=me@example.com ADMIN_PASSWORD=S3cr3t! npm run seed
 */

const seedAdmin = async () => {
  const adminEmail    = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    logger.error(
      "❌  ADMIN_EMAIL and ADMIN_PASSWORD must be set before running the seed.\n" +
      "    Example: ADMIN_EMAIL=you@co.com ADMIN_PASSWORD=Str0ng! npm run seed"
    );
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    logger.info("Connected to MongoDB for seeding");

    // Idempotent — skip if ANY admin already exists
    const existing = await User.findOne({ role: "ADMIN" });
    if (existing) {
      logger.info(`An ADMIN account already exists (${existing.email}). Seed skipped.`);
      process.exit(0);
    }

    const admin = await User.create({
      name: "System Admin",
      email: adminEmail,
      password: adminPassword,
      role: "ADMIN",
    });

    logger.info("✅ Admin user created:");
    logger.info(`   Email: ${admin.email}`);
    logger.info(`   Role:  ${admin.role}`);
    logger.info("   ⚠️  Keep ADMIN_PASSWORD secret. Rotate it after first login.");

    process.exit(0);
  } catch (error) {
    logger.error("Seeding failed:", error);
    process.exit(1);
  }
};

seedAdmin();
