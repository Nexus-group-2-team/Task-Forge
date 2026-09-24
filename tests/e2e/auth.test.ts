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
});
