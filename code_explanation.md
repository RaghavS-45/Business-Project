# 📦 Inventory & POS Backend — Complete Beginner's Guide

This document explains **every single file** in your backend, what every concept means, and *why* each piece makes your project better. Think of it as a guided tour of your own code.

---

## 🗺️ The Big Picture

Before diving into files, understand the **journey of a single request** through your system:

```
Browser / App (Frontend)
        │
        ▼
  [ Rate Limiter ]  ──── Too many requests? Blocked here.
        │
        ▼
  [ Helmet / CORS ]  ── Wrong origin? Blocked here.
        │
        ▼
  [ Body Parser ]  ─── Payload too large? Blocked here.
        │
        ▼
  [ Validate (Zod) ]  ─ Bad data format? Blocked here.
        │
        ▼
  [ Authenticate ]  ─── No valid token? Blocked here.
        │
        ▼
  [ Authorize ]  ───── Wrong role? Blocked here.
        │
        ▼
  [ Controller ]  ─── Reads the request, calls the Service
        │
        ▼
  [ Service ]  ─────── Does the real work (talks to DB)
        │
        ▼
  [ Model / MongoDB ]  Store/retrieve data
        │
        ▼
  [ Response ] ──────── Sends JSON back to the client
```

If anything goes wrong at any step, it falls into the **Error Handler** which sends a clean error response.

---

## 📁 Folder Structure Explained

```
backend/
├── .env                ← Secret config (never share this)
├── .env.example        ← Template showing what secrets are needed
├── package.json        ← Project info & list of libraries used
└── src/
    ├── server.js       ← Starts the server (entry point)
    ├── app.js          ← Configures the server (middleware setup)
    ├── config/
    │   ├── env.js      ← Validates environment variables
    │   ├── db.js       ← Connects to MongoDB
    │   └── logger.js   ← Sets up logging (Winston)
    ├── models/
    │   ├── User.js         ← Defines what a User looks like in DB
    │   └── RefreshToken.js ← Defines how sessions are stored
    ├── middleware/
    │   ├── authenticate.js ← "Are you logged in?"
    │   ├── authorize.js    ← "Do you have permission?"
    │   ├── validate.js     ← "Is your data valid?"
    │   ├── rateLimiter.js  ← "Are you sending too many requests?"
    │   └── errorHandler.js ← Catches ALL errors in one place
    ├── routes/
    │   └── auth.routes.js  ← URL paths for login/register/etc.
    ├── controllers/
    │   └── auth.controller.js  ← Reads request, calls service, sends response
    ├── services/
    │   └── auth.service.js ← All the real business logic
    ├── validators/
    │   └── auth.validator.js   ← Rules for what data is valid
    ├── utils/
    │   ├── ApiError.js     ← Custom error type
    │   └── tokens.js       ← JWT token creation & verification
    └── seeds/
        └── seedAdmin.js    ← One-time script to create first admin user
```

---

## 📄 `package.json` — The Project's ID Card

This is the **first file Node.js reads**. Think of it like the receipt of everything your project needs.

```json
{
  "name": "inventory-pos-backend",
  "type": "module",       ← Uses modern ES module syntax (import/export)
  "scripts": {
    "dev": "nodemon src/server.js",   ← Runs with auto-restart
    "start": "node src/server.js",    ← Runs normally
    "seed": "node src/seeds/seedAdmin.js"  ← Creates first admin
  }
}
```

### Libraries Used (`dependencies`)

| Library | What It Is | Why It's Used |
|---|---|---|
| **express** | The web framework | Handles all HTTP requests/responses — the backbone of the server |
| **mongoose** | MongoDB connector | Lets you work with your database using JavaScript objects instead of raw queries |
| **bcrypt** | Password hasher | Turns plain passwords into unreadable hashes so you never store real passwords |
| **jsonwebtoken** | JWT library | Creates and verifies login tokens |
| **dotenv** | Env file loader | Loads secret config from the `.env` file |
| **cors** | Cross-Origin handler | Controls which websites/apps can talk to your backend |
| **helmet** | Security headers | Adds 15+ HTTP security headers automatically |
| **express-rate-limit** | Request throttler | Limits how many requests an IP can make |
| **winston** | Logger | Professional logging system (better than `console.log`) |
| **zod** | Schema validator | Validates incoming data with very clear error messages |

