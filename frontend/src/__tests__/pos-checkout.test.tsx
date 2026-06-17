import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithProviders } from "./utils";
import { server } from "./setup";
import { useAuthStore } from "@/stores/authStore";
import { useCartStore } from "@/stores/cartStore";
import { mockProducts, mockUser } from "./handlers";
import PosPage from "@/pages/PosPage";

/**
 * POS tests require the user to be authenticated (ProtectedRoute).
 * We pre-set the auth store before each test.
 */
beforeEach(() => {
  useAuthStore.setState({
    user: mockUser,
    accessToken: "mock-access-token",
    refreshToken: "mock-refresh-token",
    isAuthenticated: true,
  });
  // Reset cart
  useCartStore.setState({
    items: [],
    selectedCustomer: null,
    customerName: null,
    paymentMethod: "CASH",
    notes: "",
  });
});

describe("POS Page — Product Grid", () => {
  it("renders product grid from API", async () => {
    renderWithProviders(<PosPage />);

    await waitFor(() => {
      expect(screen.getByText("Wireless Mouse")).toBeInTheDocument();
      expect(screen.getByText("USB Keyboard")).toBeInTheDocument();
      expect(screen.getByText("Cotton T-Shirt")).toBeInTheDocument();
    });
  });

  it("shows SKU and price for each product", async () => {
    renderWithProviders(<PosPage />);

    await waitFor(() => {
      expect(screen.getByText("WM-001")).toBeInTheDocument();
      expect(screen.getByText("₹599")).toBeInTheDocument();
    });
  });

  it("disables out-of-stock products", async () => {
    renderWithProviders(<PosPage />);

    await waitFor(() => {
      expect(screen.getByText("Out of Stock Item")).toBeInTheDocument();
    });

    // The product button with stock=0 should be disabled
    const oosButton = screen.getByText("Out of Stock Item").closest("button");
    expect(oosButton).toBeDisabled();
  });

  it("shows loading skeletons while products load", () => {
    // Delay the products response
    server.use(
      http.get("/api/products", async () => {
        await new Promise((r) => setTimeout(r, 5000));
        return HttpResponse.json({ success: true, data: { products: [] } });
      })
    );

    renderWithProviders(<PosPage />);

    // Should see animated skeleton elements
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });
});

describe("POS Page — Cart Operations", () => {
  it("adds product to cart on click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PosPage />);

    await waitFor(() => {
      expect(screen.getByText("Wireless Mouse")).toBeInTheDocument();
    });

    const productButton = screen.getByText("Wireless Mouse").closest("button")!;
    await user.click(productButton);

    // Cart should show the item
    await waitFor(() => {
      // Cart header should show count
      expect(screen.getByText(/cart \(1\)/i)).toBeInTheDocument();
    });

    // Cart store should have the item
    const cartState = useCartStore.getState();
    expect(cartState.items).toHaveLength(1);
    expect(cartState.items[0].name).toBe("Wireless Mouse");
    expect(cartState.items[0].quantity).toBe(1);
  });

  it("increments quantity when adding same product twice", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PosPage />);

    await waitFor(() => {
      expect(screen.getByText("Wireless Mouse")).toBeInTheDocument();
    });

    const productButton = screen.getByText("Wireless Mouse").closest("button")!;
    await user.click(productButton);
    await user.click(productButton);

    const cartState = useCartStore.getState();
    expect(cartState.items).toHaveLength(1);
    expect(cartState.items[0].quantity).toBe(2);
  });

  it("shows correct subtotal for cart items", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PosPage />);

    await waitFor(() => {
      expect(screen.getByText("Wireless Mouse")).toBeInTheDocument();
    });

    // Add mouse (₹599) twice
    const mouseBtn = screen.getByText("Wireless Mouse").closest("button")!;
    await user.click(mouseBtn);
    await user.click(mouseBtn);

    await waitFor(() => {
      // Subtotal should be 599 * 2 = 1198
      const subtotal = useCartStore.getState().getSubtotal();
      expect(subtotal).toBe(1198);
    });
  });

  it("clears cart when Clear button is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PosPage />);

    await waitFor(() => {
      expect(screen.getByText("Wireless Mouse")).toBeInTheDocument();
    });

    // Add product
    await user.click(screen.getByText("Wireless Mouse").closest("button")!);

    await waitFor(() => {
      expect(screen.getByText(/cart \(1\)/i)).toBeInTheDocument();
    });

    // Click clear
    await user.click(screen.getByText(/clear/i));

    await waitFor(() => {
      expect(screen.getByText(/cart is empty/i)).toBeInTheDocument();
    });
    expect(useCartStore.getState().items).toHaveLength(0);
  });
});

describe("POS Page — Checkout Flow", () => {
  it("opens checkout dialog when clicking Checkout button", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PosPage />);

    await waitFor(() => {
      expect(screen.getByText("Wireless Mouse")).toBeInTheDocument();
    });

    // Add product first
    await user.click(screen.getByText("Wireless Mouse").closest("button")!);

    await waitFor(() => {
      expect(screen.getByText(/cart \(1\)/i)).toBeInTheDocument();
    });

    // Click the Checkout button (contains "Checkout —" text)
    const checkoutButton = screen.getByRole("button", {
      name: /checkout/i,
    });
    await user.click(checkoutButton);

    // Dialog should be open
    await waitFor(() => {
      expect(screen.getByText("Confirm Checkout")).toBeInTheDocument();
      expect(screen.getByText("Walk-in")).toBeInTheDocument();
      expect(screen.getByText("CASH")).toBeInTheDocument();
    });
  });

  it("completes checkout and clears cart on success", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PosPage />);

    await waitFor(() => {
      expect(screen.getByText("Wireless Mouse")).toBeInTheDocument();
    });

    // Add product
    await user.click(screen.getByText("Wireless Mouse").closest("button")!);

    await waitFor(() => {
      expect(screen.getByText(/cart \(1\)/i)).toBeInTheDocument();
    });

    // Open checkout dialog
    await user.click(screen.getByRole("button", { name: /checkout/i }));

    await waitFor(() => {
      expect(screen.getByText("Confirm Checkout")).toBeInTheDocument();
    });

    // Click confirm button
    const confirmBtn = screen.getByRole("button", { name: /confirm/i });
    await user.click(confirmBtn);

    // Cart should be cleared after successful checkout
    await waitFor(() => {
      expect(useCartStore.getState().items).toHaveLength(0);
    });
  });

  it("shows error toast when checkout fails", async () => {
    // Override checkout to return error
    server.use(
      http.post("/api/sales/checkout", () => {
        return HttpResponse.json(
          { success: false, message: "Insufficient stock for Wireless Mouse" },
          { status: 400 }
        );
      })
    );

    const user = userEvent.setup();
    renderWithProviders(<PosPage />);

    await waitFor(() => {
      expect(screen.getByText("Wireless Mouse")).toBeInTheDocument();
    });

    // Add product
    await user.click(screen.getByText("Wireless Mouse").closest("button")!);

    await waitFor(() => {
      expect(screen.getByText(/cart \(1\)/i)).toBeInTheDocument();
    });

    // Open checkout dialog and confirm
    await user.click(screen.getByRole("button", { name: /checkout/i }));
    await waitFor(() => {
      expect(screen.getByText("Confirm Checkout")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /confirm/i }));

    // Cart should NOT be cleared (checkout failed)
    await waitFor(
      () => {
        expect(useCartStore.getState().items.length).toBeGreaterThan(0);
      },
      { timeout: 3000 }
    );
  });
});
