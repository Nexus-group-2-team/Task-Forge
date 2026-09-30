import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import app from "../../src/app.js";
import { prisma } from "../../src/shared/db/prisma.js";

vi.mock("../../src/shared/services/password-breach.service.js", () => ({
  PasswordBreachService: { isBreached: vi.fn().mockResolvedValue(false) },
}));

describe("Applications API contract & integration tests", { timeout: 30000 }, () => {
  let clientToken = "";
  let clientId = "";
  let freelancerAToken = "";
  let freelancerAId = "";
  let freelancerBToken = "";
  let freelancerBId = "";
  let jobId = "";
  let applicationAId = "";
  let applicationBId = "";

  it("should setup users and create an open job", async () => {
    // 1. Register Client
    const clientRes = await request(app).post("/api/auth/register").send({
      email: `client_app_${Date.now()}@example.com`,
      password: "Password123!",
      fullName: "Application Client",
      role: "CLIENT",
    });
    expect(clientRes.status).toBe(201);
    clientToken = clientRes.body.data.token;
    clientId = clientRes.body.data.user.id;

    // 2. Register Freelancer A
    const freeARes = await request(app).post("/api/auth/register").send({
      email: `freeA_app_${Date.now()}@example.com`,
      password: "Password123!",
      fullName: "Freelancer Alpha",
      role: "FREELANCER",
    });
    expect(freeARes.status).toBe(201);
    freelancerAToken = freeARes.body.data.token;
    freelancerAId = freeARes.body.data.user.id;

    // 3. Register Freelancer B
    const freeBRes = await request(app).post("/api/auth/register").send({
      email: `freeB_app_${Date.now()}@example.com`,
      password: "Password123!",
      fullName: "Freelancer Beta",
      role: "FREELANCER",
    });
    expect(freeBRes.status).toBe(201);
    freelancerBToken = freeBRes.body.data.token;
    freelancerBId = freeBRes.body.data.user.id;

    // 4. Create an OPEN job owned by client
    const job = await prisma.job.create({
      data: {
        title: "Fullstack Web Application Development",
        description: "Need a node.js and react fullstack app built",
        budgetMin: 500,
        budgetMax: 1500,
        ownerId: clientId,
        status: "OPEN",
      },
    });
    jobId = job.id;
  });

  it("should allow a freelancer to submit an application with estimatedDays, resumeUrl, and attachments", async () => {
    const res = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${freelancerAToken}`)
      .send({
        jobId,
        coverLetter: "I have 5+ years of experience in Node.js and TypeScript.",
        proposedBid: 1200,
        estimatedDays: 14,
        resumeUrl: "https://example.com/resumes/freelancerA.pdf",
        attachmentUrls: ["https://example.com/portfolios/case-study.pdf"],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.jobId).toBe(jobId);
    expect(res.body.data.freelancerId).toBe(freelancerAId);
    expect(res.body.data.estimatedDays).toBe(14);
    expect(res.body.data.resumeUrl).toBe("https://example.com/resumes/freelancerA.pdf");
    expect(res.body.data.attachmentUrls).toEqual(["https://example.com/portfolios/case-study.pdf"]);
    expect(res.body.data.status).toBe("PENDING");
    applicationAId = res.body.data.id;
  });

  it("should reject duplicate applications from the same freelancer with 409 Conflict", async () => {
    const res = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${freelancerAToken}`)
      .send({
        jobId,
        coverLetter: "Duplicate proposal attempt",
        proposedBid: 1000,
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it("should reject job owner applying to their own job with 403 Forbidden", async () => {
    const res = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${clientToken}`)
      .send({
        jobId,
        coverLetter: "Owner applying to own job test",
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it("should allow Freelancer B to submit an application to the same job", async () => {
    const res = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${freelancerBToken}`)
      .send({
        jobId,
        coverLetter: "Freelancer B proposal for fullstack web application",
        proposedBid: 1400,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    applicationBId = res.body.data.id;
  });

  it("should list applications scoped to roles", async () => {
    // Freelancer A sees only their application
    const resA = await request(app)
      .get("/api/applications")
      .set("Authorization", `Bearer ${freelancerAToken}`);
    expect(resA.status).toBe(200);
    expect(resA.body.success).toBe(true);
    expect(resA.body.data.length).toBe(1);
    expect(resA.body.data[0].id).toBe(applicationAId);

    // Client sees both applications for their job
    const resClient = await request(app)
      .get("/api/applications")
      .set("Authorization", `Bearer ${clientToken}`);
    expect(resClient.status).toBe(200);
    expect(resClient.body.success).toBe(true);
    expect(resClient.body.data.length).toBe(2);
  });

  it("should enforce IDOR protection when an unrelated user fetches application by ID", async () => {
    const res = await request(app)
      .get(`/api/applications/${applicationAId}`)
      .set("Authorization", `Bearer ${freelancerBToken}`);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("should allow Freelancer B to withdraw their application", async () => {
    const res = await request(app)
      .patch(`/api/applications/${applicationBId}/withdraw`)
      .set("Authorization", `Bearer ${freelancerBToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("WITHDRAWN");
  });

  it("should allow Client to ACCEPT Freelancer A's application and automatically instantiate Project contract", async () => {
    const res = await request(app)
      .patch(`/api/applications/${applicationAId}/accept`)
      .set("Authorization", `Bearer ${clientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.application.status).toBe("ACCEPTED");
    expect(res.body.data.project).toBeDefined();
    expect(res.body.data.project.applicationId).toBe(applicationAId);
    expect(res.body.data.project.clientId).toBe(clientId);
    expect(res.body.data.project.freelancerId).toBe(freelancerAId);

    // Verify Job status transitioned to IN_PROGRESS in DB
    const updatedJob = await prisma.job.findUnique({ where: { id: jobId } });
    expect(updatedJob?.status).toBe("IN_PROGRESS");
  });

  it("should reject accepting applications for jobs that are no longer OPEN", async () => {
    const res = await request(app)
      .patch(`/api/applications/${applicationBId}/accept`)
      .set("Authorization", `Bearer ${clientToken}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
