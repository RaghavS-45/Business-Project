import mongoose from "mongoose";
import PurchaseBill from "../models/PurchaseBill.js";
import SupplierPayment from "../models/SupplierPayment.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import Product from "../models/Product.js";
import Vendor from "../models/Vendor.js";
import ApiError from "../utils/ApiError.js";
import logger from "../config/logger.js";
import { addJob, QUEUE_NAMES } from "../config/queue.js";
import { priceLine, toPaise, toRupees } from "../utils/pricing.js";
import { splitTax, stateFromGstin } from "../utils/gst.js";
import { sellingUnit, validQuantity, allowsDecimal } from "../utils/unitPricing.js";
import { nextDocumentNumber, resyncCounter } from "../utils/documentNumber.js";
import { containsRegex } from "../utils/search.js";
import settingsService from "./settings.service.js";

/**
 * Purchases and payables — the buying side, mirroring receivables.
 *
 *   createBill()    post a supplier's bill: stock in, moving-average cost,
 *                   input GST, and the unpaid part owed to the supplier
 *   cancelBill()    undo a bill entered by mistake (if nothing was paid on it since)
 *   recordPayment() pay a supplier; applied to their oldest-due bills first
 *   ledger()        supplier statement with running balance (what we owe)
 *   report()        everyone we owe, by how overdue
 *
 * Vendor.outstanding is kept equal to the sum of their bills' balanceDue;
 * every change to either happens in the same transaction.
 */

const BILL_SERIES = { series: "PB", counter: "purchase-bill", model: PurchaseBill, field: "billNumber" };
const PAYMENT_SERIES = { series: "PAY", counter: "supplier-payment", model: SupplierPayment, field: "paymentNumber" };
const DAY = 86_400_000;

const duplicateOn = (e, field) => e?.code === 11000 && JSON.stringify(e.keyPattern ?? e.message).includes(field);

/** Unpaid bills of a supplier, oldest due first. */
const openBillFilter = (vendorId) => ({ vendor: vendorId, status: "POSTED", balanceDue: { $gt: 0 } });

const vendorState = (vendor) => stateFromGstin(vendor.gstin) || vendor.stateCode || "";

/** Add (or with a negative amount, remove) rupees from Vendor.outstanding, kept to 2 decimals. */
const bumpOutstanding = (vendorId, rupees, session) =>
  Vendor.updateOne(
    { _id: vendorId },
    [{ $set: { outstanding: { $max: [0, { $round: [{ $add: [{ $ifNull: ["$outstanding", 0] }, rupees] }, 2] }] } } }],
    { session }
  );

const audit = async (name, payload) => {
  try {
    await addJob(QUEUE_NAMES.AUDIT_LOG, name, payload);
  } catch (error) {
    logger.error(`${name} enqueue failed (change already saved)`, { error: error.message });
  }
};

class PayableService {
  // ─── Bills ─────────────────────────────────────────────

  /**
   * @param {Object} input
   * @param {string} input.vendor
   * @param {string} input.supplierInvoiceNo
   * @param {Date}   [input.billDate]
   * @param {Date}   [input.dueDate]         - default: bill date + supplier's payment terms
   * @param {string} [input.purchaseOrder]   - approved (or received) PO this bill is for
   * @param {Array}  input.items             - [{ product, quantity, unit?, unitCost, discountPercent?, taxPercent? }]
   * @param {number} [input.amountPaid]      - paid on the spot (default 0)
   * @param {string} [input.paymentMethod]
   * @param {string} [input.notes]
   * @param {string} userId
   */
  async createBill(input, userId) {
    for (let attempt = 1; ; attempt++) {
      try {
        const bill = await this._billTransaction(input, userId);
        logger.info(`Purchase bill posted: ${bill.billNumber}`, { vendor: bill.supplier.name, total: bill.grandTotal });
        await audit("bill-audit", {
          action: "CREATE",
          entity: "PurchaseBill",
          entityId: String(bill._id),
          userId: String(userId),
          before: null,
          after: bill.toJSON(),
          metadata: { billNumber: bill.billNumber, total: bill.grandTotal },
        });
        return bill;
      } catch (error) {
        if (duplicateOn(error, "supplierInvoiceNo")) {
          throw ApiError.conflict(`Bill ${input.supplierInvoiceNo} from this supplier is already entered`);
        }
        if (attempt < 3 && duplicateOn(error, "billNumber")) {
          await resyncCounter(BILL_SERIES);
          continue;
        }
        throw error;
      }
    }
  }

