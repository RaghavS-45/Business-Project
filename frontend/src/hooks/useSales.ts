import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";

/**
 * Sales hooks — list, detail, returns via TanStack Query.
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
    staleTime: 0, // always re-fetch — receiptUrl is populated async by the worker
  });
}

export interface CreditNote {
  _id: string;
  creditNoteNumber: string;
  invoiceNumber: string;
  createdAt: string;
  total: number;
  reason: string;
  refundMethod: string;
  items: Array<{ product: string; name: string; quantity: number; lineTotal: number; restocked: boolean }>;
}

/** Credit notes issued against a sale. */
export function useSaleReturns(saleId: string | undefined) {
  return useQuery({
    queryKey: ["sales", saleId, "returns"],
    queryFn: async () => {
      const { data } = await api.get(`/sales/${saleId}/returns`);
      return data.data.creditNotes as CreditNote[];
    },
    enabled: !!saleId,
  });
}

export interface ReturnInput {
  saleId: string;
  items: Array<{ line?: number; product?: string; quantity: number; restock: boolean }>;
  reason: string;
  refundMethod?: string;
}

/** Return items from a sale → issues a credit note. */
export function useCreateReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ saleId, ...body }: ReturnInput) => {
      const { data } = await api.post(`/sales/${saleId}/returns`, body);
      return data.data as { creditNote: CreditNote; sale: unknown };
    },
    onSuccess: () => {
      // Sales, dashboard figures, stock and customer points all change
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}
