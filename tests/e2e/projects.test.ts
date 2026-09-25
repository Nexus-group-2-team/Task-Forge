import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../../src/app.js";
import { prisma } from "../../src/shared/db/prisma.js";

describe("Projects API contract tests", { timeout: 30000 }, () => {
  let clientToken = "";
  let clientId = "";
  let freelancerToken = "";
  let freelancerId = "";
  let otherUserToken = "";
  let projectId = "";

  it("should setup users and initialize project", async () => {
    // 1. Create client
    const clientEmail = `client_proj_${Date.now()}@example.com`;
    const clientRes = await request(app).post("/api/auth/register").send({
      email: clientEmail,
      password: "Password123!",
      fullName: "Project Client",
      role: "CLIENT",
    });
    expect(clientRes.status).toBe(201);
    clientToken = clientRes.body.data.token;
    clientId = clientRes.body.data.user.id;

    // 2. Create freelancer
    const freeEmail = `free_proj_${Date.now()}@example.com`;
    const freeRes = await request(app).post("/api/auth/register").send({
      email: freeEmail,
      password: "Password123!",
      fullName: "Project Freelancer",
      role: "FREELANCER",
    });
    expect(freeRes.status).toBe(201);
    freelancerToken = freeRes.body.data.token;
    freelancerId = freeRes.body.data.user.id;

    // 3. Create third unrelated user
    const otherEmail = `other_proj_${Date.now()}@example.com`;
    const otherRes = await request(app).post("/api/auth/register").send({
      email: otherEmail,
      password: "Password123!",
      fullName: "Other User",
      role: "CLIENT",
    });
    expect(otherRes.status).toBe(201);
    otherUserToken = otherRes.body.data.token;

    // 4. Create Job & Application first to satisfy foreign key requirement
    const job = await prisma.job.create({
      data: {
        title: "Test Contract Project Job",
        description: "Job for testing project contract",
        budgetMin: 1000,
        budgetMax: 2000,
        ownerId: clientId,
        status: "IN_PROGRESS",
      },
    });

    const application = await prisma.application.create({
      data: {
        jobId: job.id,
        freelancerId,
        coverLetter: "Cover letter for contract testing",
        proposedBid: 1500,
        status: "ACCEPTED",
      },
    });

    // 5. Create an active project between client and freelancer
    const project = await prisma.project.create({
      data: {
        title: "Test Contract Project",
        clientId,
        freelancerId,
        applicationId: application.id,
        status: "ACTIVE",
        milestones: {
          create: [
            { title: "Milestone 1", description: "First deliverable", status: "PENDING" },
          ],
        },
      },
    });
    projectId = project.id;
  });

  it("should allow participants to list their projects", async () => {
    const resClient = await request(app)
      .get("/api/projects")
      .set("Authorization", `Bearer ${clientToken}`);
    expect(resClient.status).toBe(200);
    expect(resClient.body.success).toBe(true);
    expect(resClient.body.data.some((p: { id: string }) => p.id === projectId)).toBe(true);

    const resFreelancer = await request(app)
      .get("/api/projects")
      .set("Authorization", `Bearer ${freelancerToken}`);
    expect(resFreelancer.status).toBe(200);
    expect(resFreelancer.body.data.some((p: { id: string }) => p.id === projectId)).toBe(true);
  });

  it("should filter projects by status query param", async () => {
    const res = await request(app)
      .get("/api/projects?status=ACTIVE")
      .set("Authorization", `Bearer ${clientToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.every((p: { status: string }) => p.status === "ACTIVE")).toBe(true);
  });

  it("should allow client and freelancer to fetch project by ID", async () => {
    const res = await request(app)
      .get(`/api/projects/${projectId}`)
      .set("Authorization", `Bearer ${clientToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(projectId);
    expect(res.body.data.client.id).toBe(clientId);
    expect(res.body.data.freelancer.id).toBe(freelancerId);
    expect(res.body.data.milestones).toBeDefined();
  });

  it("should return 404 on fetching project for non-participant (IDOR protection)", async () => {
    const res = await request(app)
      .get(`/api/projects/${projectId}`)
      .set("Authorization", `Bearer ${otherUserToken}`);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("should reject non-client / non-admin updating project status with 403", async () => {
    const res = await request(app)
      .patch(`/api/projects/${projectId}/status`)
      .set("Authorization", `Bearer ${freelancerToken}`)
      .send({ status: "COMPLETED" });
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it("should allow client owner to update project status", async () => {
    const res = await request(app)
      .patch(`/api/projects/${projectId}/status`)
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ status: "COMPLETED" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("COMPLETED");
  });
});
