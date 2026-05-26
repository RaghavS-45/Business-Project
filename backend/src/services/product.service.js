import bwipjs from "bwip-js";
import Product from "../models/Product.js";
import cloudinary from "../config/cloudinary.js";
import ApiError from "../utils/ApiError.js";
import logger from "../config/logger.js";

/**
 * Product Service — business logic layer.
 *
 * Handles all CRUD operations, Cloudinary image management,
 * barcode generation, and stock filtering.
 *
 * Image upload flow:
 *   Multer (memory) → Buffer → Cloudinary upload stream → store {url, publicId}
 */

class ProductService {
  /**
   * Upload a buffer to Cloudinary and return {url, publicId}.
   * Uses upload_stream so no temp files are written to disk.
   * @private
   */
  _uploadToCloudinary(buffer, originalname) {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "inventory-pos/products",
          resource_type: "image",
          // Derive a clean public_id from the filename
          public_id: `${Date.now()}-${originalname.replace(/\.[^/.]+$/, "")}`,
          overwrite: false,
          transformation: [
            { width: 800, height: 800, crop: "limit" }, // Never enlarge, just constrain
            { quality: "auto:good" },                    // Smart compression
            { fetch_format: "auto" },                    // Serve WebP to browsers that support it
          ],
        },
        (error, result) => {
          if (error) return reject(ApiError.internal("Image upload failed: " + error.message));
          resolve({ url: result.secure_url, publicId: result.public_id });
        }
      );
      stream.end(buffer);
    });
  }

  /**
   * Upload multiple files in parallel.
   * @private
   */
  async _uploadFiles(files = []) {
    if (!files.length) return [];
    return Promise.all(
      files.map((file) => this._uploadToCloudinary(file.buffer, file.originalname))
    );
  }

  /**
   * Create a new product, optionally uploading images to Cloudinary.
   */
  async create(data, files = []) {
    const existingSkuCheck = data.sku
      ? await Product.findOne({ sku: data.sku.toUpperCase() })
      : null;
    if (existingSkuCheck) {
      throw ApiError.conflict(`SKU '${data.sku}' is already in use`);
    }

    if (data.barcode) {
      const existingBarcode = await Product.findOne({ barcode: data.barcode });
      if (existingBarcode) {
        throw ApiError.conflict(`Barcode '${data.barcode}' is already in use`);
      }
    }

    // Upload images first — if this fails, no DB record is created
    const images = await this._uploadFiles(files);

    const product = await Product.create({ ...data, images });

    logger.info(`Product created: ${product.name} (SKU: ${product.sku})`);
    return product;
  }

  /**
   * Paginated product list with search, category, and low-stock filters.
   */
  async list(query) {
    const {
      page,
      limit,
      category,
      search,
      lowStock,
      isActive,
      sortBy,
      sortOrder,
    } = query;

    const filter = { isActive };

    if (category) filter.category = category;

    if (search) {
      // Full-text search on name + description (uses the text index)
      filter.$text = { $search: search };
    }

    if (lowStock) {
      // Products where stock <= lowStockThreshold
      filter.$expr = { $lte: ["$stock", "$lowStockThreshold"] };
    }

    const sortObj = { [sortBy]: sortOrder === "asc" ? 1 : -1 };
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate("vendor", "name email phone")
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .lean({ virtuals: true }), // Include virtuals (isLowStock, marginPercent)
      Product.countDocuments(filter),
    ]);

    return {
      products,
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
   * Get a single product by MongoDB ObjectId.
   */
  async getById(id) {
    const product = await Product.findById(id)
      .populate("vendor", "name email phone contactPerson")
      .lean({ virtuals: true });

    if (!product) throw ApiError.notFound("Product not found");
    return product;
  }

  /**
   * Barcode scanner endpoint — look up a product by its SKU or barcode.
   * Returns the full product document if found.
   */
  async getBySku(identifier) {
    const product = await Product.findOne({
      $or: [
        { sku: identifier.toUpperCase() },
        { barcode: identifier },
      ],
      isActive: true,
    })
      .populate("vendor", "name")
      .lean({ virtuals: true });

    if (!product) {
      throw ApiError.notFound(`No active product found for identifier: ${identifier}`);
    }
    return product;
  }

  /**
   * Update a product's data and optionally add new images.
   * Existing images are preserved unless explicitly deleted via deleteImage().
   */
  async update(id, data, files = []) {
    const product = await Product.findById(id);
    if (!product) throw ApiError.notFound("Product not found");

    // Conflict checks for unique fields (only if value is changing)
    if (data.sku && data.sku.toUpperCase() !== product.sku) {
      const conflict = await Product.findOne({ sku: data.sku.toUpperCase(), _id: { $ne: id } });
      if (conflict) throw ApiError.conflict(`SKU '${data.sku}' is already in use`);
    }

    if (data.barcode && data.barcode !== product.barcode) {
      const conflict = await Product.findOne({ barcode: data.barcode, _id: { $ne: id } });
      if (conflict) throw ApiError.conflict(`Barcode '${data.barcode}' is already in use`);
    }

    // Upload new images and append to existing
    if (files.length > 0) {
      const currentImageCount = product.images.length;
      if (currentImageCount + files.length > 5) {
        throw ApiError.badRequest(
          `Cannot add ${files.length} image(s): product already has ${currentImageCount}/5 images`
        );
      }
      const newImages = await this._uploadFiles(files);
      data.images = [...product.images, ...newImages];
    }

    Object.assign(product, data);
    await product.save();

    logger.info(`Product updated: ${product.name} (${product.sku})`);
    return product.toJSON();
  }

  /**
   * Remove a single image from Cloudinary and the product's images array.
   */
  async deleteImage(productId, publicId) {
    const product = await Product.findById(productId);
    if (!product) throw ApiError.notFound("Product not found");

    const imageIndex = product.images.findIndex((img) => img.publicId === publicId);
    if (imageIndex === -1) throw ApiError.notFound("Image not found on this product");

    // Delete from Cloudinary first
    await cloudinary.uploader.destroy(publicId);

    product.images.splice(imageIndex, 1);
    await product.save();

    logger.info(`Image deleted from product ${product.sku}: ${publicId}`);
    return product.toJSON();
  }

  /**
   * Soft-delete a product and purge all its Cloudinary images.
   */
  async delete(id) {
    const product = await Product.findById(id);
    if (!product) throw ApiError.notFound("Product not found");

    // Delete all images from Cloudinary in parallel
    if (product.images.length > 0) {
      await Promise.allSettled(
        product.images.map((img) => cloudinary.uploader.destroy(img.publicId))
      );
    }

    product.isActive = false;
    product.images = [];
    await product.save();

    logger.info(`Product soft-deleted: ${product.name} (${product.sku})`);
    return { message: "Product deleted successfully" };
  }

  /**
   * Generate a barcode PNG buffer for a given SKU.
   * Uses bwip-js with Code128 symbology (readable by all barcode scanners).
   *
   * @param {string} sku - The SKU to encode
   * @param {string} format - Barcode type: 'code128' | 'ean13' | 'qrcode'
   * @returns {Buffer} PNG image buffer
   */
  async generateBarcode(sku, format = "code128") {
    // Ensure the product exists
    const product = await Product.findOne({ sku: sku.toUpperCase(), isActive: true });
    if (!product) throw ApiError.notFound(`No active product found with SKU: ${sku}`);

    const barcodeText = product.barcode || product.sku;

    try {
      const png = await bwipjs.toBuffer({
        bcid: format,           // Barcode type
        text: barcodeText,      // Text to encode
        scale: 3,               // 3x scaling
        height: 10,             // Bar height in millimetres
        includetext: true,      // Show human-readable text below
        textxalign: "center",
      });
      return { buffer: png, sku: product.sku, name: product.name };
    } catch (err) {
      throw ApiError.badRequest(`Barcode generation failed: ${err.message}`);
    }
  }
}

export default new ProductService();
