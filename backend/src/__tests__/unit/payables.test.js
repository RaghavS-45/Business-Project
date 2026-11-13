import { describe, it, expect, beforeEach } from "vitest";
import PayableService from "../../services/payable.service.js";
import PurchaseOrderService from "../../services/purchaseOrder.service.js";
import Product from "../../models/Product.js";
import Vendor from "../../models/Vendor.js";
import PurchaseBill from "../../models/PurchaseBill.js";
import PurchaseOrder from "../../models/PurchaseOrder.js";
import StoreSettings from "../../models/StoreSettings.js";
import { createTestUser, createTestProduct } from "../helpers.js";

/**
 * Purchase bills and what we owe suppliers.
 */
describe("Payables", () => {
  let admin, product, vendor;

  beforeEach(async () => {
    admin = (await createTestUser({ role: "ADMIN" })).user;
    await StoreSettings.create({ _id: "store", tradeName: "Test Traders", stateCode: "07", gstin: "07AAACS1234A1Z5" });
    product = await createTestProduct({
      costPrice: 100,
      stock: 10,
      taxRate: 18,
      unit: "pcs",
      packs: [{ name: "carton", size: 12 }],
    });
    vendor = await Vendor.create({ name: "Delhi Supplies", gstin: "07AABCD1234E1Z2", paymentTermsDays: 30 });
  });

  const bill = (extra = {}) =>
    PayableService.createBill(
      {
        vendor: vendor._id,
        supplierInvoiceNo: `SI-${Math.random().toString(36).slice(2, 7)}`,
        items: [{ product: product._id, quantity: 2, unit: "carton", unitCost: 1320 }],
        ...extra,
      },
      admin._id
    );
  const owed = async (v = vendor) => (await Vendor.findById(v._id)).outstanding;
  const stock = async () => (await Product.findById(product._id)).stock;

  describe("posting a bill", () => {
    it("adds stock in base units and works out GST for a same-state supplier", async () => {
      const b = await bill();
      expect(b.billNumber).toMatch(/^PB-\d{8}-0001$/);
      expect(b.items[0].baseQuantity).toBe(24);
      expect(await stock()).toBe(34);
      expect(b.taxableTotal).toBe(2640);
      expect(b.cgstTotal).toBe(237.6);
      expect(b.sgstTotal).toBe(237.6);
      expect(b.igstTotal).toBe(0);
      expect(b.grandTotal).toBe(3115.2);
    });

    it("charges IGST for a supplier in another state", async () => {
      const mumbai = await Vendor.create({ name: "Mumbai Mills", gstin: "27AABCM1234E1Z2" });
      const b = await bill({ vendor: mumbai._id });
      expect(b.interState).toBe(true);
      expect(b.igstTotal).toBe(475.2);
      expect(b.cgstTotal).toBe(0);
    });

    it("moves the cost price to the weighted average (before GST)", async () => {
      // 10 pcs at ₹100 + 24 pcs at ₹110 → ₹107.06
      await bill();
      expect((await Product.findById(product._id)).costPrice).toBe(107.06);
    });

    it("puts the bill on credit with a due date from the supplier's terms", async () => {
      const b = await bill({ billDate: new Date("2026-11-01T00:00:00Z") });
      expect(b.paymentStatus).toBe("UNPAID");
      expect(b.balanceDue).toBe(3115.2);
      expect(b.dueDate.toISOString().slice(0, 10)).toBe("2026-12-01");
      expect(await owed()).toBe(3115.2);
    });

    it("records a part payment made with the bill", async () => {
      const b = await bill({ amountPaid: 1115.2, paymentMethod: "BANK" });
      expect(b.paymentStatus).toBe("PARTIAL");
      expect(b.balanceDue).toBe(2000);
      expect(await owed()).toBe(2000);
    });

    it("refuses the same supplier invoice twice", async () => {
      await bill({ supplierInvoiceNo: "INV/77" });
      await expect(bill({ supplierInvoiceNo: "inv/77" })).rejects.toThrow(/already entered/);
      expect(await stock()).toBe(34);
    });

    it("needs a payment method when something was paid", async () => {
      await expect(bill({ amountPaid: 100 })).rejects.toThrow(/how the paid amount/);
      expect(await stock()).toBe(10); // rolled back
    });
  });

  describe("with a purchase order", () => {
    const makePo = async () =>
      PurchaseOrderService.create(
        { vendor: vendor._id, items: [{ product: product._id, quantity: 24, unitCost: 110 }] },
        admin._id
      );

    it("receives an approved PO: stock comes in with the bill", async () => {
      const po = await makePo();
      await PurchaseOrderService.updateStatus(po._id, "approved", admin._id);
      const b = await bill({ purchaseOrder: po._id });
      expect(b.stockAdded).toBe(true);
      expect((await PurchaseOrder.findById(po._id)).status).toBe("received");
      expect(await stock()).toBe(34);
    });

    it("doesn't add stock twice for a PO that was already received", async () => {
      const po = await makePo();
      await PurchaseOrderService.updateStatus(po._id, "approved", admin._id);
      await PurchaseOrderService.updateStatus(po._id, "received", admin._id);
      expect(await stock()).toBe(34);
      const b = await bill({ purchaseOrder: po._id });
      expect(b.stockAdded).toBe(false);
      expect(await stock()).toBe(34);
      await expect(bill({ purchaseOrder: po._id })).rejects.toThrow(/already has a bill/);
    });

    it("refuses a pending PO", async () => {
      const po = await makePo();
      await expect(bill({ purchaseOrder: po._id })).rejects.toThrow(/approve it first/);
    });
  });

  describe("supplier payments", () => {
    it("settles the bill due first, then the next", async () => {
      const first = await bill({ billDate: new Date(Date.now() - 40 * 86_400_000) });
      const second = await bill();
      const pay = await PayableService.recordPayment({ vendor: vendor._id, amount: 4000, method: "BANK" }, admin._id);
      expect(pay.paymentNumber).toMatch(/^PAY-\d{8}-0001$/);
      expect(pay.allocations.map((a) => a.amount)).toEqual([3115.2, 884.8]);
      expect((await PurchaseBill.findById(first._id)).paymentStatus).toBe("PAID");
      expect((await PurchaseBill.findById(second._id)).balanceDue).toBe(2230.4);
      expect(await owed()).toBe(2230.4);
    });

    it("can't pay more than is owed", async () => {
      await bill();
      await expect(
        PayableService.recordPayment({ vendor: vendor._id, amount: 5000, method: "CASH" }, admin._id)
      ).rejects.toThrow(/more than/);
    });

    it("keeps outstanding equal to the sum of open bills", async () => {
      await bill();
      await bill({ amountPaid: 500, paymentMethod: "UPI" });
      await PayableService.recordPayment({ vendor: vendor._id, amount: 1234.56, method: "UPI" }, admin._id);
      const open = await PayableService.openBills(vendor._id);
      const sum = Math.round(open.reduce((s, b) => s + b.balanceDue * 100, 0)) / 100;
      expect(await owed()).toBe(sum);
    });
  });

  describe("statement and report", () => {
    it("ledger runs to what we owe", async () => {
      await bill({ amountPaid: 115.2, paymentMethod: "CASH" });
      await PayableService.recordPayment({ vendor: vendor._id, amount: 1000, method: "BANK", reference: "UTR1" }, admin._id);
      const l = await PayableService.ledger(vendor._id);
      expect(l.entries.map((e) => e.type)).toEqual(["BILL", "PAYMENT", "PAYMENT"]);
      expect(l.closing).toBe(2000);
      expect(l.closing).toBe(l.vendor.outstanding);
    });

    it("buckets overdue bills", async () => {
      await bill({ billDate: new Date(Date.now() - 75 * 86_400_000) }); // due 45 days ago
      await bill();
      const r = await PayableService.report();
      expect(r.totals.vendors).toBe(1);
      expect(r.totals.d31_60).toBe(3115.2);
      expect(r.totals.current).toBe(3115.2);
      expect(r.totals.overdue).toBe(3115.2);
    });
  });

  describe("cancelling a bill", () => {
    it("takes the stock back out and clears what we owe", async () => {
      const b = await bill();
      await PayableService.cancelBill(b._id, "Entered twice", admin._id);
      expect(await stock()).toBe(10);
      expect(await owed()).toBe(0);
      // The supplier invoice number can be entered again
      await expect(bill({ supplierInvoiceNo: b.supplierInvoiceNo })).resolves.toBeDefined();
    });

    it("is blocked once a payment was applied", async () => {
      const b = await bill();
      await PayableService.recordPayment({ vendor: vendor._id, amount: 100, method: "CASH" }, admin._id);
      await expect(PayableService.cancelBill(b._id, "oops", admin._id)).rejects.toThrow(/Payments have been made/);
    });

    it("is blocked when the goods were already sold", async () => {
      const b = await bill();
      await Product.updateOne({ _id: product._id }, { stock: 5 });
      await expect(PayableService.cancelBill(b._id, "oops", admin._id)).rejects.toThrow(/Not enough/);
      expect(await owed()).toBe(3115.2);
    });
  });
});
