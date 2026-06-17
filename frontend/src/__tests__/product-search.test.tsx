import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithProviders } from "./utils";
import { server } from "./setup";
import { useAuthStore } from "@/stores/authStore";
import { useCartStore } from "@/stores/cartStore";
import { mockUser } from "./handlers";
import PosPage from "@/pages/PosPage";

beforeEach(() => {
  useAuthStore.setState({
    user: mockUser,
    accessToken: "mock-access-token",
    refreshToken: "mock-refresh-token",
    isAuthenticated: true,
  });
  useCartStore.setState({
    items: [],
    selectedCustomer: null,
    customerName: null,
    paymentMethod: "CASH",
    notes: "",
  });
});

describe("Product Search", () => {
  it("renders search input with F2 placeholder hint", async () => {
    renderWithProviders(<PosPage />);

    const searchInput = screen.getByPlaceholderText(/search products/i);
    expect(searchInput).toBeInTheDocument();
    expect(screen.getByText("F2")).toBeInTheDocument();
  });

  it("filters products when typing in search", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PosPage />);

    // Wait for initial products to load
    await waitFor(() => {
      expect(screen.getByText("Wireless Mouse")).toBeInTheDocument();
      expect(screen.getByText("USB Keyboard")).toBeInTheDocument();
    });

    // Type "mouse" — MSW handler filters by name
    const searchInput = screen.getByPlaceholderText(/search products/i);
    await user.type(searchInput, "mouse");

    // Wait for debounced search to fire and results to update
    await waitFor(
      () => {
        expect(screen.getByText("Wireless Mouse")).toBeInTheDocument();
        expect(screen.queryByText("USB Keyboard")).not.toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it("shows 'No products found' for empty results", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PosPage />);

    await waitFor(() => {
      expect(screen.getByText("Wireless Mouse")).toBeInTheDocument();
    });

    // Search for something that doesn't exist
    const searchInput = screen.getByPlaceholderText(/search products/i);
    await user.type(searchInput, "zzz-nonexistent-product-zzz");

    await waitFor(
      () => {
        expect(screen.getByText(/no products found/i)).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it("filters by category when clicking category tab", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PosPage />);

    // Wait for initial products
    await waitFor(() => {
      expect(screen.getByText("Wireless Mouse")).toBeInTheDocument();
      expect(screen.getByText("Cotton T-Shirt")).toBeInTheDocument();
    });

    // Click "Clothing" category tab
    await user.click(screen.getByRole("button", { name: "Clothing" }));

    // Should show only Clothing products
    await waitFor(
      () => {
        expect(screen.getByText("Cotton T-Shirt")).toBeInTheDocument();
        expect(screen.queryByText("Wireless Mouse")).not.toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it("shows all products when 'All' category is selected", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PosPage />);

    await waitFor(() => {
      expect(screen.getByText("Wireless Mouse")).toBeInTheDocument();
    });

    // Filter by Electronics first
    await user.click(screen.getByRole("button", { name: "Electronics" }));

    await waitFor(
      () => {
        expect(screen.queryByText("Cotton T-Shirt")).not.toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    // Click "All" to reset
    await user.click(screen.getByRole("button", { name: "All" }));

    await waitFor(
      () => {
        expect(screen.getByText("Wireless Mouse")).toBeInTheDocument();
        expect(screen.getByText("Cotton T-Shirt")).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it("shows loading skeletons while search results are loading", () => {
    // Delay the response significantly
    server.use(
      http.get("/api/products", async () => {
        await new Promise((r) => setTimeout(r, 10000));
        return HttpResponse.json({
          success: true,
          data: { products: [], total: 0 },
        });
      })
    );

    renderWithProviders(<PosPage />);

    // Should see animated skeleton placeholders
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
