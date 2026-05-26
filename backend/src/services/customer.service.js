import Customer from "../models/Customer.js";
import ApiError from "../utils/ApiError.js";
import logger from "../config/logger.js";

/**
 * Customer Service — business logic layer.
 */

class CustomerService {
  /**
   * Create a new customer.
   */
  async create(data) {
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
  async update(id, data) {
    const customer = await Customer.findById(id);
    if (!customer) throw ApiError.notFound("Customer not found");

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
    return customer.toJSON();
  }

  /**
   * Soft-delete a customer.
   */
  async delete(id) {
    const customer = await Customer.findById(id);
    if (!customer) throw ApiError.notFound("Customer not found");

    customer.isActive = false;
    await customer.save();

    logger.info(`Customer soft-deleted: ${customer.name}`);
    return { message: "Customer deleted successfully" };
  }
}

export default new CustomerService();
