import { create } from "zustand";
import { getTier } from "@/lib/loyalty";
import { priceCart, priceLine, pointsForPaise, toRupees } from "@/lib/pricing";
import {
  allowsDecimal,
  resolveLine,
  roundQty,
  type PriceLevel,
  type PricedProduct,
} from "@/lib/unitPricing";

export type PaymentMethod = "CASH" | "CARD" | "UPI" | "OTHER" | "CREDIT";

export interface CartItem {
  /** One line per product + selling unit: `${product}:${unit}` */
  key: string;
  product: string; // product _id
  name: string;
  sku: string;
  /** Selling unit of this line ("pcs", "kg", "carton", ...) */
  unit: string;
  /** Base units per selling unit (1 for the base unit) */
  unitSize: number;
  /** Product's stock unit */
  baseUnit: string;
  /** What the price depends on (selling price, packs, level prices, slabs) */
  pricing: PricedProduct;
  costPrice: number;
  stock: number; // available stock in base units
  quantity: number; // in the selling unit
  discountPercent: number;
  taxPercent: number;
  image?: string;
}

export interface AddItemInput {
  product: string;
  name: string;
  sku: string;
  costPrice: number;
  stock: number;
  pricing: PricedProduct;
  /** Product's GST rate (defaults to 0) */
  taxPercent?: number;
  image?: string;
  /** Selling unit; defaults to the base unit */
  unit?: string;
}

interface CartState {
  items: CartItem[];
  selectedCustomer: string | null;
  customerName: string | null;
  customerLoyaltyPoints: number;
  /** Which product price the selected customer gets */
  priceLevel: PriceLevel;
  paymentMethod: PaymentMethod;
  notes: string;
  /** Store setting: selling prices already include GST. */
  taxInclusive: boolean;

  // Actions
  addItem: (item: AddItemInput) => void;
  removeItem: (key: string) => void;
  updateQuantity: (key: string, quantity: number) => void;
  /** Switch a line to another selling unit (pcs ⇄ carton) */
  setLineUnit: (key: string, unit: string) => void;
  updateDiscount: (key: string, discountPercent: number) => void;
  setCustomer: (
    customerId: string | null,
    customerName?: string | null,
    loyaltyPoints?: number,
    priceLevel?: PriceLevel
  ) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  setNotes: (notes: string) => void;
  setTaxInclusive: (taxInclusive: boolean) => void;
  clearCart: () => void;

  // Computed
  getSubtotal: () => number;
  getTaxTotal: () => number;
  /** Value GST is charged on (after discounts). */
  getTaxableTotal: () => number;
  getDiscountTotal: () => number;
  getGrandTotal: () => number;
  getLoyaltyPercent: () => number;
  getLoyaltyDiscountTotal: () => number;
  getPointsToEarn: () => number;
  /** Final price of one cart line (rupees), incl. discount, loyalty and tax. */
  getLineTotal: (key: string) => number;
  /** Price per selling unit for a line, and why ("Wholesale", "Bulk 50+ kg"). */
  getLinePrice: (key: string) => { unitPrice: number; priceSource: string };
}

const lineKey = (product: string, unit: string) => `${product}:${unit}`;

/** Loose units (kg, ltr) sold in the base unit can take decimals. */
export const isLooseLine = (item: Pick<CartItem, "unitSize" | "baseUnit">) =>
  item.unitSize === 1 && allowsDecimal(item.baseUnit);

/** Most of this line that stock allows, in its selling unit. */
export const maxQuantity = (item: CartItem) =>
  isLooseLine(item) ? roundQty(item.stock) : Math.floor(roundQty(item.stock / item.unitSize));

const clampQuantity = (item: CartItem, q: number) => {
  const min = isLooseLine(item) ? 0.001 : 1;
  const value = isLooseLine(item) ? roundQty(q) : Math.round(q);
  return Math.max(min, Math.min(value, maxQuantity(item)));
};

const linePrice = (item: CartItem, level: PriceLevel) =>
  resolveLine(item.pricing, { unit: item.unit, quantity: item.quantity, level }) ?? {
    unitPrice: item.pricing.sellingPrice * item.unitSize,
    priceSource: "Retail",
  };

/** Price the whole cart with the same paise-based maths the server uses. */
const priceState = (
  state: Pick<CartState, "items" | "selectedCustomer" | "customerLoyaltyPoints" | "taxInclusive" | "priceLevel">
) =>
  priceCart(
    state.items.map((i) => ({ ...i, unitPrice: linePrice(i, state.priceLevel).unitPrice })),
    state.selectedCustomer ? getTier(state.customerLoyaltyPoints).discount : 0,
    { taxInclusive: state.taxInclusive }
  );

