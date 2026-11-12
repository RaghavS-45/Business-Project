/**
 * Checkout pricing — all money maths in whole paise (integers).
 *
 * Kept in lock-step with backend/src/utils/pricing.js so the POS screen
 * shows exactly what the server charges. If you change one, change both.
 *
 * Per line, in this order, each amount rounded once to the nearest paisa:
 *   raw      = quantity × unit price
 *   discount = raw × item discount %
 *   loyalty  = (raw − discount) × loyalty tier %
 *   tax      = (raw − discount − loyalty) × tax %
 *   line     = raw − discount − loyalty + tax
 *
 * Cart totals are plain sums of the per-line integers, so the summary rows
 * always add up to the grand total, and the lines always add up too.
 */

export interface PricingItem {
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  taxPercent?: number;
}

export interface PricedLine {
  raw: number;
  discount: number;
  loyalty: number;
  tax: number;
  total: number;
}

/**
 * Round to the nearest integer, half up, ignoring float noise
 * (e.g. 100.49999999999999 that should be 100.5).
 */
const roundHalfUp = (x: number) => Math.round(Math.round(x * 1e6) / 1e6);

/** Rupees (may be fractional) → whole paise. */
export const toPaise = (rupees: number) => roundHalfUp((Number(rupees) || 0) * 100);

/** Whole paise → rupees with at most 2 decimals. */
export const toRupees = (paise: number) => paise / 100;

/** Round a rupee amount to 2 decimals safely (1.005 → 1.01). */
export const roundMoney = (rupees: number) => toRupees(toPaise(rupees));

export function priceLine(
  { quantity, unitPrice, discountPercent = 0, taxPercent = 0 }: PricingItem,
  loyaltyPercent = 0
): PricedLine {
  const raw = roundHalfUp(quantity * toPaise(unitPrice));
  const discount = roundHalfUp((raw * discountPercent) / 100);
  const loyalty = roundHalfUp(((raw - discount) * loyaltyPercent) / 100);
  const tax = roundHalfUp(((raw - discount - loyalty) * taxPercent) / 100);
  return { raw, discount, loyalty, tax, total: raw - discount - loyalty + tax };
}

export function priceCart(items: PricingItem[], loyaltyPercent = 0) {
  const lines = items.map((item) => priceLine(item, loyaltyPercent));
  const sum = (key: keyof PricedLine) => lines.reduce((s, l) => s + l[key], 0);
  return {
    lines,
    subtotal: sum("raw"),
    discount: sum("discount"),
    loyalty: sum("loyalty"),
    tax: sum("tax"),
    grandTotal: sum("total"),
  };
}

/** 1 loyalty point per full ₹100 of the grand total. */
export const pointsForPaise = (grandTotalPaise: number) => Math.floor(grandTotalPaise / 10000);

/** "₹1,234.50" — always two decimals, Indian digit grouping. */
export const formatINR = (rupees: number) =>
  `₹${(rupees || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