### Dev Dependencies

| Library | What It Does 
|---|---|
| **nodemon** | Watches your files and restarts the server automatically when you save changes. Only used in development. |

> **Why `"type": "module"`?** — This tells Node.js to use modern JavaScript (`import`/`export`) instead of the older `require()` style. Modern and cleaner.

---

## 📄 `.env` and `.env.example` — Secret Configuration

**What are environment variables?** They are settings that change depending on *where* your code runs (your laptop vs. a production server). Instead of hardcoding sensitive things like database passwords in your code, you put them in a `.env` file.

```
NODE_ENV=development       ← "development" or "production"
PORT=5000                  ← What port the server listens on
MONGO_URI=mongodb://...    ← Where your database is
JWT_ACCESS_SECRET=...      ← Secret key to sign login tokens
JWT_REFRESH_SECRET=...     ← Secret key for refresh tokens
JWT_ACCESS_EXPIRES_IN=15m  ← Access tokens expire in 15 minutes
JWT_REFRESH_EXPIRES_IN=7d  ← Refresh tokens expire in 7 days
LOGIN_RATE_LIMIT_MAX=5     ← Max 5 login attempts per window
CORS_ORIGIN=http://...     ← Which frontend URL is allowed
```

**Why `.env.example`?** — The `.env` file is in `.gitignore` (so your secrets never go to GitHub). The `.env.example` file is a safe template that tells other developers "you need these variables, go fill them in".

> ✅ **Benefit**: Secrets are never committed to version control. Anyone who clones the repo knows exactly what variables to set up.

---

## 📁 `src/config/` — Application Configuration

### `env.js` — Environment Variable Validator

**The Problem it solves:** What if someone forgets to set `MONGO_URI`? The app would start, then crash mysteriously 5 minutes later when it tries to connect to the database. Very hard to debug.

**The Solution:** Validate ALL environment variables *at startup* before anything else runs. If anything is missing or wrong, crash immediately with a clear error message.

```js
// Uses Zod to define a "shape" of what env vars should look like
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),  // Must be a positive number
  MONGO_URI: z.string().url("MONGO_URI must be a valid URL"),  // Must be a real URL
  JWT_ACCESS_SECRET: z.string().min(16, "Too short"),  // Must be at least 16 chars
  // ...etc
});

// If validation fails, print exactly what's wrong and STOP immediately
if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.flatten());
  process.exit(1);  // Kill the process
}

// Object.freeze() makes it read-only — nobody can accidentally change it
const env = Object.freeze(parsed.data);
```

> ✅ **Benefit**: No silent failures. You know within 1 second of starting whether your config is correct.

---

### `db.js` — MongoDB Connection

**What is MongoDB?** A database that stores data as JSON-like documents instead of tables. Perfect for flexible business data like products, sales, and users.

**What is Mongoose?** A library that lets you define the *shape* of your data (schemas) and provides a clean JavaScript API to talk to MongoDB.

```js
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(env.MONGO_URI);
    logger.info(`MongoDB connected: ${conn.connection.host}`);

    // Listen for future disconnections
    mongoose.connection.on("disconnected", () => {
      logger.warn("MongoDB disconnected — attempting reconnect…");
    });
  } catch (error) {
    logger.error(`MongoDB connection failed: ${error.message}`);
    process.exit(1);  // Can't run without a database — stop immediately
  }
};
```

> ✅ **Benefit**: Mongoose automatically tries to reconnect if the database drops. Logs give you visibility into connection health.

---

### `logger.js` — Winston Logging

**Why not just use `console.log`?** `console.log` is fine for quick debugging, but in a real application:
- You need to know *when* something happened (timestamps)
- You need to save errors to files
- You need different behavior in development vs. production
- Log aggregation tools (like Datadog) need structured JSON

**Winston** solves all of this.

