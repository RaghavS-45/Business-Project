import { priceCart, pointsForPaise, toRupees } from "@/lib/pricing";

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

// Same maths as the backend (see lib/pricing.ts)
export function previewCart(items: PreviewItem[], points = 0) {
  const loyaltyPercent = getTier(points).discount;
  const t = priceCart(items, loyaltyPercent);
  return {
    loyaltyPercent,
    subtotal: toRupees(t.subtotal),
    discount: toRupees(t.discount),
    loyalty: toRupees(t.loyalty),
    tax: toRupees(t.tax),
    grandTotal: toRupees(t.grandTotal),
    pointsToEarn: pointsForPaise(t.grandTotal),
  };
}
