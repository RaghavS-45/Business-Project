import { QueryClient } from "@tanstack/react-query";

/**
 * TanStack Query client with sensible defaults for a POS app.
 * - 30s staleTime: avoid refetching on every mount (products don't change every second)
 * - 1 retry: avoid hammering the server on errors
 * - refetchOnWindowFocus: keep data fresh when switching tabs
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});