```js
// Development: pretty, colorized, human-readable
// 14:32:01 info: MongoDB connected: localhost

// Production: structured JSON (machines can parse this)
// {"level":"info","message":"MongoDB connected","timestamp":"...","service":"inventory-pos"}
```

```js
const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  // In production: only log info and above (hides debug noise)
  // In development: log everything including debug messages

  transports: [
    new winston.transports.Console(),  // Always print to terminal
    // In production ONLY: also write to files
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/combined.log" }),
  ]
});
```

> ✅ **Benefit**: In production you get structured log files you can search. In development you get readable colorized output. All from one logger.

---

## 📄 `src/server.js` — The Entry Point

This is where your application **actually starts**. Think of it like turning the key in the ignition.

```js
const startServer = async () => {
  // Step 1: Connect to MongoDB FIRST
  await connectDB();

  // Step 2: Start listening for HTTP requests
  const server = app.listen(env.PORT, () => {
    logger.info(`🚀 Server running on port ${env.PORT}`);
  });

  // Step 3: Handle OS shutdown signals
  const shutdown = (signal) => {
    server.close(() => {   // Stop accepting new requests
      process.exit(0);     // Exit cleanly
    });
    setTimeout(() => process.exit(1), 10_000); // Force exit after 10 seconds
  };

  process.on("SIGTERM", () => shutdown("SIGTERM")); // Docker/Kubernetes sends this
  process.on("SIGINT",  () => shutdown("SIGINT"));  // Ctrl+C sends this

  // Safety nets — catch crashes that shouldn't happen
  process.on("unhandledRejection", (reason) => { shutdown("UNHANDLED_REJECTION"); });
  process.on("uncaughtException",  (error)  => { shutdown("UNCAUGHT_EXCEPTION"); });
};
```

**What is Graceful Shutdown?**
> Imagine a cashier serving a customer at the exact moment a manager shouts "Close up!". A graceful cashier finishes the transaction first, then closes the register. An ungraceful one just walks away mid-transaction. This code ensures your server is a graceful cashier.

> ✅ **Benefit**: No dropped requests during deployments. No data corruption from abrupt exits.

---

## 📄 `src/app.js` — The Express Application

This file **configures** Express but doesn't start it. It's separated from `server.js` so you can import `app` in tests without starting a real server.

```js
const app = express();

// 1. Security headers (Helmet)
app.use(helmet());
// Adds headers like:
//   X-Content-Type-Options: nosniff
//   X-Frame-Options: DENY
//   Content-Security-Policy: ...

// 2. CORS — only allow our frontend
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));

// 3. Rate limiting — max 200 requests per 15 minutes per IP
app.use(apiLimiter);

// 4. Body parsing — read JSON from request body, max 10kb
app.use(express.json({ limit: "10kb" }));

// 5. Log every request
app.use((req, _res, next) => {
  logger.http(`${req.method} ${req.originalUrl}`, { ip: req.ip });
  next();
});

// 6. Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ success: true, message: "Server is healthy" });
});

// 7. Mount routes
app.use("/api/auth", authRoutes);

// 8. 404 for unknown routes
app.use((_req, res) => { res.status(404).json({ message: "Route not found" }); });

// 9. Global error handler (MUST be last)
app.use(errorHandler);
```

**What is Middleware?**
> Think of middleware as a **conveyor belt** in a factory. Each station on the belt does one job (adds security headers, checks the token, validates data), and then passes the item to the next station. If any station rejects the item, it gets sent to the "error department" (errorHandler).

> ✅ **Benefit**: Security is applied *before* any of your code runs. Even if you forget to add security to a new route, the app-level middleware still protects it.

---

## 📁 `src/models/` — Database Schemas

### `User.js` — The User Model

A **Model** is like a blueprint. It tells Mongoose: "every user document in the database must have these fields with these rules".

