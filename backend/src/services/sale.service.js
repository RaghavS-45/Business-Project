import mongoose from "mongoose";
import Sale, { REVENUE_STATUSES, NET_SALE_VALUE } from "../models/Sale.js";
import Product from "../models/Product.js";
import Customer from "../models/Customer.js";
import ApiError from "../utils/ApiError.js";
import logger from "../config/logger.js";
import { addJob, QUEUE_NAMES } from "../config/queue.js";

import { getTier } from "../utils/loyalty.js";
import { priceLine, pointsForPaise, toPaise, toRupees, roundMoney } from "../utils/pricing.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import { nextDocumentNumber, resyncCounter } from "../utils/documentNumber.js";
import settingsService from "./settings.service.js";
import returnService from "./return.service.js";
import { splitTax, stateInfo, stateFromGstin } from "../utils/gst.js";
import { sellingUnit, validQuantity, allowsDecimal, resolveLine } from "../utils/unitPricing.js";

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

const MAX_CHECKOUT_ATTEMPTS = 3;
const INVOICE_SERIES = { series: "INV", counter: "invoice", model: Sale, field: "invoiceNumber" };

/** E11000 on Sale.invoiceNumber. */
const isDuplicateInvoiceError = (error) =>
  error?.code === 11000 && Boolean(error.keyPattern?.invoiceNumber ?? /invoiceNumber/.test(error.message));

class SaleService {
  /**
   * Next invoice number for the store day: INV-YYYYMMDD-NNNN.
   * See utils/documentNumber.js for how numbers stay unique and gap-free.
   *
   * @param {ClientSession} [session] - the checkout transaction
   * @param {Date} [now]
   * @private
   */
  _generateInvoiceNumber(session = null, now = new Date()) {
    return nextDocumentNumber({ ...INVOICE_SERIES, session, now });
  }

  /** @private */
  _resyncInvoiceCounter(now = new Date()) {
    return resyncCounter({ ...INVOICE_SERIES, now });
  }

