import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithProviders } from "./utils";
import { server } from "./setup";
import { useAuthStore } from "@/stores/authStore";
import LoginPage from "@/pages/LoginPage";

// Reset auth store before each test
beforeEach(() => {
  useAuthStore.setState({
    user: null,
    accessToken: null,
    refreshToken: null,
    isAuthenticated: false,
  });
});

describe("LoginPage", () => {
  it("renders the login form with email and password fields", () => {
    renderWithProviders(<LoginPage />);

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByText(/inventory pos/i)).toBeInTheDocument();
  });

  it("shows validation errors on empty submission", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      // Zod errors for email and password
      expect(screen.getByText(/enter a valid email/i)).toBeInTheDocument();
    });
  });

  it("shows validation error for short password", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), "admin@example.com");
    await user.type(screen.getByLabelText(/password/i), "short");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
    });
  });

  it("shows API error on invalid credentials", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), "wrong@example.com");
    await user.type(screen.getByLabelText(/password/i), "WrongPassword1");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();
    });
  });

  it("stores tokens and user on successful login", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), "admin@example.com");
    await user.type(screen.getByLabelText(/password/i), "Admin@123456");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.accessToken).toBe("mock-access-token");
      expect(state.user?.email).toBe("admin@example.com");
      expect(state.user?.role).toBe("ADMIN");
    });
  });

  it("toggles password visibility", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    const passwordInput = screen.getByLabelText(/password/i);
    expect(passwordInput).toHaveAttribute("type", "password");

    // Click the toggle button (the eye icon button)
    const toggleButton = passwordInput.parentElement?.querySelector("button");
    expect(toggleButton).toBeTruthy();
    await user.click(toggleButton!);

    expect(passwordInput).toHaveAttribute("type", "text");

    // Click again to hide
    await user.click(toggleButton!);
    expect(passwordInput).toHaveAttribute("type", "password");
  });

  it("shows loading state during submission", async () => {
    // Delay the login response to observe loading state
    server.use(
      http.post("/api/auth/login", async () => {
        await new Promise((r) => setTimeout(r, 200));
        return HttpResponse.json({
          success: true,
          data: {
            user: { _id: "u1", name: "Test", email: "t@t.com", role: "ADMIN", isActive: true, lastLogin: null, createdAt: "", updatedAt: "" },
            accessToken: "tok",
            refreshToken: "ref",
          },
        });
      })
    );

    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), "admin@example.com");
    await user.type(screen.getByLabelText(/password/i), "Admin@123456");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    // Should show loading text
    expect(screen.getByText(/signing in/i)).toBeInTheDocument();

    // Button should be disabled
    expect(screen.getByRole("button", { name: /signing in/i })).toBeDisabled();
  });

  it("redirects if already authenticated", () => {
    // Pre-set auth state
    useAuthStore.setState({
      user: {
        _id: "u1",
        name: "Admin",
        email: "admin@example.com",
        role: "ADMIN",
        isActive: true,
        lastLogin: null,
        createdAt: "",
        updatedAt: "",
      },
      accessToken: "tok",
      refreshToken: "ref",
      isAuthenticated: true,
    });

    renderWithProviders(<LoginPage />);

    // Login form should NOT be visible since we're redirected
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
  });
});
