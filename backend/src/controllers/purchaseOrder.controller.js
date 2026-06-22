import purchaseOrderService from "../services/purchaseOrder.service.js";

/**
 * PurchaseOrder Controller — thin HTTP layer.
 * Follows the same pattern as VendorController.
 */
class PurchaseOrderController {
  /**
   * POST /api/purchase-orders
   * Access: ADMIN | MANAGER
   */
  async create(req, res, next) {
    try {
      const po = await purchaseOrderService.create(req.body, req.user._id);
      res.status(201).json({
        success: true,
        message: "Purchase order created successfully",
        data: { purchaseOrder: po },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/purchase-orders
   * Query: ?page, ?limit, ?status, ?vendor, ?sortBy, ?sortOrder
   * Access: authenticated
   */
  async list(req, res, next) {
    try {
      const result = await purchaseOrderService.list(req.query);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/purchase-orders/stats
   * Dashboard summary — counts by status + total spend.
   * Access: ADMIN | MANAGER
   */
  async stats(req, res, next) {
    try {
      const stats = await purchaseOrderService.stats();
      res.status(200).json({
        success: true,
        data: { stats },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/purchase-orders/:id
   * Access: authenticated
   */
  async getById(req, res, next) {
    try {
      const po = await purchaseOrderService.getById(req.params.id);
      res.status(200).json({
        success: true,
        data: { purchaseOrder: po },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/purchase-orders/:id
   * Only updates notes / expectedDelivery. Status changes go through PATCH.
   * Access: ADMIN | MANAGER
   */
  async update(req, res, next) {
    try {
      const po = await purchaseOrderService.update(req.params.id, req.body, req.user._id);
      res.status(200).json({
        success: true,
        message: "Purchase order updated successfully",
        data: { purchaseOrder: po },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/purchase-orders/:id/status
   * Transitions: pending→approved, pending→rejected, approved→received
   * "received" auto-increments product stock via transaction.
   * Access: ADMIN | MANAGER (received requires ADMIN)
   */
  async updateStatus(req, res, next) {
    try {
      const po = await purchaseOrderService.updateStatus(
        req.params.id,
        req.body.status,
        req.user._id
      );
      res.status(200).json({
        success: true,
        message: `Purchase order ${req.body.status} successfully`,
        data: { purchaseOrder: po },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/purchase-orders/:id
   * Only pending POs can be deleted.
   * Access: ADMIN
   */
  async delete(req, res, next) {
    try {
      const result = await purchaseOrderService.delete(req.params.id, req.user._id);
      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new PurchaseOrderController();