import Customer from "../models/Customer.js";
import ApiError from "../utils/ApiError.js";
import logger from "../config/logger.js";
import { addJob, QUEUE_NAMES } from "../config/queue.js";

/**
 * Customer Service — business logic layer.
 */

class CustomerService {
  /**
   * Create a new customer.
   */
  async create(data, userId = null) {
    if (data.email) {
      const existing = await Customer.findOne({ email: data.email });
      if (existing) throw ApiError.conflict("A customer with this email already exists");
    }

    if (data.phone) {
      const existing = await Customer.findOne({ phone: data.phone });
      if (existing) throw ApiError.conflict("A customer with this phone number already exists");
    }

    const customer = await Customer.create(data);
    logger.info(`Customer created: ${customer.name}`);

    if (userId) {
      await addJob(QUEUE_NAMES.AUDIT_LOG, "customer-create", {
        action: "CREATE",
        entity: "Customer",
        entityId: customer._id.toString(),
        userId: userId.toString(),
        before: null,
        after: customer.toJSON(),
        metadata: {},
      });
    }

    return customer;
  }

  /**
   * Paginated customer list with optional search.
   */
  async list(query) {
    const { page, limit, search, isActive, sortBy, sortOrder } = query;

    const filter = { isActive };
    if (search) filter.$text = { $search: search };

    const sortObj = { [sortBy]: sortOrder === "asc" ? 1 : -1 };
    const skip = (page - 1) * limit;

    const [customers, total] = await Promise.all([
      Customer.find(filter).sort(sortObj).skip(skip).limit(limit).lean(),
      Customer.countDocuments(filter),
    ]);

    return {
      customers,
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
   * Get a single customer by ID.
   */
  async getById(id) {
    const customer = await Customer.findById(id).lean();
    if (!customer) throw ApiError.notFound("Customer not found");
    return customer;
  }

  /**
   * Update customer fields.
   */
  async update(id, data, userId = null) {
    const customer = await Customer.findById(id);
    if (!customer) throw ApiError.notFound("Customer not found");

    const beforeState = customer.toJSON();

    if (data.email && data.email !== customer.email) {
      const conflict = await Customer.findOne({ email: data.email, _id: { $ne: id } });
      if (conflict) throw ApiError.conflict("A customer with this email already exists");
    }

    if (data.phone && data.phone !== customer.phone) {
      const conflict = await Customer.findOne({ phone: data.phone, _id: { $ne: id } });
      if (conflict) throw ApiError.conflict("A customer with this phone number already exists");
    }

    Object.assign(customer, data);
    await customer.save();

    logger.info(`Customer updated: ${customer.name}`);

    if (userId) {
      await addJob(QUEUE_NAMES.AUDIT_LOG, "customer-update", {
        action: "UPDATE",
        entity: "Customer",
        entityId: customer._id.toString(),
        userId: userId.toString(),
        before: beforeState,
        after: customer.toJSON(),
        metadata: {},
      });
    }

    return customer.toJSON();
  }

  /**
   * Soft-delete a customer.
   */
  async delete(id, userId = null) {
    const customer = await Customer.findById(id);
    if (!customer) throw ApiError.notFound("Customer not found");

    const beforeState = customer.toJSON();

    customer.isActive = false;
    await customer.save();

    logger.info(`Customer soft-deleted: ${customer.name}`);

    if (userId) {
      await addJob(QUEUE_NAMES.AUDIT_LOG, "customer-delete", {
        action: "DELETE",
        entity: "Customer",
        entityId: customer._id.toString(),
        userId: userId.toString(),
        before: beforeState,
        after: customer.toJSON(),
        metadata: {},
      });
    }

    return { message: "Customer deleted successfully" };
  }
}

export default new CustomerService();
