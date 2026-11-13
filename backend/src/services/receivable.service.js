import mongoose from "mongoose";
import Sale, { REVENUE_STATUSES } from "../models/Sale.js";
import Customer from "../models/Customer.js";
import CreditNote from "../models/CreditNote.js";
import Payment from "../models/Payment.js";
import ApiError from "../utils/ApiError.js";
import logger from "../config/logger.js";
import { addJob, QUEUE_NAMES } from "../config/queue.js";
import { toPaise, toRupees } from "../utils/pricing.js";
import { nextDocumentNumber, resyncCounter } from "../utils/documentNumber.js";

/**
 * Receivables — money customers owe on credit sales.
 *
 *   - recordPayment(): take a payment, apply it to unpaid invoices (oldest
 *     first unless the invoices are chosen), issue a receipt number
 *   - openInvoices(): a customer's unpaid invoices
 *   - ledger():       statement with running balance (invoices, payments,
 *                     credit notes, refunds)
 *   - report():       everyone who owes money, by how overdue it is
 *
 * Customer.outstanding is kept equal to the sum of their invoices'
 * balanceDue; every change to either happens in the same transaction.
 */

const RECEIPT_SERIES = { series: "RCPT", counter: "receipt", model: Payment, field: "receiptNumber" };
const DAY = 86_400_000;

const isDuplicateReceipt = (e) =>
  e?.code === 11000 && Boolean(e.keyPattern?.receiptNumber ?? /receiptNumber/.test(e.message));

/** Invoices that still have something to pay, oldest first. */
const openInvoiceFilter = (customerId) => ({
  customer: customerId,
  balanceDue: { $gt: 0 },
  status: { $in: REVENUE_STATUSES },
});

class ReceivableService {
  /**
   * Record a payment from a customer.
   *
   * @param {Object} input
   * @param {string} input.customer
   * @param {number} input.amount
   * @param {string} input.method       - CASH | UPI | CARD | BANK | CHEQUE | OTHER
   * @param {string} [input.reference]  - UTR / cheque no.
   * @param {Date}   [input.receivedAt]
   * @param {string} [input.notes]
   * @param {Array}  [input.allocations] - [{ sale, amount }]; omitted = oldest invoices first
   * @param {string} userId
   */
  async recordPayment(input, userId) {
    for (let attempt = 1; ; attempt++) {
      try {
        const payment = await this._paymentTransaction(input, userId);
        logger.info(`Payment received: ${payment.receiptNumber}`, {
          customer: String(payment.customer),
          amount: payment.amount,
        });
        try {
          await addJob(QUEUE_NAMES.AUDIT_LOG, "payment-audit", {
            action: "PAYMENT",
            entity: "Customer",
            entityId: String(payment.customer),
            userId: String(userId),
            before: null,
            after: payment.toJSON(),
            metadata: { receiptNumber: payment.receiptNumber, amount: payment.amount },
          });
        } catch (queueError) {
          logger.error("Payment audit enqueue failed (payment already recorded)", { error: queueError.message });
        }
        return payment;
      } catch (error) {
        if (attempt < 3 && isDuplicateReceipt(error)) {
          await resyncCounter(RECEIPT_SERIES);
          continue;
        }
        throw error;
      }
    }
  }

