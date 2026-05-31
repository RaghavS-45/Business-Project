import { describe, it, expect, beforeEach } from "vitest";
import mongoose from "mongoose";
import SaleService from "../../services/sale.service.js";
import Sale from "../../models/Sale.js";
import Product from "../../models/Product.js";
import Customer from "../../models/Customer.js";
import { createTestUser, createTestProduct, createTestCustomer } from "../helpers.js";

/**
 * Unit Tests — Sale Service (Checkout Pipeline)
 *
 * Tests the core transactional flow: stock decrement, invoice generation,
 * line-total computation, customer loyalty, and refund logic.
 *
 * All tests run against an in-memory MongoDB instance.
 * BullMQ is mocked — no Redis required.
 */

describe("SaleService", () => {
  let adminUser, cashierUser, product1, product2, customer;

  beforeEach(async () => {
    // Create test data fresh for each test
    const admin = await createTestUser({ role: "ADMIN" });
    adminUser = admin.user;

    const cashier = await createTestUser({
      role: "CASHIER",
      email: `cashier-${Date.now()}@test.com`,
      name: "Test Cashier",
    });
    cashierUser = cashier.user;

    product1 = await createTestProduct({
      name: "Widget A",
      sellingPrice: 100,
      costPrice: 60,
      stock: 50,
    });

    product2 = await createTestProduct({
      name: "Widget B",
      sellingPrice: 200,
      costPrice: 120,
      stock: 30,
    });

    customer = await createTestCustomer();
  });

  // ─── _computeLineTotal ───────────────────────────────────

  describe("_computeLineTotal", () => {
    const saleService = SaleService;

    it("should compute correct total without discount or tax", () => {
      const result = saleService._computeLineTotal(2, 100, 0, 0);
      expect(result).toBe(200);
    });

    it("should apply discount correctly", () => {
      // 2 × 100 × (1 - 10/100) = 2 × 90 = 180
      const result = saleService._computeLineTotal(2, 100, 10, 0);
      expect(result).toBe(180);
    });

    it("should apply tax correctly", () => {
      // 2 × 100 × (1 + 18/100) = 2 × 118 = 236
      const result = saleService._computeLineTotal(2, 100, 0, 18);
      expect(result).toBe(236);
    });

    it("should apply both discount and tax correctly", () => {
      // 2 × 100 × (1 - 10/100) × (1 + 18/100) = 2 × 90 × 1.18 = 212.4
      const result = saleService._computeLineTotal(2, 100, 10, 18);
      expect(result).toBe(212.4);
    });

    it("should round to 2 decimal places", () => {
      // 3 × 33.33 × (1 - 0/100) × (1 + 7/100) = 3 × 33.33 × 1.07 = 106.9893
      const result = saleService._computeLineTotal(3, 33.33, 0, 7);
      expect(result).toBe(106.99);
    });

    it("should handle 100% discount", () => {
      const result = saleService._computeLineTotal(5, 200, 100, 18);
      expect(result).toBe(0);
    });

    it("should handle quantity of 1", () => {
      const result = saleService._computeLineTotal(1, 999, 0, 0);
      expect(result).toBe(999);
    });
  });

  // ─── _generateInvoiceNumber ──────────────────────────────

  describe("_generateInvoiceNumber", () => {
    it("should generate invoice in INV-YYYYMMDD-XXXX format", async () => {
      const invoice = await SaleService._generateInvoiceNumber();
      expect(invoice).toMatch(/^INV-\d{8}-\d{4}$/);
    });

    it("should start sequence at 0001 for a new day", async () => {
      const invoice = await SaleService._generateInvoiceNumber();
      expect(invoice).toMatch(/-0001$/);
    });

    it("should increment sequence based on existing sales today", async () => {
      // Create a dummy sale to increment the counter
      await Sale.create({
        invoiceNumber: "INV-EXISTING-0001",
        cashier: cashierUser._id,
        items: [{
          product: product1._id,
          name: "Test",
          sku: "TST-001",
          quantity: 1,
          unitPrice: 100,
          costPrice: 50,
          lineTotal: 100,
        }],
        subtotal: 100,
        grandTotal: 100,
        paymentMethod: "CASH",
      });

      const invoice = await SaleService._generateInvoiceNumber();
      expect(invoice).toMatch(/-0002$/);
    });
  });

  // ─── checkout() ──────────────────────────────────────────

  describe("checkout()", () => {
    it("should create a sale with correct totals", async () => {
      const cartItems = [
        { product: product1._id, quantity: 2 },
        { product: product2._id, quantity: 1 },
      ];

      const sale = await SaleService.checkout(
        cartItems, null, "CASH", cashierUser
      );

      expect(sale).toBeDefined();
      expect(sale.invoiceNumber).toMatch(/^INV-\d{8}-\d{4}$/);
      expect(sale.items).toHaveLength(2);
      expect(sale.grandTotal).toBe(400); // (2 × 100) + (1 × 200) = 400
      expect(sale.status).toBe("COMPLETED");
      expect(sale.paymentMethod).toBe("CASH");
    });

    it("should decrement product stock atomically", async () => {
      const cartItems = [
        { product: product1._id, quantity: 5 },
      ];

      await SaleService.checkout(cartItems, null, "CASH", cashierUser);

      const updated = await Product.findById(product1._id);
      expect(updated.stock).toBe(45); // 50 - 5
    });

    it("should snapshot product data into line items", async () => {
      const cartItems = [
        { product: product1._id, quantity: 1 },
      ];

      const sale = await SaleService.checkout(
        cartItems, null, "CASH", cashierUser
      );

      const item = sale.items[0];
      expect(item.name).toBe("Widget A");
      expect(item.sku).toBe(product1.sku);
      expect(item.unitPrice).toBe(100);
      expect(item.costPrice).toBe(60);
    });

    it("should apply discount and tax to line items", async () => {
      const cartItems = [
        {
          product: product1._id,
          quantity: 2,
          discountPercent: 10,
          taxPercent: 18,
        },
      ];

      const sale = await SaleService.checkout(
        cartItems, null, "CASH", cashierUser
      );

      const item = sale.items[0];
      expect(item.discountPercent).toBe(10);
      expect(item.taxPercent).toBe(18);
      // 2 × 100 × (1 - 0.1) × (1 + 0.18) = 212.4
      expect(item.lineTotal).toBe(212.4);
    });

    it("should update customer loyalty points", async () => {
      const cartItems = [
        { product: product1._id, quantity: 3 }, // 3 × 100 = 300
      ];

      await SaleService.checkout(
        cartItems, customer._id, "CARD", cashierUser
      );

      const updatedCustomer = await Customer.findById(customer._id);
      expect(updatedCustomer.totalPurchases).toBe(300);
      expect(updatedCustomer.loyaltyPoints).toBe(3); // 1 point per ₹100
    });

    it("should handle walk-in customers (no customerId)", async () => {
      const cartItems = [
        { product: product1._id, quantity: 1 },
      ];

      const sale = await SaleService.checkout(
        cartItems, null, "CASH", cashierUser
      );

      expect(sale.customer).toBeNull();
    });

    it("should throw on insufficient stock", async () => {
      const cartItems = [
        { product: product1._id, quantity: 999 }, // Only 50 in stock
      ];

      await expect(
        SaleService.checkout(cartItems, null, "CASH", cashierUser)
      ).rejects.toThrow(/insufficient stock/i);

      // Verify stock was NOT decremented (transaction rolled back)
      const unchanged = await Product.findById(product1._id);
      expect(unchanged.stock).toBe(50);
    });

    it("should throw when product does not exist", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const cartItems = [
        { product: fakeId, quantity: 1 },
      ];

      await expect(
        SaleService.checkout(cartItems, null, "CASH", cashierUser)
      ).rejects.toThrow(/not found/i);
    });

    it("should throw for inactive product", async () => {
      await Product.findByIdAndUpdate(product1._id, { isActive: false });

      const cartItems = [
        { product: product1._id, quantity: 1 },
      ];

      await expect(
        SaleService.checkout(cartItems, null, "CASH", cashierUser)
      ).rejects.toThrow(/inactive/i);
    });

    it("should roll back all changes on partial failure (multi-item)", async () => {
      // First item will succeed, second item has insufficient stock
      const lowStockProduct = await createTestProduct({
        name: "Low Stock Item",
        stock: 1,
        sellingPrice: 50,
        costPrice: 30,
      });

      const cartItems = [
        { product: product1._id, quantity: 2 },     // OK (50 stock)
        { product: lowStockProduct._id, quantity: 5 }, // FAIL (only 1 stock)
      ];

      await expect(
        SaleService.checkout(cartItems, null, "CASH", cashierUser)
      ).rejects.toThrow();

      // Verify first product's stock was NOT decremented (full rollback)
      const p1 = await Product.findById(product1._id);
      expect(p1.stock).toBe(50);

      // Verify no sale was created
      const sales = await Sale.countDocuments();
      expect(sales).toBe(0);
    });
  });

  // ─── refund() ────────────────────────────────────────────

  describe("refund()", () => {
    let sale;

    beforeEach(async () => {
      // Create a completed sale to refund
      const cartItems = [
        { product: product1._id, quantity: 3 },
      ];
      sale = await SaleService.checkout(
        cartItems, customer._id, "CASH", cashierUser
      );
    });

    it("should mark sale as REFUNDED", async () => {
      const refunded = await SaleService.refund(
        sale._id, adminUser._id, "Customer return"
      );

      expect(refunded.status).toBe("REFUNDED");
      expect(refunded.paymentStatus).toBe("REFUNDED");
    });

    it("should restore product stock", async () => {
      await SaleService.refund(sale._id, adminUser._id, "Defective");

      const product = await Product.findById(product1._id);
      expect(product.stock).toBe(50); // 50 - 3 + 3 = 50
    });

    it("should reverse customer loyalty", async () => {
      await SaleService.refund(sale._id, adminUser._id, "Wrong item");

      const cust = await Customer.findById(customer._id);
      expect(cust.totalPurchases).toBe(0); // 300 - 300 = 0
      expect(cust.loyaltyPoints).toBe(0); // 3 - 3 = 0
    });

    it("should append refund reason to notes", async () => {
      const refunded = await SaleService.refund(
        sale._id, adminUser._id, "Broken on arrival"
      );

      expect(refunded.notes).toContain("REFUND: Broken on arrival");
    });

    it("should throw when refunding a non-existent sale", async () => {
      const fakeId = new mongoose.Types.ObjectId();

      await expect(
        SaleService.refund(fakeId, adminUser._id, "Test")
      ).rejects.toThrow(/not found/i);
    });

    it("should throw when refunding an already refunded sale", async () => {
      await SaleService.refund(sale._id, adminUser._id, "First refund");

      await expect(
        SaleService.refund(sale._id, adminUser._id, "Second refund")
      ).rejects.toThrow(/cannot refund/i);
    });
  });

  // ─── getDailySummary() ───────────────────────────────────

  describe("getDailySummary()", () => {
    it("should return zeroes when no sales exist", async () => {
      const summary = await SaleService.getDailySummary();

      expect(summary.saleCount).toBe(0);
      expect(summary.totalRevenue).toBe(0);
      expect(summary.itemsSold).toBe(0);
    });

    it("should aggregate totals correctly", async () => {
      // Create two sales
      await SaleService.checkout(
        [{ product: product1._id, quantity: 2 }], // 200
        null, "CASH", cashierUser
      );
      await SaleService.checkout(
        [{ product: product2._id, quantity: 1 }], // 200
        null, "CARD", cashierUser
      );

      const summary = await SaleService.getDailySummary();

      expect(summary.saleCount).toBe(2);
      expect(summary.totalRevenue).toBe(400);
      expect(summary.itemsSold).toBe(2);
    });

    it("should break down by payment method", async () => {
      await SaleService.checkout(
        [{ product: product1._id, quantity: 1 }],
        null, "CASH", cashierUser
      );
      await SaleService.checkout(
        [{ product: product1._id, quantity: 1 }],
        null, "UPI", cashierUser
      );

      const summary = await SaleService.getDailySummary();

      expect(summary.byPaymentMethod).toHaveLength(2);
      const methods = summary.byPaymentMethod.map((m) => m._id);
      expect(methods).toContain("CASH");
      expect(methods).toContain("UPI");
    });

    it("should not include refunded sales in summary", async () => {
      const sale = await SaleService.checkout(
        [{ product: product1._id, quantity: 1 }],
        null, "CASH", cashierUser
      );
      await SaleService.refund(sale._id, adminUser._id, "Test refund");

      const summary = await SaleService.getDailySummary();
      expect(summary.saleCount).toBe(0);
      expect(summary.totalRevenue).toBe(0);
    });
  });
});
