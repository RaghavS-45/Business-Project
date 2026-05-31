import mongoose from "mongoose";

/**
 * AuditLog Model — Immutable Ledger
 *
 * Append-only collection that records every state mutation in the system.
 * Each entry captures:
 *   - WHO made the change (userId)
 *   - WHAT entity was changed (entity + entityId)
 *   - WHEN it happened (timestamp, immutable)
 *   - WHAT changed (before/after snapshots + computed diff)
 *
 * Design decisions:
 *   - No update/delete operations are exposed — this is an append-only ledger
 *   - before/after are stored as Mixed (schemaless) to accommodate any entity type
 *   - changes[] provides a quick diff summary without comparing full snapshots
 *   - metadata captures context (IP, requestId, reason) for forensic analysis
 *   - Indexed for fast queries by entity, user, action, and time range
 *
 * Interview talking point: This mirrors real financial audit trail systems
 * (SOX compliance, GDPR audit requirements). The immutability guarantee comes
 * from the application layer — MongoDB doesn't enforce append-only natively,
 * but we never expose update/delete endpoints and the model has no such methods.
 */

const changeSchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    from: { type: mongoose.Schema.Types.Mixed },
    to: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      enum: [
        "CREATE",
        "UPDATE",
        "DELETE",
        "CHECKOUT",
        "STOCK_ADJUST",
        "REFUND",
      ],
      index: true,
    },

    entity: {
      type: String,
      required: true,
      enum: ["Product", "Vendor", "Customer", "Sale", "User"],
    },

    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Snapshot of the document BEFORE the mutation (null for CREATE)
    before: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // Snapshot of the document AFTER the mutation (null for DELETE)
    after: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // Quick-access diff: which fields changed and how
    changes: {
      type: [changeSchema],
      default: [],
    },

    // Extra context: IP address, requestId, human-readable reason, etc.
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Immutable timestamp — set once on creation, never modified
    timestamp: {
      type: Date,
      default: Date.now,
      immutable: true,
      index: true,
    },
  },
  {
    // Disable updatedAt — audit logs are never updated
    timestamps: false,
    toJSON: {
      transform(_doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// ─── Compound Indexes ────────────────────────────────────
// Query: "Show me all changes to Product X" — sorted newest first
auditLogSchema.index({ entity: 1, entityId: 1, timestamp: -1 });

// Query: "Show me everything User Y did" — sorted newest first
auditLogSchema.index({ userId: 1, timestamp: -1 });

// Query: "Show me all CHECKOUT events this week"
auditLogSchema.index({ action: 1, timestamp: -1 });

const AuditLog = mongoose.model("AuditLog", auditLogSchema);

export default AuditLog;
