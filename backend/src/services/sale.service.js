import mongoose from "mongoose";
import Sale from "../models/Sale.js";
import Product from "../models/Product.js";
import Customer from "../models/Customer.js";
import ApiError from "../utils/ApiError.js";
import logger from "../config/logger.js";
import { addJob, QUEUE_NAMES } from "../config/queue.js";

/**
 * Sale Service — Checkout Pipeline with Mongoose Transactions
 *
 * The checkout() method is the core of the POS system. It:
 *   1. Opens a MongoDB session + transaction
 *   2. Validates and decrements stock atomically (optimistic locking)
 *   3. Snapshots product data into line items
 *   4. Computes totals (subtotal, tax, discount, grand)
 *   5. Creates the Sale document
 *   6. Updates customer loyalty (if not a walk-in)
 *   7. Commits the transaction
 *   8. Enqueues background jobs (receipt PDF, audit log)
 *
 * If any step fails, the entire transaction rolls back — no partial
 * state mutations. This is the ACID guarantee.
 *
 * Interview talking point: The $gte guard on stock decrement implements
 * optimistic concurrency control. Even with concurrent cashiers, stock
 * can never go negative because findOneAndUpdate fails atomically if
 * stock < quantity.
 */

class SaleService {
  /**
   * Generate the next invoice number: INV-YYYYMMDD-XXXX
   * Uses today's sale count to create a daily sequence.
   *
   * @private
   */
  async _generateInvoiceNumber() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");

    // Count sales created today for the sequence number
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const todayCount = await Sale.countDocuments({
      createdAt: { $gte: startOfDay, $lt: endOfDay },
    });