  /** @private */
  async _billTransaction(input, userId) {
    const {
      vendor: vendorId,
      supplierInvoiceNo,
      billDate = new Date(),
      dueDate,
      purchaseOrder: poId,
      items,
      amountPaid = 0,
      paymentMethod = "",
      notes = "",
    } = input;

    const session = await mongoose.startSession();
    let bill;
    try {
      await session.withTransaction(async () => {
        const vendor = await Vendor.findById(vendorId).session(session);
        if (!vendor) throw ApiError.notFound("Supplier not found");

        const invoiceNo = String(supplierInvoiceNo).trim().toUpperCase();
        const dup = await PurchaseBill.exists({ vendor: vendor._id, supplierInvoiceNo: invoiceNo, status: "POSTED" }).session(session);
        if (dup) throw ApiError.conflict(`Bill ${invoiceNo} from ${vendor.name} is already entered`);

        // Linked purchase order: its goods arrive with this bill
        let po = null;
        let addStock = true;
        if (poId) {
          po = await PurchaseOrder.findById(poId).session(session);
          if (!po) throw ApiError.notFound("Purchase order not found");
          if (String(po.vendor) !== String(vendor._id)) throw ApiError.badRequest("That purchase order is for another supplier");
          if (!["approved", "received"].includes(po.status)) {
            throw ApiError.badRequest(`Purchase order ${po.poNumber} is ${po.status}; approve it first`);
          }
          const billed = await PurchaseBill.exists({ purchaseOrder: po._id, status: "POSTED" }).session(session);
          if (billed) throw ApiError.conflict(`Purchase order ${po.poNumber} already has a bill`);
          addStock = po.status === "approved"; // a received PO's stock is already in
        }

        const store = await settingsService.get(session);
        const supplierState = vendorState(vendor);
        const interState = Boolean(store.stateCode && supplierState && supplierState !== store.stateCode);

        const ids = [...new Set(items.map((i) => String(i.product)))];
        const products = await Product.find({ _id: { $in: ids } }).session(session);
        const byId = new Map(products.map((p) => [String(p._id), p]));

        const sums = { raw: 0, discount: 0, taxable: 0, tax: 0, total: 0, cgst: 0, sgst: 0, igst: 0 };
        const lines = [];
        // Per product: base quantity in and its cost before GST (paise)
        const intake = new Map();

        for (const item of items) {
          const product = byId.get(String(item.product));
          if (!product) throw ApiError.notFound(`Product not found: ${item.product}`);
          const unit = sellingUnit(product, item.unit);
          if (!unit) throw ApiError.badRequest(`"${product.name}" has no ${item.unit} pack`);
          if (!validQuantity(product, unit, item.quantity)) {
            throw ApiError.badRequest(
              `Quantity ${item.quantity} isn't valid for "${product.name}": ` +
                (unit.isBase && allowsDecimal(product.unit) ? "use at most 3 decimals" : `${unit.name} is counted in whole numbers`)
            );
          }
          const taxPercent = item.taxPercent ?? product.taxRate ?? 0;
          const line = priceLine({
            quantity: item.quantity,
            unitPrice: item.unitCost,
            discountPercent: item.discountPercent ?? 0,
            taxPercent,
          });
          const gst = splitTax(line.tax, interState);
          const baseQuantity = Math.round(item.quantity * unit.size * 1000) / 1000;

          sums.raw += line.raw;
          sums.discount += line.discount;
          sums.taxable += line.taxable;
          sums.tax += line.tax;
          sums.total += line.total;
          sums.cgst += gst.cgst;
          sums.sgst += gst.sgst;
          sums.igst += gst.igst;

          const prev = intake.get(String(product._id)) ?? { qty: 0, costP: 0 };
          intake.set(String(product._id), { qty: prev.qty + baseQuantity, costP: prev.costP + line.taxable });

          lines.push({
            product: product._id,
            name: product.name,
            sku: product.sku,
            quantity: item.quantity,
            unit: unit.name,
            unitSize: unit.size,
            baseUnit: product.unit,
            baseQuantity,
            unitCost: item.unitCost,
            discountPercent: item.discountPercent ?? 0,
            taxPercent,
            hsnCode: product.hsnCode || "",
            taxableValue: toRupees(line.taxable),
            cgst: toRupees(gst.cgst),
            sgst: toRupees(gst.sgst),
            igst: toRupees(gst.igst),
            lineTotal: toRupees(line.total),
          });
        }

        // Stock in + moving-average cost (GST is input credit, so cost is before GST).
        // Read-then-write is safe here: the transaction retries on a write conflict.
        for (const [id, { qty, costP }] of intake) {
          const product = byId.get(id);
          const stockBefore = Math.max(0, addStock ? product.stock : product.stock - qty);
          const newCostP = Math.round((stockBefore * toPaise(product.costPrice) + costP) / (stockBefore + qty));
          const set = { costPrice: toRupees(newCostP) };
          await Product.updateOne(
            { _id: product._id },
            addStock
              ? [{ $set: { ...set, stock: { $round: [{ $add: ["$stock", qty] }, 3] } } }]
              : { $set: set },
            { session }
          );
        }

        const grandP = sums.total;
        const paidP = toPaise(amountPaid);
        if (paidP < 0 || paidP > grandP) {
          throw ApiError.badRequest(`Amount paid must be between ₹0 and the bill total ₹${toRupees(grandP)}`);
        }
        if (paidP > 0 && !paymentMethod) throw ApiError.badRequest("Say how the paid amount was paid");
        const dueP = grandP - paidP;
        const billDay = new Date(billDate);

        const billNumber = await nextDocumentNumber({ ...BILL_SERIES, session });
        [bill] = await PurchaseBill.create(
          [
            {
              billNumber,
              supplierInvoiceNo: invoiceNo,
              billDate: billDay,
              vendor: vendor._id,
              supplier: { name: vendor.name, gstin: vendor.gstin || "", stateCode: supplierState },
              purchaseOrder: po?._id ?? null,
              poNumber: po?.poNumber ?? "",
              stockAdded: addStock,
              items: lines,
              subtotal: toRupees(sums.raw),
              discountTotal: toRupees(sums.discount),
              taxableTotal: toRupees(sums.taxable),
              cgstTotal: toRupees(sums.cgst),
              sgstTotal: toRupees(sums.sgst),
              igstTotal: toRupees(sums.igst),
              taxTotal: toRupees(sums.tax),
              grandTotal: toRupees(grandP),
              interState,
              paidAtBill: toRupees(paidP),
              paymentMethod: paidP > 0 ? paymentMethod : "",
              amountPaid: toRupees(paidP),
              balanceDue: toRupees(dueP),
              dueDate: dueP > 0 ? (dueDate ? new Date(dueDate) : new Date(billDay.getTime() + (vendor.paymentTermsDays ?? 30) * DAY)) : null,
              paymentStatus: dueP === 0 ? "PAID" : paidP === 0 ? "UNPAID" : "PARTIAL",
              notes,
              createdBy: userId,
            },
          ],
          { session }
        );

        if (dueP > 0) await bumpOutstanding(vendor._id, toRupees(dueP), session);

        if (po && po.status === "approved") {
          po.status = "received";
          po.receivedAt = new Date();
          await po.save({ session });
        }
      });
    } finally {
      await session.endSession();
    }
    return bill;
  }

