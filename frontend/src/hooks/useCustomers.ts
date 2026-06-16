import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";

export interface CustomerFilters {
  page?: number;
  limit?: number;
  search?: string;
}

export function useCustomers(filters: CustomerFilters = {}) {
  return useQuery({
    queryKey: ["customers", filters],
    queryFn: async () => {
      const { data } = await api.get("/customers", { params: filters });
      return data.data;
    },
  });
}

export function useCustomer(id: string | undefined) {
  return useQuery({
    queryKey: ["customers", id],
    queryFn: async () => {
      const { data } = await api.get(`/customers/${id}`);
      return data.data.customer;
    },
    enabled: !!id,
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (customerData: Record<string, unknown>) => {
      const { data } = await api.post("/customers", customerData);
      return data.data.customer;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...customerData
    }: Record<string, unknown> & { id: string }) => {
      const { data } = await api.put(`/customers/${id}`, customerData);
      return data.data.customer;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/customers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}
