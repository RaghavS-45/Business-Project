/**
 * Selling units and price resolution.
 *
 * Kept in lock-step with backend/src/utils/unitPricing.js so the POS shows
 * exactly the price the server charges. If you change one, change both.
 *
 * - Stock is always kept in the product's base unit (pcs, kg, ...).
 * - A product can also be sold in packs: { name: "carton", size: 12, price? }
 *   — size is in base units; price (optional) is per pack.
 * - Price per base unit = the customer's price level (Retail = selling price,
 *   Wholesale, Distributor), lowered by a bulk slab if the quantity reaches it.
 * - The customer always gets the lowest applicable price.
 */

export interface PricedProduct {
  unit: string;
  sellingPrice: number;
  packs?: Array<{ name: string; size: number; price?: number | null }>;
  levelPrices?: { wholesale?: number | null; distributor?: number | null };
  priceSlabs?: Array<{ minQty: number; price: number }>;
}

export type PriceLevel = "RETAIL" | "WHOLESALE" | "DISTRIBUTOR";

export interface SellingUnit {
  name: string;
  size: number;
  price: number | null;
  isBase: boolean;
}

/** Units that can be sold in fractions (2.5 kg). Everything else is whole units. */
export const DECIMAL_UNITS = ["kg", "g", "ltr", "ml", "m"];
export const PRICE_LEVELS: PriceLevel[] = ["RETAIL", "WHOLESALE", "DISTRIBUTOR"];
export const LEVEL_LABELS: Record<PriceLevel, string> = { RETAIL: "Retail", WHOLESALE: "Wholesale", DISTRIBUTOR: "Distributor" };

export const allowsDecimal = (unit: string) => DECIMAL_UNITS.includes(unit);

/** Quantities are kept to 3 decimals (grams of a kg). */
export const roundQty = (q: number) => Math.round((Number(q) || 0) * 1000) / 1000;

const roundMoney = (rupees: number) => Math.round(Math.round(rupees * 100 * 1e6) / 1e6) / 100;

/**
 * The unit a line is sold in: the base unit, or one of the product's packs.
 * Returns null if the product has no such unit.
 */
export function sellingUnit(product: PricedProduct, unitName?: string | null): SellingUnit | null {
  if (!unitName || unitName === product.unit) {
    return { name: product.unit, size: 1, price: null, isBase: true };
  }
  const pack = (product.packs ?? []).find((p) => p.name === unitName);
  return pack ? { name: pack.name, size: pack.size, price: pack.price ?? null, isBase: false } : null;
}

/** Whether `quantity` is allowed for this unit (whole numbers unless loose). */
export function validQuantity(product: PricedProduct, unit: SellingUnit, quantity: number) {
  if (!(quantity > 0)) return false;
  if (roundQty(quantity) !== quantity) return false; // max 3 decimals
  const decimalOk = unit.isBase && allowsDecimal(product.unit);
  return decimalOk || Number.isInteger(quantity);
}

/**
 * Price per base unit for a customer's price level and a quantity (in base
 * units), with where the price came from.
 */
export function baseUnitPrice(product: PricedProduct, level: PriceLevel = "RETAIL", baseQty = 0) {
  const levelPrice =
    level === "WHOLESALE"
      ? product.levelPrices?.wholesale
      : level === "DISTRIBUTOR"
        ? product.levelPrices?.distributor
        : null;

  let price: number = product.sellingPrice;
  let source = "Retail";
  if (levelPrice !== null && levelPrice !== undefined && levelPrice < price) {
    price = levelPrice;
    source = LEVEL_LABELS[level];
  }

  // Highest slab reached by this quantity
  const slab = (product.priceSlabs ?? [])
    .filter((s) => baseQty >= s.minQty)
    .sort((a, b) => b.minQty - a.minQty)[0];
  if (slab && slab.price < price) {
    price = slab.price;
    source = `Bulk ${slab.minQty}+ ${product.unit}`;
  }
  return { price, source };
}

/**
 * Resolve one cart line: unit, base quantity and price per selling unit.
 *
 * @returns {{ unitName, unitSize, baseQty, unitPrice, priceSource } | null}
 *          null if the unit doesn't exist on the product
 */
export function resolveLine(
  product: PricedProduct,
  { unit, quantity, level = "RETAIL" }: { unit?: string | null; quantity: number; level?: PriceLevel }
) {
  const u = sellingUnit(product, unit);
  if (!u) return null;
  const baseQty = roundQty(quantity * u.size);
  const { price: perBase, source } = baseUnitPrice(product, level, baseQty);

  let unitPrice = roundMoney(perBase * u.size);
  let priceSource = source;
  if (u.price !== null && u.price < unitPrice) {
    unitPrice = u.price;
    priceSource = `${u.name} price`;
  }
  return { unitName: u.name, unitSize: u.size, baseQty, unitPrice, priceSource };
}
