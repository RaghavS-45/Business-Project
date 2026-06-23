import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";

export interface PurchaseOrderFilters {
  page?: number;
  limit?: number;
  status?: "pending" | "approved" | "received" | "rejected";
  vendor?: string;
  sortBy?: "createdAt" | "totalAmount" | "status";
  sortOrder?: "asc" | "desc";
}

export interface LineItemInput {
  product: string;
  quantity: number;
  unitCost: number;
}

export interface CreatePurchaseOrderInput {
  vendor: string;
  items: LineItemInput[];
  notes?: string;
  expectedDelivery?: string | null;
}

export function usePurchaseOrders(filters: PurchaseOrderFilters = {}) {
  return useQuery({
    queryKey: ["purchase-orders", filters],
    queryFn: async () => {
      const { data } = await api.get("/purchase-orders", { params: filters });
      return data.data;
    },
  });
}

export function usePurchaseOrder(id: string | undefined) {
  return useQuery({
    queryKey: ["purchase-orders", id],
    queryFn: async () => {
      const { data } = await api.get(`/purchase-orders/${id}`);
      return data.data.purchaseOrder;
    },
    enabled: !!id,
  });
}

export function usePurchaseOrderStats() {
  return useQuery({
    queryKey: ["purchase-orders", "stats"],
    queryFn: async () => {
      const { data } = await api.get("/purchase-orders/stats");
      return data.data.stats;
    },
  });
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (poData: CreatePurchaseOrderInput) => {
      const { data } = await api.post("/purchase-orders", poData);
      return data.data.purchaseOrder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      // Invalidate products so stock counts refresh
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useUpdatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...poData }: { id: string; notes?: string; expectedDelivery?: string | null }) => {
      const { data } = await api.put(`/purchase-orders/${id}`, poData);
      return data.data.purchaseOrder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
  });
}

export function useUpdatePurchaseOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" | "received" }) => {
      const { data } = await api.patch(`/purchase-orders/${id}/status`, { status });
      return data.data.purchaseOrder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      // Invalidate products — stock changes on "received"
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useDeletePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/purchase-orders/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
  });
}