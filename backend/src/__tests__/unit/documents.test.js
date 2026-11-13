import { describe, it, expect, beforeEach } from "vitest";
import QuotationService from "../../services/quotation.service.js";
import ChallanService from "../../services/challan.service.js";
import SaleService from "../../services/sale.service.js";
import Product from "../../models/Product.js";
import Quotation from "../../models/Quotation.js";
import DeliveryChallan from "../../models/DeliveryChallan.js";
import Customer from "../../models/Customer.js";
import Sale from "../../models/Sale.js";
import StoreSettings from "../../models/StoreSettings.js";
import { renderQuotationPdf, renderChallanPdf } from "../../services/invoicePdf.service.js";
import { createTestUser, createTestProduct, createTestCustomer } from "../helpers.js";

/**
 * Quotations and delivery challans.
 */
describe("Quotations and challans", () => {
  let admin, product, customer;

  beforeEach(async () => {
    admin = (await createTestUser({ role: "ADMIN" })).user;
    await StoreSettings.create({ _id: "store", tradeName: "Test Traders", stateCode: "07" });
    product = await createTestProduct({
      sellingPrice: 100,
      taxRate: 18,
      stock: 100,
      unit: "pcs",
      packs: [{ name: "box", size: 10 }],
      levelPrices: { wholesale: 90 },
    });
    customer = await createTestCustomer({ name: "Gupta Stores", priceLevel: "WHOLESALE", stateCode: "07" });
  });

  const stock = async () => (await Product.findById(product._id)).stock;
  const quote = (extra = {}) =>
    QuotationService.create(
      { customer: customer._id, items: [{ product: product._id, quantity: 2, unit: "box", discountPercent: 5 }], ...extra },
      admin
    );

  describe("quotations", () => {
    it("prices like checkout (customer's level, pack, GST) and moves no stock", async () => {
      const q = await quote();
      expect(q.quoteNumber).toMatch(/^QT-\d{8}-0001$/);
      expect(q.items[0].unitPrice).toBe(900); // wholesale 90 × box of 10
      expect(q.items[0].priceSource).toBe("Wholesale");
      expect(q.taxableTotal).toBe(1710); // 1800 less 5%
      expect(q.cgstTotal + q.sgstTotal).toBe(307.8);
      expect(q.grandTotal).toBe(2017.8);
      expect(q.isExpired).toBe(false);
      expect(await stock()).toBe(100);
    });

    it("its invoice comes to the same total and marks it converted", async () => {
      const q = await quote();
      const sale = await SaleService.checkout(
        q.items.map((i) => ({ product: i.product, quantity: i.quantity, unit: i.unit, discountPercent: i.discountPercent })),
        customer._id,
        "CASH",
        admin,
        "",
        { quotationId: q._id }
      );
      expect(sale.grandTotal).toBe(q.grandTotal);
      expect(sale.quoteNumber).toBe(q.quoteNumber);
      const after = await Quotation.findById(q._id);
      expect(after.status).toBe("CONVERTED");
      expect(after.convertedTo.number).toBe(sale.invoiceNumber);
    });

    it("can't be billed twice", async () => {
      const q = await quote();
      const bill = () =>
        SaleService.checkout([{ product: product._id, quantity: 1 }], customer._id, "CASH", admin, "", { quotationId: q._id });
      await bill();
      await expect(bill()).rejects.toThrow(/converted/);
      expect(await Sale.countDocuments()).toBe(1);
    });

    it("works for a party that isn't a saved customer (retail prices)", async () => {
      const q = await QuotationService.create(
        { partyName: "New Shop", partyPhone: "9876543210", items: [{ product: product._id, quantity: 3 }] },
        admin
      );
      expect(q.buyer.name).toBe("New Shop");
      expect(q.items[0].unitPrice).toBe(100);
    });

    it("tracks accepted / declined, and shows expiry", async () => {
      const q = await quote({ validDays: 1 });
      expect((await QuotationService.setStatus(q._id, "ACCEPTED")).status).toBe("ACCEPTED");
      await Quotation.updateOne({ _id: q._id }, { validUntil: new Date(Date.now() - 1000) });
      expect((await QuotationService.getById(q._id)).isExpired).toBe(true);
      const expired = await QuotationService.list({ status: "EXPIRED" });
      expect(expired.quotations).toHaveLength(1);
    });
  });

  describe("delivery challans", () => {
    const challan = (extra = {}) =>
      ChallanService.create(
        { customer: customer._id, items: [{ product: product._id, quantity: 3, unit: "box" }], vehicleNumber: "dl01ab1234", ...extra },
        admin
      );

    it("takes the stock when the goods leave", async () => {
      const c = await challan();
      expect(c.challanNumber).toMatch(/^DC-\d{8}-0001$/);
      expect(c.status).toBe("OPEN");
      expect(c.vehicleNumber).toBe("DL01AB1234");
      expect(await stock()).toBe(70);
    });

    it("refuses more than is in stock", async () => {
      await expect(challan({ items: [{ product: product._id, quantity: 11, unit: "box" }] })).rejects.toThrow(/Insufficient stock/);
      expect(await DeliveryChallan.countDocuments()).toBe(0);
    });

    it("invoicing it doesn't take stock again, and only happens once", async () => {
      const c = await challan();
      const sale = await ChallanService.invoice(c._id, { paymentMethod: "CREDIT" }, admin);
      expect(await stock()).toBe(70);
      expect(sale.challanNumber).toBe(c.challanNumber);
      expect(sale.grandTotal).toBe(c.grandTotal);
      expect(sale.balanceDue).toBe(c.grandTotal);
      expect((await Customer.findById(customer._id)).outstanding).toBe(c.grandTotal);
      const after = await DeliveryChallan.findById(c._id);
      expect(after.status).toBe("INVOICED");
      expect(after.invoiceNumber).toBe(sale.invoiceNumber);
      await expect(ChallanService.invoice(c._id, { paymentMethod: "CASH" }, admin)).rejects.toThrow(/already invoiced/);
    });

    it("concurrent invoices for one challan make one sale", async () => {
      const c = await challan();
      const results = await Promise.allSettled([
        ChallanService.invoice(c._id, { paymentMethod: "CASH" }, admin),
        ChallanService.invoice(c._id, { paymentMethod: "CASH" }, admin),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await Sale.countDocuments()).toBe(1);
    });

    it("cancelling puts the stock back", async () => {
      const c = await challan();
      await ChallanService.cancel(c._id, "Buyer refused");
      expect(await stock()).toBe(100);
      await expect(ChallanService.invoice(c._id, { paymentMethod: "CASH" }, admin)).rejects.toThrow(/cancelled/);
    });

    it("can be made from a quotation (its lines, its customer)", async () => {
      const q = await quote();
      const c = await ChallanService.create({ quotation: q._id }, admin);
      expect(String(c.customer)).toBe(String(customer._id));
      expect(c.grandTotal).toBe(q.grandTotal);
      expect(c.quoteNumber).toBe(q.quoteNumber);
      expect(await stock()).toBe(80);
      expect((await Quotation.findById(q._id)).convertedTo.kind).toBe("CHALLAN");
    });
  });

  it("renders quotation and challan PDFs", async () => {
    const q = await quote();
    const c = await ChallanService.create({ customer: customer._id, items: [{ product: product._id, quantity: 1 }] }, admin);
    const [qPdf, cPdf] = await Promise.all([renderQuotationPdf(q), renderChallanPdf(c)]);
    expect(qPdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(cPdf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