```js
const ROLES = ["ADMIN", "MANAGER", "CASHIER"];

const userSchema = new mongoose.Schema({
  name:      { type: String, required: true, minlength: 2, maxlength: 100 },
  email:     { type: String, required: true, unique: true, lowercase: true },
  password:  { type: String, required: true, minlength: 8, select: false },
  //                                                         ↑
  // select: false = password is NEVER included in query results by default.
  // You must explicitly ask for it with .select("+password")
  role:      { type: String, enum: ROLES, default: "CASHIER" },
  isActive:  { type: Boolean, default: true },
  lastLogin: { type: Date, default: null },
}, {
  timestamps: true,  // Automatically adds createdAt and updatedAt
  toJSON: {
    transform(doc, ret) {
      delete ret.password;   // Never send password in JSON response
      delete ret.__v;        // Remove Mongoose version field
      return ret;
    }
  }
});

// Index = like a bookmark in a book. Makes searching faster.
userSchema.index({ email: 1 });  // Finding users by email is VERY fast
userSchema.index({ role: 1 });   // Filtering by role is VERY fast

// Pre-save hook: automatically hash password before saving
userSchema.pre("save", async function(next) {
  if (!this.isModified("password")) return next(); // Don't re-hash if unchanged
  this.password = await bcrypt.hash(this.password, 12); // 12 salt rounds
  next();
});

// Instance method: check if a password matches the stored hash
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};
```

**What is bcrypt?**
> Bcrypt is a one-way hashing algorithm. `"Admin@123456"` becomes `"$2b$12$Xk9jlk..."`. You can never reverse it back. When a user logs in, you hash what they typed and compare the two hashes. The real password is never stored anywhere.

**What are Salt Rounds?** 
> Salt rounds (12 in your code) control how slow the hashing is. Slower = harder for hackers to crack. 12 rounds is the recommended production value.

> ✅ **Benefit**: Even if your entire database is stolen, passwords cannot be recovered. The `select: false` + `toJSON` transform ensures passwords can never accidentally leak in a response.

---

### `RefreshToken.js` — Session Storage

**The Problem:** JWTs (access tokens) can't be "logged out" — once issued, they're valid until they expire. If someone steals a token, you can't invalidate it.

**The Solution:** Store refresh tokens in the database. To "logout", delete the record. The token is now invalid even if someone has it.

```js
const refreshTokenSchema = new mongoose.Schema({
  user:      { type: ObjectId, ref: "User", required: true }, // Links to a User
  tokenHash: { type: String, required: true, unique: true },  // HASHED token (never raw)
  expiresAt: { type: Date, required: true },                  // When it expires
  userAgent: { type: String },  // What browser/device created this session
  ipAddress: { type: String },  // What IP created this session
});

// TTL Index = Time To Live. MongoDB automatically deletes documents
// when their expiresAt date passes. No cron job needed!
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Static method to delete ALL sessions for a user (logout everywhere)
refreshTokenSchema.statics.revokeAllForUser = async function(userId) {
  return this.deleteMany({ user: userId });
};
```

> ✅ **Benefit**: You can log someone out of a specific device OR all devices at once. Expired tokens are cleaned up automatically. You can see what devices are logged in (via userAgent + ipAddress).

---

## 📁 `src/middleware/` — The Security Checkpoints

### `authenticate.js` — "Are You Logged In?"

This middleware runs on every **protected route**. It checks for a valid access token in the request header.

```js
const authenticate = async (req, _res, next) => {
  // 1. Check for "Authorization: Bearer <token>" header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw ApiError.unauthorized("Missing or malformed Authorization header");
  }

  // 2. Extract the token
  const token = authHeader.split(" ")[1]; // Gets the part after "Bearer "

  // 3. Verify the JWT signature
  const decoded = verifyAccessToken(token); // Throws if expired or tampered

  // 4. Make sure the user still exists in the database
  const user = await User.findById(decoded.userId);
  if (!user) throw ApiError.unauthorized("User no longer exists");

  // 5. Make sure the account isn't deactivated
  if (!user.isActive) throw ApiError.forbidden("Account has been deactivated");

  // 6. Attach the user to the request so the next function can use it
  req.user = user;
  next(); // Pass control to the next middleware/controller
};
```