  /**
   * Compute line total (in rupees) for a single item.
   * See utils/pricing.js — discount, then loyalty, then tax, each rounded
   * once to the nearest paisa.
   *
   * @private
   */
  _computeLineTotal(quantity, unitPrice, discountPercent, taxPercent, loyaltyPercent = 0) {
    return toRupees(
      priceLine({ quantity, unitPrice, discountPercent, taxPercent }, loyaltyPercent).total
    );
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
  async checkout(cartItems, customerId, paymentMethod, cashierUser, notes = "", { amountPaid } = {}) {
    // ── Role-based discount caps ─────────────────────────────
    // Cashiers cannot set arbitrary discounts.
    const DISCOUNT_CAPS = {
      CASHIER: 10,   // max 10% per item
      MANAGER: 30,   // max 30% per item
      ADMIN:   100,  // unlimited
    };
    const maxDiscount = DISCOUNT_CAPS[cashierUser.role] ?? 0;

    let sale; // visible in the post-commit block

    // Each attempt runs the whole checkout as one transaction. The driver's
    // withTransaction() already retries write conflicts (two cashiers selling
    // the same product, or taking the next invoice number, at the same
    // moment). The outer loop only covers a duplicate invoice number, which
    // can happen if the day's counter fell behind — it is resynced first.
    for (let attempt = 1; ; attempt++) {
      try {
        sale = await this._checkoutTransaction(
          cartItems, customerId, paymentMethod, cashierUser, notes, maxDiscount, amountPaid
        );
        break;
      } catch (error) {
        if (attempt < MAX_CHECKOUT_ATTEMPTS && isDuplicateInvoiceError(error)) {
          logger.warn("Duplicate invoice number — resyncing counter and retrying", {
            attempt,
            error: error.message,
          });
          await this._resyncInvoiceCounter();
          continue;
        }
        logger.error("Checkout failed — transaction rolled back", {
          error: error.message,
          cashier: cashierUser?.email,
        });
        throw error;
      }
    }

    logger.info(`Checkout completed: ${sale.invoiceNumber}`, {
      saleId: sale._id,
      cashier: cashierUser.email,
      itemCount: sale.items.length,
      grandTotal: sale.grandTotal,
    });

    // ─── Enqueue background jobs (AFTER commit, outside transaction) ──
    // A failure here must never cause a 500 that misleads the cashier into
    // retrying — the sale is already committed and money has changed hands.
    try {
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
          invoiceNumber: sale.invoiceNumber,
          grandTotal: sale.grandTotal,
          itemCount: sale.items.length,
          paymentMethod,
        },
      });
    } catch (queueError) {
      // Log but never propagate — the cashier's screen must show success.
      logger.error("Post-checkout job enqueue failed (sale already committed)", {
        saleId: sale._id,
        error: queueError.message,
      });
    }

    return sale;
  }

  /**
   * One checkout attempt as a single transaction. Returns the committed sale.
   * Everything is recomputed from scratch on each try, so retries are safe.
   * @private
   */
  async _checkoutTransaction(cartItems, customerId, paymentMethod, cashierUser, notes, maxDiscount, amountPaid) {
    const session = await mongoose.startSession();
    let sale;
    try {
      await session.withTransaction(async () => {
        const saleItems = [];
        // Running totals in whole paise — summed from the per-line amounts so
        // the lines always add up to the grand total exactly.
        let subtotalP = 0;
        let taxP = 0;
        let discountP = 0;
        let loyaltyP = 0;
        let grandP = 0;

        let loyaltyPercent = 0;
        let loyaltyTier = null;

        let customer = null;
        if (customerId) {
          customer = await Customer.findById(customerId).session(session);
          if (!customer) throw ApiError.notFound(`Customer not found: ${customerId}`);
          const tier = getTier(customer.loyaltyPoints); // tier BEFORE this sale
          loyaltyPercent = tier.discount;
          loyaltyTier = tier.name;
        }

        // ── GST context ──────────────────────────────────
        // Place of supply is the buyer's state (from their GSTIN, else their
        // saved state); for walk-ins it is the store's own state. A buyer in
        // a different state is charged IGST, otherwise CGST + SGST.
        const store = await settingsService.get(session);
        const pricing = { taxInclusive: Boolean(store.pricesIncludeTax) };
        const buyerState = stateFromGstin(customer?.gstin) || customer?.stateCode || "";
        const placeOfSupply = stateInfo(buyerState || store.stateCode);
        const interState = Boolean(
          store.stateCode && placeOfSupply && placeOfSupply.code !== store.stateCode
        );
        let taxableP = 0;
        let cgstP = 0;
        let sgstP = 0;
        let igstP = 0;

        // ─── Process each cart item within the transaction ───
        for (const item of cartItems) {
          // ── Validate discount cap ────────────────────────
          const discountPercent = item.discountPercent || 0;
          if (discountPercent < 0 || discountPercent > 100) {
            throw ApiError.badRequest(`Invalid discountPercent: ${discountPercent}`);
          }
          if (discountPercent > maxDiscount) {
            throw ApiError.badRequest(
              `Your role (${cashierUser.role}) allows a maximum discount of ${maxDiscount}%. ` +
              `Requested: ${discountPercent}%.`
            );
          }

          // ── Product, selling unit and price ──────────────
          const product = await Product.findById(item.product).session(session);
          if (!product) throw ApiError.notFound(`Product not found: ${item.product}`);
          if (!product.isActive) throw ApiError.badRequest(`Product is inactive: ${product.name}`);

          const unit = sellingUnit(product, item.unit);
          if (!unit) {
            throw ApiError.badRequest(`"${product.name}" isn't sold by the ${item.unit}`);
          }
          if (!validQuantity(product, unit, item.quantity)) {
            throw ApiError.badRequest(
              `Quantity ${item.quantity} isn't valid for "${product.name}": ` +
                (unit.isBase && allowsDecimal(product.unit)
                  ? "use at most 3 decimals"
                  : `${unit.name} is sold in whole numbers`)
            );
          }
          // Price is always worked out here (customer level, bulk slabs,
          // pack price) — never taken from the request.
          const resolved = resolveLine(product, {
            unit: unit.name,
            quantity: item.quantity,
            level: customer?.priceLevel ?? "RETAIL",
          });

          // Take the stock (in base units). The $gte guard means it can never
          // go negative, even with concurrent checkouts; $round keeps loose
          // quantities (kg, ltr) free of float drift.
          const taken = await Product.updateOne(
            { _id: product._id, isActive: true, stock: { $gte: resolved.baseQty } },
            [{ $set: { stock: { $round: [{ $subtract: ["$stock", resolved.baseQty] }, 3] } } }],
            { session }
          );
          if (taken.matchedCount === 0) {
            throw ApiError.badRequest(
              `Insufficient stock for "${product.name}": requested ${resolved.baseQty} ${product.unit}, ` +
                `available ${product.stock} ${product.unit}`
            );
          }

          // Tax is always read from the product — never from the request body.
          const taxPercent = product.taxRate ?? 0;

          const line = priceLine(
            {
              quantity: item.quantity,
              unitPrice: resolved.unitPrice,
              discountPercent,
              taxPercent,
            },
            loyaltyPercent,
            pricing
          );
          const lineTotal = toRupees(line.total);
          const gst = splitTax(line.tax, interState);
          taxableP += line.taxable;
          cgstP += gst.cgst;
          sgstP += gst.sgst;
          igstP += gst.igst;

          subtotalP += line.raw;
          discountP += line.discount;
          loyaltyP += line.loyalty;
          taxP += line.tax;
          grandP += line.total;

          // Snapshot product data into the line item
          saleItems.push({
            product: product._id,
            name: product.name,
            sku: product.sku,
            quantity: item.quantity,
            unit: resolved.unitName,
            unitSize: resolved.unitSize,
            baseUnit: product.unit,
            baseQuantity: resolved.baseQty,
            priceSource: resolved.priceSource,
            unitPrice: resolved.unitPrice,
            costPrice: toRupees(Math.round(toPaise(product.costPrice) * resolved.unitSize)),
            discountPercent,
            taxPercent,
            hsnCode: product.hsnCode || "",
            taxableValue: toRupees(line.taxable),
            cgst: toRupees(gst.cgst),
            sgst: toRupees(gst.sgst),
            igst: toRupees(gst.igst),
            lineTotal,
          });
        }

        const subtotal = toRupees(subtotalP);
        const taxTotal = toRupees(taxP);
        const discountTotal = toRupees(discountP);
        const loyaltyDiscountTotal = toRupees(loyaltyP);
        const grandTotal = toRupees(grandP);

        // ── Payment: paid in full, part-paid, or on credit ──
        // CREDIT means nothing paid now; otherwise the method is how the
        // paid part was paid, and amountPaid defaults to the full bill.
        const paidP =
          amountPaid === undefined || amountPaid === null
            ? paymentMethod === "CREDIT" ? 0 : grandP
            : toPaise(amountPaid);
        if (paidP < 0 || paidP > grandP) {
          throw ApiError.badRequest(`Amount paid must be between ₹0 and the bill total ₹${toRupees(grandP)}`);
        }
        if (paymentMethod === "CREDIT" && paidP > 0) {
          throw ApiError.badRequest("Choose how the paid part was paid (cash, UPI, …) instead of Credit");
        }
        const dueP = grandP - paidP;
        let dueDate = null;
        if (dueP > 0) {
          if (!customer) {
            throw ApiError.badRequest("Walk-in sales must be paid in full. Choose a customer to sell on credit.");
          }
          const outstandingP = toPaise(customer.outstanding ?? 0);
          if (customer.creditLimit !== null && customer.creditLimit !== undefined) {
            const limitP = toPaise(customer.creditLimit);
            if (outstandingP + dueP > limitP) {
              throw ApiError.badRequest(
                `Credit limit exceeded for ${customer.name}: owes ₹${toRupees(outstandingP)}, ` +
                  `limit ₹${toRupees(limitP)}, this bill would add ₹${toRupees(dueP)}.`
              );
            }
          }
          dueDate = new Date(Date.now() + (customer.paymentTermsDays ?? 30) * 86_400_000);
        }

        // Next invoice number — taken inside the transaction
        const invoiceNumber = await this._generateInvoiceNumber(session);

        // Create the Sale document within the transaction
        const [created] = await Sale.create(
          [
            {
              invoiceNumber,
              customer: customerId || null,
              cashier: cashierUser._id,
              items: saleItems,
              subtotal,
              taxTotal,
              discountTotal,
              loyaltyTier,
              loyaltyDiscountPercent: loyaltyPercent,
              loyaltyDiscountTotal,
              grandTotal,
              taxableTotal: toRupees(taxableP),
              cgstTotal: toRupees(cgstP),
              sgstTotal: toRupees(sgstP),
              igstTotal: toRupees(igstP),
              pricesIncludeTax: pricing.taxInclusive,
              interState,
              placeOfSupply: placeOfSupply ?? { code: "", name: "" },
              seller: {
                legalName: store.legalName,
                tradeName: store.tradeName,
                gstin: store.gstin,
                stateCode: store.stateCode,
                address: store.address,
                phone: store.phone,
                email: store.email,
                bankDetails: store.bankDetails,
                invoiceTerms: store.invoiceTerms,
              },
              buyer: customer
                ? {
                    name: customer.name,
                    gstin: customer.gstin || "",
                    stateCode: buyerState,
                    address: [customer.address?.street, customer.address?.city, customer.address?.state, customer.address?.pincode]
                      .filter(Boolean)
                      .join(", "),
                    phone: customer.phone || "",
                  }
                : { name: "", gstin: "", stateCode: "", address: "", phone: "" },
              paymentMethod,
              paidAtSale: toRupees(paidP),
              amountPaid: toRupees(paidP),
              balanceDue: toRupees(dueP),
              dueDate,
              paymentStatus: dueP === 0 ? "PAID" : paidP === 0 ? "UNPAID" : "PARTIAL",
              notes,
            },
          ],
          { session }
        );
        sale = created;

        // Update customer loyalty if not a walk-in
        if (customerId) {
            const loyaltyPoints = pointsForPaise(grandP);

            // Pipeline update so the running ₹ total is re-rounded to 2 decimals
            // on every sale — a plain $inc lets float error pile up over time.
            await Customer.updateOne(
              { _id: customerId },
              [
                {
                  $set: {
                    totalPurchases: {
                      $round: [{ $add: [{ $ifNull: ["$totalPurchases", 0] }, grandTotal] }, 2],
                    },
                    loyaltyPoints: { $add: [{ $ifNull: ["$loyaltyPoints", 0] }, loyaltyPoints] },
                    outstanding: {
                      $round: [{ $add: [{ $ifNull: ["$outstanding", 0] }, toRupees(dueP)] }, 2],
                    },
                  },
                },
              ],
              { session }
            );

            if (loyaltyPoints > 0) {
              await LoyaltyTransaction.create(
                [{ customer: customerId, sale: sale._id, points: loyaltyPoints, type: "earn" }],
                { session }
              );
            }
        }
      });
    } finally {
      await session.endSession();
    }
    return sale;
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
      paymentStatus,
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
    if (paymentStatus) filter.paymentStatus = paymentStatus;
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
    // A full refund is a return of everything not yet returned: it issues a
    // credit note, restocks, and reverses loyalty — see return.service.js.
    const { sale } = await returnService.returnAll(saleId, userId, reason);
    return sale;
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
          status: { $in: REVENUE_STATUSES },
        },
      },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                // Net of returns (credit notes) on these sales
                totalRevenue: { $sum: NET_SALE_VALUE },
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
            { $group: { _id: "$paymentMethod", count: { $sum: 1 }, total: { $sum: NET_SALE_VALUE } } },
            { $sort: { total: -1 } },
          ],
          topProducts: [
            { $unwind: "$items" },
            {
              $group: {
                _id: "$items.sku",
                name: { $first: "$items.name" },
                totalQuantity: {
                  $sum: { $subtract: ["$items.quantity", { $ifNull: ["$items.returnedQuantity", 0] }] },
                },
                // Line value for the units kept (not returned)
                totalRevenue: {
                  $sum: {
                    $multiply: [
                      "$items.lineTotal",
                      {
                        $divide: [
                          { $subtract: ["$items.quantity", { $ifNull: ["$items.returnedQuantity", 0] }] },
                          "$items.quantity",
                        ],
                      },
                    ],
                  },
                },
              },
            },
            { $sort: { totalQuantity: -1 } },
            { $limit: 5 },
          ],
          // NEW: daily breakdown for chart
          dailyBreakdown: [
            {
              $group: {
                // Bucket by the store's calendar day (IST), not UTC, so a
                // sale at 1am counts towards that day on the chart.
                _id: {
                  $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Kolkata" },
                },
                revenue: { $sum: NET_SALE_VALUE },
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