  /** @private */
  async _paymentTransaction({ customer: customerId, amount, method, reference = "", receivedAt, notes = "", allocations }, userId) {
    const session = await mongoose.startSession();
    let payment;
    try {
      await session.withTransaction(async () => {
        const customer = await Customer.findById(customerId).session(session);
        if (!customer) throw ApiError.notFound("Customer not found");

        const amountP = toPaise(amount);
        if (amountP <= 0) throw ApiError.badRequest("Payment amount must be more than ₹0");

        const open = await Sale.find(openInvoiceFilter(customer._id)).sort({ createdAt: 1 }).session(session);
        const totalDueP = open.reduce((s, sale) => s + toPaise(sale.balanceDue), 0);
        if (amountP > totalDueP) {
          throw ApiError.badRequest(
            `Payment of ₹${toRupees(amountP)} is more than the ₹${toRupees(totalDueP)} ${customer.name} owes`
          );
        }

        // Work out which invoices the money goes to
        let plan; // [{ sale, amountP }]
        if (allocations?.length) {
          const byId = new Map(open.map((s) => [String(s._id), s]));
          plan = allocations.map((a) => {
            const sale = byId.get(String(a.sale));
            if (!sale) throw ApiError.badRequest("An allocated invoice is not an unpaid invoice of this customer");
            const p = toPaise(a.amount);
            if (p <= 0 || p > toPaise(sale.balanceDue)) {
              throw ApiError.badRequest(
                `₹${toRupees(p)} can't be applied to ${sale.invoiceNumber}: ₹${sale.balanceDue} is due on it`
              );
            }
            return { sale, amountP: p };
          });
          if (new Set(plan.map((x) => String(x.sale._id))).size !== plan.length) {
            throw ApiError.badRequest("An invoice appears twice in the allocation");
          }
          const allocatedP = plan.reduce((s, x) => s + x.amountP, 0);
          if (allocatedP !== amountP) {
            throw ApiError.badRequest(
              `Allocated ₹${toRupees(allocatedP)} doesn't match the payment of ₹${toRupees(amountP)}`
            );
          }
        } else {
          // Oldest invoice first
          plan = [];
          let leftP = amountP;
          for (const sale of open) {
            if (leftP === 0) break;
            const p = Math.min(leftP, toPaise(sale.balanceDue));
            plan.push({ sale, amountP: p });
            leftP -= p;
          }
        }

        for (const { sale, amountP: p } of plan) {
          const dueAfterP = toPaise(sale.balanceDue) - p;
          sale.balanceDue = toRupees(dueAfterP);
          sale.amountPaid = toRupees(toPaise(sale.amountPaid ?? 0) + p);
          if (sale.paymentStatus !== "REFUNDED") {
            sale.paymentStatus = dueAfterP === 0 ? "PAID" : "PARTIAL";
          }
          await sale.save({ session });
        }

        await Customer.updateOne(
          { _id: customer._id },
          [
            {
              $set: {
                outstanding: {
                  $max: [0, { $round: [{ $subtract: [{ $ifNull: ["$outstanding", 0] }, toRupees(amountP)] }, 2] }],
                },
              },
            },
          ],
          { session }
        );

        const receiptNumber = await nextDocumentNumber({ ...RECEIPT_SERIES, session });
        [payment] = await Payment.create(
          [
            {
              receiptNumber,
              customer: customer._id,
              amount: toRupees(amountP),
              method,
              reference,
              receivedAt: receivedAt ?? new Date(),
              notes,
              allocations: plan.map(({ sale, amountP: p }) => ({
                sale: sale._id,
                invoiceNumber: sale.invoiceNumber,
                amount: toRupees(p),
              })),
              createdBy: userId,
            },
          ],
          { session }
        );
      });
    } finally {
      await session.endSession();
    }
    return payment;
  }

  /** A customer's unpaid invoices, oldest first. */
  async openInvoices(customerId) {
    const now = Date.now();
    const sales = await Sale.find(openInvoiceFilter(customerId))
      .sort({ createdAt: 1 })
      .select("invoiceNumber createdAt dueDate grandTotal returnedTotal amountPaid balanceDue paymentStatus");
    return sales.map((s) => ({
      ...s.toJSON(),
      daysOverdue: s.dueDate && s.dueDate.getTime() < now ? Math.floor((now - s.dueDate.getTime()) / DAY) : 0,
    }));
  }

  listPayments(customerId) {
    return Payment.find(customerId ? { customer: customerId } : {})
      .sort({ receivedAt: -1 })
      .limit(200)
      .populate("createdBy", "name");
  }

