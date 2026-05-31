import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../app.js";
import Product from "../../models/Product.js";
import { createTestUser, createTestProduct } from "../helpers.js";

/**
 * Integration Tests — Product CRUD Routes
 *
 * Tests the full HTTP request/response cycle for:
 *   POST   /api/products       — Create product
 *   GET    /api/products       — List products (paginated)
 *   GET    /api/products/:id   — Get single product
 *   PUT    /api/products/:id   — Update product
 *   DELETE /api/products/:id   — Soft-delete product
 *
 * Auth + role enforcement is tested alongside CRUD operations.
 */

describe("Product CRUD Integration", () => {
  let adminToken, managerToken, cashierToken;

  beforeEach(async () => {
    const admin = await createTestUser({ role: "ADMIN" });
    adminToken = admin.accessToken;

    const manager = await createTestUser({
      role: "MANAGER",
      email: `manager-${Date.now()}@test.com`,
    });
    managerToken = manager.accessToken;

    const cashier = await createTestUser({
      role: "CASHIER",
      email: `cashier-${Date.now()}@test.com`,
    });
    cashierToken = cashier.accessToken;
  });

  // ─── POST /api/products ──────────────────────────────────

  describe("POST /api/products", () => {
    const validProduct = {
      name: "Test Keyboard",
      category: "Electronics",
      unit: "pcs",
      costPrice: 500,
      sellingPrice: 1200,
      stock: 25,
    };

    it("should create a product as ADMIN", async () => {
      const res = await request(app)
        .post("/api/products")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(validProduct);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.product.name).toBe("Test Keyboard");
      expect(res.body.data.product.sku).toBeDefined(); // Auto-generated
      expect(res.body.data.product.stock).toBe(25);
    });

    it("should create a product as MANAGER", async () => {
      const res = await request(app)
        .post("/api/products")
        .set("Authorization", `Bearer ${managerToken}`)
        .send({ ...validProduct, name: "Manager Product" });

      expect(res.status).toBe(201);
    });

    it("should reject CASHIER from creating products (403)", async () => {
      const res = await request(app)
        .post("/api/products")
        .set("Authorization", `Bearer ${cashierToken}`)
        .send(validProduct);

      expect(res.status).toBe(403);
    });

    it("should reject unauthenticated request (401)", async () => {
      const res = await request(app)
        .post("/api/products")
        .send(validProduct);

      expect(res.status).toBe(401);
    });

    it("should reject product with missing required fields (400)", async () => {
      const res = await request(app)
        .post("/api/products")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Incomplete" }); // missing category, costPrice, sellingPrice

      expect(res.status).toBe(400);
    });

    it("should reject duplicate SKU (409)", async () => {
      await createTestProduct({ sku: "DUPE-SKU-001" });

      const res = await request(app)
        .post("/api/products")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ ...validProduct, sku: "DUPE-SKU-001" });

      expect(res.status).toBe(409);
    });
  });

  // ─── GET /api/products ───────────────────────────────────

  describe("GET /api/products", () => {
    beforeEach(async () => {
      // Seed 3 products
      await createTestProduct({ name: "Alpha Widget", category: "Electronics" });
      await createTestProduct({ name: "Beta Gadget", category: "Clothing" });
      await createTestProduct({ name: "Gamma Tool", category: "Electronics" });
    });

    it("should list all active products (paginated)", async () => {
      const res = await request(app)
        .get("/api/products")
        .set("Authorization", `Bearer ${cashierToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.products).toHaveLength(3);
      expect(res.body.data.pagination.total).toBe(3);
    });

    it("should paginate results", async () => {
      const res = await request(app)
        .get("/api/products?page=1&limit=2")
        .set("Authorization", `Bearer ${cashierToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.products).toHaveLength(2);
      expect(res.body.data.pagination.hasNext).toBe(true);
      expect(res.body.data.pagination.totalPages).toBe(2);
    });

    it("should filter by category", async () => {
      const res = await request(app)
        .get("/api/products?category=Electronics")
        .set("Authorization", `Bearer ${cashierToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.products).toHaveLength(2);
      res.body.data.products.forEach((p) => {
        expect(p.category).toBe("Electronics");
      });
    });

    it("should require authentication (401)", async () => {
      const res = await request(app).get("/api/products");
      expect(res.status).toBe(401);
    });
  });

  // ─── GET /api/products/:id ───────────────────────────────

  describe("GET /api/products/:id", () => {
    it("should return a single product by ID", async () => {
      const product = await createTestProduct({ name: "Find Me" });

      const res = await request(app)
        .get(`/api/products/${product._id}`)
        .set("Authorization", `Bearer ${cashierToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.product.name).toBe("Find Me");
    });

    it("should return 404 for non-existent product", async () => {
      const fakeId = "507f1f77bcf86cd799439011";

      const res = await request(app)
        .get(`/api/products/${fakeId}`)
        .set("Authorization", `Bearer ${cashierToken}`);

      expect(res.status).toBe(404);
    });
  });

  // ─── PUT /api/products/:id ───────────────────────────────

  describe("PUT /api/products/:id", () => {
    it("should update product fields as ADMIN", async () => {
      const product = await createTestProduct({
        name: "Old Name",
        sellingPrice: 100,
      });

      const res = await request(app)
        .put(`/api/products/${product._id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "New Name", sellingPrice: 200 });

      expect(res.status).toBe(200);
      expect(res.body.data.product.name).toBe("New Name");
      expect(res.body.data.product.sellingPrice).toBe(200);
    });

    it("should reject CASHIER from updating products (403)", async () => {
      const product = await createTestProduct();

      const res = await request(app)
        .put(`/api/products/${product._id}`)
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({ name: "Hack" });

      expect(res.status).toBe(403);
    });

    it("should return 404 for non-existent product", async () => {
      const fakeId = "507f1f77bcf86cd799439011";

      const res = await request(app)
        .put(`/api/products/${fakeId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Ghost" });

      expect(res.status).toBe(404);
    });
  });

  // ─── DELETE /api/products/:id ────────────────────────────

  describe("DELETE /api/products/:id", () => {
    it("should soft-delete a product (set isActive = false)", async () => {
      const product = await createTestProduct();

      const res = await request(app)
        .delete(`/api/products/${product._id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);

      // Verify it's soft-deleted, not removed
      const deleted = await Product.findById(product._id);
      expect(deleted).toBeDefined();
      expect(deleted.isActive).toBe(false);
    });

    it("should reject CASHIER from deleting products (403)", async () => {
      const product = await createTestProduct();

      const res = await request(app)
        .delete(`/api/products/${product._id}`)
        .set("Authorization", `Bearer ${cashierToken}`);

      expect(res.status).toBe(403);
    });

    it("should return 404 for non-existent product", async () => {
      const fakeId = "507f1f77bcf86cd799439011";

      const res = await request(app)
        .delete(`/api/products/${fakeId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });
});
