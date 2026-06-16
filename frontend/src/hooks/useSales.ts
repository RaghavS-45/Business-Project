import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";

/**
 * Sales hooks — list, detail, refund via TanStack Query.
 */

export interface SaleFilters {
  page?: number;
  limit?: number;
  status?: string;
  paymentMethod?: string;
  customerId?: string;
  cashierId?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export function useSales(filters: SaleFilters = {}) {
  return useQuery({
    queryKey: ["sales", filters],
    queryFn: async () => {
      const { data } = await api.get("/sales", { params: filters });
      return data.data;
    },
  });
}

export function useSale(id: string | undefined) {
  return useQuery({
    queryKey: ["sales", id],
    queryFn: async () => {
      const { data } = await api.get(`/sales/${id}`);
      return data.data.sale;
    },
    enabled: !!id,
  });
}

export function useRefund() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data } = await api.post(`/sales/${id}/refund`, { reason });
      return data.data.sale;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
    },
  });
}
