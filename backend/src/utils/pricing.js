/**
 * Checkout pricing — all money maths in whole paise (integers).
 *
 * Kept in lock-step with frontend/src/lib/pricing.ts so the POS screen
 * shows exactly what the server charges. If you change one, change both.
 *
 * Per line, in this order, each amount rounded once to the nearest paisa:
 *   raw      = quantity × unit price
 *   discount = raw × item discount %
 *   loyalty  = (raw − discount) × loyalty tier %
 *   net      = raw − discount − loyalty
 *
 *   GST-exclusive prices (default — wholesale / B2B):
 *     taxable = net,   tax = taxable × rate %,   line = taxable + tax
 *   GST-inclusive prices (MRP-style retail):
 *     line = net,   taxable = net × 100 / (100 + rate),   tax = line − taxable
 *
 * Cart totals are plain sums of the per-line integers, so
 *   subtotal − discount − loyalty + tax  ===  sum of line totals  ===  grand total
 * always holds exactly.
 */

/**
 * Round to the nearest integer, half up, ignoring float noise
 * (e.g. 100.49999999999999 that should be 100.5).
 */
const roundHalfUp = (x) => Math.round(Math.round(x * 1e6) / 1e6);

/** Rupees (may be fractional) → whole paise. */
export const toPaise = (rupees) => roundHalfUp((Number(rupees) || 0) * 100);

/** Whole paise → rupees with at most 2 decimals. */
export const toRupees = (paise) => paise / 100;

/** Round a rupee amount to 2 decimals safely (1.005 → 1.01). */
export const roundMoney = (rupees) => toRupees(toPaise(rupees));

/**
 * Price a single line. All returned amounts are integers in paise.
 */
export function priceLine(
  { quantity, unitPrice, discountPercent = 0, taxPercent = 0 },
  loyaltyPercent = 0,
  { taxInclusive = false } = {}
) {
  const raw = roundHalfUp(quantity * toPaise(unitPrice));
  const discount = roundHalfUp((raw * discountPercent) / 100);
  const loyalty = roundHalfUp(((raw - discount) * loyaltyPercent) / 100);
  const net = raw - discount - loyalty;
  if (taxInclusive) {
    const taxable = roundHalfUp((net * 100) / (100 + taxPercent));
    return { raw, discount, loyalty, taxable, tax: net - taxable, total: net };
  }
  const tax = roundHalfUp((net * taxPercent) / 100);
  return { raw, discount, loyalty, taxable: net, tax, total: net + tax };
}

/**
 * Price a whole cart. Totals are integers in paise.
 */
export function priceCart(items, loyaltyPercent = 0, options = {}) {
  const lines = items.map((item) => priceLine(item, loyaltyPercent, options));
  const sum = (key) => lines.reduce((s, l) => s + l[key], 0);
  return {
    lines,
    subtotal: sum("raw"),
    discount: sum("discount"),
    loyalty: sum("loyalty"),
    taxable: sum("taxable"),
    tax: sum("tax"),
    grandTotal: sum("total"),
  };
}

/** 1 loyalty point per full ₹100 of the grand total. */
export const pointsForPaise = (grandTotalPaise) => Math.floor(grandTotalPaise / 10000);
