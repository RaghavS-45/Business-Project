import multer from "multer";
import ApiError from "../utils/ApiError.js";

/**
 * Multer Configuration — In-Memory Storage
 *
 * Files are stored as Buffer objects on req.file / req.files.
 * They are streamed directly to Cloudinary — nothing is written to disk.
 *
 * Limits:
 *   - Max file size: 5 MB per image
 *   - Max files per request: 5 images
 *   - Allowed MIME types: JPEG, PNG, WebP
 */

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const storage = multer.memoryStorage();

const fileFilter = (_req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      ApiError.badRequest(
        `Unsupported file type: ${file.mimetype}. Allowed: JPEG, PNG, WebP`
      ),
      false
    );
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 5,
  },
});

export default upload;
