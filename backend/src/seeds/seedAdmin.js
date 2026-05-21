import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/User.js";
import logger from "../config/logger.js";

dotenv.config();

/**
 * Seed Script — creates a default ADMIN user for development.
 *
 * Run with:  npm run seed
 *
 * This is idempotent — if the admin already exists it logs and exits.
 * The default password should be changed immediately in production.
 */

const ADMIN_EMAIL = "admin@inventory-pos.com";
const ADMIN_PASSWORD = "Admin@123456";

const seedAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    logger.info("Connected to MongoDB for seeding");

    // Check if admin already exists
    const existing = await User.findOne({ email: ADMIN_EMAIL });
    if (existing) {
      logger.info(`Admin user already exists: ${ADMIN_EMAIL}`);
      process.exit(0);
    }

    // Create admin user
    const admin = await User.create({
      name: "System Admin",
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: "ADMIN",
    });

    logger.info(`✅ Admin user created:`);
    logger.info(`   Email:    ${admin.email}`);
    logger.info(`   Password: ${ADMIN_PASSWORD}`);
    logger.info(`   Role:     ${admin.role}`);
    logger.info(`   ⚠️  Change this password in production!`);

    process.exit(0);
  } catch (error) {
    logger.error("Seeding failed:", error);
    process.exit(1);
  }
};

seedAdmin();
