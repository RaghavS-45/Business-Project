import mongoose from "mongoose";
import PurchaseOrder from "../models/PurchaseOrder.js";
import Product from "../models/Product.js";
import Vendor from "../models/Vendor.js";
import ApiError from "../utils/ApiError.js";
import logger from "../config/logger.js";
import { addJob, QUEUE_NAMES } from "../config/queue.js";
import { sellingUnit, validQuantity, allowsDecimal, roundQty } from "../utils/unitPricing.js";
import { containsRegex } from "../utils/search.js";
import { toPaise, toRupees } from "../utils/pricing.js";

/** PO total (before GST) to the paisa; lean() reads skip the model's virtual. */
const withTotal = (po) => ({
  ...po,
  totalAmount: toRupees(po.items.reduce((sum, i) => sum + Math.round(i.quantity * toPaise(i.unitCost)), 0)),
});

/** Base units a PO line brings in. */
const baseQtyOf = (item) => roundQty(item.quantity * (item.unitSize || 1));

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
   * Check each line's product, unit and quantity, and snapshot name/SKU.
   * Cost defaults to the product's cost price for the chosen unit.
   * @private
   */
  async _buildItems(items) {
    const ids = [...new Set(items.map((i) => String(i.product)))];
    const products = await Product.find({ _id: { $in: ids }, isActive: true }).lean();
    const byId = new Map(products.map((p) => [String(p._id), p]));
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length) {
      throw ApiError.badRequest(`Some products were not found or are inactive: ${missing.join(", ")}`);
    }

    return items.map((item) => {
      const product = byId.get(String(item.product));
      const unit = sellingUnit(product, item.unit);
      if (!unit) throw ApiError.badRequest(`"${product.name}" has no ${item.unit} pack`);
      if (!validQuantity(product, unit, item.quantity)) {
        throw ApiError.badRequest(
          `Quantity ${item.quantity} isn't valid for "${product.name}": ` +
            (unit.isBase && allowsDecimal(product.unit) ? "use at most 3 decimals" : `${unit.name} is counted in whole numbers`)
        );
      }
      return {
        product: product._id,
        quantity: item.quantity,
        unit: unit.name,
        unitSize: unit.size,
        unitCost: item.unitCost ?? toRupees(Math.round(toPaise(product.costPrice) * unit.size)),
        productName: product.name,
        productSku: product.sku,
      };
    });
  }

  /**
   * What to reorder: active products at or below their reorder level, less
   * what's already on order (pending / approved POs). Suggests enough to
   * bring stock back to twice the reorder level, in the product's first
   * pack if it has one. Grouped by each product's usual supplier.
   */
  async reorderSuggestions() {
    const [low, open] = await Promise.all([
      Product.find({ isActive: true, $expr: { $lte: ["$stock", "$lowStockThreshold"] } })
        .populate("vendor", "name")
        .lean(),
      PurchaseOrder.find({ status: { $in: ["pending", "approved"] } }).select("items").lean(),
    ]);

    const onOrder = new Map();
    for (const po of open) {
      for (const item of po.items) {
        const id = String(item.product);
        onOrder.set(id, roundQty((onOrder.get(id) ?? 0) + baseQtyOf(item)));
      }
    }

    const suggestions = [];
    for (const p of low) {
      const ordered = onOrder.get(String(p._id)) ?? 0;
      const target = Math.max(p.lowStockThreshold * 2, p.lowStockThreshold + 1);
      const needBase = roundQty(target - p.stock - ordered);
      if (needBase <= 0) continue;
      const pack = p.packs?.[0];
      const quantity = pack
        ? Math.ceil(needBase / pack.size)
        : allowsDecimal(p.unit) ? needBase : Math.ceil(needBase);
      const unitSize = pack?.size ?? 1;
      suggestions.push({
        product: p._id,
        name: p.name,
        sku: p.sku,
        stock: p.stock,
        baseUnit: p.unit,
        lowStockThreshold: p.lowStockThreshold,
        onOrder: ordered,
        unit: pack?.name ?? p.unit,
        unitSize,
        quantity,
        unitCost: toRupees(Math.round(toPaise(p.costPrice) * unitSize)),
        vendor: p.vendor ? { _id: p.vendor._id, name: p.vendor.name } : null,
      });
    }
    return suggestions.sort((a, b) => a.stock / (a.lowStockThreshold || 1) - b.stock / (b.lowStockThreshold || 1));
  }

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

    const enrichedItems = await this._buildItems(items);

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
    const { page, limit, status, vendor, search, sortBy, sortOrder } = query;

    const filter = {};
    if (status) filter.status = status;
    if (vendor) filter.vendor = vendor;
    if (search) {
      // PO number, supplier name or a product on it
      const rx = containsRegex(search);
      const vendorIds = await Vendor.find({ name: rx }).distinct("_id");
      filter.$or = [{ poNumber: rx }, { vendor: { $in: vendorIds } }, { "items.productName": rx }];
    }

    const sortObj = { [sortBy]: sortOrder === "asc" ? 1 : -1 };
    const skip = (page - 1) * limit;

    const [purchaseOrders, total] = await Promise.all([
      PurchaseOrder.find(filter)
        .populate("vendor", "name email phone")
        .populate("items.product", "name sku stock unit")
        .populate("createdBy", "name email")
        .populate("approvedBy", "name email")
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .lean({ virtuals: true }),
      PurchaseOrder.countDocuments(filter),
    ]);

    return {
      purchaseOrders: purchaseOrders.map(withTotal),
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
      .populate("vendor", "name email phone contactPerson address paymentTerms paymentTermsDays gstin")
      .populate("items.product", "name sku stock unit costPrice sellingPrice")
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email")
      .lean({ virtuals: true });

    if (!po) throw ApiError.notFound("Purchase order not found");
    return withTotal(po);
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
    const { items, vendor: vendorId, ...rest } = data;
    if (vendorId && String(vendorId) !== String(po.vendor)) {
      const vendor = await Vendor.findById(vendorId);
      if (!vendor || !vendor.isActive) throw ApiError.badRequest("Choose an active supplier");
      po.vendor = vendor._id;
    }
    if (items) po.items = await this._buildItems(items);
    Object.assign(po, rest);
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
          // Packs arrive as base units (10 cartons of 12 → 120 pcs)
          const bulkOps = po.items.map((item) => ({
            updateOne: {
              filter: { _id: item.product, isActive: true },
              update: [{ $set: { stock: { $round: [{ $add: ["$stock", baseQtyOf(item)] }, 3] } } }],
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