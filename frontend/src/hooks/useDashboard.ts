import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";

/**
 * Dashboard hooks — TanStack Query for KPIs, charts, low stock, recent sales.
 */

export function useDailySummary(date?: string) {
  return useQuery({
    queryKey: ["sales", "summary", date],
    queryFn: async () => {
      const params = date ? { date } : {};
      const { data } = await api.get("/sales/summary/daily", { params });
      return data.data.summary;
    },
    staleTime: 60 * 1000, // 1 minute
  });
}

export function useLowStockProducts() {
  return useQuery({
    queryKey: ["products", "low-stock"],
    queryFn: async () => {
      const { data } = await api.get("/products", {
        params: { limit: 50, sortBy: "stock", sortOrder: "asc" },
      });
      // Filter client-side for low stock
      const products = data.data.products || data.data.docs || [];
      return products.filter(
        (p: { stock: number; lowStockThreshold: number }) =>
          p.stock <= p.lowStockThreshold
      );
    },
    staleTime: 60 * 1000,
  });
}

export function useRecentSales(limit = 5) {
  return useQuery({
    queryKey: ["sales", "recent", limit],
    queryFn: async () => {
      const { data } = await api.get("/sales", {
        params: { limit, sortBy: "createdAt", sortOrder: "desc" },
      });
      return data.data;
    },
    staleTime: 30 * 1000,
  });
}

export function useProductStats() {
  return useQuery({
    queryKey: ["products", "stats"],
    queryFn: async () => {
      const { data } = await api.get("/products", {
        params: { limit: 1 },
      });
      return { total: data.data.total || data.data.totalDocs || 0 };
    },
    staleTime: 60 * 1000,
  });
}
