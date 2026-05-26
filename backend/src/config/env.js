import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

/**
 * Validate all environment variables at startup using Zod.
 * If any required var is missing or malformed the process exits
 * immediately with a descriptive error — no silent failures.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(5000),

  // MongoDB
  MONGO_URI: z.string().url("MONGO_URI must be a valid connection string"),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET too short"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET too short"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),

  // Rate Limiting
  LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900_000), // 15 min
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().default(5),

  // CORS
  CORS_ORIGIN: z.string().default("http://localhost:5173"),

  // Cloudinary — image CDN for product photos
  CLOUDINARY_CLOUD_NAME: z.string().min(1, "CLOUDINARY_CLOUD_NAME is required"),
  CLOUDINARY_API_KEY: z.string().min(1, "CLOUDINARY_API_KEY is required"),
  CLOUDINARY_API_SECRET: z.string().min(1, "CLOUDINARY_API_SECRET is required"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "❌  Invalid environment variables:\n",
    parsed.error.flatten().fieldErrors
  );
  process.exit(1);
}

const env = Object.freeze(parsed.data);
export default env;
