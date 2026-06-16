import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";

export interface VendorFilters {
  page?: number;
  limit?: number;
  search?: string;
}

export function useVendors(filters: VendorFilters = {}) {
  return useQuery({
    queryKey: ["vendors", filters],
    queryFn: async () => {
      const { data } = await api.get("/vendors", { params: filters });
      return data.data;
    },
  });
}

export function useVendor(id: string | undefined) {
  return useQuery({
    queryKey: ["vendors", id],
    queryFn: async () => {
      const { data } = await api.get(`/vendors/${id}`);
      return data.data.vendor;
    },
    enabled: !!id,
  });
}

export function useCreateVendor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vendorData: Record<string, unknown>) => {
      const { data } = await api.post("/vendors", vendorData);
      return data.data.vendor;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
    },
  });
}

export function useUpdateVendor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...vendorData
    }: Record<string, unknown> & { id: string }) => {
      const { data } = await api.put(`/vendors/${id}`, vendorData);
      return data.data.vendor;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
    },
  });
}

export function useDeleteVendor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/vendors/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
    },
  });
}
