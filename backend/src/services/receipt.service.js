import { renderInvoicePdf } from "./invoicePdf.service.js";
import Sale from "../models/Sale.js";
import cloudinary from "../config/cloudinary.js";
import logger from "../config/logger.js";
import ApiError from "../utils/ApiError.js";

/**
 * Receipt Service — PDF generation + Cloudinary upload
 *
 * Generates a professional-looking receipt PDF for a completed sale,
 * uploads it to Cloudinary, and updates the Sale document with the URL.
 *
 * The PDF itself is the A4 GST tax invoice from invoicePdf.service.js.
 */

class ReceiptService {
  /**
   * Generate a receipt PDF and upload to Cloudinary.
   * Updates the Sale document with the receiptUrl.
   *
   * @param {string} saleId - The Sale document's _id
   * @returns {Promise<string>} The Cloudinary secure_url
   */
  async generateAndUpload(saleId) {
    // Fetch sale with populated references
    const sale = await Sale.findById(saleId)
      .populate("customer", "name email phone")
      .populate("cashier", "name email");

    if (!sale) {
      throw ApiError.notFound(`Sale not found: ${saleId}`);
    }

    // Generate the PDF buffer (A4 GST tax invoice)
    const pdfBuffer = await renderInvoicePdf(sale);

    // Upload to Cloudinary (private/authenticated) — returns the public_id
    const receiptPublicId = await this._uploadToCloudinary(
      pdfBuffer,
      sale.invoiceNumber
    );

    // Store the stable public_id on the Sale document.
    // To serve the PDF, call receiptService.getSignedReceiptUrl(sale.receiptUrl).
    sale.receiptUrl = receiptPublicId;
    await sale.save();

    logger.info(`Receipt uploaded (private): ${sale.invoiceNumber}`, {
      saleId: sale._id,
      receiptPublicId,
    });

    return receiptPublicId;
  }

  /**
   * Upload a PDF buffer to Cloudinary as an authenticated (private) resource.
   *
   * Receipts are NOT public. Anyone who knows the Cloudinary cloud name and the
   * invoice number (which is printed on receipts) can construct a direct URL to
   * a public resource. Uploading with type:"authenticated" requires a signed URL
   * to access the file, preventing enumeration.
   *
   * The Sale document stores the raw public_id (path), NOT the secure_url.
   * Call getSignedReceiptUrl() to produce a short-lived URL for download.
   *
   * @private
   */
  _uploadToCloudinary(buffer, invoiceNumber) {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "inventory-pos/receipts",
          resource_type: "raw",          // PDF is a raw file type
          type: "authenticated",          // private — requires signed URL to access
          public_id: `${invoiceNumber}`,  // no .pdf — Cloudinary adds it automatically for raw
          overwrite: true,
        },
        (error, result) => {
          if (error) {
            return reject(
              ApiError.internal("Receipt upload failed: " + error.message)
            );
          }
          // Store the public_id (path), not the URL.
          // The URL changes whenever the signature expires; the public_id is stable.
          resolve(result.public_id);
        }
      );
      stream.end(buffer);
    });
  }

  /**
   * Generate a short-lived signed URL for a private receipt.
   *
   * @param {string} publicId - The Cloudinary public_id stored on the Sale document
   * @param {number} [expiresInSeconds=3600] - URL validity window (default: 1 hour)
   * @returns {string} A signed, time-limited URL for downloading the PDF
   */
  getSignedReceiptUrl(publicId, expiresInSeconds = 3600) {
    if (!publicId) return null;
    return cloudinary.utils.private_download_url(publicId, "pdf", {
      resource_type: "raw",
      type: "authenticated",
      expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
    });
  }

  /**
   * Format a date for the receipt.
   * @private
   */
  _formatDate(date) {
    return new Intl.DateTimeFormat("en-IN", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(date));
  }

  /**
   * Draw a horizontal line.
   * @private
   */
  _drawLine(doc, width) {
    const x = doc.page.margins.left;
    doc
      .moveTo(x, doc.y)
      .lineTo(x + width, doc.y)
      .strokeColor("#cccccc")
      .lineWidth(0.5)
      .stroke();
  }
}

export default new ReceiptService();

