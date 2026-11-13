import mongoose from "mongoose";
import Quotation from "../models/Quotation.js";
import Customer from "../models/Customer.js";
import ApiError from "../utils/ApiError.js";
import logger from "../config/logger.js";
import { nextDocumentNumber, resyncCounter } from "../utils/documentNumber.js";
import { containsRegex } from "../utils/search.js";
import settingsService from "./settings.service.js";
import { priceDocument, sellerSnapshot, buyerSnapshot } from "./documentPricing.service.js";

/**
 * Quotations — priced offers that move no stock and no money.
 *
 * Prices are worked out on the server with the same rules as checkout
 * (customer's price level, bulk slabs, pack prices, loyalty, GST), so the
 * quote total is what the invoice will be while prices stay the same.
 */

const QUOTE_SERIES = { series: "QT", counter: "quotation", model: Quotation, field: "quoteNumber" };
const DAY = 86_400_000;

const isDuplicate = (e) => e?.code === 11000 && /quoteNumber/.test(JSON.stringify(e.keyPattern ?? e.message));

/** A quote past its valid-until date that hasn't been settled. */
const expired = (q) => ["OPEN", "ACCEPTED"].includes(q.status) && new Date(q.validUntil).getTime() < Date.now();

const withExpiry = (q) => {
  const json = typeof q.toJSON === "function" ? q.toJSON() : q;
  return { ...json, isExpired: expired(json) };
};

class QuotationService {
  async create(input, user) {
    for (let attempt = 1; ; attempt++) {
      try {
        const quote = await this._create(input, user);
        logger.info(`Quotation created: ${quote.quoteNumber}`, { total: quote.grandTotal });
        return withExpiry(quote);
      } catch (error) {
        if (attempt < 3 && isDuplicate(error)) {
          await resyncCounter(QUOTE_SERIES);
          continue;
        }
        throw error;
      }
    }
  }

  /** @private */
  async _create({ customer: customerId, partyName, partyPhone, items, validDays = 15, notes = "" }, user) {
    const session = await mongoose.startSession();
    let quote;
    try {
      await session.withTransaction(async () => {
        const customer = customerId ? await Customer.findById(customerId).session(session) : null;
        if (customerId && !customer) throw ApiError.notFound("Customer not found");
        if (!customer && !partyName) throw ApiError.badRequest("Choose a customer or enter who the quote is for");

        const store = await settingsService.get(session);
        const priced = await priceDocument(items, { customer, store, session });
        const quoteNumber = await nextDocumentNumber({ ...QUOTE_SERIES, session });

        [quote] = await Quotation.create(
          [
            {
              quoteNumber,
              customer: customer?._id ?? null,
              buyer: buyerSnapshot(customer, { name: partyName, phone: partyPhone }),
              seller: sellerSnapshot(store),
              items: priced.items,
              ...priced.totals,
              validUntil: new Date(Date.now() + validDays * DAY),
              notes,
              createdBy: user._id,
            },
          ],
          { session }
        );
      });
    } finally {
      await session.endSession();
    }
    return quote;
  }

  async list({ page = 1, limit = 20, status, customer, search } = {}) {
    const filter = {};
    if (status === "EXPIRED") {
      filter.status = { $in: ["OPEN", "ACCEPTED"] };
      filter.validUntil = { $lt: new Date() };
    } else if (status) {
      filter.status = status;
    }
    if (customer) filter.customer = customer;
    if (search) {
      const rx = containsRegex(search);
      filter.$or = [{ quoteNumber: rx }, { "buyer.name": rx }];
    }
    const [rows, total] = await Promise.all([
      Quotation.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select("-seller")
        .lean(),
      Quotation.countDocuments(filter),
    ]);
    return {
      quotations: rows.map(withExpiry),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getById(id) {
    const quote = await Quotation.findById(id).populate("customer", "name phone priceLevel").populate("createdBy", "name");
    if (!quote) throw ApiError.notFound("Quotation not found");
    return withExpiry(quote);
  }

  /** OPEN ⇄ ACCEPTED, or → DECLINED. Converting happens through billing / challans. */
  async setStatus(id, status) {
    const quote = await Quotation.findById(id);
    if (!quote) throw ApiError.notFound("Quotation not found");
    const allowed = { OPEN: ["ACCEPTED", "DECLINED"], ACCEPTED: ["OPEN", "DECLINED"], DECLINED: ["OPEN"], CONVERTED: [] };
    if (!allowed[quote.status].includes(status)) {
      throw ApiError.badRequest(`A ${quote.status.toLowerCase()} quotation can't be marked ${status.toLowerCase()}`);
    }
    quote.status = status;
    await quote.save();
    return withExpiry(quote);
  }
}

export default new QuotationService();
