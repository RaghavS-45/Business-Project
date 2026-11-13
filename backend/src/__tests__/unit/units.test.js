import { describe, it, expect, beforeEach } from "vitest";
import SaleService from "../../services/sale.service.js";
import ReturnService from "../../services/return.service.js";
import Product from "../../models/Product.js";
import { resolveLine } from "../../utils/unitPricing.js";
import { createTestUser, createTestProduct, createTestCustomer } from "../helpers.js";

/**
 * Selling units (loose / packs), price levels and bulk slabs.
 */
describe("Units & price lists", () => {
  let admin;

  beforeEach(async () => {
    admin = (await createTestUser({ role: "ADMIN" })).user;
  });

  const sell = (items, customerId = null) => SaleService.checkout(items, customerId, "CASH", admin);
  const stockOf = async (p) => (await Product.findById(p._id)).stock;

  describe("loose quantities", () => {
    it("sells 2.5 kg and takes exactly that from stock", async () => {
      const sugar = await createTestProduct({ unit: "kg", sellingPrice: 48, taxRate: 0, stock: 100 });
      const sale = await sell([{ product: sugar._id, quantity: 2.5 }]);
      expect(sale.grandTotal).toBe(120);
      expect(sale.items[0]).toMatchObject({ quantity: 2.5, unit: "kg", unitSize: 1, baseQuantity: 2.5 });
      expect(await stockOf(sugar)).toBe(97.5);
    });

    it("keeps stock exact after many small sales (no float drift)", async () => {
      const oil = await createTestProduct({ unit: "ltr", sellingPrice: 150, taxRate: 0, stock: 1 });
      for (let i = 0; i < 10; i++) await sell([{ product: oil._id, quantity: 0.1 }]);
      expect(await stockOf(oil)).toBe(0);
    });

    it("refuses fractions of counted units", async () => {
      const pen = await createTestProduct({ unit: "pcs", sellingPrice: 10 });
      await expect(sell([{ product: pen._id, quantity: 1.5 }])).rejects.toThrow(/whole numbers/);
    });

    it("refuses more than 3 decimals", async () => {
      const sugar = await createTestProduct({ unit: "kg", sellingPrice: 48 });
      await expect(sell([{ product: sugar._id, quantity: 1.2345 }])).rejects.toThrow(/3 decimals/);
    });
  });

  describe("packs", () => {
    let soap;
    beforeEach(async () => {
      soap = await createTestProduct({
        unit: "pcs",
        sellingPrice: 40,
        taxRate: 0,
        stock: 100,
        packs: [
          { name: "carton", size: 24, price: 900 },
          { name: "box", size: 6 }, // no own price → 6 × 40
        ],
      });
    });

    it("sells cartons at the carton price and takes pieces from stock", async () => {
      const sale = await sell([{ product: soap._id, quantity: 2, unit: "carton" }]);
      expect(sale.items[0]).toMatchObject({ unit: "carton", unitSize: 24, baseQuantity: 48, unitPrice: 900, baseUnit: "pcs" });
      expect(sale.grandTotal).toBe(1800);
      expect(await stockOf(soap)).toBe(52);
    });

    it("prices a pack without its own price as size × unit price", async () => {
      const sale = await sell([{ product: soap._id, quantity: 1, unit: "box" }]);
      expect(sale.items[0].unitPrice).toBe(240);
    });

    it("sells pieces and cartons of the same product on one bill", async () => {
      const sale = await sell([
        { product: soap._id, quantity: 1, unit: "carton" },
        { product: soap._id, quantity: 3 },
      ]);
      expect(sale.grandTotal).toBe(1020);
      expect(await stockOf(soap)).toBe(73);
    });

    it("refuses an unknown pack and fractional packs", async () => {
      await expect(sell([{ product: soap._id, quantity: 1, unit: "crate" }])).rejects.toThrow(/isn't sold by the crate/);
      await expect(sell([{ product: soap._id, quantity: 1.5, unit: "carton" }])).rejects.toThrow(/whole numbers/);
    });

    it("checks stock in base units", async () => {
      await expect(sell([{ product: soap._id, quantity: 5, unit: "carton" }])).rejects.toThrow(/requested 120 pcs, available 100/);
    });

    it("returns cartons back to stock as pieces, by invoice line", async () => {
      const sale = await sell([
        { product: soap._id, quantity: 2, unit: "carton" },
        { product: soap._id, quantity: 4 },
      ]);
      expect(await stockOf(soap)).toBe(48);
      // Same product on two lines → must say which line
      await expect(
        ReturnService.createReturn(sale._id, { items: [{ product: String(soap._id), quantity: 1 }], reason: "x x x" }, admin._id)
      ).rejects.toThrow(/several lines/);

      const { creditNote } = await ReturnService.createReturn(
        sale._id,
        { items: [{ line: 0, quantity: 1 }], reason: "One carton damaged in transit" },
        admin._id
      );
      expect(creditNote.items[0]).toMatchObject({ line: 0, unit: "carton", unitSize: 24, quantity: 1 });
      expect(creditNote.total).toBe(900);
      expect(await stockOf(soap)).toBe(72);
    });
  });

  describe("price levels & bulk slabs", () => {
    let rice;
    beforeEach(async () => {
      rice = await createTestProduct({
        unit: "kg",
        sellingPrice: 60,
        taxRate: 0,
        stock: 1000,
        levelPrices: { wholesale: 55, distributor: 50 },
        priceSlabs: [
          { minQty: 50, price: 52 },
          { minQty: 100, price: 49 },
        ],
      });
    });

    it("walk-ins and retail customers pay the selling price", async () => {
      const sale = await sell([{ product: rice._id, quantity: 10 }]);
      expect(sale.items[0]).toMatchObject({ unitPrice: 60, priceSource: "Retail" });
    });

    it("wholesale and distributor customers get their level price", async () => {
      const w = await createTestCustomer({ priceLevel: "WHOLESALE" });
      const d = await createTestCustomer({ priceLevel: "DISTRIBUTOR" });
      expect((await sell([{ product: rice._id, quantity: 10 }], w._id)).items[0]).toMatchObject({ unitPrice: 55, priceSource: "Wholesale" });
      expect((await sell([{ product: rice._id, quantity: 10 }], d._id)).items[0]).toMatchObject({ unitPrice: 50, priceSource: "Distributor" });
    });

    it("bulk slabs lower the price once the quantity is reached", async () => {
      expect((await sell([{ product: rice._id, quantity: 49.5 }])).items[0].unitPrice).toBe(60);
      expect((await sell([{ product: rice._id, quantity: 50 }])).items[0]).toMatchObject({ unitPrice: 52, priceSource: "Bulk 50+ kg" });
      expect((await sell([{ product: rice._id, quantity: 120 }])).items[0].unitPrice).toBe(49);
    });

    it("a slab never raises a better level price", async () => {
      const d = await createTestCustomer({ priceLevel: "DISTRIBUTOR" });
      const sale = await sell([{ product: rice._id, quantity: 60 }], d._id); // slab 52 > distributor 50
      expect(sale.items[0]).toMatchObject({ unitPrice: 50, priceSource: "Distributor" });
    });

    it("ignores any price sent by the client", async () => {
      const sale = await sell([{ product: rice._id, quantity: 1, unitPrice: 1 }]);
      expect(sale.items[0].unitPrice).toBe(60);
    });
  });

  it("pack slabs count base units, and the lower of pack price and slab price wins", () => {
    const p = {
      unit: "pcs",
      sellingPrice: 10,
      packs: [{ name: "carton", size: 100, price: 950 }],
      priceSlabs: [{ minQty: 200, price: 9 }],
    };
    expect(resolveLine(p, { unit: "carton", quantity: 1 })).toMatchObject({ unitPrice: 950, priceSource: "carton price" });
    // 3 cartons = 300 pcs → slab 9/pc = 900/carton beats 950
    expect(resolveLine(p, { unit: "carton", quantity: 3 })).toMatchObject({ unitPrice: 900, baseQty: 300, priceSource: "Bulk 200+ pcs" });
  });
});
