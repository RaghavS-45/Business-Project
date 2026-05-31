import productService from "../services/product.service.js";

/**
 * Product Controller — thin HTTP layer.
 *
 * Reads req, calls the service, sends res.
 * Image files come from req.files (set by Multer middleware in the route).
 * JSON body fields come from req.body (validated by Zod middleware).
 */
class ProductController {
  /**
   * POST /api/products
   * Body: multipart/form-data (fields + up to 5 image files)
   * Access: ADMIN | MANAGER
   */
  async create(req, res, next) {
    try {
      const product = await productService.create(req.body, req.files ?? [], req.user._id);
      res.status(201).json({
        success: true,
        message: "Product created successfully",
        data: { product },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/products
   * Query: ?page, ?limit, ?category, ?search, ?lowStock, ?sortBy, ?sortOrder
   * Access: authenticated
   */
  async list(req, res, next) {
    try {
      const result = await productService.list(req.query);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/products/sku/:sku
   * Barcode scanner lookup — find a product by SKU or barcode string.
   * Access: authenticated
   */
  async getBySku(req, res, next) {
    try {
      const product = await productService.getBySku(req.params.sku);
      res.status(200).json({
        success: true,
        data: { product },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/products/barcode/:sku
   * Returns a barcode PNG image for the given SKU.
   * Query: ?format=code128 (default) | qrcode | ean13
   * Access: authenticated
   */
  async getBarcodePng(req, res, next) {
    try {
      const format = req.query.format || "code128";
      const { buffer, sku, name } = await productService.generateBarcode(
        req.params.sku,
        format
      );

      res.set({
        "Content-Type": "image/png",
        "Content-Disposition": `inline; filename="${sku}-barcode.png"`,
        "X-Product-Name": name,
        "Cache-Control": "public, max-age=86400", // Cache 24h — barcodes don't change
      });
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/products/:id
   * Access: authenticated
   */
  async getById(req, res, next) {
    try {
      const product = await productService.getById(req.params.id);
      res.status(200).json({
        success: true,
        data: { product },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/products/:id
   * Body: multipart/form-data (any subset of fields + optional new images)
   * Access: ADMIN | MANAGER
   */
  async update(req, res, next) {
    try {
      const product = await productService.update(
        req.params.id,
        req.body,
        req.files ?? [],
        req.user._id
      );
      res.status(200).json({
        success: true,
        message: "Product updated successfully",
        data: { product },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/products/:id/images/:publicId
   * Removes one image from Cloudinary + product document.
   * publicId must be URL-encoded (contains slashes).
   * Access: ADMIN | MANAGER
   */
  async deleteImage(req, res, next) {
    try {
      // publicId may contain "/" — decode the full param
      const publicId = decodeURIComponent(req.params.publicId);
      const product = await productService.deleteImage(req.params.id, publicId);
      res.status(200).json({
        success: true,
        message: "Image removed successfully",
        data: { product },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/products/:id
   * Soft-deletes the product and purges all Cloudinary images.
   * Access: ADMIN | MANAGER
   */
  async delete(req, res, next) {
    try {
      const result = await productService.delete(req.params.id, req.user._id);
      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new ProductController();
