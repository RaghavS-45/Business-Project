import { describe, it, expect } from "vitest";
import ProductService from "../../services/product.service.js";
import CustomerService from "../../services/customer.service.js";
import SaleService from "../../services/sale.service.js";
import "../../models/Vendor.js"; // product list populates vendor
import { createTestUser, createTestProduct, createTestCustomer } from "../helpers.js";

/** Search-as-you-type used by the command palette and list pages. */
describe("Search", () => {
  const base = { page: 1, limit: 20, isActive: true, sortBy: "createdAt", sortOrder: "desc" };

  it("finds products by part of the name or SKU", async () => {
    await createTestProduct({ name: "Sugar (loose)", sku: "SUG-001" });
    await createTestProduct({ name: "Tata Salt", sku: "SLT-002" });
    expect((await ProductService.list({ ...base, search: "sug" })).products.map((p) => p.name)).toEqual(["Sugar (loose)"]);
    expect((await ProductService.list({ ...base, search: "slt-0" })).products.map((p) => p.name)).toEqual(["Tata Salt"]);
  });

  it("treats special characters literally", async () => {
    await createTestProduct({ name: "Sugar (loose)" });
    expect((await ProductService.list({ ...base, search: "(loose" })).products).toHaveLength(1);
  });

  it("finds customers by name, phone or GSTIN", async () => {
    await createTestCustomer({ name: "Gupta General Store", phone: "9898989898", gstin: "07AAFPG1234K1Z2" });
    await createTestCustomer({ name: "Mehta Retail" });
    const q = (search) => CustomerService.list({ ...base, sortBy: "name", sortOrder: "asc", search });
    expect((await q("gupta")).customers).toHaveLength(1);
    expect((await q("98989")).customers).toHaveLength(1);
    expect((await q("aafpg")).customers).toHaveLength(1);
  });

  it("finds sales by invoice number", async () => {
    const { user } = await createTestUser({ role: "ADMIN" });
    const p = await createTestProduct({ stock: 10 });
    const sale = await SaleService.checkout([{ product: p._id, quantity: 1 }], null, "CASH", user);
    const res = await SaleService.list({ ...base, search: sale.invoiceNumber.slice(-4) });
    expect(res.sales.map((s) => s.invoiceNumber)).toEqual([sale.invoiceNumber]);
  });
});
