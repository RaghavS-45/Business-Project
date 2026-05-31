import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { vi, beforeAll, afterAll, afterEach } from "vitest";

/**
 * Global Test Setup
 *
 * Spins up an in-memory MongoDB **replica set** for test isolation.
 * Replica set is required because the checkout flow uses Mongoose transactions
 * (which require a replica set or mongos).
 *
 * Also stubs out BullMQ/Redis and Cloudinary to prevent real connections.
 */

let mongoServer;

// ─── Mock BullMQ queues (no real Redis needed) ───────────
vi.mock("../config/queue.js", () => ({
  QUEUE_NAMES: {
    RECEIPT_GENERATION: "receipt-generation",
    AUDIT_LOG: "audit-log",
    DEAD_LETTER: "dead-letter",
  },
  addJob: vi.fn().mockResolvedValue({ id: "mock-job-id" }),
  getQueue: vi.fn(),
  closeQueues: vi.fn(),
  moveToDeadLetterQueue: vi.fn(),
}));

// ─── Mock Cloudinary (no real uploads during tests) ──────
vi.mock("../config/cloudinary.js", () => ({
  default: {
    uploader: {
      upload_stream: vi.fn(),
      destroy: vi.fn().mockResolvedValue({ result: "ok" }),
    },
  },
}));

// ─── Set test environment variables ─────────────────────
process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = "test-access-secret-key-minimum-16-chars";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-key-minimum-16-chars";
process.env.JWT_ACCESS_EXPIRES_IN = "15m";
process.env.JWT_REFRESH_EXPIRES_IN = "7d";
process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
process.env.CLOUDINARY_API_KEY = "test-key";
process.env.CLOUDINARY_API_SECRET = "test-secret";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.CORS_ORIGIN = "http://localhost:5173";
process.env.STORE_NAME = "Test Store";

beforeAll(async () => {
  // Use a replica set so Mongoose transactions work
  mongoServer = await MongoMemoryReplSet.create({
    replSet: { count: 1 }, // Single-node replica set (fastest)
  });
  const uri = mongoServer.getUri();
  process.env.MONGO_URI = uri;

  await mongoose.connect(uri);
});

afterEach(async () => {
  // Clean all collections between tests for isolation
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});
