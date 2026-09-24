import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../../src/app.js";

describe("Projects API contract tests", { timeout: 20000 }, () => {
  const testEmail = `client_${Date.now()}@example.com`;
  let authToken = "";

  it("should setup client user and list projects", async () => {
    const regRes = await request(app).post("/api/auth/register").send({
      email: testEmail,
      password: "Password123!",
      fullName: "Project Owner",
      role: "CLIENT",
    });
    expect(regRes.status).toBe(201);
    authToken = regRes.body.data.token;

    const res = await request(app)
      .get("/api/projects")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
