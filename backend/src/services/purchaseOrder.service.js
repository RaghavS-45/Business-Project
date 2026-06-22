import mongoose from "mongoose";
import PurchaseOrder from "../models/PurchaseOrder.js";
import Product from "../models/Product.js";
import Vendor from "../models/Vendor.js";
import ApiError from "../utils/ApiError.js";
import logger from "../config/logger.js";
import { addJob, QUEUE_NAMES } from "../config/queue.js";

/**
 * PurchaseOrder Service — business logic layer.
 *
 * Follows the same class/singleton pattern as VendorService and ProductService.
 *
 * Key flow — inventory auto-update:
 *   When status → "received", each line item's product.stock is incremented
 *   atomically via $inc inside a MongoDB session (transaction) so a partial
 *   failure never leaves inventory in an inconsistent state.
 */

class PurchaseOrderService {
  /**
   * Create a new purchase order (status: pending).
   * Validates that all referenced products and vendor exist and are active.
   * Snapshots product name + SKU onto each line item for historical integrity.
   */
  async create(data, userId = null) {
    const { vendor: vendorId, items, notes, expectedDelivery } = data;

    // Validate vendor exists and is active
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) throw ApiError.notFound("Vendor not found");
    if (!vendor.isActive) throw ApiError.badRequest("Cannot create PO for an inactive vendor");

    // Validate all products exist, are active, and snapshot name/SKU
    const productIds = items.map((i) => i.product);
    const products = await Product.find({
      _id: { $in: productIds },
      isActive: true,
    }).lean();

    if (products.length !== productIds.length) {
      const foundIds = products.map((p) => p._id.toString());
      const missing = productIds.filter((id) => !foundIds.includes(id.toString()));
      throw ApiError.badRequest(
        `Some products were not found or are inactive: ${missing.join(", ")}`
      );
    }

    // Build product lookup map for snapshots
    const productMap = Object.fromEntries(products.map((p) => [p._id.toString(), p]));

    // Enrich line items with product name/SKU snapshots
    const enrichedItems = items.map((item) => {
      const product = productMap[item.product.toString()];
      return {
        ...item,
        productName: product.name,
        productSku: product.sku,
      };
    });

    const po = await PurchaseOrder.create({
      vendor: vendorId,
      items: enrichedItems,
      notes,
      expectedDelivery,
      createdBy: userId,
      status: "pending",
    });

    logger.info(`Purchase order created: ${po.poNumber} — vendor: ${vendor.name}`);

    if (userId) {
      await addJob(QUEUE_NAMES.AUDIT_LOG, "po-create", {
        action: "CREATE",
        entity: "PurchaseOrder",
        entityId: po._id.toString(),
        userId: userId.toString(),
        before: null,
        after: po.toJSON(),
        metadata: { poNumber: po.poNumber },
      });
    }

