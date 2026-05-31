import winston from "winston";

const { combine, timestamp, json, colorize, printf, errors } = winston.format;

/**
 * Structured JSON logger using Winston.
 *
 * Custom log levels (highest priority first):
 *   error  (0) — unrecoverable failures
 *   warn   (1) — recoverable issues / deprecation notices
 *   audit  (2) — financial-system audit trail (immutable ledger events)
 *   info   (3) — general application lifecycle events
 *   http   (4) — HTTP request/response logging
 *   debug  (5) — detailed diagnostic information
 *
 * Production  → JSON format (machine-parsable, ready for log aggregators)
 * Development → coloured, human-readable format
 *
 * Never use console.log in production — always use logger.info/warn/error.
 */

// ─── Custom Levels ────────────────────────────────────────
const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    audit: 2,
    info: 3,
    http: 4,
    debug: 5,
  },
  colors: {
    error: "red",
    warn: "yellow",
    audit: "magenta",
    info: "green",
    http: "cyan",
    debug: "white",
  },
};

winston.addColors(customLevels.colors);

// ─── Formats ──────────────────────────────────────────────
const devFormat = combine(
  colorize(),
  timestamp({ format: "HH:mm:ss" }),
  errors({ stack: true }), // Serialize Error objects with stack traces
  printf(({ timestamp, level, message, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length
      ? JSON.stringify(meta, null, 2)
      : "";
    const msg = stack || message;
    return `${timestamp} ${level}: ${msg} ${metaStr}`;
  })
);

const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

// ─── Logger Instance ──────────────────────────────────────
const logger = winston.createLogger({
  levels: customLevels.levels,
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: process.env.NODE_ENV === "production" ? prodFormat : devFormat,
  defaultMeta: { service: "inventory-pos" },
  transports: [
    new winston.transports.Console(),

    // ─── File transports (always active) ────────────────
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
    }),
    new winston.transports.File({
      filename: "logs/audit.log",
      level: "audit",
    }),
    new winston.transports.File({
      filename: "logs/combined.log",
    }),
  ],
});

export default logger;
