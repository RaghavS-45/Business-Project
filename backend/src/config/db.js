import mongoose from "mongoose";
import logger from "./logger.js";
import env from "./env.js";

/**
 * Connect to MongoDB with retry logic.
 * Mongoose buffers commands until the connection is ready, but we
 * still want to log explicitly so failures are visible in Winston.
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(env.MONGO_URI, {
      // Mongoose 8 defaults are good — no need for useNewUrlParser etc.
    });

    logger.info(`MongoDB connected: ${conn.connection.host}`);

    mongoose.connection.on("error", (err) => {
      logger.error("MongoDB connection error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      logger.warn("MongoDB disconnected — attempting reconnect…");
    });

    return conn;
  } catch (error) {
    logger.error(`MongoDB connection failed: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;