export const useCartStore = create<CartState>()((set, get) => ({
  items: [],
  selectedCustomer: null,
  customerName: null,
  customerLoyaltyPoints: 0,
  priceLevel: "RETAIL",
  paymentMethod: "CASH",
  notes: "",
  taxInclusive: false,

  addItem: (input) =>
    set((state) => {
      const pack = input.unit ? input.pricing.packs?.find((p) => p.name === input.unit) : undefined;
      const unit = pack ? pack.name : input.pricing.unit;
      const key = lineKey(input.product, unit);
      const existing = state.items.find((i) => i.key === key);
      if (existing) {
        return {
          items: state.items.map((i) => (i.key === key ? { ...i, quantity: clampQuantity(i, i.quantity + 1) } : i)),
        };
      }
      const item: CartItem = {
        key,
        product: input.product,
        name: input.name,
        sku: input.sku,
        unit,
        unitSize: pack?.size ?? 1,
        baseUnit: input.pricing.unit,
        pricing: input.pricing,
        costPrice: input.costPrice,
        stock: input.stock,
        quantity: 1,
        discountPercent: 0,
        taxPercent: input.taxPercent ?? 0,
        image: input.image,
      };
      if (maxQuantity(item) < 1 && !isLooseLine(item)) return state; // not enough stock for one
      return { items: [...state.items, { ...item, quantity: clampQuantity(item, 1) }] };
    }),

  removeItem: (key) => set((state) => ({ items: state.items.filter((i) => i.key !== key) })),

  updateQuantity: (key, quantity) =>
    set((state) => ({
      items: state.items.map((i) => (i.key === key ? { ...i, quantity: clampQuantity(i, quantity) } : i)),
    })),

  setLineUnit: (key, unit) =>
    set((state) => {
      const item = state.items.find((i) => i.key === key);
      if (!item || item.unit === unit) return state;
      const pack = item.pricing.packs?.find((p) => p.name === unit);
      const isBase = unit === item.baseUnit;
      if (!pack && !isBase) return state;
      const changed: CartItem = { ...item, key: lineKey(item.product, unit), unit, unitSize: pack?.size ?? 1 };
      const other = state.items.find((i) => i.key === changed.key);
      if (other) {
        // Already a line in that unit: merge into it
        return {
          items: state.items
            .filter((i) => i.key !== key)
            .map((i) => (i.key === changed.key ? { ...i, quantity: clampQuantity(i, i.quantity + 1) } : i)),
        };
      }
      return {
        // Start the new unit at 1 (2.5 kg → 1 bag, not "3 bags")
        items: state.items.map((i) => (i.key === key ? { ...changed, quantity: clampQuantity(changed, 1) } : i)),
      };
    }),

  updateDiscount: (key, discountPercent) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.key === key ? { ...i, discountPercent: Math.max(0, Math.min(100, discountPercent)) } : i
      ),
    })),

  setCustomer: (customerId, customerName = null, loyaltyPoints = 0, priceLevel = "RETAIL") =>
    set({
      selectedCustomer: customerId,
      customerName,
      customerLoyaltyPoints: customerId ? loyaltyPoints : 0,
      priceLevel: customerId ? priceLevel : "RETAIL",
    }),

  setPaymentMethod: (method) => set({ paymentMethod: method }),

  setNotes: (notes) => set({ notes }),

  setTaxInclusive: (taxInclusive) => set({ taxInclusive }),

  clearCart: () =>
    set({
      items: [],
      selectedCustomer: null,
      customerName: null,
      customerLoyaltyPoints: 0,
      priceLevel: "RETAIL",
      paymentMethod: "CASH",
      notes: "",
    }),

  // ─── Computed (all amounts in rupees, exact to the paisa) ───
  getSubtotal: () => toRupees(priceState(get()).subtotal),

  getDiscountTotal: () => toRupees(priceState(get()).discount),

  getLoyaltyPercent: () => {
    const { selectedCustomer, customerLoyaltyPoints } = get();
    return selectedCustomer ? getTier(customerLoyaltyPoints).discount : 0;
  },

  getLoyaltyDiscountTotal: () => toRupees(priceState(get()).loyalty),

  getTaxTotal: () => toRupees(priceState(get()).tax),

  getTaxableTotal: () => toRupees(priceState(get()).taxable),

  getGrandTotal: () => toRupees(priceState(get()).grandTotal),

  getPointsToEarn: () => {
    const state = get();
    return state.selectedCustomer ? pointsForPaise(priceState(state).grandTotal) : 0;
  },

  getLinePrice: (key) => {
    const { items, priceLevel } = get();
    const item = items.find((i) => i.key === key);
    if (!item) return { unitPrice: 0, priceSource: "" };
    const { unitPrice, priceSource } = linePrice(item, priceLevel);
    return { unitPrice, priceSource };
  },

  getLineTotal: (key) => {
    const { items, priceLevel, taxInclusive } = get();
    const item = items.find((i) => i.key === key);
    if (!item) return 0;
    const unitPrice = linePrice(item, priceLevel).unitPrice;
    return toRupees(priceLine({ ...item, unitPrice }, get().getLoyaltyPercent(), { taxInclusive }).total);
  },
}));