> ✅ **Benefit**: Even if someone has a valid JWT for a deleted or deactivated account, they will be blocked. The user object is attached to `req.user` once — no need to fetch it again in controllers.

---

### `authorize.js` — "Do You Have Permission?"

After knowing *who* you are (authenticate), this checks *what* you're allowed to do.

```js
const authorize = (...allowedRoles) => {
  // This returns a middleware function
  return (req, _res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return next(ApiError.forbidden(`Role '${req.user.role}' is not authorized`));
    }
    next();
  };
};

// Usage examples:
router.post("/register", authenticate, authorize("ADMIN"), ...)
// A CASHIER hitting this route gets a 403 Forbidden error

router.get("/reports", authenticate, authorize("ADMIN", "MANAGER"), ...)
// A CASHIER is blocked. ADMIN and MANAGER can access it.
```

> ✅ **Benefit**: Role-based access control (RBAC) in one reusable function. Adding a new protected route is as simple as `authorize("ADMIN")`. A cashier can never accidentally access admin functionality.

---

### `validate.js` — "Is Your Data Valid?"

Before any business logic runs, this ensures the incoming data is exactly what you expect.

```js
const validate = (schema, source = "body") => {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]); // Run Zod validation

    if (!result.success) {
      const fieldErrors = result.error.errors.map(err => ({
        field: err.path.join("."),
        message: err.message,
      }));
      return next(ApiError.badRequest("Validation failed", fieldErrors));
      // Returns: { success: false, errors: [{ field: "email", message: "Invalid email" }] }
    }

    req[source] = result.data; // Replace with cleaned/transformed data
    next();
  };
};
```

> ✅ **Benefit**: Controllers never receive bad data. If you send `{ email: "not-an-email" }`, the error is caught here with a clear message before it ever touches your database logic.

---

### `rateLimiter.js` — "Are You Sending Too Many Requests?"

Protects against bots and brute-force attacks.

```js
// Login limiter: max 5 attempts per 15 minutes, per IP + email combination
export const loginLimiter = rateLimit({
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MS, // 15 minutes
  max: env.LOGIN_RATE_LIMIT_MAX,            // 5 attempts
  keyGenerator: (req) => `${req.ip}-${req.body?.email || "unknown"}`,
  // Using IP + email means a shared office IP won't lock out ALL employees
  // when one person types their password wrong 5 times
  message: { success: false, message: "Too many login attempts — try again in 15 minutes" }
});

// General API limiter: max 200 requests per 15 minutes for everything else
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
});
```

> ✅ **Benefit**: Makes brute-force password attacks practically impossible (5 guesses per 15 minutes = 480 guesses per day, while a modern password has billions of combinations). The IP+email key is smarter than IP-only.

---

### `errorHandler.js` — The Catch-All Safety Net

This is the **last middleware** in `app.js`. Any error thrown or passed via `next(error)` anywhere in the app ends up here.

```js
const errorHandler = (err, req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal server error";

  // Handle specific Mongoose errors and give them the right HTTP codes:
  if (err.code === 11000) {
    // Duplicate key (e.g., email already exists)
    statusCode = 409; message = `${field} already exists`;
  }
  if (err.name === "ValidationError") {
    // Mongoose schema validation failed
    statusCode = 400; message = "Validation failed";
  }
  if (err.name === "CastError" && err.kind === "ObjectId") {
    // Someone sent an invalid MongoDB ID like "/users/not-a-real-id"
    statusCode = 400; message = `Invalid ID format`;
  }

  // Log server errors (500+) as errors, client errors (4xx) as warnings
  if (statusCode >= 500) logger.error(...);
  else logger.warn(...);

  res.status(statusCode).json({
    success: false,
    message,
    // In development only: include the full stack trace to help debugging
    ...(env.NODE_ENV === "development" && { stack: err.stack }),
  });
};
```

> ✅ **Benefit**: Clients always get a consistent, clean JSON error response. Internal details (stack traces) are never leaked in production. Every error is logged with context (URL, user ID, IP). You never have to write try/catch in every route.

---

## 📁 `src/utils/` — Shared Tools

### `ApiError.js` — Custom Error Type

