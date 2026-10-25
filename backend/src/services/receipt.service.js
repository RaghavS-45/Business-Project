import PDFDocument from "pdfkit";
import Sale from "../models/Sale.js";
import cloudinary from "../config/cloudinary.js";
import env from "../config/env.js";
import logger from "../config/logger.js";
import ApiError from "../utils/ApiError.js";

/**
 * Receipt Service — PDF generation + Cloudinary upload
 *
 * Generates a professional-looking receipt PDF for a completed sale,
 * uploads it to Cloudinary, and updates the Sale document with the URL.
 *
 * Layout:
 *   ┌──────────────────────────────────────┐
 *   │           STORE NAME                 │
 *   │        store address/phone           │
 *   │──────────────────────────────────────│
 *   │ Invoice: INV-20260531-0001           │
 *   │ Date: May 31, 2026 01:02 AM         │
 *   │ Cashier: Admin User                 │
 *   │ Customer: John Doe                  │
 *   │──────────────────────────────────────│
 *   │ Item       Qty  Price  Disc  Total  │
 *   │ Widget A     2  ₹500    0%  ₹1000  │
 *   │ Gadget B     1  ₹200   10%  ₹180   │
 *   │──────────────────────────────────────│
 *   │              Subtotal:    ₹1200.00  │
 *   │              Discount:    - ₹20.00  │
 *   │              Tax:         + ₹0.00   │
 *   │              ─────────────────────  │
 *   │              GRAND TOTAL: ₹1180.00  │
 *   │──────────────────────────────────────│
 *   │ Payment: CASH                       │
 *   │──────────────────────────────────────│
 *   │    Thank you for your purchase!     │
 *   └──────────────────────────────────────┘
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

    // Generate the PDF buffer
    const pdfBuffer = await this._generatePdf(sale);

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
   * Generate a receipt PDF as a Buffer.
   * @private
   */
  async _generatePdf(sale) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: [226.77, 600], // ~80mm width receipt paper, tall
          margin: 15,
          bufferPages: true,
        });

        const chunks = [];
        doc.on("data", (chunk) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);

        const pageWidth = 226.77 - 30; // Width minus margins

        // ─── Store Header ──────────────────────────────────
        doc
          .fontSize(14)
          .font("Helvetica-Bold")
          .text(env.STORE_NAME, { align: "center" });

        if (env.STORE_ADDRESS) {
          doc
            .fontSize(7)
            .font("Helvetica")
            .text(env.STORE_ADDRESS, { align: "center" });
        }

        if (env.STORE_PHONE) {
          doc
            .fontSize(7)
            .font("Helvetica")
            .text(`Tel: ${env.STORE_PHONE}`, { align: "center" });
        }

        doc.moveDown(0.3);
        this._drawLine(doc, pageWidth);

        // ─── Invoice Details ───────────────────────────────
        doc.moveDown(0.3);
        doc.fontSize(7).font("Helvetica");
        doc.text(`Invoice: ${sale.invoiceNumber}`);
        doc.text(`Date: ${this._formatDate(sale.createdAt)}`);
        doc.text(`Cashier: ${sale.cashier?.name || "Unknown"}`);

        if (sale.customer) {
          doc.text(`Customer: ${sale.customer.name}`);
        } else {
          doc.text("Customer: Walk-in");
        }

        doc.moveDown(0.3);
        this._drawLine(doc, pageWidth);

        // ─── Items Table Header ────────────────────────────
        doc.moveDown(0.3);
        doc.fontSize(7).font("Helvetica-Bold");

        const col = { item: 15, qty: 100, price: 125, total: 160 };
        const y = doc.y;
        doc.text("Item", col.item, y, { width: 80 });
        doc.text("Qty", col.qty, y, { width: 25, align: "right" });
        doc.text("Price", col.price, y, { width: 30, align: "right" });
        doc.text("Total", col.total, y, { width: 35, align: "right" });

        doc.moveDown(0.3);
        this._drawLine(doc, pageWidth);
        doc.moveDown(0.2);

        // ─── Items ─────────────────────────────────────────
        doc.font("Helvetica").fontSize(7);

        for (const item of sale.items) {
          const itemY = doc.y;

          // Item name (may wrap)
          doc.text(item.name, col.item, itemY, { width: 80 });

          // After name wraps, get the new Y position
          const afterNameY = doc.y;

          // Qty, Price, Total on the first line of the item
          doc.text(String(item.quantity), col.qty, itemY, {
            width: 25,
            align: "right",
          });
          doc.text(`₹${item.unitPrice.toFixed(0)}`, col.price, itemY, {
            width: 30,
            align: "right",
          });
          doc.text(`₹${item.lineTotal.toFixed(2)}`, col.total, itemY, {
            width: 35,
            align: "right",
          });

          // Show discount info if applicable
          if (item.discountPercent > 0) {
            doc
              .fontSize(6)
              .text(
                `  (${item.discountPercent}% off)`,
                col.item,
                afterNameY
              );
          }

          doc.fontSize(7);
          doc.moveDown(0.2);
        }

        doc.moveDown(0.2);
        this._drawLine(doc, pageWidth);

        // ─── Totals ────────────────────────────────────────
        doc.moveDown(0.3);
        doc.fontSize(7).font("Helvetica");

        const labelX = 100;
        const valueX = 155;
        const totalsWidth = 40;

        doc.text("Subtotal:", labelX, doc.y, { width: 55, align: "right" });
        doc.text(`₹${sale.subtotal.toFixed(2)}`, valueX, doc.y - doc.currentLineHeight(), {
          width: totalsWidth,
          align: "right",
        });

        if (sale.discountTotal > 0) {
          doc.text("Discount:", labelX, doc.y, { width: 55, align: "right" });
          doc.text(`-₹${sale.discountTotal.toFixed(2)}`, valueX, doc.y - doc.currentLineHeight(), {
            width: totalsWidth,
            align: "right",
          });
        }

        if (sale.taxTotal > 0) {
          doc.text("Tax:", labelX, doc.y, { width: 55, align: "right" });
          doc.text(`+₹${sale.taxTotal.toFixed(2)}`, valueX, doc.y - doc.currentLineHeight(), {
            width: totalsWidth,
            align: "right",
          });
        }

        doc.moveDown(0.2);
        doc.font("Helvetica-Bold").fontSize(9);
        doc.text("TOTAL:", labelX, doc.y, { width: 55, align: "right" });
        doc.text(`₹${sale.grandTotal.toFixed(2)}`, valueX, doc.y - doc.currentLineHeight(), {
          width: totalsWidth,
          align: "right",
        });

        doc.moveDown(0.3);
        this._drawLine(doc, pageWidth);

        // ─── Payment Method ────────────────────────────────
        doc.moveDown(0.3);
        doc
          .fontSize(7)
          .font("Helvetica")
          .text(`Payment: ${sale.paymentMethod}`, { align: "center" });

        if (sale.notes) {
          doc.moveDown(0.2);
          doc.fontSize(6).text(`Notes: ${sale.notes}`, { align: "center" });
        }

        doc.moveDown(0.3);
        this._drawLine(doc, pageWidth);

        // ─── Footer ────────────────────────────────────────
        doc.moveDown(0.5);
        doc
          .fontSize(8)
          .font("Helvetica-Bold")
          .text("Thank you for your purchase!", { align: "center" });

        doc.moveDown(0.3);
        doc
          .fontSize(6)
          .font("Helvetica")
          .text(`Generated: ${new Date().toISOString()}`, { align: "center" });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
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

