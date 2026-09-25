import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../../src/app.js";

describe("Auth & Profile API contract tests", { timeout: 20000 }, () => {
  const testEmail = `test_${Date.now()}@example.com`;
  let authToken = "";
  let userId = "";

  it("should register a new user", async () => {
    const response = await request(app).post("/api/auth/register").send({
      email: testEmail,
      password: "Password123!",
      fullName: "Bekam Yoseph",
      role: "FREELANCER",
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe(testEmail);
    expect(response.body.data.token).toBeDefined();

    authToken = response.body.data.token;
    userId = response.body.data.user.id;
  });

  it("should login with registered credentials", async () => {
    const response = await request(app).post("/api/auth/login").send({
      email: testEmail,
      password: "Password123!",
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.token).toBeDefined();
  });

  it("should fetch current user profile via /api/auth/me", async () => {
    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${authToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBe(userId);
  });

  it("should update user profile via /api/profiles/me", async () => {
    const response = await request(app)
      .patch("/api/profiles/me")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        headline: "Full Stack Engineer & Prisma Specialist",
        experienceYears: 4,
        bio: "Building robust freelance platforms.",
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.headline).toBe("Full Stack Engineer & Prisma Specialist");
  });

  it("should update user skills via /api/profiles/me/skills", async () => {
    const response = await request(app)
      .put("/api/profiles/me/skills")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        skills: ["TypeScript", "Node.js", "Express", "Prisma"],
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.userSkills.length).toBe(4);
  });
  it("should issue access token and refresh cookie on login and allow token refresh and logout", async () => {
    // Login
    const loginRes = await request(app).post("/api/auth/login").send({
      email: testEmail,
      password: "Password123!",
    });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.accessToken).toBeDefined();
    expect(loginRes.body.data.refreshToken).toBeDefined();

    // Check refresh cookie is set
    const cookies = loginRes.headers["set-cookie"];
    expect(cookies).toBeDefined();
    const refreshCookie = Array.isArray(cookies)
      ? cookies.find((c: string) => c.startsWith("taskforge_refresh_token="))
      : (cookies as string);
    expect(refreshCookie).toBeDefined();

    // Call /api/auth/refresh using the cookie
    const refreshRes = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", refreshCookie!)
      .send({});

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.success).toBe(true);
    expect(refreshRes.body.data.accessToken).toBeDefined();
    expect(refreshRes.body.data.refreshToken).toBeDefined();

    // Call /api/auth/logout
    const logoutRes = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", refreshRes.headers["set-cookie"]![0])
      .send({});

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.success).toBe(true);

    // After logout, old refresh token is invalid
    const postLogoutRefresh = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", refreshCookie!)
      .send({});

    expect(postLogoutRefresh.status).toBe(401);
  });

  describe("Negative & Edge-Case Authorization Assertions", () => {
    it("should reject requests without authorization header with 401", async () => {
      const response = await request(app).get("/api/auth/me");
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it("should reject requests with invalid or malformed bearer token with 401", async () => {
      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "Bearer invalid.token.payload");
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it("should not expose private email to unauthenticated users viewing public profiles", async () => {
      const response = await request(app).get(`/api/profiles/${userId}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBeUndefined();
      expect(response.body.data.accountStatus).toBeUndefined();
      expect(response.body.data.profile.fullName).toBe("Bekam Yoseph");
    });

    it("should reveal email and account status when the profile owner views their own profile by ID", async () => {
      const response = await request(app)
        .get(`/api/profiles/${userId}`)
        .set("Authorization", `Bearer ${authToken}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe(testEmail);
      expect(response.body.data.accountStatus).toBe("ACTIVE");
    });

    it("should return 404 on accessing a non-existent project or one not owned by the caller", async () => {
      const response = await request(app)
        .get("/api/projects/cld999999999999999999999")
        .set("Authorization", `Bearer ${authToken}`);
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
    it("should allow admin to suspend user and invalidate all user sessions (logout all)", async () => {
      // 1. Create an admin user to perform moderation
      const adminEmail = `admin_${Date.now()}@example.com`;
      const adminReg = await request(app).post("/api/auth/register").send({
        email: adminEmail,
        password: "Password123!",
        fullName: "Test Admin",
        role: "CLIENT",
      });
      const adminId = adminReg.body.data.user.id;

      // Escalate to ADMIN role directly in database for testing
      const { prisma } = await import("../../src/shared/db/prisma.js");
      await prisma.user.update({
        where: { id: adminId },
        data: { role: "ADMIN" },
      });

      // Login as admin
      const adminLogin = await request(app).post("/api/auth/login").send({
        email: adminEmail,
        password: "Password123!",
      });
      const adminToken = adminLogin.body.data.token;

      // 2. Create a target user with multiple active sessions
      const victimEmail = `victim_${Date.now()}@example.com`;
      await request(app).post("/api/auth/register").send({
        email: victimEmail,
        password: "Password123!",
        fullName: "Victim User",
        role: "FREELANCER",
      });

      // Session 1 (Device A)
      const session1 = await request(app).post("/api/auth/login").send({
        email: victimEmail,
        password: "Password123!",
      });
      const victimToken1 = session1.body.data.token;
      const victimCookie1 = session1.headers["set-cookie"]?.[0]?.split(";")[0] ?? "";
      const victimId = session1.body.data.user.id;

      // Session 2 (Device B)
      const session2 = await request(app).post("/api/auth/login").send({
        email: victimEmail,
        password: "Password123!",
      });
      const victimToken2 = session2.body.data.token;
      const victimCookie2 = session2.headers["set-cookie"]?.[0]?.split(";")[0] ?? "";

      // Verify both sessions work initially
      const check1 = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${victimToken1}`);
      expect(check1.status).toBe(200);

      // Verify non-admin cannot suspend users
      const forbiddenAttempt = await request(app)
        .patch(`/api/auth/users/${victimId}/status`)
        .set("Authorization", `Bearer ${victimToken1}`)
        .send({ status: "SUSPENDED" });
      expect(forbiddenAttempt.status).toBe(403);

      // 3. Admin suspends the user (triggers logout-all and session revocation)
      const suspendRes = await request(app)
        .patch(`/api/auth/users/${victimId}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "SUSPENDED" });
      expect(suspendRes.status).toBe(200);
      expect(suspendRes.body.data.user.accountStatus).toBe("SUSPENDED");
      expect(suspendRes.body.data.revokedSessionsCount).toBeGreaterThanOrEqual(2);

      // 4. Verify all existing access tokens are rejected immediately
      const postBanAccess1 = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${victimToken1}`);
      expect(postBanAccess1.status).toBe(401);

      const postBanAccess2 = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${victimToken2}`);
      expect(postBanAccess2.status).toBe(401);

      // 5. Verify refresh tokens on all devices are revoked
      const postBanRefresh1 = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", victimCookie1)
        .send({});
      expect(postBanRefresh1.status).toBe(401);

      const postBanRefresh2 = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", victimCookie2)
        .send({});
      expect(postBanRefresh2.status).toBe(401);

      // 6. Verify banned user cannot log back in
      const postBanLogin = await request(app).post("/api/auth/login").send({
        email: victimEmail,
        password: "Password123!",
      });
      expect(postBanLogin.status).toBe(401);
    }, 60000);

  });

});

