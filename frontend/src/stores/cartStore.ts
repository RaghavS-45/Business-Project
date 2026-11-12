import { create } from "zustand";
import { getTier } from "@/lib/loyalty";
import { priceCart, priceLine, pointsForPaise, toRupees } from "@/lib/pricing";

export interface CartItem {
  product: string; // product _id
  name: string;
  sku: string;
  unitPrice: number;
  costPrice: number;
  stock: number; // available stock (for validation)
  quantity: number;
  discountPercent: number;
  taxPercent: number;
  image?: string;
}

interface CartState {
  items: CartItem[];
  selectedCustomer: string | null;
  customerName: string | null;
  customerLoyaltyPoints: number;
  paymentMethod: "CASH" | "CARD" | "UPI" | "OTHER";
  notes: string;

  // Actions
  addItem: (item: Omit<CartItem, "quantity" | "discountPercent" | "taxPercent">) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  updateDiscount: (productId: string, discountPercent: number) => void;
  updateTax: (productId: string, taxPercent: number) => void;
  setCustomer: (customerId: string | null, customerName?: string | null, loyaltyPoints?: number) => void;
  
  setPaymentMethod: (method: "CASH" | "CARD" | "UPI" | "OTHER") => void;
  setNotes: (notes: string) => void;
  clearCart: () => void;

  // Computed
  getSubtotal: () => number;
  getTaxTotal: () => number;
  getDiscountTotal: () => number;
  getGrandTotal: () => number;
  getLoyaltyPercent: () => number;        
  getLoyaltyDiscountTotal: () => number;
  getPointsToEarn: () => number;
  /** Final price of one cart line (rupees), incl. discount, loyalty and tax. */
  getLineTotal: (productId: string) => number;
}

/** Price the whole cart with the same paise-based maths the server uses. */
const priceState = (state: Pick<CartState, "items" | "selectedCustomer" | "customerLoyaltyPoints">) =>
  priceCart(
    state.items,
    state.selectedCustomer ? getTier(state.customerLoyaltyPoints).discount : 0
  );

export const useCartStore = create<CartState>()((set, get) => ({
  items: [],
  selectedCustomer: null,
  customerName: null,
  customerLoyaltyPoints: 0,
  paymentMethod: "CASH",
  notes: "",

  addItem: (item) =>
    set((state) => {
      const existing = state.items.find((i) => i.product === item.product);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.product === item.product
              ? { ...i, quantity: Math.min(i.quantity + 1, i.stock) }
              : i
          ),
        };
      }
      return {
        items: [
          ...state.items,
          { ...item, quantity: 1, discountPercent: 0, taxPercent: 0 },
        ],
      };
    }),

  removeItem: (productId) =>
    set((state) => ({
      items: state.items.filter((i) => i.product !== productId),
    })),

  updateQuantity: (productId, quantity) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.product === productId
          ? { ...i, quantity: Math.max(1, Math.min(quantity, i.stock)) }
          : i
      ),
    })),

  updateDiscount: (productId, discountPercent) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.product === productId
          ? { ...i, discountPercent: Math.max(0, Math.min(100, discountPercent)) }
          : i
      ),
    })),

  updateTax: (productId, taxPercent) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.product === productId
          ? { ...i, taxPercent: Math.max(0, Math.min(100, taxPercent)) }
          : i
      ),
    })),

    setCustomer: (customerId, customerName = null, loyaltyPoints = 0) =>
    set({
      selectedCustomer: customerId,
      customerName,
      customerLoyaltyPoints: customerId ? loyaltyPoints : 0,
    }),

  setPaymentMethod: (method) => set({ paymentMethod: method }),

  setNotes: (notes) => set({ notes }),

  clearCart: () =>
    set({
      items: [],
      selectedCustomer: null,
      customerName: null,
      customerLoyaltyPoints: 0,
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

  getGrandTotal: () => toRupees(priceState(get()).grandTotal),

  getPointsToEarn: () => {
    const state = get();
    return state.selectedCustomer ? pointsForPaise(priceState(state).grandTotal) : 0;
  },

  getLineTotal: (productId) => {
    const item = get().items.find((i) => i.product === productId);
    return item ? toRupees(priceLine(item, get().getLoyaltyPercent()).total) : 0;
  },
}));