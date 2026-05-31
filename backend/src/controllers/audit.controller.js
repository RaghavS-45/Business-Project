import auditService from "../services/audit.service.js";

/**
 * Audit Controller — thin HTTP layer for the immutable ledger.
 *
 * Read-only endpoints. No POST/PUT/DELETE — audit logs are written
 * internally by other services, never by external HTTP requests.
 *
 * All routes require ADMIN role (see audit.routes.js).
 */
class AuditController {
  /**
   * GET /api/audit/:entity/:entityId
   * View the full audit trail for a specific document.
   *
   * Query: ?page=1&limit=20
   * Access: ADMIN only
   */
  async getByEntity(req, res, next) {
    try {
      const { entity, entityId } = req.params;
      const page = parseInt(req.query.page) || 1;
      const limit = Math.min(parseInt(req.query.limit) || 20, 100);

      const result = await auditService.getByEntity(entity, entityId, {
        page,
        limit,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/audit/user/:userId
   * View all actions performed by a specific user.
   *
   * Query: ?page=1&limit=20
   * Access: ADMIN only
   */
  async getByUser(req, res, next) {
    try {
      const { userId } = req.params;
      const page = parseInt(req.query.page) || 1;
      const limit = Math.min(parseInt(req.query.limit) || 20, 100);

      const result = await auditService.getByUser(userId, { page, limit });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new AuditController();
