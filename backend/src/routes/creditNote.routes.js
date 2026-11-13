import { Router } from "express";
import authenticate from "../middleware/authenticate.js";
import authorize from "../middleware/authorize.js";
import validate from "../middleware/validate.js";
import returnService from "../services/return.service.js";
import { renderCreditNotePdf } from "../services/invoicePdf.service.js";
import { creditNoteQuerySchema } from "../validators/return.validator.js";

/**
 * Credit Note Routes (ADMIN | MANAGER)
 *
 * GET /api/credit-notes          — List credit notes, newest first
 * GET /api/credit-notes/:id      — One credit note
 * GET /api/credit-notes/:id/pdf  — Credit note PDF (generated on demand)
 *
 * Credit notes are created by returning items:  POST /api/sales/:id/returns
 */
const router = Router();
router.use(authenticate, authorize("ADMIN", "MANAGER"));

router.get("/", validate(creditNoteQuerySchema, "query"), async (req, res, next) => {
  try {
    const data = await returnService.list(req.query);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const creditNote = await returnService.getById(req.params.id);
    res.json({ success: true, data: { creditNote } });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/pdf", async (req, res, next) => {
  try {
    const cn = await returnService.getById(req.params.id);
    const pdf = await renderCreditNotePdf(cn);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `${req.query.download === "1" ? "attachment" : "inline"}; filename="${cn.creditNoteNumber}.pdf"`
    );
    res.setHeader("Cache-Control", "private, no-store");
    res.send(pdf);
  } catch (error) {
    next(error);
  }
});

export default router;
