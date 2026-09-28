import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import app from "../../src/app.js";

const { sendPasswordResetEmail } = vi.hoisted(() => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/shared/services/email.service.js", () => ({
  EmailService: { sendPasswordResetEmail },
}));

describe("Password reset flow", { timeout: 20000 }, () => {
  const resetEmail = `reset_${Date.now()}@example.com`;
  const originalPassword = "OriginalPass123!";
  const newPassword = "NewSecurePass456!";

  function extractTokenFromCall(): string {
    const lastCall = sendPasswordResetEmail.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    const resetLink = lastCall![1] as string;
    const url = new URL(resetLink);
    return url.searchParams.get("token")!;
  }

  it("should register a user for the reset flow", async () => {
    const response = await request(app).post("/api/auth/register").send({
      email: resetEmail,
      password: originalPassword,
      fullName: "Reset Tester",
      role: "FREELANCER",
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });

  it("should return a generic message for forgot-password (existing account)", async () => {
    sendPasswordResetEmail.mockClear();
    const response = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: resetEmail });

    expect(response.status).toBe(200);
    expect(response.body.message).toMatch(/if an account with that email exists/i);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(extractTokenFromCall()).toBeTruthy();
  });

  it("should return the same generic message for an unknown email (no enumeration)", async () => {
    sendPasswordResetEmail.mockClear();
    const response = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: `unknown_${Date.now()}@example.com` });

    expect(response.status).toBe(200);
    expect(response.body.message).toMatch(/if an account with that email exists/i);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("should still return the generic 200 message when email delivery fails", async () => {
    const resilientEmail = `email_fail_${Date.now()}@example.com`;
    await request(app).post("/api/auth/register").send({
      email: resilientEmail,
      password: originalPassword,
      fullName: "Email Fail Tester",
      role: "FREELANCER",
    });

    sendPasswordResetEmail.mockClear();
    sendPasswordResetEmail.mockRejectedValueOnce(new Error("Resend outage"));

    const response = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: resilientEmail });

    expect(response.status).toBe(200);
    expect(response.body.message).toMatch(/if an account with that email exists/i);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    sendPasswordResetEmail.mockResolvedValue(undefined);
  });

  it("should reject reset-password with an invalid token", async () => {
    const response = await request(app).post("/api/auth/reset-password").send({
      token: "not-a-real-token",
      newPassword,
    });

    expect(response.status).toBe(400);
  });

  it("should reset the password with a valid token", async () => {
    sendPasswordResetEmail.mockClear();
    await request(app).post("/api/auth/forgot-password").send({ email: resetEmail });
    const token = extractTokenFromCall();

    const response = await request(app).post("/api/auth/reset-password").send({
      token,
      newPassword,
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it("should reject reuse of a consumed reset token", async () => {
    sendPasswordResetEmail.mockClear();
    await request(app).post("/api/auth/forgot-password").send({ email: resetEmail });
    const token = extractTokenFromCall();

    const first = await request(app).post("/api/auth/reset-password").send({
      token,
      newPassword: "AnotherPass789!",
    });
    expect(first.status).toBe(200);

    const second = await request(app).post("/api/auth/reset-password").send({
      token,
      newPassword: "ThirdPass000!",
    });
    expect(second.status).toBe(400);
  });

  it("should allow login with the newly set password after reset", async () => {
    const response = await request(app).post("/api/auth/login").send({
      email: resetEmail,
      password: "AnotherPass789!",
    });

    expect(response.status).toBe(200);
  });

  it("should reject login with a password superseded by a reset", async () => {
    const response = await request(app).post("/api/auth/login").send({
      email: resetEmail,
      password: newPassword,
    });

    expect(response.status).toBe(401);
  });

  it("should require a valid email format on forgot-password", async () => {
    const response = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "not-an-email" });

    expect(response.status).toBe(400);
  });

  it("should require the new password on reset-password", async () => {
    const response = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "abc" });

    expect(response.status).toBe(400);
  });
});

describe("Frontend pages served by the API", () => {
  it("serves the home page with navigation links", async () => {
    const response = await request(app).get("/");
    expect(response.status).toBe(200);
    expect(response.text).toContain("/login");
    expect(response.text).toContain("/forgot-password");
  });

  it("serves the forgot-password page", async () => {
    const response = await request(app).get("/forgot-password");
    expect(response.status).toBe(200);
    expect(response.text).toContain("Forgot your password?");
    expect(response.text).toContain("/js/forgot-password.js");
  });

  it("serves the reset-password page (the link target from the email)", async () => {
    const response = await request(app).get("/reset-password");
    expect(response.status).toBe(200);
    expect(response.text).toContain("Set a new password");
    expect(response.text).toContain("/js/reset-password.js");
  });

  it("serves the login page", async () => {
    const response = await request(app).get("/login");
    expect(response.status).toBe(200);
    expect(response.text).toContain("Log in to TaskForge");
    expect(response.text).toContain("/js/login.js");
  });

  it("serves the client-side scripts referenced by the pages", async () => {
    const forgotJs = await request(app).get("/js/forgot-password.js");
    expect(forgotJs.status).toBe(200);
    expect(forgotJs.text).toContain("/api/auth/forgot-password");

    const resetJs = await request(app).get("/js/reset-password.js");
    expect(resetJs.status).toBe(200);
    expect(resetJs.text).toContain("/api/auth/reset-password");
    expect(resetJs.text).toContain("token");

    const loginJs = await request(app).get("/js/login.js");
    expect(loginJs.status).toBe(200);
    expect(loginJs.text).toContain("/api/auth/login");
  });
});
