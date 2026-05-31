# Immutable Ledger — Walkthrough

## Summary

Built the complete transactional sales/checkout pipeline with an append-only audit trail, background job processing via BullMQ + Redis, production-grade Winston logging, and PDF receipt generation. **15 new files created, 10 files modified.**

---

## Changes by Component

### Component 1: Winston Logger Hardening

| File | Type | What changed |
|------|------|-------------|
| [logger.js](file:///Users/raghavsawhney/Desktop/Business-Project/backend/src/config/logger.js) | MODIFIED | Custom `audit` level, `errors({ stack: true })` format, dedicated `logs/audit.log` transport |
| [requestId.js](file:///Users/raghavsawhney/Desktop/Business-Project/backend/src/middleware/requestId.js) | NEW | UUID v4 per-request ID for log correlation, respects incoming `X-Request-ID` header |
| [env.js](file:///Users/raghavsawhney/Desktop/Business-Project/backend/src/config/env.js) | MODIFIED | Added `REDIS_URL`, `STORE_NAME`, `STORE_PHONE`, `STORE_ADDRESS` |
| [app.js](file:///Users/raghavsawhney/Desktop/Business-Project/backend/src/app.js) | MODIFIED | Mounted `requestId` middleware, added `requestId` to HTTP logs, added sale/audit route mounts |
| [.env](file:///Users/raghavsawhney/Desktop/Business-Project/backend/.env) | MODIFIED | Added Redis + store branding vars |
| [.env.example](file:///Users/raghavsawhney/Desktop/Business-Project/backend/.env.example) | MODIFIED | Same additions |

**Zero `console.log` in production code** — verified via grep.

---

### Component 2: AuditLog (Immutable Ledger)

| File | Type | Purpose |
|------|------|---------|
| [AuditLog.js](file:///Users/raghavsawhney/Desktop/Business-Project/backend/src/models/AuditLog.js) | NEW | Append-only model with immutable timestamps, before/after snapshots, computed diffs |
| [audit.service.js](file:///Users/raghavsawhney/Desktop/Business-Project/backend/src/services/audit.service.js) | NEW | Centralized audit write + diff computation + paginated queries |
| [audit.controller.js](file:///Users/raghavsawhney/Desktop/Business-Project/backend/src/controllers/audit.controller.js) | NEW | Read-only HTTP endpoints (no POST/PUT/DELETE) |
| [audit.routes.js](file:///Users/raghavsawhney/Desktop/Business-Project/backend/src/routes/audit.routes.js) | NEW | ADMIN-only routes: `GET /api/audit/:entity/:entityId`, `GET /api/audit/user/:userId` |

**Key design**: No update/delete methods exist on the AuditLog model. Immutability is enforced at the application layer. The `timestamp` field has `immutable: true`.

---

### Component 3: Redis + BullMQ

| File | Type | Purpose |
|------|------|---------|
| [redis.js](file:///Users/raghavsawhney/Desktop/Business-Project/backend/src/config/redis.js) | NEW | IORedis connection with BullMQ-compatible settings + worker connection factory |
| [queue.js](file:///Users/raghavsawhney/Desktop/Business-Project/backend/src/config/queue.js) | NEW | Queue definitions, `addJob()` helper, default retry policy (3 attempts, exponential backoff) |
| [audit.worker.js](file:///Users/raghavsawhney/Desktop/Business-Project/backend/src/workers/audit.worker.js) | NEW | BullMQ worker for async audit log writes (concurrency: 5) |
| [receipt.worker.js](file:///Users/raghavsawhney/Desktop/Business-Project/backend/src/workers/receipt.worker.js) | NEW | BullMQ worker for PDF receipt generation (concurrency: 3, CPU-bound) |
| [server.js](file:///Users/raghavsawhney/Desktop/Business-Project/backend/src/server.js) | MODIFIED | Starts workers after DB connect, graceful shutdown closes workers → queues → Redis |

---

### Component 4: Sale Model + Checkout Flow

| File | Type | Purpose |
|------|------|---------|
| [Sale.js](file:///Users/raghavsawhney/Desktop/Business-Project/backend/src/models/Sale.js) | NEW | Sale model with snapshotted line items, invoice number, payment tracking |
| [sale.validator.js](file:///Users/raghavsawhney/Desktop/Business-Project/backend/src/validators/sale.validator.js) | NEW | Zod schemas for checkout, listing, and refund validation |
| [sale.service.js](file:///Users/raghavsawhney/Desktop/Business-Project/backend/src/services/sale.service.js) | NEW | **Checkout with Mongoose transactions**, optimistic stock locking, refund, daily summary |
| [sale.controller.js](file:///Users/raghavsawhney/Desktop/Business-Project/backend/src/controllers/sale.controller.js) | NEW | Thin HTTP layer for checkout, listing, summary, refund |
| [sale.routes.js](file:///Users/raghavsawhney/Desktop/Business-Project/backend/src/routes/sale.routes.js) | NEW | Routes with role-based access |

**Checkout transaction flow**:
```
1. Start Mongoose session + transaction
2. For each cart item:
   a. Atomic stock decrement with $gte guard (optimistic lock)
   b. Snapshot product data into line item
   c. Compute line total with discount + tax
3. Generate invoice number (INV-YYYYMMDD-XXXX)
4. Create Sale document (within session)
5. Update customer loyalty (within session)
6. Commit transaction
7. Enqueue receipt + audit jobs (outside transaction)
```

---

### Component 5: PDF Receipt Generation

| File | Type | Purpose |
|------|------|---------|
| [receipt.service.js](file:///Users/raghavsawhney/Desktop/Business-Project/backend/src/services/receipt.service.js) | NEW | PDFKit receipt generation (80mm width) + Cloudinary upload |

---

### Integration: Audit Logging in Existing Services

| File | Changes |
|------|---------|
| [product.service.js](file:///Users/raghavsawhney/Desktop/Business-Project/backend/src/services/product.service.js) | Added `userId` param + audit jobs to create/update/delete |
| [customer.service.js](file:///Users/raghavsawhney/Desktop/Business-Project/backend/src/services/customer.service.js) | Added `userId` param + audit jobs to create/update/delete |
| [vendor.service.js](file:///Users/raghavsawhney/Desktop/Business-Project/backend/src/services/vendor.service.js) | Added `userId` param + audit jobs to create/update/delete |
| [product.controller.js](file:///Users/raghavsawhney/Desktop/Business-Project/backend/src/controllers/product.controller.js) | Passes `req.user._id` to service mutations |
| [customer.controller.js](file:///Users/raghavsawhney/Desktop/Business-Project/backend/src/controllers/customer.controller.js) | Passes `req.user._id` to service mutations |
| [vendor.controller.js](file:///Users/raghavsawhney/Desktop/Business-Project/backend/src/controllers/vendor.controller.js) | Passes `req.user._id` to service mutations |

---

## New Dependencies

```
bullmq, ioredis, pdfkit, uuid, node-cron
```

## API Endpoints Added

| Method | Route | Access | Description |
|--------|-------|--------|-------------|
| `POST` | `/api/sales/checkout` | All authenticated | Process checkout |
| `GET` | `/api/sales` | ADMIN, MANAGER | List sales (paginated) |
| `GET` | `/api/sales/summary/daily` | ADMIN, MANAGER | Daily sales summary |
| `GET` | `/api/sales/:id` | Authenticated | Get sale details |
| `POST` | `/api/sales/:id/refund` | ADMIN, MANAGER | Process refund |
| `GET` | `/api/audit/:entity/:entityId` | ADMIN | Entity audit trail |
| `GET` | `/api/audit/user/:userId` | ADMIN | User action history |

## Verification

- ✅ All modules load without syntax/import errors
- ✅ No `console.log` in any production source file
- ✅ Duplicate Mongoose index warning fixed
- ⚠️ Redis not running locally — install with `brew install redis && brew services start redis`

## Next Steps to Run

```bash
# 1. Start Redis
brew install redis && brew services start redis

# 2. Start the server
cd backend && npm run dev

# 3. Test checkout (after logging in to get a token)
curl -X POST http://localhost:5001/api/sales/checkout \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"items": [{"product": "<id>", "quantity": 2}], "paymentMethod": "CASH"}'
```
