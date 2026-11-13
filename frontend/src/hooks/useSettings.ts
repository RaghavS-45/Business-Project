import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";

export interface StoreSettings {
  legalName: string;
  tradeName: string;
  gstin: string;
  stateCode: string;
  address: string;
  phone: string;
  email: string;
  pricesIncludeTax: boolean;
  bankDetails: string;
  invoiceTerms: string;
}

export interface GstState {
  code: string;
  name: string;
}

/** Store details + pricing mode. Cached for the session; rarely changes. */
export function useStoreSettings() {
  return useQuery({
    queryKey: ["settings", "store"],
    queryFn: async () => {
      const { data } = await api.get("/settings/store");
      return data.data.settings as StoreSettings;
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useUpdateStoreSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (settings: Partial<StoreSettings>) => {
      const { data } = await api.put("/settings/store", settings);
      return data.data.settings as StoreSettings;
    },
    onSuccess: (settings) => qc.setQueryData(["settings", "store"], settings),
  });
}

/** GST state codes for dropdowns. */
export function useGstStates() {
  return useQuery({
    queryKey: ["settings", "states"],
    queryFn: async () => {
      const { data } = await api.get("/settings/states");
      return data.data.states as GstState[];
    },
    staleTime: Infinity,
  });
}
