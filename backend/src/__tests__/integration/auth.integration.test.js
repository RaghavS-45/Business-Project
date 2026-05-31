import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../app.js";
import User from "../../models/User.js";
import { createTestUser } from "../helpers.js";

/**
 * Integration Tests — Auth Routes
 *
 * Tests the full HTTP request/response cycle for:
 *   POST /api/auth/login
 *   GET  /api/auth/me
 *   POST /api/auth/refresh
 *
 * Note: POST /api/auth/register requires ADMIN auth, tested below.
 */

describe("Auth Integration", () => {
  let adminUser, adminToken;

  beforeEach(async () => {
    const result = await createTestUser({ role: "ADMIN" });
    adminUser = result.user;
    adminToken = result.accessToken;
  });

  // ─── POST /api/auth/login ────────────────────────────────

  describe("POST /api/auth/login", () => {
    it("should login with valid credentials and return tokens", async () => {
      // Create a user with known password
      await User.create({
        name: "Login Test",
        email: "login@test.com",
        password: "Password123!",
        role: "CASHIER",
      });

      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "login@test.com", password: "Password123!" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.user.email).toBe("login@test.com");
      // Password should never be returned
      expect(res.body.data.user.password).toBeUndefined();
    });

    it("should reject invalid password with 401", async () => {
      await User.create({
        name: "Fail Test",
        email: "fail@test.com",
        password: "CorrectPassword1!",
        role: "CASHIER",
      });

      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "fail@test.com", password: "WrongPassword1!" });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("should reject non-existent email with 401", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "ghost@test.com", password: "Anything123!" });

      expect(res.status).toBe(401);
    });

    it("should reject deactivated user with 403", async () => {
      await User.create({
        name: "Deactivated",
        email: "deactivated@test.com",
        password: "Password123!",
        role: "CASHIER",
        isActive: false,
      });

      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "deactivated@test.com", password: "Password123!" });

      expect(res.status).toBe(403);
    });

    it("should reject missing fields with 400", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "test@test.com" }); // missing password

      expect(res.status).toBe(400);
    });
  });

  // ─── POST /api/auth/register (ADMIN-only) ────────────────

  describe("POST /api/auth/register", () => {
    it("should allow ADMIN to register a new user", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "New Cashier",
          email: "newcashier@test.com",
          password: "SecurePass123!",
          role: "CASHIER",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.user.email).toBe("newcashier@test.com");
      expect(res.body.data.user.role).toBe("CASHIER");
    });

    it("should reject duplicate email with 409", async () => {
      await User.create({
        name: "Existing",
        email: "duplicate@test.com",
        password: "Password123!",
        role: "CASHIER",
      });

      const res = await request(app)
        .post("/api/auth/register")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Duplicate",
          email: "duplicate@test.com",
          password: "Password123!",
          role: "CASHIER",
        });

      expect(res.status).toBe(409);
    });

    it("should reject unauthenticated register with 401", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          name: "No Auth",
          email: "noauth@test.com",
          password: "Password123!",
          role: "CASHIER",
        });

      expect(res.status).toBe(401);
    });

    it("should reject non-ADMIN register with 403", async () => {
      const cashier = await createTestUser({
        role: "CASHIER",
        email: "cashier-reg@test.com",
      });

      const res = await request(app)
        .post("/api/auth/register")
        .set("Authorization", `Bearer ${cashier.accessToken}`)
        .send({
          name: "By Cashier",
          email: "bycashier@test.com",
          password: "Password123!",
          role: "CASHIER",
        });

      expect(res.status).toBe(403);
    });
  });

  // ─── GET /api/auth/me ────────────────────────────────────

  describe("GET /api/auth/me", () => {
    it("should return authenticated user profile", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe(adminUser.email);
      expect(res.body.data.user.role).toBe("ADMIN");
      expect(res.body.data.user.password).toBeUndefined();
    });

    it("should reject request without token with 401", async () => {
      const res = await request(app).get("/api/auth/me");

      expect(res.status).toBe(401);
    });

    it("should reject request with invalid token with 401", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "Bearer invalid-jwt-token");

      expect(res.status).toBe(401);
    });
  });
});
