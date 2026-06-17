import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useRef } from "react";
import api from "@/lib/axios";
import { useCartStore } from "@/stores/cartStore";

/**
 * POS-specific hooks: checkout mutation, debounced search, SKU lookup.
 */

export function useCheckout() {
  const queryClient = useQueryClient();
  const clearCart = useCartStore((s) => s.clearCart);

  return useMutation({
    mutationFn: async (payload: {
      items: Array<{
        product: string;
        quantity: number;
        discountPercent?: number;
        taxPercent?: number;
      }>;
      customerId?: string | null;
      paymentMethod: string;
      notes?: string;
    }) => {
      const { data } = await api.post("/sales/checkout", payload);
      return data.data.sale;
    },
    onSuccess: () => {
      clearCart();
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
    },
  });
}

export function useProductSearch(query: string) {
  return useQuery({
    queryKey: ["products", "search", query],
    queryFn: async () => {
      const { data } = await api.get("/products", {
        params: { search: query, limit: 20 },
      });
      return data.data.products || data.data.docs || [];
    },
    enabled: query.length >= 1,
    staleTime: 10 * 1000,
  });
}

export function useSkuLookup() {
  return useMutation({
    mutationFn: async (sku: string) => {
      const { data } = await api.get(`/products/sku/${sku}`);
      return data.data.product;
    },
  });
}

/**
 * Debounced search hook — returns a debounced value that updates
 * after the specified delay.
 */
export function useDebouncedValue(delay = 300) {
  const [value, setValue] = useState("");
  const [debouncedValue, setDebouncedValue] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const onChange = useCallback(
    (newValue: string) => {
      setValue(newValue);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setDebouncedValue(newValue);
      }, delay);
    },
    [delay]
  );

  return { value, debouncedValue, onChange };
}
