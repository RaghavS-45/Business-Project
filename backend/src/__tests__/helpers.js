import User from "../models/User.js";
import Product from "../models/Product.js";
import Customer from "../models/Customer.js";
import { generateAccessToken } from "../utils/tokens.js";

/**
 * Test Helpers — factory functions for creating test data.
 *
 * Each factory returns a Mongoose document saved to the in-memory DB.
 * Overrides let individual tests customize specific fields.
 */

/**
 * Create and save a test user, returning the user + a valid JWT.
 */
export const createTestUser = async (overrides = {}) => {
  const defaults = {
    name: "Test Admin",
    email: `admin-${Date.now()}@test.com`,
    password: "Password123!",
    role: "ADMIN",
    isActive: true,
  };

  const user = await User.create({ ...defaults, ...overrides });
  const accessToken = generateAccessToken(user);

  return { user, accessToken };
};

/**
 * Create and save a test product.
 */
export const createTestProduct = async (overrides = {}) => {
  const defaults = {
    name: `Test Product ${Date.now()}`,
    sku: `TST-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    category: "Electronics",
    unit: "pcs",
    costPrice: 500,
    sellingPrice: 999,
    stock: 100,
    lowStockThreshold: 10,
    isActive: true,
  };

  return Product.create({ ...defaults, ...overrides });
};

/**
 * Create and save a test customer.
 */
export const createTestCustomer = async (overrides = {}) => {
  const defaults = {
    name: `Test Customer ${Date.now()}`,
    email: `customer-${Date.now()}@test.com`,
    phone: `+91${Math.floor(9000000000 + Math.random() * 1000000000)}`,
  };

  return Customer.create({ ...defaults, ...overrides });
};