  /**
   * Cancel a bill entered by mistake. Not allowed once a supplier payment
   * has been applied to it, or if its stock has already been sold.
   */
  async cancelBill(id, reason, userId) {
    const session = await mongoose.startSession();
    let bill;
    try {
      await session.withTransaction(async () => {
        bill = await PurchaseBill.findById(id).session(session);
        if (!bill) throw ApiError.notFound("Purchase bill not found");
        if (bill.status !== "POSTED") throw ApiError.badRequest("This bill is already cancelled");
        if (toPaise(bill.amountPaid) !== toPaise(bill.paidAtBill)) {
          throw ApiError.badRequest("Payments have been made against this bill; it can't be cancelled");
        }

        if (bill.stockAdded) {
          for (const line of bill.items) {
            const back = await Product.updateOne(
              { _id: line.product, stock: { $gte: line.baseQuantity } },
              [{ $set: { stock: { $round: [{ $subtract: ["$stock", line.baseQuantity] }, 3] } } }],
              { session }
            );
            if (back.matchedCount === 0) {
              throw ApiError.badRequest(`Not enough "${line.name}" left in stock to undo this bill`);
            }
          }
          if (bill.purchaseOrder) {
            await PurchaseOrder.updateOne(
              { _id: bill.purchaseOrder, status: "received" },
              { $set: { status: "approved", receivedAt: null } },
              { session }
            );
          }
        }

        if (bill.balanceDue > 0) await bumpOutstanding(bill.vendor, -bill.balanceDue, session);
        bill.status = "CANCELLED";
        bill.cancelledAt = new Date();
        bill.cancelReason = reason;
        bill.balanceDue = 0;
        await bill.save({ session });
      });
    } finally {
      await session.endSession();
    }
    logger.info(`Purchase bill cancelled: ${bill.billNumber}`);
    await audit("bill-cancel-audit", {
      action: "UPDATE",
      entity: "PurchaseBill",
      entityId: String(bill._id),
      userId: String(userId),
      before: null,
      after: bill.toJSON(),
      metadata: { billNumber: bill.billNumber, statusChange: "POSTED → CANCELLED", reason },
    });
    return bill;
  }