    const seq = String(todayCount + 1).padStart(4, "0");
    return `INV-${dateStr}-${seq}`;
  }

  /**
   * Compute line total for a single item.
   * Formula: qty * unitPrice * (1 - discount/100) * (1 + tax/100)
   *
   * @private
   */
  _computeLineTotal(quantity, unitPrice, discountPercent, taxPercent) {
    const discounted = unitPrice * (1 - discountPercent / 100);
    const taxed = discounted * (1 + taxPercent / 100);
    return Math.round(quantity * taxed * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Process a checkout transaction.
   *
   * @param {Array}  cartItems     - [{ product, quantity, discountPercent, taxPercent }]
   * @param {string} customerId    - Customer ObjectId (null for walk-in)
   * @param {string} paymentMethod - CASH | CARD | UPI | OTHER
   * @param {Object} cashierUser   - req.user (the authenticated cashier)
   * @param {string} notes         - Optional notes
   * @returns {Promise<Object>}    - The created Sale document
   */
  async checkout(cartItems, customerId, paymentMethod, cashierUser, notes = "") {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const saleItems = [];
      let subtotal = 0;
      let taxTotal = 0;
      let discountTotal = 0;

      // ─── Process each cart item within the transaction ───
      for (const item of cartItems) {
        // Atomically decrement stock with optimistic lock
        // The $gte guard ensures stock never goes negative
        const product = await Product.findOneAndUpdate(
          {
            _id: item.product,
            isActive: true,
            stock: { $gte: item.quantity }, // Optimistic concurrency guard
          },
          {
            $inc: { stock: -item.quantity },
          },
          {
            new: true, // Return the updated document
            session,
          }
        );

        if (!product) {
          // Check if the product exists at all for a better error message
          const exists = await Product.findById(item.product).session(session);
          if (!exists) {
            throw ApiError.notFound(`Product not found: ${item.product}`);
          }
          if (!exists.isActive) {
            throw ApiError.badRequest(`Product is inactive: ${exists.name}`);
          }
          throw ApiError.badRequest(
            `Insufficient stock for "${exists.name}": requested ${item.quantity}, available ${exists.stock}`
          );
        }

        // Compute line total
        const discountPercent = item.discountPercent || 0;
        const taxPercent = item.taxPercent || 0;
        const lineTotal = this._computeLineTotal(
          item.quantity,
          product.sellingPrice,
          discountPercent,
          taxPercent
        );

        // Pre-tax, pre-discount line value (for totals calculation)
        const rawLineValue = item.quantity * product.sellingPrice;
        const discountAmount = rawLineValue * (discountPercent / 100);
        const taxableAmount = rawLineValue - discountAmount;
        const taxAmount = taxableAmount * (taxPercent / 100);

        subtotal += rawLineValue;
        discountTotal += discountAmount;
        taxTotal += taxAmount;

        // Snapshot product data into the line item
        saleItems.push({
          product: product._id,
          name: product.name,
          sku: product.sku,
          quantity: item.quantity,
          unitPrice: product.sellingPrice,
          costPrice: product.costPrice,
          discountPercent,
          taxPercent,
          lineTotal,
        });
      }

      // Round totals to 2 decimal places
      subtotal = Math.round(subtotal * 100) / 100;
      taxTotal = Math.round(taxTotal * 100) / 100;
      discountTotal = Math.round(discountTotal * 100) / 100;
      const grandTotal = Math.round((subtotal - discountTotal + taxTotal) * 100) / 100;

      // Generate invoice number
      const invoiceNumber = await this._generateInvoiceNumber();

      // Create the Sale document within the transaction
      const [sale] = await Sale.create(
        [
          {
            invoiceNumber,
            customer: customerId || null,
            cashier: cashierUser._id,
            items: saleItems,
            subtotal,
            taxTotal,
            discountTotal,
            grandTotal,
            paymentMethod,
            notes,
          },
        ],
        { session }
      );

      // Update customer loyalty if not a walk-in
      if (customerId) {
        const loyaltyPoints = Math.floor(grandTotal / 100); // 1 point per ₹100

        await Customer.findByIdAndUpdate(
          customerId,
          {
            $inc: {
              totalPurchases: grandTotal,
              loyaltyPoints,
            },
          },
          { session }
        );
      }

      // ─── Commit the transaction ─────────────────────────
      await session.commitTransaction();

      logger.info(`Checkout completed: ${invoiceNumber}`, {
        saleId: sale._id,
        cashier: cashierUser.email,
        itemCount: saleItems.length,
        grandTotal,
      });

      // ─── Enqueue background jobs (outside transaction) ──
      // These are fire-and-forget — if they fail, they'll be retried
      // by BullMQ. The sale is already committed.
      await addJob(QUEUE_NAMES.RECEIPT_GENERATION, "generate-receipt", {
        saleId: sale._id.toString(),
      });

      await addJob(QUEUE_NAMES.AUDIT_LOG, "checkout-audit", {
        action: "CHECKOUT",
        entity: "Sale",
        entityId: sale._id.toString(),
        userId: cashierUser._id.toString(),
        before: null,
        after: sale.toJSON(),
        metadata: {
          invoiceNumber,
          grandTotal,
          itemCount: saleItems.length,
          paymentMethod,
        },
      });

      return sale;
    } catch (error) {
      // Roll back the entire transaction on any error
      await session.abortTransaction();
      logger.error("Checkout failed — transaction rolled back", {
        error: error.message,
        cashier: cashierUser?.email,
      });
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Get a single sale by ID with populated references.
   */
  async getById(id) {
    const sale = await Sale.findById(id)
      .populate("customer", "name email phone")
      .populate("cashier", "name email role")
      .lean();

    if (!sale) throw ApiError.notFound("Sale not found");
    return sale;
  }

  /**
   * Paginated sales list with filters.
   *
   * Supports: date range, status, paymentMethod, customerId, cashierId
   */
  async list(query) {
    const {
      page,
      limit,
      status,
      paymentMethod,
      customerId,
      cashierId,
      startDate,
      endDate,
      sortBy,
      sortOrder,
    } = query;

    const filter = {};

    if (status) filter.status = status;
    if (paymentMethod) filter.paymentMethod = paymentMethod;
    if (customerId) filter.customer = customerId;
    if (cashierId) filter.cashier = cashierId;

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const sortObj = { [sortBy]: sortOrder === "asc" ? 1 : -1 };
    const skip = (page - 1) * limit;

    const [sales, total] = await Promise.all([
      Sale.find(filter)
        .populate("customer", "name email")
        .populate("cashier", "name email")
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .lean(),
      Sale.countDocuments(filter),
    ]);

    return {
      sales,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Process a refund — reverse the checkout.
   *
   * 1. Verify sale exists and is COMPLETED
   * 2. Open a transaction
   * 3. Restock all items
   * 4. Reverse customer loyalty updates
   * 5. Mark sale as REFUNDED
   * 6. Commit transaction
   * 7. Enqueue audit log
   */
  async refund(saleId, userId, reason) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const sale = await Sale.findById(saleId).session(session);
      if (!sale) throw ApiError.notFound("Sale not found");

      if (sale.status !== "COMPLETED") {
        throw ApiError.badRequest(
          `Cannot refund a sale with status: ${sale.status}`
        );
      }

      // Snapshot before state for audit
      const beforeState = sale.toJSON();

      // Restock all items
      for (const item of sale.items) {
        await Product.findByIdAndUpdate(
          item.product,
          { $inc: { stock: item.quantity } },
          { session }
        );
      }

      // Reverse customer loyalty
      if (sale.customer) {
        const loyaltyPoints = Math.floor(sale.grandTotal / 100);

        await Customer.findByIdAndUpdate(
          sale.customer,
          {
            $inc: {
              totalPurchases: -sale.grandTotal,
              loyaltyPoints: -loyaltyPoints,
            },
          },
          { session }
        );
      }

      // Mark sale as refunded
      sale.status = "REFUNDED";
      sale.paymentStatus = "REFUNDED";
      sale.notes = sale.notes
        ? `${sale.notes} | REFUND: ${reason}`
        : `REFUND: ${reason}`;
      await sale.save({ session });

      await session.commitTransaction();

      logger.info(`Refund processed: ${sale.invoiceNumber}`, {
        saleId: sale._id,
        grandTotal: sale.grandTotal,
        reason,
      });

      // Enqueue audit log
      await addJob(QUEUE_NAMES.AUDIT_LOG, "refund-audit", {
        action: "REFUND",
        entity: "Sale",
        entityId: sale._id.toString(),
        userId: userId.toString(),
        before: beforeState,
        after: sale.toJSON(),
        metadata: { reason, invoiceNumber: sale.invoiceNumber },
      });

      return sale;
    } catch (error) {
      await session.abortTransaction();
      logger.error("Refund failed — transaction rolled back", {
        error: error.message,
        saleId,
      });
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Get daily sales summary — aggregate for a given date.
   *
   * Returns: total revenue, sale count, items sold, average order value,
   * payment method breakdown, and top 5 products by quantity sold.
   */
  async getDailySummary(dateStr, endDateStr) {
    let startOfDay, endOfDay;

    if (endDateStr) {
      // Date range mode
      const start = new Date(dateStr);
      const end = new Date(endDateStr);
      startOfDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      endOfDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      endOfDay.setDate(endOfDay.getDate() + 1);
    } else {
      // Single day mode (existing behavior)
      const date = dateStr ? new Date(dateStr) : new Date();
      startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);
    }

    // Add daily breakdown for chart when range is selected
    const [summary] = await Sale.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfDay, $lt: endOfDay },
          status: "COMPLETED",
        },
      },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: "$grandTotal" },
                totalTax: { $sum: "$taxTotal" },
                totalDiscount: { $sum: "$discountTotal" },
                saleCount: { $sum: 1 },
                itemsSold: { $sum: { $size: "$items" } },
              },
            },
            {
              $project: {
                _id: 0,
                totalRevenue: { $round: ["$totalRevenue", 2] },
                totalTax: { $round: ["$totalTax", 2] },
                totalDiscount: { $round: ["$totalDiscount", 2] },
                saleCount: 1,
                itemsSold: 1,
                avgOrderValue: {
                  $round: [
                    { $cond: [{ $eq: ["$saleCount", 0] }, 0, { $divide: ["$totalRevenue", "$saleCount"] }] },
                    2,
                  ],
                },
              },
            },
          ],
          byPaymentMethod: [
            { $group: { _id: "$paymentMethod", count: { $sum: 1 }, total: { $sum: "$grandTotal" } } },
            { $sort: { total: -1 } },
          ],
          topProducts: [
            { $unwind: "$items" },
            {
              $group: {
                _id: "$items.sku",
                name: { $first: "$items.name" },
                totalQuantity: { $sum: "$items.quantity" },
                totalRevenue: { $sum: "$items.lineTotal" },
              },
            },
            { $sort: { totalQuantity: -1 } },
            { $limit: 5 },
          ],
          // NEW: daily breakdown for chart
          dailyBreakdown: [
            {
              $group: {
                _id: {
                  $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
                },
                revenue: { $sum: "$grandTotal" },
                orders: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]);
    return {
      date: startOfDay.toISOString().slice(0, 10),
      ...(summary?.totals?.[0] || {
        totalRevenue: 0,
        totalTax: 0,
        totalDiscount: 0,
        saleCount: 0,
        itemsSold: 0,
        avgOrderValue: 0,
      }),
      byPaymentMethod: summary?.byPaymentMethod || [],
      topProducts: summary?.topProducts || [],
      dailyBreakdown: summary?.dailyBreakdown || [],
    };
  }
}

export default new SaleService();
