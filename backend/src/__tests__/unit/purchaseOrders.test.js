import { describe, it, expect, beforeEach } from "vitest";
import PurchaseOrderService from "../../services/purchaseOrder.service.js";
import Product from "../../models/Product.js";
import Vendor from "../../models/Vendor.js";
import { renderPurchaseOrderPdf } from "../../services/purchaseOrderPdf.service.js";
import { createTestUser, createTestProduct } from "../helpers.js";

/**
 * Purchase orders: packs, editing, search, reorder suggestions.
 */
describe("Purchase orders", () => {
  let admin, vendor, oil, rice;

  beforeEach(async () => {
    admin = (await createTestUser({ role: "ADMIN" })).user;
    vendor = await Vendor.create({ name: "Sharma Distributors" });
    oil = await createTestProduct({
      name: "Sunflower Oil 1L",
      unit: "pcs",
      costPrice: 150,
      stock: 4,
      lowStockThreshold: 10,
      packs: [{ name: "carton", size: 12 }],
      vendor: vendor._id,
    });
    rice = await createTestProduct({ name: "Rice loose", unit: "kg", costPrice: 60, stock: 50, lowStockThreshold: 20 });
  });

  const create = (items, extra = {}) => PurchaseOrderService.create({ vendor: vendor._id, items, ...extra }, admin._id);
  const stock = async (p) => (await Product.findById(p._id)).stock;

  it("orders in packs, with cost per pack defaulting from the product", async () => {
    const po = await create([{ product: oil._id, quantity: 3, unit: "carton" }]);
    expect(po.items[0].unit).toBe("carton");
    expect(po.items[0].unitSize).toBe(12);
    expect(po.items[0].unitCost).toBe(1800);
  });

  it("receiving adds packs as base units, and loose quantities exactly", async () => {
    const po = await create([
      { product: oil._id, quantity: 3, unit: "carton", unitCost: 1750 },
      { product: rice._id, quantity: 12.5, unitCost: 58 },
    ]);
    await PurchaseOrderService.updateStatus(po._id, "approved", admin._id);
    await PurchaseOrderService.updateStatus(po._id, "received", admin._id);
    expect(await stock(oil)).toBe(40);
    expect(await stock(rice)).toBe(62.5);
  });

  it("refuses a pack the product doesn't have, or half a carton", async () => {
    await expect(create([{ product: oil._id, quantity: 1, unit: "crate" }])).rejects.toThrow(/no crate pack/);
    await expect(create([{ product: oil._id, quantity: 1.5, unit: "carton" }])).rejects.toThrow(/whole numbers/);
  });

  it("lets a pending PO's lines and supplier be edited, but not an approved one", async () => {
    const po = await create([{ product: oil._id, quantity: 1, unit: "carton" }]);
    const other = await Vendor.create({ name: "Fresh Farms" });
    const edited = await PurchaseOrderService.update(
      po._id,
      { vendor: other._id, items: [{ product: rice._id, quantity: 30 }] },
      admin._id
    );
    expect(String(edited.vendor)).toBe(String(other._id));
    expect(edited.items).toHaveLength(1);
    expect(edited.items[0].productName).toBe("Rice loose");
    await PurchaseOrderService.updateStatus(po._id, "approved", admin._id);
    await expect(PurchaseOrderService.update(po._id, { notes: "x" }, admin._id)).rejects.toThrow(/Only pending/);
  });

  it("searches by PO number, supplier or product", async () => {
    const po = await create([{ product: oil._id, quantity: 1 }]);
    const find = (search) => PurchaseOrderService.list({ page: 1, limit: 10, search, sortBy: "createdAt", sortOrder: "desc" });
    expect((await find("sharma")).purchaseOrders).toHaveLength(1);
    expect((await find("sunflower")).purchaseOrders).toHaveLength(1);
    expect((await find(po.poNumber.slice(-4))).purchaseOrders).toHaveLength(1);
    expect((await find("nothing-like-this")).purchaseOrders).toHaveLength(0);
  });

  describe("reorder suggestions", () => {
    it("suggests low-stock items in their pack, up to twice the reorder level", async () => {
      const [s] = await PurchaseOrderService.reorderSuggestions();
      expect(s.name).toBe("Sunflower Oil 1L");
      // needs 20 − 4 = 16 pcs → 2 cartons
      expect(s.unit).toBe("carton");
      expect(s.quantity).toBe(2);
      expect(s.unitCost).toBe(1800);
      expect(s.vendor.name).toBe("Sharma Distributors");
    });

    it("counts what is already on order", async () => {
      await create([{ product: oil._id, quantity: 2, unit: "carton" }]);
      expect(await PurchaseOrderService.reorderSuggestions()).toHaveLength(0);
    });

    it("ignores products above their reorder level", async () => {
      await Product.updateOne({ _id: oil._id }, { stock: 11 });
      expect(await PurchaseOrderService.reorderSuggestions()).toHaveLength(0);
    });
  });

  it("renders a PDF for the supplier", async () => {
    const po = await create([{ product: oil._id, quantity: 2, unit: "carton" }], { notes: "Deliver to back gate" });
    const full = await PurchaseOrderService.getById(po._id);
    const pdf = await renderPurchaseOrderPdf(full, { tradeName: "Test Traders", stateCode: "07" });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });
});

describe("Purchase order totals", () => {
  it("list and detail carry the total", async () => {
    const admin = (await createTestUser({ role: "ADMIN" })).user;
    const vendor = await Vendor.create({ name: "Totals Co" });
    const p = await createTestProduct({ costPrice: 10.5 });
    const po = await PurchaseOrderService.create({ vendor: vendor._id, items: [{ product: p._id, quantity: 3, unitCost: 10.55 }] }, admin._id);
    const list = await PurchaseOrderService.list({ page: 1, limit: 5, sortBy: "createdAt", sortOrder: "desc" });
    expect(list.purchaseOrders[0].totalAmount).toBe(31.65);
    expect((await PurchaseOrderService.getById(po._id)).totalAmount).toBe(31.65);
  });
});
