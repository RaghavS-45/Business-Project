import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import authorize from "../middleware/authorize.js";
import validate from "../middleware/validate.js";
import receivableService from "../services/receivable.service.js";
import settingsService from "../services/settings.service.js";
import { renderStatementPdf } from "../services/statementPdf.service.js";
import { createPaymentSchema, paymentQuerySchema, ledgerQuerySchema } from "../validators/payment.validator.js";

/**
 * Receivables (ADMIN | MANAGER)
 *
 * POST /api/receivables/payments                 — Record a payment (applied oldest invoice first by default)
 * GET  /api/receivables/payments?customer=        — Payments received
 * GET  /api/receivables                          — Who owes what, by how overdue
 * GET  /api/receivables/customers/:id/open        — A customer's unpaid invoices
 * GET  /api/receivables/customers/:id/ledger      — Statement with running balance (?from&to)
 * GET  /api/receivables/customers/:id/statement   — Statement PDF (?from&to)
 */
const router = Router();
router.use(authenticate, authorize("ADMIN", "MANAGER"));

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};

router.get(
  "/",
  handle(async (_req, res) => {
    res.json({ success: true, data: await receivableService.report() });
  })
);

router.post(
  "/payments",
  validate(createPaymentSchema),
  handle(async (req, res) => {
    const payment = await receivableService.recordPayment(req.body, req.user._id);
    res.status(201).json({
      success: true,
      message: `Payment ${payment.receiptNumber} recorded`,
      data: { payment },
    });
  })
);

router.get(
  "/payments",
  validate(paymentQuerySchema, "query"),
  handle(async (req, res) => {
    const payments = await receivableService.listPayments(req.query.customer);
    res.json({ success: true, data: { payments } });
  })
);

router.get(
  "/customers/:id/open",
  handle(async (req, res) => {
    const invoices = await receivableService.openInvoices(req.params.id);
    res.json({ success: true, data: { invoices } });
  })
);

router.get(
  "/customers/:id/ledger",
  validate(ledgerQuerySchema, "query"),
  handle(async (req, res) => {
    const ledger = await receivableService.ledger(req.params.id, req.query);
    res.json({ success: true, data: ledger });
  })
);

router.get(
  "/customers/:id/statement",
  validate(ledgerQuerySchema, "query"),
  handle(async (req, res) => {
    const [ledger, store] = await Promise.all([
      receivableService.ledger(req.params.id, req.query),
      settingsService.get(),
    ]);
    const pdf = await renderStatementPdf(ledger, store);
    const safeName = ledger.customer.name.replace(/[^\w-]+/g, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="Statement_${safeName}.pdf"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(pdf);
  })
);

export default router;
