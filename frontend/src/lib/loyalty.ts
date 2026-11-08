export const TIERS = [
  { name: "Bronze",   min: 0,    discount: 0 },
  { name: "Silver",   min: 100,  discount: 5 },
  { name: "Gold",     min: 500,  discount: 8 },
  { name: "Platinum", min: 1000, discount: 10 },
] as const;

export type Tier = (typeof TIERS)[number];

export const getTier = (points = 0): Tier =>
  [...TIERS].reverse().find((t) => points >= t.min)!;

export const getNextTier = (points = 0): Tier | null =>
  TIERS.find((t) => t.min > points) ?? null;

type PreviewItem = {
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  taxPercent?: number;
};

// Same order as the backend: item discount, then loyalty, then tax
export function previewCart(items: PreviewItem[], points = 0) {
  const loyaltyPercent = getTier(points).discount;
  let subtotal = 0, discount = 0, loyalty = 0, tax = 0;

  for (const i of items) {
    const raw = i.quantity * i.unitPrice;
    const d = raw * ((i.discountPercent ?? 0) / 100);
    const l = (raw - d) * (loyaltyPercent / 100);
    const t = (raw - d - l) * ((i.taxPercent ?? 0) / 100);
    subtotal += raw; discount += d; loyalty += l; tax += t;
  }

  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    loyaltyPercent,
    subtotal: r(subtotal),
    discount: r(discount),
    loyalty: r(loyalty),
    tax: r(tax),
    grandTotal: r(subtotal - discount - loyalty + tax),
    pointsToEarn: Math.floor(r(subtotal - discount - loyalty + tax) / 100),
  };
}