  async listBills({ page = 1, limit = 20, vendor, status, paymentStatus, search } = {}) {
    const filter = {};
    if (vendor) filter.vendor = vendor;
    if (status) filter.status = status;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (search) {
      const rx = containsRegex(search);
      filter.$or = [{ billNumber: rx }, { supplierInvoiceNo: rx }, { "supplier.name": rx }, { poNumber: rx }];
    }
    const [bills, total] = await Promise.all([
      PurchaseBill.find(filter)
        .sort({ billDate: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select("-items")
        .lean(),
      PurchaseBill.countDocuments(filter),
    ]);
    return { bills, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getBill(id) {
    const bill = await PurchaseBill.findById(id).populate("createdBy", "name");
    if (!bill) throw ApiError.notFound("Purchase bill not found");
    const payments = await SupplierPayment.find({ "allocations.bill": bill._id })
      .sort({ paidAt: 1 })
      .select("paymentNumber paidAt method reference allocations");
    return {
      ...bill.toJSON(),
      payments: payments.map((p) => ({
        _id: p._id,
        paymentNumber: p.paymentNumber,
        paidAt: p.paidAt,
        method: p.method,
        reference: p.reference,
        amount: p.allocations.find((a) => String(a.bill) === String(bill._id))?.amount ?? 0,
      })),
    };
  }

  // ─── Payments ──────────────────────────────────────────

  async recordPayment(input, userId) {
    for (let attempt = 1; ; attempt++) {
      try {
        const payment = await this._paymentTransaction(input, userId);
        logger.info(`Supplier payment: ${payment.paymentNumber}`, { vendor: String(payment.vendor), amount: payment.amount });
        await audit("supplier-payment-audit", {
          action: "PAYMENT",
          entity: "Vendor",
          entityId: String(payment.vendor),
          userId: String(userId),
          before: null,
          after: payment.toJSON(),
          metadata: { paymentNumber: payment.paymentNumber, amount: payment.amount },
        });
        return payment;
      } catch (error) {
        if (attempt < 3 && duplicateOn(error, "paymentNumber")) {
          await resyncCounter(PAYMENT_SERIES);
          continue;
        }
        throw error;
      }
    }
  }

  /** @private */
  async _paymentTransaction({ vendor: vendorId, amount, method, reference = "", paidAt, notes = "", allocations }, userId) {
    const session = await mongoose.startSession();
    let payment;
    try {
      await session.withTransaction(async () => {
        const vendor = await Vendor.findById(vendorId).session(session);
        if (!vendor) throw ApiError.notFound("Supplier not found");

        const amountP = toPaise(amount);
        if (amountP <= 0) throw ApiError.badRequest("Payment amount must be more than ₹0");

        const open = await PurchaseBill.find(openBillFilter(vendor._id))
          .sort({ dueDate: 1, billDate: 1 })
          .session(session);
        const totalDueP = open.reduce((s, b) => s + toPaise(b.balanceDue), 0);
        if (amountP > totalDueP) {
          throw ApiError.badRequest(`Payment of ₹${toRupees(amountP)} is more than the ₹${toRupees(totalDueP)} owed to ${vendor.name}`);
        }

        let plan;
        if (allocations?.length) {
          const byId = new Map(open.map((b) => [String(b._id), b]));
          plan = allocations.map((a) => {
            const bill = byId.get(String(a.bill));
            if (!bill) throw ApiError.badRequest("An allocated bill is not an unpaid bill of this supplier");
            const p = toPaise(a.amount);
            if (p <= 0 || p > toPaise(bill.balanceDue)) {
              throw ApiError.badRequest(`₹${toRupees(p)} can't be applied to ${bill.billNumber}: ₹${bill.balanceDue} is due on it`);
            }
            return { bill, amountP: p };
          });
          if (new Set(plan.map((x) => String(x.bill._id))).size !== plan.length) {
            throw ApiError.badRequest("A bill appears twice in the allocation");
          }
          const allocatedP = plan.reduce((s, x) => s + x.amountP, 0);
          if (allocatedP !== amountP) {
            throw ApiError.badRequest(`Allocated ₹${toRupees(allocatedP)} doesn't match the payment of ₹${toRupees(amountP)}`);
          }
        } else {
          plan = [];
          let leftP = amountP;
          for (const bill of open) {
            if (leftP === 0) break;
            const p = Math.min(leftP, toPaise(bill.balanceDue));
            plan.push({ bill, amountP: p });
            leftP -= p;
          }
        }

        for (const { bill, amountP: p } of plan) {
          const dueAfterP = toPaise(bill.balanceDue) - p;
          bill.balanceDue = toRupees(dueAfterP);
          bill.amountPaid = toRupees(toPaise(bill.amountPaid) + p);
          bill.paymentStatus = dueAfterP === 0 ? "PAID" : "PARTIAL";
          await bill.save({ session });
        }
        await bumpOutstanding(vendor._id, -toRupees(amountP), session);

        const paymentNumber = await nextDocumentNumber({ ...PAYMENT_SERIES, session });
        [payment] = await SupplierPayment.create(
          [
            {
              paymentNumber,
              vendor: vendor._id,
              amount: toRupees(amountP),
              method,
              reference,
              paidAt: paidAt ?? new Date(),
              notes,
              allocations: plan.map(({ bill, amountP: p }) => ({
                bill: bill._id,
                billNumber: bill.billNumber,
                supplierInvoiceNo: bill.supplierInvoiceNo,
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

  /** A supplier's unpaid bills, oldest due first. */
  async openBills(vendorId) {
    const now = Date.now();
    const bills = await PurchaseBill.find(openBillFilter(vendorId))
      .sort({ dueDate: 1, billDate: 1 })
      .select("billNumber supplierInvoiceNo billDate dueDate grandTotal amountPaid balanceDue paymentStatus");
    return bills.map((b) => ({
      ...b.toJSON(),
      daysOverdue: b.dueDate && b.dueDate.getTime() < now ? Math.floor((now - b.dueDate.getTime()) / DAY) : 0,
    }));
  }

  listPayments(vendorId) {
    return SupplierPayment.find(vendorId ? { vendor: vendorId } : {})
      .sort({ paidAt: -1 })
      .limit(200)
      .populate("vendor", "name")
      .populate("createdBy", "name");
  }

  /**
   * Supplier statement. `billed` raises what we owe, `paid` lowers it;
   * balance is what we owe after each entry.
   */
  async ledger(vendorId) {
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) throw ApiError.notFound("Supplier not found");

    const [bills, payments] = await Promise.all([
      PurchaseBill.find({ vendor: vendorId, status: "POSTED" }).sort({ billDate: 1 }),
      SupplierPayment.find({ vendor: vendorId }).sort({ paidAt: 1 }),
    ]);

    const entries = [];
    for (const b of bills) {
      entries.push({
        date: b.billDate,
        type: "BILL",
        ref: b.billNumber,
        refId: b._id,
        description: `Bill ${b.supplierInvoiceNo}${b.dueDate ? ` · due ${b.dueDate.toISOString().slice(0, 10)}` : ""}`,
        billedP: toPaise(b.grandTotal),
        paidP: 0,
      });
      if (b.paidAtBill > 0) {
        entries.push({
          date: b.billDate,
          type: "PAYMENT",
          ref: b.billNumber,
          refId: b._id,
          description: `Paid with bill (${b.paymentMethod})`,
          billedP: 0,
          paidP: toPaise(b.paidAtBill),
        });
      }
    }
    for (const p of payments) {
      entries.push({
        date: p.paidAt,
        type: "PAYMENT",
        ref: p.paymentNumber,
        refId: p._id,
        description: `Payment (${p.method}${p.reference ? ` · ${p.reference}` : ""}) against ${p.allocations
          .map((a) => a.supplierInvoiceNo || a.billNumber)
          .join(", ")}`,
        billedP: 0,
        paidP: toPaise(p.amount),
      });
    }
    const order = { BILL: 0, PAYMENT: 1 };
    entries.sort((a, b) => a.date - b.date || order[a.type] - order[b.type]);

    let balanceP = 0;
    const rows = entries.map((e) => {
      balanceP += e.billedP - e.paidP;
      return {
        date: e.date,
        type: e.type,
        ref: e.ref,
        refId: e.refId,
        description: e.description,
        billed: toRupees(e.billedP),
        paid: toRupees(e.paidP),
        balance: toRupees(balanceP),
      };
    });

    const open = await this.openBills(vendorId);
    const overdueP = open.filter((b) => b.daysOverdue > 0).reduce((s, b) => s + toPaise(b.balanceDue), 0);
    return {
      vendor: {
        _id: vendor._id,
        name: vendor.name,
        phone: vendor.phone,
        email: vendor.email,
        gstin: vendor.gstin,
        paymentTermsDays: vendor.paymentTermsDays ?? 30,
        outstanding: vendor.outstanding ?? 0,
      },
      closing: toRupees(balanceP),
      overdue: toRupees(overdueP),
      entries: rows,
      openBills: open,
    };
  }

  /**
   * Everyone we owe, by how far past the due date.
   * Buckets: not yet due, 1–30, 31–60, 61–90, 90+ days overdue; plus what
   * falls due in the next 7 days, to plan cash.
   */
  async report() {
    const now = new Date();
    const daysLate = { $divide: [{ $subtract: [now, { $ifNull: ["$dueDate", now] }] }, DAY] };
    const bucket = (min, max) => ({
      $sum: {
        $cond: [{ $and: [{ $gt: [daysLate, min] }, max === null ? true : { $lte: [daysLate, max] }] }, "$balanceDue", 0],
      },
    });

    const rows = await PurchaseBill.aggregate([
      { $match: { status: "POSTED", balanceDue: { $gt: 0 } } },
      {
        $group: {
          _id: "$vendor",
          outstanding: { $sum: "$balanceDue" },
          current: { $sum: { $cond: [{ $lte: [daysLate, 0] }, "$balanceDue", 0] } },
          dueThisWeek: { $sum: { $cond: [{ $and: [{ $lte: [daysLate, 0] }, { $gt: [daysLate, -7] }] }, "$balanceDue", 0] } },
          d1_30: bucket(0, 30),
          d31_60: bucket(30, 60),
          d61_90: bucket(60, 90),
          d90_plus: bucket(90, null),
          bills: { $sum: 1 },
          nextDue: { $min: "$dueDate" },
        },
      },
      { $lookup: { from: "vendors", localField: "_id", foreignField: "_id", as: "vendor" } },
      { $unwind: "$vendor" },
      {
        $project: {
          _id: 0,
          vendorId: "$_id",
          name: "$vendor.name",
          phone: "$vendor.phone",
          bills: 1,
          nextDue: 1,
          outstanding: { $round: ["$outstanding", 2] },
          current: { $round: ["$current", 2] },
          dueThisWeek: { $round: ["$dueThisWeek", 2] },
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
        dueThisWeek: sum("dueThisWeek"),
        d1_30: sum("d1_30"),
        d31_60: sum("d31_60"),
        d61_90: sum("d61_90"),
        d90_plus: sum("d90_plus"),
        overdue: toRupees(["d1_30", "d31_60", "d61_90", "d90_plus"].reduce((s, k) => s + toPaise(sum(k)), 0)),
        vendors: rows.length,
      },
      vendors: rows,
    };
  }
}

export default new PayableService();
