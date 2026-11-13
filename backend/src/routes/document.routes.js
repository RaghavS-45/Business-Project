import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import authorize from "../middleware/authorize.js";
import validate from "../middleware/validate.js";
import quotationService from "../services/quotation.service.js";
import challanService from "../services/challan.service.js";
import payableService from "../services/payable.service.js";
import { renderQuotationPdf, renderChallanPdf } from "../services/invoicePdf.service.js";
import {
  createQuotationSchema,
  quotationStatusSchema,
  quotationQuerySchema,
  createChallanSchema,
  invoiceChallanSchema,
  cancelSchema,
  challanQuerySchema,
  createBillSchema,
  billQuerySchema,
  supplierPaymentSchema,
  supplierPaymentQuerySchema,
} from "../validators/document.validator.js";

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};

const sendPdf = (res, buffer, filename) => {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}.pdf"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(buffer);
};

/**
 * Quotations (ADMIN | MANAGER)
 *
 * POST  /api/quotations             — Create (priced on the server)
 * GET   /api/quotations             — List (?status incl. EXPIRED, ?customer, ?search)
 * GET   /api/quotations/:id         — One quotation
 * PATCH /api/quotations/:id/status  — OPEN / ACCEPTED / DECLINED
 * GET   /api/quotations/:id/pdf     — PDF
 *
 * Billing a quote: POST /api/sales/checkout with quotationId.
 * Dispatching it:  POST /api/challans with quotation.
 */
export const quotationRouter = Router();
quotationRouter.use(authenticate, authorize("ADMIN", "MANAGER"));

quotationRouter.post(
  "/",
  validate(createQuotationSchema),
  handle(async (req, res) => {
    const quotation = await quotationService.create(req.body, req.user);
    res.status(201).json({ success: true, message: `Quotation ${quotation.quoteNumber} created`, data: { quotation } });
  })
);
quotationRouter.get(
  "/",
  validate(quotationQuerySchema, "query"),
  handle(async (req, res) => res.json({ success: true, data: await quotationService.list(req.query) }))
);
quotationRouter.get(
  "/:id",
  handle(async (req, res) => res.json({ success: true, data: { quotation: await quotationService.getById(req.params.id) } }))
);
quotationRouter.patch(
  "/:id/status",
  validate(quotationStatusSchema),
  handle(async (req, res) => {
    const quotation = await quotationService.setStatus(req.params.id, req.body.status);
    res.json({ success: true, data: { quotation } });
  })
);
quotationRouter.get(
  "/:id/pdf",
  handle(async (req, res) => {
    const q = await quotationService.getById(req.params.id);
    sendPdf(res, await renderQuotationPdf(q), q.quoteNumber);
  })
);

/**
 * Delivery challans (ADMIN | MANAGER)
 *
 * POST /api/challans              — Dispatch goods (takes stock); from items or a quotation
 * GET  /api/challans              — List
 * GET  /api/challans/:id          — One challan
 * POST /api/challans/:id/invoice  — Raise its invoice (no second stock movement)
 * POST /api/challans/:id/cancel   — Goods came back; restock
 * GET  /api/challans/:id/pdf      — PDF
 */
export const challanRouter = Router();
challanRouter.use(authenticate, authorize("ADMIN", "MANAGER"));

challanRouter.post(
  "/",
  validate(createChallanSchema),
  handle(async (req, res) => {
    const challan = await challanService.create(req.body, req.user);
    res.status(201).json({ success: true, message: `Challan ${challan.challanNumber} created`, data: { challan } });
  })
);
challanRouter.get(
  "/",
  validate(challanQuerySchema, "query"),
  handle(async (req, res) => res.json({ success: true, data: await challanService.list(req.query) }))
);
challanRouter.get(
  "/:id",
  handle(async (req, res) => res.json({ success: true, data: { challan: await challanService.getById(req.params.id) } }))
);
challanRouter.post(
  "/:id/invoice",
  validate(invoiceChallanSchema),
  handle(async (req, res) => {
    const sale = await challanService.invoice(req.params.id, req.body, req.user);
    res.status(201).json({ success: true, message: `Invoice ${sale.invoiceNumber} raised`, data: { sale } });
  })
);
challanRouter.post(
  "/:id/cancel",
  validate(cancelSchema),
  handle(async (req, res) => {
    const challan = await challanService.cancel(req.params.id, req.body.reason);
    res.json({ success: true, message: `Challan ${challan.challanNumber} cancelled`, data: { challan } });
  })
);
challanRouter.get(
  "/:id/pdf",
  handle(async (req, res) => {
    const c = await challanService.getById(req.params.id);
    sendPdf(res, await renderChallanPdf(c), c.challanNumber);
  })
);

/**
 * Purchases and payables (ADMIN | MANAGER)
 *
 * POST /api/payables/bills                     — Post a supplier bill (stock in, cost, GST, dues)
 * GET  /api/payables/bills                     — List bills
 * GET  /api/payables/bills/:id                 — One bill with payments against it
 * POST /api/payables/bills/:id/cancel          — Cancel a mistaken bill
 * POST /api/payables/payments                  — Pay a supplier (oldest due bill first by default)
 * GET  /api/payables/payments?vendor=          — Payments made
 * GET  /api/payables                           — Who we owe, by how overdue
 * GET  /api/payables/vendors/:id/open          — A supplier's unpaid bills
 * GET  /api/payables/vendors/:id/ledger        — Supplier statement
 */
export const payableRouter = Router();
payableRouter.use(authenticate, authorize("ADMIN", "MANAGER"));

payableRouter.get(
  "/",
  handle(async (_req, res) => res.json({ success: true, data: await payableService.report() }))
);
payableRouter.post(
  "/bills",
  validate(createBillSchema),
  handle(async (req, res) => {
    const bill = await payableService.createBill(req.body, req.user._id);
    res.status(201).json({ success: true, message: `Bill ${bill.billNumber} posted`, data: { bill } });
  })
);
payableRouter.get(
  "/bills",
  validate(billQuerySchema, "query"),
  handle(async (req, res) => res.json({ success: true, data: await payableService.listBills(req.query) }))
);
payableRouter.get(
  "/bills/:id",
  handle(async (req, res) => res.json({ success: true, data: { bill: await payableService.getBill(req.params.id) } }))
);
payableRouter.post(
  "/bills/:id/cancel",
  validate(cancelSchema),
  handle(async (req, res) => {
    const bill = await payableService.cancelBill(req.params.id, req.body.reason, req.user._id);
    res.json({ success: true, message: `Bill ${bill.billNumber} cancelled`, data: { bill } });
  })
);
payableRouter.post(
  "/payments",
  validate(supplierPaymentSchema),
  handle(async (req, res) => {
    const payment = await payableService.recordPayment(req.body, req.user._id);
    res.status(201).json({ success: true, message: `Payment ${payment.paymentNumber} recorded`, data: { payment } });
  })
);
payableRouter.get(
  "/payments",
  validate(supplierPaymentQuerySchema, "query"),
  handle(async (req, res) => res.json({ success: true, data: { payments: await payableService.listPayments(req.query.vendor) } }))
);
payableRouter.get(
  "/vendors/:id/open",
  handle(async (req, res) => res.json({ success: true, data: { bills: await payableService.openBills(req.params.id) } }))
);
payableRouter.get(
  "/vendors/:id/ledger",
  handle(async (req, res) => res.json({ success: true, data: await payableService.ledger(req.params.id) }))
);
