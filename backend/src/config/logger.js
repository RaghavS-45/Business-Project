import winston from "winston";

const { combine, timestamp, json, colorize, printf } = winston.format;

/**
 * Structured JSON logger using Winston.
 *
 * - Production  → JSON format (machine-parsable, ready for log aggregators)
 * - Development → coloured, human-readable format
 *
 * Log levels: error, warn, info, http, debug
 * Never use console.log in production — always use logger.info/warn/error.
 */

const devFormat = combine(
  colorize(),
  timestamp({ format: "HH:mm:ss" }),
  printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : "";
    return `${timestamp} ${level}: ${message} ${metaStr}`;
  })
);

const prodFormat = combine(timestamp(), json());

const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: process.env.NODE_ENV === "production" ? prodFormat : devFormat,
  defaultMeta: { service: "inventory-pos" },
  transports: [
    new winston.transports.Console(),
    // File transports for production — errors get their own file
    ...(process.env.NODE_ENV === "production"
      ? [
          new winston.transports.File({
            filename: "logs/error.log",
            level: "error",
          }),
          new winston.transports.File({ filename: "logs/combined.log" }),
        ]
      : []),
  ],
});

export default logger;
