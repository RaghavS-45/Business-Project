import { http, HttpResponse } from "msw";

// ─── Mock Data ────────────────────────────────────────────

export const mockUser = {
  _id: "user-1",
  name: "Admin User",
  email: "admin@example.com",
  role: "ADMIN" as const,
  isActive: true,
  lastLogin: new Date().toISOString(),
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

export const mockCashier = {
  ...mockUser,
  _id: "user-2",
  name: "Cashier User",
  email: "cashier@example.com",
  role: "CASHIER" as const,
};

export const mockProducts = [
  {
    _id: "prod-1",
    name: "Wireless Mouse",
    sku: "WM-001",
    sellingPrice: 599,
    costPrice: 350,
    stock: 25,
    category: "Electronics",
    images: [{ url: "https://example.com/mouse.jpg" }],
    isActive: true,
  },
  {
    _id: "prod-2",
    name: "USB Keyboard",
    sku: "KB-002",
    sellingPrice: 899,
    costPrice: 500,
    stock: 15,
    category: "Electronics",
    images: [],
    isActive: true,
  },
  {
    _id: "prod-3",
    name: "Cotton T-Shirt",
    sku: "TS-003",
    sellingPrice: 499,
    costPrice: 200,
    stock: 50,
    category: "Clothing",
    images: [],
    isActive: true,
  },
  {
    _id: "prod-4",
    name: "Out of Stock Item",
    sku: "OOS-004",
    sellingPrice: 199,
    costPrice: 100,
    stock: 0,
    category: "Other",
    images: [],
    isActive: true,
  },
];

export const mockCustomers = [
  { _id: "cust-1", name: "John Doe", phone: "9876543210" },
  { _id: "cust-2", name: "Jane Smith", phone: "9876543211" },
];

// ─── MSW Handlers ─────────────────────────────────────────

export const handlers = [
  // ── Auth ──────────────────────────────────────
  http.post("/api/auth/login", async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };

    if (body.email === "admin@example.com" && body.password === "Admin@123456") {
      return HttpResponse.json({
        success: true,
        data: {
          user: mockUser,
          accessToken: "mock-access-token",
          refreshToken: "mock-refresh-token",
        },
      });
    }

    if (body.email === "cashier@example.com" && body.password === "Cashier@123456") {
      return HttpResponse.json({
        success: true,
        data: {
          user: mockCashier,
          accessToken: "mock-access-token-cashier",
          refreshToken: "mock-refresh-token-cashier",
        },
      });
    }

    return HttpResponse.json(
      { success: false, message: "Invalid email or password" },
      { status: 401 }
    );
  }),

  http.get("/api/auth/me", () => {
    return HttpResponse.json({
      success: true,
      data: { user: mockUser },
    });
  }),

  // ── Products ──────────────────────────────────
  http.get("/api/products", ({ request }) => {
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.toLowerCase();
    const category = url.searchParams.get("category");

    let filtered = [...mockProducts];

    if (search) {
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(search) ||
          p.sku.toLowerCase().includes(search)
      );
    }

    if (category) {
      filtered = filtered.filter((p) => p.category === category);
    }

    return HttpResponse.json({
      success: true,
      data: {
        products: filtered,
        total: filtered.length,
        page: 1,
        totalPages: 1,
      },
    });
  }),

  // ── Customers ─────────────────────────────────
  http.get("/api/customers", () => {
    return HttpResponse.json({
      success: true,
      data: {
        customers: mockCustomers,
        total: mockCustomers.length,
      },
    });
  }),

  // ── Checkout ──────────────────────────────────
  http.post("/api/sales/checkout", async ({ request }) => {
    const body = (await request.json()) as { items?: unknown[] };

    if (!body.items || (body.items as unknown[]).length === 0) {
      return HttpResponse.json(
        { success: false, message: "Cart is empty" },
        { status: 400 }
      );
    }

    return HttpResponse.json({
      success: true,
      data: {
        sale: {
          _id: "sale-1",
          invoiceNumber: "INV-20260617-0001",
          items: body.items,
          grandTotal: 599,
          paymentMethod: "CASH",
          status: "COMPLETED",
        },
      },
    });
  }),
];