Instead of throwing generic JavaScript errors, you throw `ApiError` which carries an HTTP status code.

```js
class ApiError extends Error {
  constructor(statusCode, message, errors = []) {
    super(message);
    this.statusCode = statusCode;   // e.g., 401, 403, 404
    this.isOperational = true;      // Means "this is an expected error, not a bug"
  }

  // Convenient shorthand methods:
  static unauthorized(msg) { return new ApiError(401, msg); }
  static forbidden(msg)    { return new ApiError(403, msg); }
  static notFound(msg)     { return new ApiError(404, msg); }
  static conflict(msg)     { return new ApiError(409, msg); }
  // etc.
}

// Usage anywhere in code:
throw ApiError.unauthorized("Invalid token");    // → 401 response
throw ApiError.forbidden("Admins only");         // → 403 response
throw ApiError.notFound("Product not found");    // → 404 response
```

> ✅ **Benefit**: Throwing errors is simple and readable. The errorHandler knows exactly what status code to send. No magic numbers scattered throughout your code.

---

### `tokens.js` — JWT Token Utilities

**What is a JWT (JSON Web Token)?**
> Imagine a hotel key card. The hotel embeds your room number on the card. When you use it, the door reads the card — it doesn't need to call the front desk every time. A JWT works the same way: your user ID and role are embedded in the token, so the server doesn't need to check the database on every request.

```js
// ACCESS TOKEN — short-lived JWT (15 minutes)
// Contains: { userId, role }  — encoded and SIGNED with your secret key
export const generateAccessToken = (user) => {
  return jwt.sign(
    { userId: user._id, role: user.role }, // Payload (visible but tamper-proof)
    env.JWT_ACCESS_SECRET,                 // Secret used to sign it
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN } // Expires in 15m
  );
};

// REFRESH TOKEN — long-lived random string (7 days)
// NOT a JWT — just a random hex string. Stored in the database (hashed).
export const generateRefreshToken = () => {
  return crypto.randomBytes(40).toString("hex"); // 80 random hex characters
};

// Hash a token with SHA-256 before storing it
// Never store the raw token — only the hash
export const hashToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

// Parse "7d" → 604800000 (milliseconds)
// Used to calculate when a refresh token should expire
export const parseDuration = (duration) => { ... };
```

**Access Token vs. Refresh Token — Why Two Tokens?**

| | Access Token | Refresh Token |
|---|---|---|
| **Lifespan** | 15 minutes | 7 days |
| **Stored where** | Client memory / header | Client storage + database |
| **Purpose** | Proves you're authenticated | Gets you a new access token |
| **Revocable?** | No (expires on its own) | Yes (delete from DB) |