  /**
   * Customer statement: every invoice, payment, credit note and refund with
   * a running balance (positive = customer owes us).
   *
   * Sales from before credit tracking count as paid in full at the counter,
   * and their credit notes as fully refunded, so old history balances to 0.
   */
  async ledger(customerId, { from, to } = {}) {
    const customer = await Customer.findById(customerId);
    if (!customer) throw ApiError.notFound("Customer not found");

    const [sales, payments, creditNotes] = await Promise.all([
      Sale.find({ customer: customerId, status: { $ne: "VOID" } }).sort({ createdAt: 1 }),
      Payment.find({ customer: customerId }).sort({ receivedAt: 1 }),
      CreditNote.find({ customer: customerId }).sort({ createdAt: 1 }),
    ]);

    const entries = [];
    for (const s of sales) {
      entries.push({
        date: s.createdAt,
        type: "INVOICE",
        ref: s.invoiceNumber,
        refId: s._id,
        description: `Invoice${s.dueDate ? ` · due ${s.dueDate.toISOString().slice(0, 10)}` : ""}`,
        debitP: toPaise(s.grandTotal),
        creditP: 0,
      });
      const paidAtSaleP = toPaise(s.paidAtSale ?? s.grandTotal);
      if (paidAtSaleP > 0) {
        entries.push({
          date: s.createdAt,
          type: "PAYMENT",
          ref: s.invoiceNumber,
          refId: s._id,
          description: `Paid at sale (${s.paymentMethod})`,
          debitP: 0,
          creditP: paidAtSaleP,
        });
      }
    }
    for (const p of payments) {
      entries.push({
        date: p.receivedAt,
        type: "PAYMENT",
        ref: p.receiptNumber,
        refId: p._id,
        description: `Payment (${p.method}${p.reference ? ` · ${p.reference}` : ""})${
          p.allocations.length ? ` against ${p.allocations.map((a) => a.invoiceNumber).join(", ")}` : ""
        }`,
        debitP: 0,
        creditP: toPaise(p.amount),
      });
    }
    for (const cn of creditNotes) {
      entries.push({
        date: cn.createdAt,
        type: "CREDIT_NOTE",
        ref: cn.creditNoteNumber,
        refId: cn._id,
        description: `Goods returned against ${cn.invoiceNumber}`,
        debitP: 0,
        creditP: toPaise(cn.total),
      });
      const cashP = toPaise(cn.cashRefund ?? cn.total);
      if (cashP > 0) {
        entries.push({
          date: cn.createdAt,
          type: "REFUND",
          ref: cn.creditNoteNumber,
          refId: cn._id,
          description: `Refund paid (${cn.refundMethod})`,
          debitP: cashP,
          creditP: 0,
        });
      }
    }

    // Same timestamp: invoice before its payment, credit note before its refund
    const order = { INVOICE: 0, CREDIT_NOTE: 1, REFUND: 2, PAYMENT: 3 };
    entries.sort((a, b) => a.date - b.date || order[a.type] - order[b.type]);

    const fromD = from ? new Date(from) : null;
    const toD = to ? new Date(to) : null;
    let balanceP = 0;
    let openingP = 0;
    const rows = [];
    for (const e of entries) {
      balanceP += e.debitP - e.creditP;
      if (fromD && e.date < fromD) {
        openingP = balanceP;
        continue;
      }
      if (toD && e.date > toD) continue;
      rows.push({
        date: e.date,
        type: e.type,
        ref: e.ref,
        refId: e.refId,
        description: e.description,
        debit: toRupees(e.debitP),
        credit: toRupees(e.creditP),
        balance: toRupees(balanceP),
      });
    }
    const closing = rows.length ? rows[rows.length - 1].balance : toRupees(openingP);

    const open = await this.openInvoices(customerId);
    const overdue = open.filter((i) => i.daysOverdue > 0).reduce((s, i) => s + toPaise(i.balanceDue), 0);

    return {
      customer: {
        _id: customer._id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        gstin: customer.gstin,
        creditLimit: customer.creditLimit,
        paymentTermsDays: customer.paymentTermsDays,
        outstanding: customer.outstanding ?? 0,
      },
      period: { from: fromD, to: toD },
      opening: toRupees(openingP),
      closing,
      overdue: toRupees(overdue),
      entries: rows,
      openInvoices: open,
    };
  }

  /**
   * Everyone who owes money, split by how far past the due date it is.
   * Buckets: not yet due, 1–30, 31–60, 61–90, 90+ days overdue.
   */
  async report() {
    const now = new Date();
    const daysLate = { $divide: [{ $subtract: [now, { $ifNull: ["$dueDate", now] }] }, DAY] };
    const bucket = (min, max) => ({
      $sum: {
        $cond: [
          { $and: [{ $gt: [daysLate, min] }, max === null ? true : { $lte: [daysLate, max] }] },
          "$balanceDue",
          0,
        ],
      },
    });

    const rows = await Sale.aggregate([
      { $match: { balanceDue: { $gt: 0 }, status: { $in: REVENUE_STATUSES }, customer: { $ne: null } } },
      {
        $group: {
          _id: "$customer",
          outstanding: { $sum: "$balanceDue" },
          current: { $sum: { $cond: [{ $lte: [daysLate, 0] }, "$balanceDue", 0] } },
          d1_30: bucket(0, 30),
          d31_60: bucket(30, 60),
          d61_90: bucket(60, 90),
          d90_plus: bucket(90, null),
          invoices: { $sum: 1 },
          oldestDue: { $min: "$dueDate" },
        },
      },
      { $lookup: { from: "customers", localField: "_id", foreignField: "_id", as: "customer" } },
      { $unwind: "$customer" },
      {
        $project: {
          _id: 0,
          customerId: "$_id",
          name: "$customer.name",
          phone: "$customer.phone",
          creditLimit: "$customer.creditLimit",
          invoices: 1,
          oldestDue: 1,
          outstanding: { $round: ["$outstanding", 2] },
          current: { $round: ["$current", 2] },
          d1_30: { $round: ["$d1_30", 2] },
          d31_60: { $round: ["$d31_60", 2] },
          d61_90: { $round: ["$d61_90", 2] },
          d90_plus: { $round: ["$d90_plus", 2] },
        },
      },
      { $sort: { outstanding: -1 } },
    ]);

    const sum = (k) => toRupees(rows.reduce((s, r) => s + toPaise(r[k]), 0));
    return {
      totals: {
        outstanding: sum("outstanding"),
        current: sum("current"),
        d1_30: sum("d1_30"),
        d31_60: sum("d31_60"),
        d61_90: sum("d61_90"),
        d90_plus: sum("d90_plus"),
        overdue: toRupees(
          ["d1_30", "d31_60", "d61_90", "d90_plus"].reduce((s, k) => s + toPaise(sum(k)), 0)
        ),
        customers: rows.length,
      },
      customers: rows,
    };
  }
}

export default new ReceivableService();
