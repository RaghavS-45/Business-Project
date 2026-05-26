import { v2 as cloudinary } from "cloudinary";
import env from "./env.js";

/**
 * Cloudinary Configuration
 *
 * Initialises the Cloudinary SDK with credentials from environment variables.
 * All image uploads/deletions in the application use this configured instance.
 *
 * Free tier limits (generous for development):
 *   - 25 GB storage
 *   - 25 GB monthly bandwidth
 *   - 25,000 transformations/month
 */
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true, // Always use HTTPS URLs
});

export default cloudinary;
