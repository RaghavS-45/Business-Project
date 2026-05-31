import AuditLog from "../models/AuditLog.js";
import logger from "../config/logger.js";

/**
 * Audit Service — business logic for the immutable ledger.
 *
 * Provides methods to:
 *   1. Write audit entries (log)
 *   2. Compute before/after diffs (computeChanges)
 *   3. Query audit history by entity or user
 *
 * All writes go through this service — controllers and other services
 * never create AuditLog documents directly.
 *
 * Interview talking point: Centralising audit writes through a single
 * service ensures consistent formatting, prevents accidental omissions,
 * and makes it trivial to add enrichment (e.g., geo-IP lookup) later.
 */

class AuditService {
  /**
   * Compute a diff between two plain objects.
   * Returns an array of { field, from, to } for changed fields.
   *
   * Skips internal Mongoose fields (__v, updatedAt) and nested _id fields.
   * Handles top-level primitive + array comparisons via JSON.stringify.
   *
   * @param {Object} before - Document state before mutation
   * @param {Object} after  - Document state after mutation
   * @returns {Array<{field: string, from: any, to: any}>}
   */
  computeChanges(before, after) {
    if (!before || !after) return [];

    const skipFields = new Set(["__v", "updatedAt", "_id"]);
    const changes = [];

    // Get all unique keys from both objects
    const allKeys = new Set([
      ...Object.keys(before),
      ...Object.keys(after),
    ]);

    for (const key of allKeys) {
      if (skipFields.has(key)) continue;

      const fromVal = before[key];
      const toVal = after[key];

      // Deep comparison via JSON serialization
      const fromStr = JSON.stringify(fromVal);
      const toStr = JSON.stringify(toVal);

      if (fromStr !== toStr) {
        changes.push({ field: key, from: fromVal, to: toVal });
      }
    }

    return changes;
  }

  /**
   * Write an audit log entry.
   *
   * @param {string} action    - CREATE | UPDATE | DELETE | CHECKOUT | STOCK_ADJUST | REFUND
   * @param {string} entity    - Product | Vendor | Customer | Sale | User
   * @param {ObjectId} entityId - The _id of the mutated document
   * @param {ObjectId} userId   - Who performed the action
   * @param {Object} options
   * @param {Object} [options.before]   - Snapshot before change (null for CREATE)
   * @param {Object} [options.after]    - Snapshot after change (null for DELETE)
   * @param {Object} [options.metadata] - Extra context (IP, requestId, reason)
   * @returns {Promise<Object>} The created AuditLog document
   */
  async log(action, entity, entityId, userId, { before = null, after = null, metadata = {} } = {}) {
    try {
      const changes = this.computeChanges(before, after);

      const entry = await AuditLog.create({
        action,
        entity,
        entityId,
        userId,
        before,
        after,
        changes,
        metadata,
      });

      logger.audit(`${action} ${entity} ${entityId}`, {
        auditId: entry._id,
        userId,
        changedFields: changes.map((c) => c.field),
      });

      return entry;
    } catch (error) {
      // Audit log failures should never crash the main operation
      // Log the error and continue — the business operation has already succeeded
      logger.error("Failed to write audit log", {
        action,
        entity,
        entityId,
        userId,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Query audit history for a specific document.
   *
   * @param {string} entity   - e.g. "Product"
   * @param {string} entityId - The document's _id
   * @param {Object} pagination - { page, limit }
   * @returns {Promise<{logs: Array, pagination: Object}>}
   */
  async getByEntity(entity, entityId, { page = 1, limit = 20 } = {}) {
    const filter = { entity, entityId };
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate("userId", "name email role")
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    return {
      logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Query all actions performed by a specific user.
   *
   * @param {string} userId - The user's _id
   * @param {Object} pagination - { page, limit }
   * @returns {Promise<{logs: Array, pagination: Object}>}
   */
  async getByUser(userId, { page = 1, limit = 20 } = {}) {
    const filter = { userId };
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate("userId", "name email role")
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    return {
      logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }
}

export default new AuditService();
