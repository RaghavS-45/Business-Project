import { create } from "zustand";
import { getTier } from "@/lib/loyalty";

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
}

/**
 * Compute the line total for a cart item.
 * Formula: qty * unitPrice * (1 - discount/100) * (1 + tax/100)
 */
const computeLineTotal = (item: CartItem, loyaltyPercent = 0): number => {
  const afterItemDiscount = item.unitPrice * (1 - item.discountPercent / 100);
  const afterLoyalty = afterItemDiscount * (1 - loyaltyPercent / 100);
  const taxed = afterLoyalty * (1 + item.taxPercent / 100);
  return Math.round(item.quantity * taxed * 100) / 100;
};

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

  getSubtotal: () => {
    const { items } = get();
    return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  },

  getDiscountTotal: () => {
    const { items } = get();
    return items.reduce((sum, item) => {
      const discount = item.unitPrice * (item.discountPercent / 100);
      return sum + item.quantity * discount;
    }, 0);
  },

  getLoyaltyPercent: () => {
    const { selectedCustomer, customerLoyaltyPoints } = get();
    return selectedCustomer ? getTier(customerLoyaltyPoints).discount : 0;
  },

  getLoyaltyDiscountTotal: () => {
    const { items } = get();
    const pct = get().getLoyaltyPercent();
    return items.reduce((sum, item) => {
      const afterItemDiscount =
        item.quantity * item.unitPrice * (1 - item.discountPercent / 100);
      return sum + afterItemDiscount * (pct / 100);
    }, 0);
  },

  getTaxTotal: () => {
    const { items } = get();
    const pct = get().getLoyaltyPercent();
    return items.reduce((sum, item) => {
      const taxable =
        item.unitPrice * (1 - item.discountPercent / 100) * (1 - pct / 100);
      return sum + item.quantity * taxable * (item.taxPercent / 100);
    }, 0);
  },

  getGrandTotal: () => {
    const r = (n: number) => Math.round(n * 100) / 100;
    const g = get();
    return r(
      g.getSubtotal() - g.getDiscountTotal() - g.getLoyaltyDiscountTotal() + g.getTaxTotal()
    );
  },

  getPointsToEarn: () => {
    const { selectedCustomer } = get();
    return selectedCustomer ? Math.floor(get().getGrandTotal() / 100) : 0;
  },
}));