    return po.populate([
      { path: "vendor", select: "name email phone" },
      { path: "items.product", select: "name sku stock" },
      { path: "createdBy", select: "name email" },
    ]);
  }

  /**
   * Paginated list with optional status/vendor filters.
   */
  async list(query) {
    const { page, limit, status, vendor, sortBy, sortOrder } = query;

    const filter = {};
    if (status) filter.status = status;
    if (vendor) filter.vendor = vendor;

    const sortObj = { [sortBy]: sortOrder === "asc" ? 1 : -1 };
    const skip = (page - 1) * limit;

    const [purchaseOrders, total] = await Promise.all([
      PurchaseOrder.find(filter)
        .populate("vendor", "name email phone")
        .populate("items.product", "name sku stock")
        .populate("createdBy", "name email")
        .populate("approvedBy", "name email")
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .lean({ virtuals: true }),
      PurchaseOrder.countDocuments(filter),
    ]);

    return {
      purchaseOrders,
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
   * Get a single PO by ID with full population.
   */
  async getById(id) {
    const po = await PurchaseOrder.findById(id)
      .populate("vendor", "name email phone contactPerson address paymentTerms")
      .populate("items.product", "name sku stock costPrice sellingPrice")
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email")
      .lean({ virtuals: true });

    if (!po) throw ApiError.notFound("Purchase order not found");
    return po;
  }

  /**
   * Update notes / expectedDelivery on a pending PO.
   * Only pending POs can be edited — approved/received/rejected are locked.
   */
  async update(id, data, userId = null) {
    const po = await PurchaseOrder.findById(id);
    if (!po) throw ApiError.notFound("Purchase order not found");

    if (po.status !== "pending") {
      throw ApiError.badRequest(
        `Only pending purchase orders can be edited. Current status: ${po.status}`
      );
    }

    const beforeState = po.toJSON();
    Object.assign(po, data);
    await po.save();

    logger.info(`Purchase order updated: ${po.poNumber}`);

    if (userId) {
      await addJob(QUEUE_NAMES.AUDIT_LOG, "po-update", {
        action: "UPDATE",
        entity: "PurchaseOrder",
        entityId: po._id.toString(),
        userId: userId.toString(),
        before: beforeState,
        after: po.toJSON(),
        metadata: { poNumber: po.poNumber },
      });
    }

    return po.toJSON();
  }

  /**
   * Transition PO status.
   *
   * Valid transitions:
   *   pending  → approved | rejected
   *   approved → received  ← triggers inventory update
   *
   * Inventory update (on "received"):
   *   Runs inside a MongoDB session/transaction.
   *   Uses bulkWrite with $inc so each product's stock is updated atomically.
   *   If any update fails, the whole transaction rolls back.
   */
  async updateStatus(id, status, userId = null) {
    const po = await PurchaseOrder.findById(id).populate("vendor", "name");
    if (!po) throw ApiError.notFound("Purchase order not found");

    // ── Guard valid transitions ──────────────────────────
    const validTransitions = {
      pending: ["approved", "rejected"],
      approved: ["received"],
      received: [],
      rejected: [],
    };

    if (!validTransitions[po.status].includes(status)) {
      throw ApiError.badRequest(
        `Cannot transition from "${po.status}" to "${status}". ` +
          `Valid next statuses: ${validTransitions[po.status].join(", ") || "none"}`
      );
    }

    const beforeState = po.toJSON();

    // ── Inventory update (approved → received) ───────────
    if (status === "received") {
      const session = await mongoose.startSession();

      try {
        await session.withTransaction(async () => {
          // Atomic bulk stock increment for all line items
          const bulkOps = po.items.map((item) => ({
            updateOne: {
              filter: { _id: item.product, isActive: true },
              update: { $inc: { stock: item.quantity } },
            },
          }));

          const bulkResult = await Product.bulkWrite(bulkOps, { session });

          // Verify all products were actually updated
          if (bulkResult.modifiedCount !== po.items.length) {
            throw ApiError.badRequest(
              "Some products could not be updated — they may have been deactivated. " +
                "Inventory was not modified."
            );
          }

          po.status = "received";
          po.receivedAt = new Date();
          po.approvedBy = po.approvedBy || userId; // keep existing approver if set
          await po.save({ session });
        });
      } finally {
        await session.endSession();
      }

      logger.info(
        `Purchase order received: ${po.poNumber} — ` +
          `${po.items.length} product(s) restocked`
      );
    } else {
      // approve or reject (no inventory change)
      po.status = status;
      po.approvedBy = userId;
      po.approvedAt = new Date();
      await po.save();

      logger.info(`Purchase order ${status}: ${po.poNumber}`);
    }

    if (userId) {
      await addJob(QUEUE_NAMES.AUDIT_LOG, `po-${status}`, {
        action: "UPDATE",
        entity: "PurchaseOrder",
        entityId: po._id.toString(),
        userId: userId.toString(),
        before: beforeState,
        after: po.toJSON(),
        metadata: { poNumber: po.poNumber, statusChange: `${beforeState.status} → ${status}` },
      });
    }

    return po.toJSON();
  }

  /**
   * Delete a PO — only allowed when status is "pending".
   * Approved/received POs cannot be deleted (audit trail integrity).
   */
  async delete(id, userId = null) {
    const po = await PurchaseOrder.findById(id);
    if (!po) throw ApiError.notFound("Purchase order not found");

    if (po.status !== "pending") {
      throw ApiError.badRequest(
        `Only pending purchase orders can be deleted. Current status: ${po.status}`
      );
    }

    const beforeState = po.toJSON();
    await po.deleteOne();

    logger.info(`Purchase order deleted: ${po.poNumber}`);

    if (userId) {
      await addJob(QUEUE_NAMES.AUDIT_LOG, "po-delete", {
        action: "DELETE",
        entity: "PurchaseOrder",
        entityId: po._id.toString(),
        userId: userId.toString(),
        before: beforeState,
        after: null,
        metadata: { poNumber: po.poNumber },
      });
    }

    return { message: "Purchase order deleted successfully" };
  }

  /**
   * Summary stats for dashboard widget.
   * Returns counts by status and total spend.
   */
  async stats() {
    const [statusCounts, spendAgg] = await Promise.all([
      PurchaseOrder.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      PurchaseOrder.aggregate([
        { $match: { status: "received" } },
        {
          $project: {
            totalAmount: {
              $sum: {
                $map: {
                  input: "$items",
                  as: "item",
                  in: { $multiply: ["$$item.quantity", "$$item.unitCost"] },
                },
              },
            },
          },
        },
        { $group: { _id: null, totalSpend: { $sum: "$totalAmount" } } },
      ]),
    ]);

    const counts = { pending: 0, approved: 0, received: 0, rejected: 0 };
    statusCounts.forEach(({ _id, count }) => {
      counts[_id] = count;
    });

    return {
      counts,
      totalSpend: spendAgg[0]?.totalSpend ?? 0,
    };
  }
}

export default new PurchaseOrderService();