> ✅ **Benefit**: Short-lived access tokens limit damage if stolen. Long-lived refresh tokens give good UX (you don't log out every 15 minutes). Hashing refresh tokens in the DB means a database breach doesn't give attackers working tokens.

---

## 📁 `src/validators/` — Input Rules

### `auth.validator.js` — Zod Schemas

**What is Zod?** A library that lets you define exactly what shape your data must have, then validate against it.

```js
export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),

  email: z.string().trim().email("Invalid email address").toLowerCase(),
  // .toLowerCase() transforms the input automatically — "User@EMAIL.com" becomes "user@email.com"

  password: z.string()
    .min(8).max(128)
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Must contain uppercase, lowercase, and a number"
    ),
  // e.g., "weakpassword" fails. "Strongpass1" passes.

  role: z.enum(["ADMIN", "MANAGER", "CASHIER"]).default("CASHIER"),
});

export const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1),  // Just needs to exist — bcrypt handles the real check
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});
```

> ✅ **Benefit**: You get automatic transformation (trim whitespace, lowercase emails) AND validation in one step. Error messages are field-specific and user-friendly. Your service layer only ever receives clean, valid data.

---

## 📁 `src/routes/` — URL Definitions

### `auth.routes.js` — Auth Route Map

Routes connect a URL + HTTP method to a chain of middleware + a controller handler.

```js
// Route: POST /api/auth/register
// Chain: authenticate → authorize("ADMIN") → validate(registerSchema) → controller.register
router.post("/register",
  authenticate,          // Must be logged in
  authorize("ADMIN"),    // Must be an ADMIN
  validate(registerSchema), // Body must match the schema
  authController.register   // Then run the actual logic
);

// Route: POST /api/auth/login
// Chain: loginLimiter → validate(loginSchema) → controller.login
router.post("/login",
  loginLimiter,          // Max 5 attempts per 15 min (anti-brute-force)
  validate(loginSchema),
  authController.login
);

// Other routes...
// POST /api/auth/refresh   → rotate tokens
// POST /api/auth/logout    → revoke one session
// POST /api/auth/logout-all → revoke all sessions
// GET  /api/auth/me        → get current user profile
```

> ✅ **Benefit**: Security policy for each route is crystal clear at a glance. You can see exactly what protections are applied without reading the controller code.

---

## 📁 `src/controllers/` — HTTP Layer

### `auth.controller.js` — Thin HTTP Handler

The controller's **only job** is: read the HTTP request → call the service → send the HTTP response. Nothing else.

```js
class AuthController {
  async login(req, res, next) {
    try {
      const { user, accessToken, refreshToken } = await authService.login(
        req.body,                          // The validated body (email, password)
        { userAgent: req.headers["user-agent"], ip: req.ip }  // For session tracking
      );

      res.status(200).json({
        success: true,
        message: "Login successful",
        data: { user, accessToken, refreshToken },
      });
    } catch (error) {
      next(error); // Pass any error to the global error handler
    }
  }
  // ...similar for register, refresh, logout, logoutAll, me
}
```

> ✅ **Benefit**: Controllers stay small and easy to understand. All real logic is in the service, which makes unit testing possible — you can test the service without HTTP.

---

## 📁 `src/services/` — Business Logic Layer

### `auth.service.js` — Where the Real Work Happens

This is the heart of your authentication system. It talks to the database and contains all the business rules.

```js
class AuthService {
  // LOGIN: Check credentials, update lastLogin, create token pair
  async login({ email, password }, { userAgent, ip }) {
    const user = await User.findOne({ email }).select("+password");
    // ↑ .select("+password") overrides the "select: false" on the schema

    if (!user) throw ApiError.unauthorized("Invalid email or password");
    // Note: same message whether email or password is wrong
    // This prevents "email enumeration" — hackers can't tell if an email exists

    const isMatch = await user.comparePassword(password);
    if (!isMatch) throw ApiError.unauthorized("Invalid email or password");

    user.lastLogin = new Date();
    await user.save();

    return { user, ...await this._createTokenPair(user, { userAgent, ip }) };
  }

  // REFRESH: Verify old token, revoke it, issue new pair (token rotation)
  async refreshAccessToken(rawRefreshToken, { userAgent, ip }) {
    const tokenHash = hashToken(rawRefreshToken); // Hash it to look it up in DB
    const storedToken = await RefreshToken.findOne({ tokenHash });

    if (!storedToken) throw ApiError.unauthorized("Invalid refresh token");
    if (storedToken.expiresAt < new Date()) {
      await storedToken.deleteOne();
      throw ApiError.unauthorized("Refresh token expired");
    }

    await storedToken.deleteOne(); // ← Token rotation: old token is immediately revoked
    return { user, ...await this._createTokenPair(user, { userAgent, ip }) };
  }

  // Internal helper: create an access token + refresh token pair
  async _createTokenPair(user, meta = {}) {
    const accessToken = generateAccessToken(user);   // 15m JWT
    const rawRefreshToken = generateRefreshToken();  // Random 80-char string

    await RefreshToken.create({
      user: user._id,
      tokenHash: hashToken(rawRefreshToken), // Store the HASH, not the raw token
      expiresAt: new Date(Date.now() + parseDuration(env.JWT_REFRESH_EXPIRES_IN)),
      userAgent: meta.userAgent || "",
      ipAddress: meta.ip || "",
    });

    return { accessToken, refreshToken: rawRefreshToken }; // Return the RAW token to client
  }
}
```

> ✅ **Benefit**: Token rotation means each refresh token can only be used once. Even if someone intercepts a refresh token, they can only use it until the next rotation. The same error message for wrong email/password prevents hackers from discovering valid emails.

---

## 📁 `src/seeds/` — Database Seeder

### `seedAdmin.js` — Create the First Admin

Since `/register` requires an admin token, you need a way to create the very *first* admin user. This script does that.

```js
const ADMIN_EMAIL = "admin@inventory-pos.com";
const ADMIN_PASSWORD = "Admin@123456";  // ← Change this immediately in production!

const seedAdmin = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  // Idempotent: if admin already exists, just exit without doing anything
  const existing = await User.findOne({ email: ADMIN_EMAIL });
  if (existing) { process.exit(0); }

  await User.create({ name: "System Admin", email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: "ADMIN" });
  // The User model automatically hashes the password before saving!
};
```

**Run it with:** `npm run seed`

> ✅ **Benefit**: Safe to run multiple times (idempotent). Creates the initial admin without compromising security. The password is hashed by the User model's pre-save hook automatically.

---

## 🔗 How Everything Connects — A Login Example

Let's trace `POST /api/auth/login` with `{ email: "cashier@store.com", password: "MyPass1" }`:

```
1. REQUEST ARRIVES
   POST /api/auth/login

2. app.js: helmet() adds security headers to the response

3. app.js: cors() checks if this frontend domain is allowed ✓

4. app.js: apiLimiter checks if this IP hasn't exceeded 200 req/15min ✓

5. app.js: express.json() parses the JSON body into req.body

6. app.js: logger.http() logs "POST /api/auth/login" with IP

7. auth.routes.js: loginLimiter checks if this IP+email hasn't tried 5+ times ✓

8. auth.routes.js: validate(loginSchema) checks:
   - Is email a real email format? ✓
   - Is password present? ✓
   - Lowercases email automatically

9. auth.controller.js: login() reads req.body and calls authService.login()

10. auth.service.js: login()
    - Queries MongoDB for the user with that email ✓
    - Checks account is active ✓
    - Hashes entered password and compares to stored hash ✓
    - Updates lastLogin
    - Calls _createTokenPair():
      - Generates a 15m JWT access token
      - Generates a random 80-char refresh token
      - Saves HASHED refresh token to RefreshToken collection in MongoDB
    - Returns { user, accessToken, refreshToken }

11. auth.controller.js: Sends 200 response:
    {
      "success": true,
      "message": "Login successful",
      "data": {
        "user": { "name": "...", "email": "...", "role": "CASHIER" },
        "accessToken": "eyJhbGciOiJIUzI1NiIs...",
        "refreshToken": "a3f8c92e1d4b7..."
      }
    }

✅ LOGIN COMPLETE
```

---

## 🏆 Summary: Why This Architecture is Professional

| Design Choice | Beginner Alternative | Why Yours is Better |
|---|---|---|
| Config validated at startup | Find out DB_URI missing when a request fails | Fail fast, fail loud, fail clear |
| Winston logger | console.log everywhere | Structured logs, log files, log levels |
| bcrypt with 12 rounds | Store passwords as-is | Passwords are unrecoverable even if DB is stolen |
| `select: false` on password | Query user and forget to exclude password | Password can never accidentally be returned |
| Separate access + refresh tokens | One long-lived token | Revocable sessions, short attack windows |
| Store hashed refresh tokens | Store raw tokens in DB | DB breach doesn't give attackers valid tokens |
| Token rotation on refresh | Reuse same refresh token | Stolen tokens are invalidated after first use |
| Zod validation middleware | Validate inside the controller | Controllers only receive clean, safe data |
| Global error handler | Try/catch in every route | One consistent error format everywhere |
| Graceful shutdown | Just let the process die | No dropped requests during deployments |
| Role-based authorization | Check roles inside each controller | Authorization is declarative, impossible to forget |
| Same error for wrong email/password | "Email not found" or "Wrong password" | Prevents email enumeration attacks |
```
