import mongoose from "mongoose";
import DeliveryChallan from "../models/DeliveryChallan.js";
import Quotation from "../models/Quotation.js";
import Customer from "../models/Customer.js";
import Product from "../models/Product.js";
import ApiError from "../utils/ApiError.js";
import logger from "../config/logger.js";
import { nextDocumentNumber, resyncCounter } from "../utils/documentNumber.js";
import { containsRegex } from "../utils/search.js";
import settingsService from "./settings.service.js";
import saleService from "./sale.service.js";
import { priceDocument, sellerSnapshot, buyerSnapshot } from "./documentPricing.service.js";

/**
 * Delivery challans — goods dispatched now, invoiced later.
 *
 *   create()   takes the stock (same $gte guard as checkout) and numbers the challan
 *   invoice()  raises the invoice through normal checkout, without taking stock again
 *   cancel()   goods came back: stock restored
 */

const CHALLAN_SERIES = { series: "DC", counter: "challan", model: DeliveryChallan, field: "challanNumber" };
const isDuplicate = (e) => e?.code === 11000 && /challanNumber/.test(JSON.stringify(e.keyPattern ?? e.message));

class ChallanService {
  async create(input, user) {
    for (let attempt = 1; ; attempt++) {
      try {
        const challan = await this._create(input, user);
        logger.info(`Delivery challan created: ${challan.challanNumber}`, { items: challan.items.length });
        return challan;
      } catch (error) {
        if (attempt < 3 && isDuplicate(error)) {
          await resyncCounter(CHALLAN_SERIES);
          continue;
        }
        throw error;
      }
    }
  }

  /** @private */
  async _create(
    { customer: customerId, quotation: quotationId, items, deliveryAddress = "", vehicleNumber = "", transporter = "", notes = "" },
    user
  ) {
    const session = await mongoose.startSession();
    let challan;
    try {
      await session.withTransaction(async () => {
        // From a quotation: its customer and lines (quantities, units, discounts)
        let quote = null;
        let lines = items;
        if (quotationId) {
          quote = await Quotation.findById(quotationId).session(session);
          if (!quote) throw ApiError.notFound("Quotation not found");
          if (!["OPEN", "ACCEPTED"].includes(quote.status)) {
            throw ApiError.badRequest(`Quotation ${quote.quoteNumber} is ${quote.status.toLowerCase()}`);
          }
          if (quote.customer && customerId && String(quote.customer) !== String(customerId)) {
            throw ApiError.badRequest("The challan must be for the quotation's customer");
          }
          customerId = customerId ?? quote.customer;
          lines = quote.items.map((i) => ({
            product: i.product,
            quantity: i.quantity,
            unit: i.unit,
            discountPercent: i.discountPercent,
          }));
        }
        if (!lines?.length) throw ApiError.badRequest("Add at least one item");
        if (!customerId) throw ApiError.badRequest("Choose the customer the goods are going to");

        const customer = await Customer.findById(customerId).session(session);
        if (!customer) throw ApiError.notFound("Customer not found");

        const store = await settingsService.get(session);
        const priced = await priceDocument(lines, { customer, store, session });

        // Goods leave now: take the stock
        for (const line of priced.items) {
          const taken = await Product.updateOne(
            { _id: line.product, isActive: true, stock: { $gte: line.baseQuantity } },
            [{ $set: { stock: { $round: [{ $subtract: ["$stock", line.baseQuantity] }, 3] } } }],
            { session }
          );
          if (taken.matchedCount === 0) {
            const p = priced.products.get(String(line.product));
            throw ApiError.badRequest(
              `Insufficient stock for "${line.name}": needs ${line.baseQuantity} ${line.baseUnit}, ` +
                `available ${p?.stock ?? 0} ${line.baseUnit}`
            );
          }
        }

        const buyer = buyerSnapshot(customer);
        const challanNumber = await nextDocumentNumber({ ...CHALLAN_SERIES, session });
        [challan] = await DeliveryChallan.create(
          [
            {
              challanNumber,
              customer: customer._id,
              buyer,
              seller: sellerSnapshot(store),
              items: priced.items,
              ...priced.totals,
              deliveryAddress: deliveryAddress || buyer.address,
              vehicleNumber,
              transporter,
              quotation: quote?._id ?? null,
              quoteNumber: quote?.quoteNumber ?? "",
              notes,
              createdBy: user._id,
            },
          ],
          { session }
        );

        if (quote) {
          quote.status = "CONVERTED";
          quote.convertedTo = { kind: "CHALLAN", id: challan._id, number: challanNumber, at: new Date() };
          await quote.save({ session });
        }
      });
    } finally {
      await session.endSession();
    }
    return challan;
  }

  /**
   * Raise the invoice for an open challan. Goes through normal checkout (same
   * numbering, GST, credit limit, loyalty) with the challan's lines; stock is
   * not taken again.
   */
  async invoice(id, { paymentMethod, amountPaid, notes = "" }, user) {
    const challan = await DeliveryChallan.findById(id);
    if (!challan) throw ApiError.notFound("Delivery challan not found");
    if (challan.status !== "OPEN") {
      throw ApiError.badRequest(`Challan ${challan.challanNumber} is already ${challan.status.toLowerCase()}`);
    }
    const items = challan.items.map((i) => ({
      product: String(i.product),
      quantity: i.quantity,
      unit: i.unit,
      discountPercent: i.discountPercent,
    }));
    return saleService.checkout(
      items,
      String(challan.customer),
      paymentMethod,
      user,
      notes || `Against delivery challan ${challan.challanNumber}`,
      { amountPaid, challanId: challan._id }
    );
  }

  /** Goods came back before invoicing: restore the stock. */
  async cancel(id, reason = "") {
    const session = await mongoose.startSession();
    let challan;
    try {
      await session.withTransaction(async () => {
        challan = await DeliveryChallan.findById(id).session(session);
        if (!challan) throw ApiError.notFound("Delivery challan not found");
        if (challan.status !== "OPEN") {
          throw ApiError.badRequest(`Only open challans can be cancelled (this one is ${challan.status.toLowerCase()})`);
        }
        for (const line of challan.items) {
          await Product.updateOne(
            { _id: line.product },
            [{ $set: { stock: { $round: [{ $add: ["$stock", line.baseQuantity] }, 3] } } }],
            { session }
          );
        }
        challan.status = "CANCELLED";
        challan.cancelledAt = new Date();
        challan.cancelReason = reason;
        await challan.save({ session });
      });
    } finally {
      await session.endSession();
    }
    logger.info(`Delivery challan cancelled: ${challan.challanNumber}`);
    return challan;
  }

  async list({ page = 1, limit = 20, status, customer, search } = {}) {
    const filter = {};
    if (status) filter.status = status;
    if (customer) filter.customer = customer;
    if (search) {
      const rx = containsRegex(search);
      filter.$or = [{ challanNumber: rx }, { "buyer.name": rx }, { invoiceNumber: rx }];
    }
    const [challans, total] = await Promise.all([
      DeliveryChallan.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select("-seller")
        .lean(),
      DeliveryChallan.countDocuments(filter),
    ]);
    return { challans, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getById(id) {
    const challan = await DeliveryChallan.findById(id).populate("customer", "name phone").populate("createdBy", "name");
    if (!challan) throw ApiError.notFound("Delivery challan not found");
    return challan;
  }
}

export default new ChallanService();
