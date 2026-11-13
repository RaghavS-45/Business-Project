import { describe, it, expect } from "vitest";
import SaleService from "../../services/sale.service.js";
import StoreSettings from "../../models/StoreSettings.js";
import { renderInvoicePdf } from "../../services/invoicePdf.service.js";
import { priceLine, priceCart } from "../../utils/pricing.js";
import { amountInWords, splitTax, stateFromGstin, GSTIN_REGEX } from "../../utils/gst.js";
import { createTestUser, createTestProduct, createTestCustomer } from "../helpers.js";

/**
 * GST — pricing modes, CGST/SGST vs IGST, invoice snapshot and PDF.
 */

describe("GST pricing", () => {
  it("adds GST on top for exclusive prices (wholesale default)", () => {
    const line = priceLine({ quantity: 10, unitPrice: 100, taxPercent: 18 });
    expect(line).toMatchObject({ raw: 100000, taxable: 100000, tax: 18000, total: 118000 });
  });

  it("extracts GST from inclusive prices", () => {
    const line = priceLine({ quantity: 1, unitPrice: 118, taxPercent: 18 }, 0, { taxInclusive: true });
    expect(line).toMatchObject({ taxable: 10000, tax: 1800, total: 11800 });
  });

  it("charges GST on the value after discounts", () => {
    const line = priceLine({ quantity: 2, unitPrice: 500, discountPercent: 10, taxPercent: 12 });
    // 1000 − 100 = 900 taxable, 108 tax
    expect(line).toMatchObject({ taxable: 90000, tax: 10800, total: 100800 });
  });

  it("cart totals add up exactly in both modes", () => {
    const items = [
      { quantity: 3, unitPrice: 33.33, taxPercent: 5 },
      { quantity: 7, unitPrice: 19.99, taxPercent: 18, discountPercent: 3 },
      { quantity: 1, unitPrice: 999.99, taxPercent: 28 },
    ];
    for (const taxInclusive of [false, true]) {
      const c = priceCart(items, 5, { taxInclusive });
      expect(c.taxable + c.tax).toBe(c.grandTotal);
      expect(c.lines.reduce((s, l) => s + l.total, 0)).toBe(c.grandTotal);
    }
  });

  it("splits tax into CGST/SGST with no paisa lost, or all IGST", () => {
    expect(splitTax(1801, false)).toEqual({ cgst: 901, sgst: 900, igst: 0 });
    expect(splitTax(1801, true)).toEqual({ cgst: 0, sgst: 0, igst: 1801 });
  });

  it("reads the state from a GSTIN", () => {
    expect(GSTIN_REGEX.test("27AAPFU0939F1ZV")).toBe(true);
    expect(stateFromGstin("27AAPFU0939F1ZV")).toBe("27");
    expect(stateFromGstin("")).toBeNull();
  });

  it("writes amounts in words with lakh and crore", () => {
    expect(amountInWords(1234.5)).toBe("Rupees One Thousand Two Hundred Thirty Four and Fifty Paise Only");
    expect(amountInWords(12500000)).toBe("Rupees One Crore Twenty Five Lakh Only");
    expect(amountInWords(0)).toBe("Rupees Zero Only");
  });
});

