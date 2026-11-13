import type { PricedProduct } from "@/lib/unitPricing";

/** What the editors need from a product. */
export interface CatalogProduct extends PricedProduct {
  _id: string;
  name: string;
  sku: string;
  stock: number;
  costPrice: number;
  taxRate?: number;
  hsnCode?: string;
}

/**
 * One editable line. Numbers are kept as typed text so "2." or "0.25" can
 * be entered before they parse.
 */
export interface EditorLine {
  key: string;
  product: string;
  unit: string;
  quantity: string;
  discountPercent: string;
  /** Buying only: cost per unit (before GST) and GST rate */
  unitCost: string;
  taxPercent: string;
}

let nextKey = 0;
export const newLine = (partial: Partial<EditorLine> = {}): EditorLine => ({
  key: `l${nextKey++}`,
  product: "",
  unit: "",
  quantity: "1",
  discountPercent: "",
  unitCost: "",
  taxPercent: "",
  ...partial,
});

export const num = (v: string) => (v.trim() === "" ? 0 : Number(v));

/** Lines that are filled in enough to send. */
export const completeLines = (lines: EditorLine[]) => lines.filter((l) => l.product && num(l.quantity) > 0);

/** A saved customer as the sell-side forms need it. */
export interface BuyerCustomer {
  _id: string;
  name: string;
  phone?: string;
  priceLevel?: "RETAIL" | "WHOLESALE" | "DISTRIBUTOR";
  loyaltyPoints?: number;
  address?: { street?: string; city?: string; state?: string; pincode?: string };
}

/** Editor lines → API lines for selling documents. */
export const toSellLines = (lines: EditorLine[]) =>
  completeLines(lines).map((l) => ({
    product: l.product,
    quantity: num(l.quantity),
    unit: l.unit || undefined,
    discountPercent: num(l.discountPercent) || undefined,
  }));
