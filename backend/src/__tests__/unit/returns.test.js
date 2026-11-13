import { describe, it, expect, beforeEach } from "vitest";
import SaleService from "../../services/sale.service.js";
import ReturnService from "../../services/return.service.js";
import Product from "../../models/Product.js";
import Customer from "../../models/Customer.js";
import CreditNote from "../../models/CreditNote.js";
import StoreSettings from "../../models/StoreSettings.js";
import { renderCreditNotePdf } from "../../services/invoicePdf.service.js";
import { createTestUser, createTestProduct, createTestCustomer } from "../helpers.js";

/**
 * Returns & credit notes — partial returns, exact totals, stock, loyalty.
 */

const paise = (r) => Math.round(r * 100);

describe("Returns & credit notes", () => {
  let admin, product, customer;

  beforeEach(async () => {
    admin = (await createTestUser({ role: "ADMIN" })).user;
    product = await createTestProduct({ sellingPrice: 1000, taxRate: 0, stock: 50 });
    customer = await createTestCustomer();
  });

  const sell = (items, cust = customer._id) => SaleService.checkout(items, cust, "CASH", admin);
  const ret = (sale, items, reason = "Customer returned goods", extra = {}) =>
    ReturnService.createReturn(sale._id, { items, reason, ...extra }, admin._id);

  it("returns part of a sale and issues a numbered credit note", async () => {
    const sale = await sell([{ product: product._id, quantity: 3 }]);
    const { creditNote, sale: after } = await ret(sale, [{ product: String(product._id), quantity: 1 }]);

    expect(creditNote.creditNoteNumber).toMatch(/^CN-\d{8}-0001$/);
    expect(creditNote.invoiceNumber).toBe(sale.invoiceNumber);
    expect(creditNote.total).toBe(1000);
    expect(creditNote.refundMethod).toBe("CASH"); // defaults to the sale's payment method
    expect(after.status).toBe("PARTIALLY_RETURNED");
    expect(after.returnedTotal).toBe(1000);
    expect(after.items[0].returnedQuantity).toBe(1);
    expect((await Product.findById(product._id)).stock).toBe(48); // 50 − 3 + 1
  });

  it("marks the sale REFUNDED once everything is returned", async () => {
    const sale = await sell([{ product: product._id, quantity: 3 }]);
    await ret(sale, [{ product: String(product._id), quantity: 1 }]);
    const { sale: after } = await ret(sale, [{ product: String(product._id), quantity: 2 }]);
    expect(after.status).toBe("REFUNDED");
    expect(after.paymentStatus).toBe("REFUNDED");
    expect(await CreditNote.countDocuments({ sale: sale._id })).toBe(2);
  });

  it("refuses to return more than is left", async () => {
    const sale = await sell([{ product: product._id, quantity: 3 }]);
    await ret(sale, [{ product: String(product._id), quantity: 2 }]);
    await expect(ret(sale, [{ product: String(product._id), quantity: 2 }])).rejects.toThrow(/only 1 of 3/);
    // The failed return changed nothing
    expect(await CreditNote.countDocuments()).toBe(1);
    expect((await Product.findById(product._id)).stock).toBe(49);
  });

  it("refuses products that weren't on the invoice", async () => {
    const other = await createTestProduct({ sellingPrice: 10 });
    const sale = await sell([{ product: product._id, quantity: 1 }]);
    await expect(ret(sale, [{ product: String(other._id), quantity: 1 }])).rejects.toThrow(/not on invoice/);
  });

  it("credit notes for a fully returned sale add up to the invoice exactly", async () => {
    await StoreSettings.create({ _id: "store", stateCode: "07", gstin: "07AAACS1234A1Z5" });
    const odd = await createTestProduct({ sellingPrice: 33.33, taxRate: 18, stock: 100 });
    const odd2 = await createTestProduct({ sellingPrice: 19.99, taxRate: 5, stock: 100 });
    // Gold-tier customer so a loyalty discount is in the mix too
    const loyal = await createTestCustomer({ loyaltyPoints: 600 });
    const sale = await sell(
      [
        { product: odd._id, quantity: 7, discountPercent: 3 },
        { product: odd2._id, quantity: 5 },
      ],
      loyal._id
    );

    const cns = [];
    for (const [a, b] of [[2, 1], [2, 0], [3, 4]]) {
      const items = [];
      if (a) items.push({ product: String(odd._id), quantity: a });
      if (b) items.push({ product: String(odd2._id), quantity: b });
      cns.push((await ret(sale, items)).creditNote);
    }

    const sum = (k) => cns.reduce((s, cn) => s + paise(cn[k]), 0);
    expect(sum("total")).toBe(paise(sale.grandTotal));
    expect(sum("taxableTotal")).toBe(paise(sale.taxableTotal));
    expect(sum("cgstTotal")).toBe(paise(sale.cgstTotal));
    expect(sum("sgstTotal")).toBe(paise(sale.sgstTotal));
    for (const cn of cns) {
      expect(paise(cn.taxableTotal) + paise(cn.taxTotal)).toBe(paise(cn.total));
    }
  });

  it("does not restock damaged goods", async () => {
    const sale = await sell([{ product: product._id, quantity: 3 }]);
    const { creditNote } = await ret(sale, [{ product: String(product._id), quantity: 2, restock: false }], "Damaged");
    expect(creditNote.items[0].restocked).toBe(false);
    expect((await Product.findById(product._id)).stock).toBe(47); // nothing put back
  });

  it("takes back loyalty points and purchases for the returned part", async () => {
    // 2 × ₹1000 = ₹2000 → 20 points
    const sale = await sell([{ product: product._id, quantity: 2 }]);
    expect((await Customer.findById(customer._id)).loyaltyPoints).toBe(20);

    await ret(sale, [{ product: String(product._id), quantity: 1 }]);
    let c = await Customer.findById(customer._id);
    expect(c.loyaltyPoints).toBe(10);
    expect(c.totalPurchases).toBe(1000);

    await ret(sale, [{ product: String(product._id), quantity: 1 }]);
    c = await Customer.findById(customer._id);
    expect(c.loyaltyPoints).toBe(0);
    expect(c.totalPurchases).toBe(0);
  });

  it("full refund after a partial return only returns what's left", async () => {
    const sale = await sell([{ product: product._id, quantity: 3 }]);
    await ret(sale, [{ product: String(product._id), quantity: 1 }]);
    const after = await SaleService.refund(sale._id, admin._id, "Rest returned");
    expect(after.status).toBe("REFUNDED");
    expect(after.returnedTotal).toBe(3000);
    expect((await Product.findById(product._id)).stock).toBe(50);
    const cns = await ReturnService.listForSale(sale._id);
    expect(cns.map((c) => c.total)).toEqual([1000, 2000]);
  });

  it("two simultaneous returns can't take back more than was sold", async () => {
    const sale = await sell([{ product: product._id, quantity: 3 }]);
    const results = await Promise.allSettled([
      ret(sale, [{ product: String(product._id), quantity: 2 }]),
      ret(sale, [{ product: String(product._id), quantity: 2 }]),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await Product.findById(product._id)).stock).toBe(49); // 50 − 3 + 2
  }, 20_000);

  it("revenue on the dashboard is net of returns", async () => {
    const sale = await sell([{ product: product._id, quantity: 3 }]);
    await ret(sale, [{ product: String(product._id), quantity: 1 }]);
    const summary = await SaleService.getDailySummary();
    expect(summary.totalRevenue).toBe(2000);
    expect(summary.saleCount).toBe(1);
  });

  it("renders a credit note PDF", async () => {
    const sale = await sell([{ product: product._id, quantity: 3 }]);
    const { creditNote } = await ret(sale, [{ product: String(product._id), quantity: 1 }]);
    const pdf = await renderCreditNotePdf(creditNote);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
