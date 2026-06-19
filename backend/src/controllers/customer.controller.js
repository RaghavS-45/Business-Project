import customerService from "../services/customer.service.js";

/**
 * Customer Controller — thin HTTP layer.
 */
class CustomerController {
  /**
   * POST /api/customers
   * Access: ADMIN | MANAGER | CASHIER (cashier can create customers at the POS)
   */
  async create(req, res, next) {
    try {
      const customerData = { ...req.body };

      // Cleanse phone
      if (!customerData.phone || customerData.phone === "" || customerData.phone === null) {
        customerData.phone = undefined;
      }

      // Cleanse email
      if (!customerData.email || customerData.email === "" || customerData.email === null) {
        customerData.email = undefined;
      }

      const customer = await customerService.create(customerData, req.user._id);
      res.status(201).json({
        success: true,
        message: "Customer created successfully",
        data: { customer },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/customers
   * Query: ?page, ?limit, ?search, ?isActive, ?sortBy, ?sortOrder
   * Access: authenticated
   */
  async list(req, res, next) {
    try {
      const result = await customerService.list(req.query);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/customers/:id
   * Access: authenticated
   */
  async getById(req, res, next) {
    try {
      const customer = await customerService.getById(req.params.id);
      res.status(200).json({
        success: true,
        data: { customer },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/customers/:id
   * Access: ADMIN | MANAGER
   */
  async update(req, res, next) {
    try {
      const customerData = { ...req.body };

      // Cleanse phone
      if (!customerData.phone || customerData.phone === "" || customerData.phone === null) {
        customerData.phone = undefined;
      }

      // Cleanse email
      if (!customerData.email || customerData.email === "" || customerData.email === null) {
        customerData.email = undefined;
      }

      const customer = await customerService.update(req.params.id, customerData, req.user._id);
      res.status(200).json({
        success: true,
        message: "Customer updated successfully",
        data: { customer },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/customers/:id
   * Soft-deletes the customer (isActive = false).
   * Access: ADMIN
   */
  async delete(req, res, next) {
    try {
      const result = await customerService.delete(req.params.id, req.user._id);
      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new CustomerController();