describe("Checkout with GST", () => {
  const setupStore = (overrides = {}) =>
    StoreSettings.create({
      _id: "store",
      legalName: "Sharma Traders Pvt Ltd",
      tradeName: "Sharma Traders",
      gstin: "07AAACS1234A1Z5",
      stateCode: "07",
      address: "12 Chandni Chowk, Delhi",
      ...overrides,
    });

  const setup = async () => {
    const { user } = await createTestUser({ role: "ADMIN" });
    const product = await createTestProduct({ sellingPrice: 100, taxRate: 18, hsnCode: "8517", stock: 100 });
    return { user, product };
  };

  it("charges CGST + SGST to a buyer in the same state", async () => {
    await setupStore();
    const { user, product } = await setup();
    const buyer = await createTestCustomer({ name: "Delhi Buyer", gstin: "07AAPFU0939F1ZV", stateCode: "07" });

    const sale = await SaleService.checkout([{ product: product._id, quantity: 10 }], buyer._id, "UPI", user);

    expect(sale.interState).toBe(false);
    expect(sale.taxableTotal).toBe(1000);
    expect(sale.cgstTotal).toBe(90);
    expect(sale.sgstTotal).toBe(90);
    expect(sale.igstTotal).toBe(0);
    expect(sale.grandTotal).toBe(1180);
    expect(sale.items[0]).toMatchObject({ hsnCode: "8517", taxPercent: 18, taxableValue: 1000, cgst: 90, sgst: 90 });
    expect(sale.placeOfSupply.code).toBe("07");
  });

  it("charges IGST to a buyer in another state (state taken from GSTIN)", async () => {
    await setupStore();
    const { user, product } = await setup();
    const buyer = await createTestCustomer({ name: "Mumbai Buyer", gstin: "27AAPFU0939F1ZV" });

    const sale = await SaleService.checkout([{ product: product._id, quantity: 10 }], buyer._id, "CASH", user);

    expect(sale.interState).toBe(true);
    expect(sale.igstTotal).toBe(180);
    expect(sale.cgstTotal + sale.sgstTotal).toBe(0);
    expect(sale.placeOfSupply).toMatchObject({ code: "27", name: "Maharashtra" });
    expect(sale.buyer).toMatchObject({ name: "Mumbai Buyer", gstin: "27AAPFU0939F1ZV", stateCode: "27" });
  });

  it("treats walk-in sales as intra-state", async () => {
    await setupStore();
    const { user, product } = await setup();
    const sale = await SaleService.checkout([{ product: product._id, quantity: 1 }], null, "CASH", user);
    expect(sale.interState).toBe(false);
    expect(sale.cgstTotal).toBe(9);
    expect(sale.sgstTotal).toBe(9);
  });

  it("extracts GST when the store uses inclusive prices", async () => {
    await setupStore({ pricesIncludeTax: true });
    const { user } = await createTestUser({ role: "ADMIN" });
    const product = await createTestProduct({ sellingPrice: 118, taxRate: 18 });
    const sale = await SaleService.checkout([{ product: product._id, quantity: 1 }], null, "CASH", user);
    expect(sale.grandTotal).toBe(118);
    expect(sale.taxableTotal).toBe(100);
    expect(sale.cgstTotal + sale.sgstTotal).toBe(18);
  });

  it("snapshots the seller, so later edits don't change issued invoices", async () => {
    await setupStore();
    const { user, product } = await setup();
    const sale = await SaleService.checkout([{ product: product._id, quantity: 1 }], null, "CASH", user);
    await StoreSettings.updateOne({ _id: "store" }, { $set: { tradeName: "Renamed Co" } });
    const again = await SaleService.getById(sale._id);
    expect(again.seller.tradeName).toBe("Sharma Traders");
    expect(again.seller.gstin).toBe("07AAACS1234A1Z5");
  });

  it("works before any store settings are saved (no GST state → intra-state)", async () => {
    const { user, product } = await setup();
    const sale = await SaleService.checkout([{ product: product._id, quantity: 1 }], null, "CASH", user);
    expect(sale.interState).toBe(false);
    expect(sale.grandTotal).toBe(118);
  });

  it("renders a tax invoice PDF", async () => {
    await setupStore();
    const { user, product } = await setup();
    const buyer = await createTestCustomer({ name: "Mumbai Buyer", gstin: "27AAPFU0939F1ZV" });
    const sale = await SaleService.checkout([{ product: product._id, quantity: 3 }], buyer._id, "CASH", user);
    const pdf = await renderInvoicePdf(await SaleService.getById(sale._id));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2000);
  });
});
