import mongoose from "mongoose";
import Sale from "../models/Sale.js";
import Product from "../models/Product.js";
import Customer from "../models/Customer.js";
import CreditNote from "../models/CreditNote.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import ApiError from "../utils/ApiError.js";
import logger from "../config/logger.js";
import { addJob, QUEUE_NAMES } from "../config/queue.js";
import { toPaise, toRupees, pointsForPaise } from "../utils/pricing.js";
import { nextDocumentNumber, resyncCounter } from "../utils/documentNumber.js";
import { allowsDecimal, roundQty } from "../utils/unitPricing.js";

/**
 * Returns & credit notes.
 *
 * A return takes back some units of a sale and issues a numbered credit note
 * (CN-YYYYMMDD-NNNN) for them, all in one transaction:
 *   - the returned share of each line is worked out in paise from the
 *     original invoice line (see shareOf), so the credit notes for a fully
 *     returned sale add up to the invoice exactly,
 *   - stock goes back for items marked restock (not for damaged goods),
 *   - an unpaid balance on the invoice is reduced first; only the rest is
 *     paid back (cashRefund),
 *   - the customer's purchases, dues and loyalty points are reduced,
 *   - the sale becomes PARTIALLY_RETURNED, or REFUNDED once nothing is left.
 */

const CREDIT_NOTE_SERIES = { series: "CN", counter: "creditnote", model: CreditNote, field: "creditNoteNumber" };
const MAX_ATTEMPTS = 3;

/**
 * Paise of `amountP` that belong to units [from, to) out of `qty` units.
 * Cumulative rounding: shareOf(0, qty) === amountP, and consecutive shares
 * always add up, however the returns are split.
 */
const shareOf = (amountP, from, to, qty) =>
  Math.round((amountP * to) / qty) - Math.round((amountP * from) / qty);

/** GST components of an invoice line, in paise. */
function lineParts(item) {
  const hasGst = item.taxableValue || item.cgst || item.sgst || item.igst;
  return hasGst
    ? {
        taxable: toPaise(item.taxableValue),
        cgst: toPaise(item.cgst),
        sgst: toPaise(item.sgst),
        igst: toPaise(item.igst),
      }
    : // Sales from before GST tracking: the whole line is taxable value
      { taxable: toPaise(item.lineTotal), cgst: 0, sgst: 0, igst: 0 };
}

const isDuplicateNumberError = (e) =>
  e?.code === 11000 && Boolean(e.keyPattern?.creditNoteNumber ?? /creditNoteNumber/.test(e.message));

class ReturnService {
  /**
   * Return units from a sale and issue a credit note.
   *
   * @param {string} saleId
   * @param {Object} input
   * @param {Array}  input.items        - [{ product, quantity, restock = true }]
   * @param {string} input.reason
   * @param {string} [input.refundMethod] - defaults to the sale's payment method
   * @param {string} userId
   * @param {Object} [opts]
   * @param {string} [opts.noteLabel]   - prefix for the sale's notes ("RETURN" / "REFUND")
   * @returns {Promise<{ creditNote, sale }>}
   */
  async createReturn(saleId, input, userId, { noteLabel = null } = {}) {
    for (let attempt = 1; ; attempt++) {
      try {
        const result = await this._returnTransaction(saleId, input, userId, noteLabel);
        logger.info(`Credit note issued: ${result.creditNote.creditNoteNumber}`, {
          saleId,
          invoiceNumber: result.sale.invoiceNumber,
          total: result.creditNote.total,
        });

        try {
          await addJob(QUEUE_NAMES.AUDIT_LOG, "return-audit", {
            action: "RETURN",
            entity: "Sale",
            entityId: result.sale._id.toString(),
            userId: userId.toString(),
            before: null,
            after: result.sale.toJSON(),
            metadata: {
              creditNoteNumber: result.creditNote.creditNoteNumber,
              invoiceNumber: result.sale.invoiceNumber,
              total: result.creditNote.total,
              reason: input.reason,
            },
          });
        } catch (queueError) {
          logger.error("Return audit enqueue failed (credit note already issued)", {
            error: queueError.message,
          });
        }

        return result;
      } catch (error) {
        if (attempt < MAX_ATTEMPTS && isDuplicateNumberError(error)) {
          await resyncCounter(CREDIT_NOTE_SERIES);
          continue;
        }
        throw error;
      }
    }
  }

