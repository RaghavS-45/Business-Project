import { v4 as uuidv4 } from "uuid";

/**
 * Request ID Middleware
 *
 * Generates a UUID v4 for every incoming request and attaches it to:
 *   - req.requestId   — available to all downstream handlers / services
 *   - X-Request-ID    — response header (useful for client-side debugging)
 *
 * This enables log correlation: every log line produced during a single
 * request shares the same requestId, making it trivial to trace a full
 * request lifecycle in production log aggregators (ELK, Datadog, etc.).
 */
const requestId = (req, res, next) => {
  const id = req.headers["x-request-id"] || uuidv4();
  req.requestId = id;
  res.setHeader("X-Request-ID", id);
  next();
};

export default requestId;
