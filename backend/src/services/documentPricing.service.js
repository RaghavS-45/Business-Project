import Product from "../models/Product.js";
import ApiError from "../utils/ApiError.js";
import { getTier } from "../utils/loyalty.js";
import { priceLine, toPaise, toRupees } from "../utils/pricing.js";
import { splitTax, stateInfo, stateFromGstin } from "../utils/gst.js";
import { sellingUnit, validQuantity, allowsDecimal, resolveLine } from "../utils/unitPricing.js";

/**
 * Prices a list of lines for a buyer exactly the way checkout does (price
 * level, bulk slabs, pack prices, loyalty, GST split), without touching
 * stock. Used by quotations and delivery challans so the numbers on them
 * match the invoice they turn into.
 */

/** Seller details as printed on documents. */
export const sellerSnapshot = (store) => ({
  legalName: store.legalName,
  tradeName: store.tradeName,
  gstin: store.gstin,
  stateCode: store.stateCode,
  address: store.address,
  phone: store.phone,
  email: store.email,
  bankDetails: store.bankDetails,
  invoiceTerms: store.invoiceTerms,
});

/** Buyer details as printed on documents. */
export const buyerSnapshot = (customer, fallback = {}) => {
  if (!customer) {
    return {
      name: fallback.name ?? "",
      gstin: "",
      stateCode: "",
      address: fallback.address ?? "",
      phone: fallback.phone ?? "",
    };
  }
  return {
    name: customer.name,
    gstin: customer.gstin || "",
    stateCode: stateFromGstin(customer.gstin) || customer.stateCode || "",
    address: [customer.address?.street, customer.address?.city, customer.address?.state, customer.address?.pincode]
      .filter(Boolean)
      .join(", "),
    phone: customer.phone || "",
  };
};

/**
 * @param {Array}  items     - [{ product, quantity, unit?, discountPercent? }]
 * @param {Object} ctx
 * @param {Object} [ctx.customer]   - Customer document (or null)
 * @param {Object} ctx.store        - StoreSettings
 * @param {number} [ctx.maxDiscount] - highest item discount % allowed
 * @param {ClientSession} [ctx.session]
 * @returns {{ items: Array, totals: Object }}
 */
export async function priceDocument(items, { customer = null, store, maxDiscount = 100, session = null }) {
  const ids = [...new Set(items.map((i) => String(i.product)))];
  const products = await Product.find({ _id: { $in: ids } }).session(session);
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const tier = customer ? getTier(customer.loyaltyPoints ?? 0) : null;
  const loyaltyPercent = tier?.discount ?? 0;
  const pricing = { taxInclusive: Boolean(store.pricesIncludeTax) };
  const buyerState = stateFromGstin(customer?.gstin) || customer?.stateCode || "";
  const placeOfSupply = stateInfo(buyerState || store.stateCode);
  const interState = Boolean(store.stateCode && placeOfSupply && placeOfSupply.code !== store.stateCode);

  const sums = { raw: 0, discount: 0, loyalty: 0, taxable: 0, tax: 0, total: 0, cgst: 0, sgst: 0, igst: 0 };
  const lines = [];

  for (const item of items) {
    const product = byId.get(String(item.product));
    if (!product) throw ApiError.notFound(`Product not found: ${item.product}`);
    if (!product.isActive) throw ApiError.badRequest(`Product is inactive: ${product.name}`);

    const discountPercent = item.discountPercent || 0;
    if (discountPercent < 0 || discountPercent > maxDiscount) {
      throw ApiError.badRequest(`Discount on "${product.name}" can be at most ${maxDiscount}%`);
    }

    const unit = sellingUnit(product, item.unit);
    if (!unit) throw ApiError.badRequest(`"${product.name}" isn't sold by the ${item.unit}`);
    if (!validQuantity(product, unit, item.quantity)) {
      throw ApiError.badRequest(
        `Quantity ${item.quantity} isn't valid for "${product.name}": ` +
          (unit.isBase && allowsDecimal(product.unit)
            ? "use at most 3 decimals"
            : `${unit.name} is sold in whole numbers`)
      );
    }

    const resolved = resolveLine(product, {
      unit: unit.name,
      quantity: item.quantity,
      level: customer?.priceLevel ?? "RETAIL",
    });
    const taxPercent = product.taxRate ?? 0;
    const line = priceLine(
      { quantity: item.quantity, unitPrice: resolved.unitPrice, discountPercent, taxPercent },
      loyaltyPercent,
      pricing
    );
    const gst = splitTax(line.tax, interState);

    sums.raw += line.raw;
    sums.discount += line.discount;
    sums.loyalty += line.loyalty;
    sums.taxable += line.taxable;
    sums.tax += line.tax;
    sums.total += line.total;
    sums.cgst += gst.cgst;
    sums.sgst += gst.sgst;
    sums.igst += gst.igst;

    lines.push({
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
      discountPercent,
      taxPercent,
      hsnCode: product.hsnCode || "",
      taxableValue: toRupees(line.taxable),
      cgst: toRupees(gst.cgst),
      sgst: toRupees(gst.sgst),
      igst: toRupees(gst.igst),
      lineTotal: toRupees(line.total),
    });
  }

  return {
    items: lines,
    products: byId,
    totals: {
      subtotal: toRupees(sums.raw),
      discountTotal: toRupees(sums.discount),
      loyaltyTier: tier?.name ?? null,
      loyaltyDiscountPercent: loyaltyPercent,
      loyaltyDiscountTotal: toRupees(sums.loyalty),
      taxableTotal: toRupees(sums.taxable),
      taxTotal: toRupees(sums.tax),
      cgstTotal: toRupees(sums.cgst),
      sgstTotal: toRupees(sums.sgst),
      igstTotal: toRupees(sums.igst),
      grandTotal: toRupees(sums.total),
      pricesIncludeTax: pricing.taxInclusive,
      interState,
      placeOfSupply: placeOfSupply ?? { code: "", name: "" },
    },
  };
}

/** Same paise-safe sum used across services. */
export const sumRupees = (values) => toRupees(values.reduce((s, v) => s + toPaise(v), 0));
