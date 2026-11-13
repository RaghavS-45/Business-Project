import { describe, it, expect, beforeEach } from "vitest";
import SaleService from "../../services/sale.service.js";
import ReturnService from "../../services/return.service.js";
import ReceivableService from "../../services/receivable.service.js";
import Sale from "../../models/Sale.js";
import Customer from "../../models/Customer.js";
import Payment from "../../models/Payment.js";
import { renderStatementPdf } from "../../services/statementPdf.service.js";
import { createTestUser, createTestProduct, createTestCustomer } from "../helpers.js";

/**
 * Credit sales, payments, dues, statements.
 */
describe("Receivables", () => {
  let admin, product, customer;

  beforeEach(async () => {
    admin = (await createTestUser({ role: "ADMIN" })).user;
    product = await createTestProduct({ sellingPrice: 1000, taxRate: 0, stock: 100 });
    customer = await createTestCustomer({ name: "Credit Buyer", paymentTermsDays: 15 });
  });

  const sell = (qty, method = "CREDIT", opts = {}, cust = customer._id) =>
    SaleService.checkout([{ product: product._id, quantity: qty }], cust, method, admin, "", opts);
  const pay = (amount, extra = {}) =>
    ReceivableService.recordPayment({ customer: customer._id, amount, method: "UPI", ...extra }, admin._id);
  const owed = async () => (await Customer.findById(customer._id)).outstanding;

  describe("credit sales", () => {
    it("puts the whole bill on credit with a due date from the payment terms", async () => {
      const sale = await sell(2);
      expect(sale.paymentStatus).toBe("UNPAID");
      expect(sale.amountPaid).toBe(0);
      expect(sale.balanceDue).toBe(2000);
      const days = (sale.dueDate - sale.createdAt) / 86_400_000;
      expect(Math.round(days)).toBe(15);
      expect(await owed()).toBe(2000);
    });

    it("supports part payment at the counter", async () => {
      const sale = await sell(3, "CASH", { amountPaid: 1000 });
      expect(sale.paymentStatus).toBe("PARTIAL");
      expect(sale.paidAtSale).toBe(1000);
      expect(sale.balanceDue).toBe(2000);
      expect(await owed()).toBe(2000);
    });

    it("is fully paid by default", async () => {
      const sale = await sell(1, "CASH");
      expect(sale.paymentStatus).toBe("PAID");
      expect(sale.balanceDue).toBe(0);
      expect(await owed()).toBe(0);
    });

    it("refuses credit for walk-in customers", async () => {
      await expect(sell(1, "CREDIT", {}, null)).rejects.toThrow(/walk-in/i);
    });

    it("refuses more than the bill as paid", async () => {
      await expect(sell(1, "CASH", { amountPaid: 1500 })).rejects.toThrow(/between/);
    });

    it("enforces the credit limit (and rolls back the stock)", async () => {
      await Customer.updateOne({ _id: customer._id }, { creditLimit: 2500 });
      await sell(2); // owes 2000
      await expect(sell(1)).rejects.toThrow(/Credit limit exceeded/);
      expect(await owed()).toBe(2000);
      expect(await Sale.countDocuments()).toBe(1);
      // A cash sale is still fine
      await expect(sell(1, "CASH")).resolves.toBeDefined();
    });

    it("a limit of 0 means cash only", async () => {
      await Customer.updateOne({ _id: customer._id }, { creditLimit: 0 });
      await expect(sell(1)).rejects.toThrow(/Credit limit exceeded/);
    });

    it("concurrent credit sales can't jointly break the limit", async () => {
      await Customer.updateOne({ _id: customer._id }, { creditLimit: 3000 });
      const results = await Promise.allSettled([sell(2), sell(2), sell(2)]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await owed()).toBe(2000);
    }, 20_000);
  });

  describe("payments", () => {
    it("applies a payment to the oldest invoices first", async () => {
      const a = await sell(1); // 1000
      const b = await sell(2); // 2000
      const payment = await pay(1500);

      expect(payment.receiptNumber).toMatch(/^RCPT-\d{8}-0001$/);
      expect(payment.allocations.map((x) => [x.invoiceNumber, x.amount])).toEqual([
        [a.invoiceNumber, 1000],
        [b.invoiceNumber, 500],
      ]);
      expect((await Sale.findById(a._id)).paymentStatus).toBe("PAID");
      const bAfter = await Sale.findById(b._id);
      expect(bAfter.paymentStatus).toBe("PARTIAL");
      expect(bAfter.balanceDue).toBe(1500);
      expect(await owed()).toBe(1500);
    });

    it("can be applied to chosen invoices", async () => {
      const a = await sell(1);
      const b = await sell(2);
      await pay(2000, { allocations: [{ sale: String(b._id), amount: 2000 }] });
      expect((await Sale.findById(a._id)).balanceDue).toBe(1000);
      expect((await Sale.findById(b._id)).paymentStatus).toBe("PAID");
    });

    it("refuses paying more than is owed", async () => {
      await sell(1);
      await expect(pay(1000.01)).rejects.toThrow(/more than/);
      expect(await Payment.countDocuments()).toBe(0);
    });

    it("refuses allocations that don't add up", async () => {
      const a = await sell(2);
      await expect(pay(1500, { allocations: [{ sale: String(a._id), amount: 1000 }] })).rejects.toThrow(
        /doesn't match/
      );
    });
  });

  describe("returns on credit bills", () => {
    it("reduces what's owed before refunding any cash", async () => {
      const sale = await sell(3, "CASH", { amountPaid: 1000 }); // owes 2000
      const { creditNote, sale: after } = await ReturnService.createReturn(
        sale._id,
        { items: [{ product: String(product._id), quantity: 1 }], reason: "Damaged" },
        admin._id
      );
      expect(creditNote.adjustedAgainstDue).toBe(1000);
      expect(creditNote.cashRefund).toBe(0);
      expect(creditNote.refundMethod).toBe("ADJUSTED");
      expect(after.balanceDue).toBe(1000);
      expect(await owed()).toBe(1000);
    });

    it("refunds only the part beyond what's owed", async () => {
      const sale = await sell(3, "CASH", { amountPaid: 2500 }); // owes 500
      const { creditNote, sale: after } = await ReturnService.createReturn(
        sale._id,
        { items: [{ product: String(product._id), quantity: 2 }], reason: "Wrong item", refundMethod: "UPI" },
        admin._id
      );
      expect(creditNote.adjustedAgainstDue).toBe(500);
      expect(creditNote.cashRefund).toBe(1500);
      expect(creditNote.refundMethod).toBe("UPI");
      expect(after.balanceDue).toBe(0);
      expect(after.paymentStatus).toBe("PAID");
      expect(await owed()).toBe(0);
    });
  });

  describe("statement & dues", () => {
    it("ledger runs to the customer's outstanding balance", async () => {
      const s1 = await sell(3, "CASH", { amountPaid: 1000 }); // +3000 −1000
      await sell(2); // +2000
      await pay(1500); // −1500 → invoice 1 now owes 500, invoice 2 owes 2000
      await ReturnService.createReturn(
        s1._id,
        { items: [{ product: String(product._id), quantity: 1 }], reason: "Damaged" },
        admin._id
      ); // credit note −1000: 500 knocked off invoice 1, 500 refunded in cash (+500)
      // A fully paid cash sale nets to zero
      await sell(1, "CASH");

      const ledger = await ReceivableService.ledger(customer._id);
      expect(ledger.closing).toBe(2000);
      expect(ledger.closing).toBe(await owed());
      expect(ledger.entries.at(-1).balance).toBe(2000);
      expect(ledger.openInvoices.reduce((s, i) => s + i.balanceDue, 0)).toBe(2000);
      expect(ledger.entries.map((e) => e.type)).toContain("REFUND");
    });

    it("statement period starts from the opening balance", async () => {
      await sell(2);
      const later = new Date(Date.now() + 1000);
      const ledger = await ReceivableService.ledger(customer._id, { from: later });
      expect(ledger.opening).toBe(2000);
      expect(ledger.entries).toHaveLength(0);
      expect(ledger.closing).toBe(2000);
    });

    it("dues report splits by how overdue", async () => {
      const fresh = await sell(1);
      const old = await sell(2);
      // Make one invoice 45 days overdue
      await Sale.updateOne({ _id: old._id }, { dueDate: new Date(Date.now() - 45 * 86_400_000) });

      const { totals, customers } = await ReceivableService.report();
      expect(totals.outstanding).toBe(3000);
      expect(totals.current).toBe(1000);
      expect(totals.d31_60).toBe(2000);
      expect(totals.overdue).toBe(2000);
      expect(customers[0]).toMatchObject({ name: "Credit Buyer", outstanding: 3000, invoices: 2 });
      expect(fresh).toBeDefined();
    });

    it("renders a statement PDF", async () => {
      await sell(2);
      await pay(500);
      const pdf = await renderStatementPdf(await ReceivableService.ledger(customer._id), { tradeName: "Test Co" });
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    });
  });
});
