import saleService from "../services/sale.service.js";

/**
 * Sale Controller — thin HTTP layer for checkout and sales management.
 *
 * POST   /api/sales/checkout       — Process a checkout
 * GET    /api/sales                — List sales (paginated, filterable)
 * GET    /api/sales/summary/daily  — Daily sales summary
 * GET    /api/sales/:id            — Get sale details
 * POST   /api/sales/:id/refund     — Process a refund
 */
class SaleController {
  /**
   * POST /api/sales/checkout
   * Body: { items: [{ product, quantity, discountPercent?, taxPercent? }],
   *         customerId?, paymentMethod, notes? }
   * Access: ADMIN | MANAGER | CASHIER
   */
  async checkout(req, res, next) {
    try {
      const { items, customerId, paymentMethod, notes } = req.body;

      const sale = await saleService.checkout(
        items,
        customerId,
        paymentMethod,
        req.user,
        notes
      );

      res.status(201).json({
        success: true,
        message: "Checkout completed successfully",
        data: { sale },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/sales
   * Query: ?page, ?limit, ?status, ?paymentMethod, ?customerId,
   *        ?cashierId, ?startDate, ?endDate, ?sortBy, ?sortOrder
   * Access: ADMIN | MANAGER
   */
  async list(req, res, next) {
    try {
      const result = await saleService.list(req.query);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/sales/summary/daily
   * Query: ?date=2026-05-30 (defaults to today)
   * Access: ADMIN | MANAGER
   */
  async dailySummary(req, res, next) {
    try {
      const summary = await saleService.getDailySummary(
        req.query.date,
        req.query.endDate
      );
      res.status(200).json({ success: true, data: { summary } });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/sales/:id
   * Access: authenticated
   */
  async getById(req, res, next) {
    try {
      const sale = await saleService.getById(req.params.id);
      res.status(200).json({
        success: true,
        data: { sale },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/sales/:id/refund
   * Body: { reason: "Customer returned items" }
   * Access: ADMIN | MANAGER
   */
  async refund(req, res, next) {
    try {
      const sale = await saleService.refund(
        req.params.id,
        req.user._id,
        req.body.reason
      );
      res.status(200).json({
        success: true,
        message: "Refund processed successfully",
        data: { sale },
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new SaleController();
