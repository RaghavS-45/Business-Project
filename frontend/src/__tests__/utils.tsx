import React, { type ReactElement } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Create a fresh QueryClient for each test — prevents cross-test
 * cache pollution. Retries disabled for deterministic test results.
 */
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

/**
 * Custom render that wraps component in all the providers
 * the app uses: Router, QueryClient, TooltipProvider.
 */
function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">
) {
  const testQueryClient = createTestQueryClient();

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={testQueryClient}>
        <TooltipProvider>
          <BrowserRouter>{children}</BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...options }),
    queryClient: testQueryClient,
  };
}

export { renderWithProviders };
