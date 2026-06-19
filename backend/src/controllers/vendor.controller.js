import vendorService from "../services/vendor.service.js";

/**
 * Vendor Controller — thin HTTP layer.
 */
class VendorController {
  /**
   * POST /api/vendors
   * Access: ADMIN | MANAGER
   */
  async create(req, res, next) {
    try {

      const vendorData = { ...req.body };

      // Cleanse GSTIN
      if (!vendorData.gstin || vendorData.gstin === "" || vendorData.gstin === null) {
        vendorData.gstin = undefined;
      }

      // Cleanse Email
      if (!vendorData.email || vendorData.email === "" || vendorData.email === null) {
        vendorData.email = undefined;
      }

      const vendor = await vendorService.create(vendorData, req.user._id);
      res.status(201).json({
        success: true,
        message: "Vendor created successfully",
        data: { vendor },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/vendors
   * Query: ?page, ?limit, ?search, ?isActive, ?sortBy, ?sortOrder
   * Access: authenticated
   */
  async list(req, res, next) {
    try {
      const result = await vendorService.list(req.query);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/vendors/:id
   * Access: authenticated
   */
  async getById(req, res, next) {
    try {
      const vendor = await vendorService.getById(req.params.id);
      res.status(200).json({
        success: true,
        data: { vendor },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/vendors/:id
   * Access: ADMIN | MANAGER
   */
  async update(req, res, next) {
    try {
      const vendorData = { ...req.body };

      // 2. Cleanse GSTIN
      if (!vendorData.gstin || vendorData.gstin === "" || vendorData.gstin === null) {
        vendorData.gstin = undefined;
      }

      // 3. Cleanse Email
      if (!vendorData.email || vendorData.email === "" || vendorData.email === null) {
        vendorData.email = undefined;
      }

      // 4. Pass the cleansed data to the service
      const vendor = await vendorService.update(req.params.id, vendorData, req.user._id);

      res.status(200).json({
        success: true,
        message: "Vendor updated successfully",
        data: { vendor },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/vendors/:id
   * Soft-deletes the vendor (isActive = false).
   * Access: ADMIN
   */
  async delete(req, res, next) {
    try {
      const result = await vendorService.delete(req.params.id, req.user._id);
      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new VendorController();
