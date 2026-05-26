import Vendor from "../models/Vendor.js";
import ApiError from "../utils/ApiError.js";
import logger from "../config/logger.js";

/**
 * Vendor Service — business logic layer.
 */

class VendorService {
  /**
   * Create a new vendor.
   */
  async create(data) {
    if (data.email) {
      const existing = await Vendor.findOne({ email: data.email });
      if (existing) throw ApiError.conflict("A vendor with this email already exists");
    }

    if (data.gstin) {
      const existing = await Vendor.findOne({ gstin: data.gstin.toUpperCase() });
      if (existing) throw ApiError.conflict("A vendor with this GSTIN already exists");
    }

    const vendor = await Vendor.create(data);
    logger.info(`Vendor created: ${vendor.name}`);
    return vendor;
  }

  /**
   * Paginated vendor list with optional search.
   */
  async list(query) {
    const { page, limit, search, isActive, sortBy, sortOrder } = query;

    const filter = { isActive };
    if (search) filter.$text = { $search: search };

    const sortObj = { [sortBy]: sortOrder === "asc" ? 1 : -1 };
    const skip = (page - 1) * limit;

    const [vendors, total] = await Promise.all([
      Vendor.find(filter).sort(sortObj).skip(skip).limit(limit).lean(),
      Vendor.countDocuments(filter),
    ]);

    return {
      vendors,
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
   * Get a single vendor by ID.
   */
  async getById(id) {
    const vendor = await Vendor.findById(id).lean();
    if (!vendor) throw ApiError.notFound("Vendor not found");
    return vendor;
  }

  /**
   * Update vendor fields.
   */
  async update(id, data) {
    const vendor = await Vendor.findById(id);
    if (!vendor) throw ApiError.notFound("Vendor not found");

    if (data.email && data.email !== vendor.email) {
      const conflict = await Vendor.findOne({ email: data.email, _id: { $ne: id } });
      if (conflict) throw ApiError.conflict("A vendor with this email already exists");
    }

    if (data.gstin && data.gstin.toUpperCase() !== vendor.gstin) {
      const conflict = await Vendor.findOne({ gstin: data.gstin.toUpperCase(), _id: { $ne: id } });
      if (conflict) throw ApiError.conflict("A vendor with this GSTIN already exists");
    }

    Object.assign(vendor, data);
    await vendor.save();

    logger.info(`Vendor updated: ${vendor.name}`);
    return vendor.toJSON();
  }

  /**
   * Soft-delete a vendor.
   */
  async delete(id) {
    const vendor = await Vendor.findById(id);
    if (!vendor) throw ApiError.notFound("Vendor not found");

    vendor.isActive = false;
    await vendor.save();

    logger.info(`Vendor soft-deleted: ${vendor.name}`);
    return { message: "Vendor deleted successfully" };
  }
}

export default new VendorService();
