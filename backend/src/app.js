import express from "express";
import compression from "compression";
import cors from "cors";
import helmet from "helmet";
import env from "./config/env.js";
import { apiLimiter } from "./middleware/rateLimiter.js";
import errorHandler from "./middleware/errorHandler.js";
import requestId from "./middleware/requestId.js";
import logger from "./config/logger.js";

// ─── Route Imports ────────────────────────────────────────
import authRoutes from "./routes/auth.routes.js";
import productRoutes from "./routes/product.routes.js";
import vendorRoutes from "./routes/vendor.routes.js";
import customerRoutes from "./routes/customer.routes.js";
import saleRoutes from "./routes/sale.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import dlqRoutes from "./routes/dlq.routes.js";
import userRoutes from "./routes/user.routes.js";
import purchaseOrderRoutes from "./routes/purchaseOrder.routes.js";

/**
 * Express Application
 *
 * Security layers (applied in order):
 *   1. Helmet — sets security-related HTTP headers (CSP, HSTS, etc.)
 *   2. CORS — whitelist allowed origins
 *   3. Rate limiter — general API throttle (200 req/15min)
 *   4. Request ID — UUID v4 for log correlation
 *   5. Body parsers — JSON + URL-encoded with size limits
 *
 * Routes are mounted under /api/<resource>.
 * Global error handler sits at the bottom of the middleware stack.
 */

const app = express();

// ─── Security Middleware ──────────────────────────────────
app.use(
  helmet({
    // Stricter referrer policy — don't leak paths to external origins
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    // Restrict browser features the app doesn't need
    permittedCrossDomainPolicies: { permittedPolicies: "none" },
    // Prevent MIME-type sniffing
    noSniff: true,
    // Prevent click-jacking
    frameguard: { action: "deny" },
    // Cross-Origin policies for isolation
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. curl, Postman, server-to-server)
      if (!origin) return callback(null, true);

      const allowed = env.CORS_ORIGIN;
      // Support wildcard for easy initial deployment
      if (allowed === "*") return callback(null, true);

      // Support comma-separated origins
      const origins = allowed.split(",").map((o) => o.trim());
      if (origins.includes(origin)) {
        return callback(null, true);
      }

      callback(new Error(`CORS: ${origin} not allowed`));
    },
    credentials: true,
  })
);

// ─── Compression ──────────────────────────────────────────
// Gzip/deflate responses — ~60-70% size reduction on JSON payloads
app.use(
  compression({
    threshold: 1024, // Only compress responses > 1KB
    level: 6,        // Balanced speed/ratio (1-9)
    filter: (req, res) =>
      req.headers["x-no-compression"]
        ? false
        : compression.filter(req, res),
  })
);

app.use(apiLimiter);

// ─── Request ID (before body parsers & logging) ──────────
app.use(requestId);

// ─── Body Parsers ─────────────────────────────────────────
app.use(express.json({ limit: "10kb" })); // prevent large payload attacks
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// ─── Request Logging ──────────────────────────────────────
app.use((req, _res, next) => {
  logger.http(`${req.method} ${req.originalUrl}`, {
    requestId: req.requestId,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  });
  next();
});

// ─── Health Check ─────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is healthy",
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  });
});

// ─── API Routes ───────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/vendors", vendorRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/sales", saleRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/admin/dlq", dlqRoutes);
app.use("/api/users", userRoutes);
app.use("/api/purchase-orders", purchaseOrderRoutes);

// ─── 404 Handler ──────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// ─── Global Error Handler (must be last) ──────────────────
app.use(errorHandler);


export default app;