  /** @private */
  async _returnTransaction(saleId, { items, reason, refundMethod }, userId, noteLabel) {
    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        const sale = await Sale.findById(saleId).session(session);
        if (!sale) throw ApiError.notFound("Sale not found");
        if (!["COMPLETED", "PARTIALLY_RETURNED"].includes(sale.status)) {
          throw ApiError.badRequest(`Cannot refund a sale with status: ${sale.status}`);
        }

        // Which invoice line each request row refers to: by `line` index, or
        // by product when that product appears on only one line.
        // Rows for the same line are merged.
        const requested = new Map(); // lineIndex → { quantity, restock }
        for (const it of items) {
          let index = it.line;
          if (index === undefined || index === null) {
            const matches = sale.items
              .map((l, i) => (String(l.product) === String(it.product) ? i : -1))
              .filter((i) => i >= 0);
            if (matches.length === 0) {
              throw ApiError.badRequest(`Product ${it.product} is not on invoice ${sale.invoiceNumber}`);
            }
            if (matches.length > 1) {
              throw ApiError.badRequest("That product is on several lines of the invoice; say which line to return");
            }
            index = matches[0];
          }
          if (!sale.items[index]) throw ApiError.badRequest(`Invoice ${sale.invoiceNumber} has no line ${index + 1}`);
          const prev = requested.get(index);
          requested.set(index, {
            quantity: roundQty((prev?.quantity ?? 0) + it.quantity),
            restock: it.restock ?? prev?.restock ?? true,
          });
        }

        const cnItems = [];
        let subtotalP = 0, taxableP = 0, cgstP = 0, sgstP = 0, igstP = 0;

        for (const [index, req] of requested) {
          const line = sale.items[index];
          const unitSize = line.unitSize ?? 1;
          const unitName = line.unit || "";
          // Loose quantities only where the line was sold loose (kg, ltr in the base unit)
          const looseOk = unitSize === 1 && allowsDecimal(unitName);
          if (!looseOk && !Number.isInteger(req.quantity)) {
            throw ApiError.badRequest(`"${line.name}" was sold in whole ${unitName || "units"}; return a whole number`);
          }

          const already = line.returnedQuantity ?? 0;
          const left = roundQty(line.quantity - already);
          if (req.quantity > left) {
            throw ApiError.badRequest(
              `Can't return ${req.quantity} × "${line.name}": only ${left} of ${line.quantity} not yet returned`
            );
          }

          const parts = lineParts(line);
          const share = (p) => shareOf(p, already, already + req.quantity, line.quantity);
          const taxable = share(parts.taxable);
          const cgst = share(parts.cgst);
          const sgst = share(parts.sgst);
          const igst = share(parts.igst);
          const gross = Math.round(req.quantity * toPaise(line.unitPrice));

          cnItems.push({
            product: line.product,
            name: line.name,
            sku: line.sku,
            hsnCode: line.hsnCode || "",
            line: index,
            quantity: req.quantity,
            unit: unitName,
            unitSize,
            baseUnit: line.baseUnit || "",
            unitPrice: line.unitPrice,
            discountPercent: line.discountPercent ?? 0,
            taxPercent: line.taxPercent ?? 0,
            taxableValue: toRupees(taxable),
            cgst: toRupees(cgst),
            sgst: toRupees(sgst),
            igst: toRupees(igst),
            lineTotal: toRupees(taxable + cgst + sgst + igst),
            restocked: req.restock,
          });
          subtotalP += gross;
          taxableP += taxable;
          cgstP += cgst;
          sgstP += sgst;
          igstP += igst;

          line.returnedQuantity = roundQty(already + req.quantity);

          if (req.restock) {
            // Back into stock in base units (2 cartons of 12 → 24 pcs)
            const baseQty = roundQty(req.quantity * unitSize);
            await Product.updateOne(
              { _id: line.product },
              [{ $set: { stock: { $round: [{ $add: ["$stock", baseQty] }, 3] } } }],
              { session }
            );
          }
        }

        const totalP = taxableP + cgstP + sgstP + igstP;
        const returnedBeforeP = toPaise(sale.returnedTotal ?? 0);
        const grandP = toPaise(sale.grandTotal);
        const everythingReturned = sale.items.every((i) => roundQty(i.returnedQuantity ?? 0) >= i.quantity);

        // An unpaid invoice is reduced first; only the rest is paid back
        const dueBeforeP = toPaise(sale.balanceDue ?? 0);
        const adjustP = Math.min(dueBeforeP, totalP);
        const cashP = totalP - adjustP;

        const creditNoteNumber = await nextDocumentNumber({ ...CREDIT_NOTE_SERIES, session });
        const [creditNote] = await CreditNote.create(
          [
            {
              creditNoteNumber,
              sale: sale._id,
              invoiceNumber: sale.invoiceNumber,
              invoiceDate: sale.createdAt,
              customer: sale.customer,
              createdBy: userId,
              items: cnItems,
              subtotal: toRupees(subtotalP),
              taxableTotal: toRupees(taxableP),
              cgstTotal: toRupees(cgstP),
              sgstTotal: toRupees(sgstP),
              igstTotal: toRupees(igstP),
              taxTotal: toRupees(cgstP + sgstP + igstP),
              total: toRupees(totalP),
              reason,
              refundMethod:
                cashP === 0
                  ? "ADJUSTED"
                  : refundMethod || (sale.paymentMethod === "CREDIT" ? "CASH" : sale.paymentMethod),
              adjustedAgainstDue: toRupees(adjustP),
              cashRefund: toRupees(cashP),
              pricesIncludeTax: sale.pricesIncludeTax,
              interState: sale.interState,
              placeOfSupply: sale.placeOfSupply,
              seller: sale.seller?.toObject?.() ?? sale.seller ?? {},
              buyer: sale.buyer?.toObject?.() ?? sale.buyer ?? {},
            },
          ],
          { session }
        );

        // ── Customer: purchases and loyalty points ─────────
        if (sale.customer) {
          await this._reverseLoyalty(sale, grandP, returnedBeforeP, totalP, adjustP, session);
        }

        // ── Sale ───────────────────────────────────────────
        sale.returnedTotal = toRupees(returnedBeforeP + totalP);
        sale.balanceDue = toRupees(dueBeforeP - adjustP);
        sale.status = everythingReturned ? "REFUNDED" : "PARTIALLY_RETURNED";
        if (everythingReturned) {
          sale.paymentStatus = "REFUNDED";
        } else if (dueBeforeP > 0 && dueBeforeP - adjustP === 0) {
          sale.paymentStatus = "PAID";
        }
        const label = noteLabel ?? `RETURN ${creditNoteNumber}`;
        sale.notes = sale.notes ? `${sale.notes} | ${label}: ${reason}` : `${label}: ${reason}`;
        await sale.save({ session });

        result = { creditNote, sale };
      });
    } finally {
      await session.endSession();
    }
    return result;
  }

  /**
   * Take back the purchases total and the loyalty points that the returned
   * amount had earned. Points are worked out from what the customer keeps:
   * earned − points(kept value), so a full return reverses all of them.
   * @private
   */
  async _reverseLoyalty(sale, grandP, returnedBeforeP, refundP, adjustP, session) {
    const customer = await Customer.findById(sale.customer).session(session);
    if (!customer) return;

    const [earned, reversed] = await Promise.all([
      LoyaltyTransaction.findOne({ sale: sale._id, type: "earn" }).session(session),
      LoyaltyTransaction.findOne({ sale: sale._id, type: "reverse" }).session(session),
    ]);
    // Old sales (before the ledger existed) have no earn row: use the formula
    const earnedPoints = earned?.points ?? pointsForPaise(grandP);
    const keptAfterP = Math.max(0, grandP - returnedBeforeP - refundP);
    const shouldHaveReversed = Math.max(0, earnedPoints - pointsForPaise(keptAfterP));
    const alreadyReversed = -(reversed?.points ?? 0);
    const pointsBack = Math.min(Math.max(0, shouldHaveReversed - alreadyReversed), customer.loyaltyPoints);
    const purchasesBack = toRupees(Math.min(refundP, toPaise(customer.totalPurchases)));

    await Customer.updateOne(
      { _id: customer._id },
      [
        {
          $set: {
            loyaltyPoints: { $max: [0, { $subtract: ["$loyaltyPoints", pointsBack] }] },
            totalPurchases: {
              $max: [0, { $round: [{ $subtract: ["$totalPurchases", purchasesBack] }, 2] }],
            },
            // The part knocked off the unpaid invoice is no longer owed
            outstanding: {
              $max: [0, { $round: [{ $subtract: [{ $ifNull: ["$outstanding", 0] }, toRupees(adjustP)] }, 2] }],
            },
          },
        },
      ],
      { session }
    );

    if (pointsBack > 0) {
      // One running "reverse" row per sale (the ledger allows one per type)
      await LoyaltyTransaction.updateOne(
        { sale: sale._id, type: "reverse" },
        { $inc: { points: -pointsBack }, $setOnInsert: { customer: customer._id } },
        { upsert: true, session }
      );
    }
  }

  /**
   * Return everything not yet returned (the old "refund" action).
   */
  async returnAll(saleId, userId, reason) {
    const sale = await Sale.findById(saleId);
    if (!sale) throw ApiError.notFound("Sale not found");
    if (!["COMPLETED", "PARTIALLY_RETURNED"].includes(sale.status)) {
      throw ApiError.badRequest(`Cannot refund a sale with status: ${sale.status}`);
    }
    const items = sale.items
      .map((i, line) => ({ line, quantity: roundQty(i.quantity - (i.returnedQuantity ?? 0)), restock: true }))
      .filter((i) => i.quantity > 0);
    return this.createReturn(saleId, { items, reason }, userId, { noteLabel: "REFUND" });
  }

  listForSale(saleId) {
    return CreditNote.find({ sale: saleId }).sort({ createdAt: 1 });
  }

  async getById(id) {
    const cn = await CreditNote.findById(id);
    if (!cn) throw ApiError.notFound("Credit note not found");
    return cn;
  }

  async list({ page = 1, limit = 20 } = {}) {
    const [creditNotes, total] = await Promise.all([
      CreditNote.find()
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("createdBy", "name"),
      CreditNote.countDocuments(),
    ]);
    return { creditNotes, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
  }
}

export default new ReturnService();
