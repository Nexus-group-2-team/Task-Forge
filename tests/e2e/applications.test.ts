import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import app from "../../src/app.js";
import { prisma } from "../../src/shared/db/prisma.js";
import { env } from "../../src/shared/config/env.js";

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

    // Industry standard: withdrawal removes the proposal outright so the
    // (job, freelancer) slot is freed for a future re-application.
    const row = await prisma.application.findUnique({
      where: { id: applicationBId },
    });
    expect(row).toBeNull();
  });

  it("should allow Freelancer B to re-apply to the same job after withdrawal", async () => {
    const res = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${freelancerBToken}`)
      .send({
        jobId,
        coverLetter: "Freelancer B updated proposal after withdrawing",
        proposedBid: 1500,
        estimatedDays: 21,
        resumeUrl: "https://cdn.example.com/resume-b.pdf",
        attachmentUrls: ["https://example.com/portfolio-b"],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("PENDING");
    expect(res.body.data.estimatedDays).toBe(21);
    expect(res.body.data.resumeUrl).toBe("https://cdn.example.com/resume-b.pdf");
    applicationBId = res.body.data.id; // later tests must use the fresh proposal
  });

  it("should still block duplicate applications while a PENDING one exists", async () => {
    const res = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${freelancerBToken}`)
      .send({
        jobId,
        coverLetter: "Second simultaneous application attempt should conflict",
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it("should reject external file URLs when STRICT_UPLOAD_URLS is enabled", async () => {
    const previous = env.STRICT_UPLOAD_URLS;
    env.STRICT_UPLOAD_URLS = true;
    try {
      const res = await request(app)
        .post("/api/applications")
        .set("Authorization", `Bearer ${freelancerAToken}`)
        .send({
          jobId,
          coverLetter: "Testing strict origin enforcement",
          resumeUrl: "https://evil.example.com/resume.pdf",
        });

      // URL policy is validated before duplicate/state checks (fail fast 400).
      expect(res.status).toBe(400);
      expect(res.body.message).toContain("STRICT_UPLOAD_URLS");
    } finally {
      env.STRICT_UPLOAD_URLS = previous;
    }

    // With the flag back off (default), external links remain allowed — the
    // URL check passes and we reach the duplicate check instead.
    const allowed = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${freelancerAToken}`)
      .send({
        jobId,
        coverLetter: "External link should be fine by default",
        resumeUrl: "https://cdn.example.com/portfolio/resume.pdf",
      });

    expect(allowed.status).toBe(409);
    expect(allowed.body.message).toBe("You have already applied to this job");
  });

  it("should fail closed for file URLs when strict mode is on but storage is unconfigured", async () => {
    const previousStrict = env.STRICT_UPLOAD_URLS;
    const previousUrl = env.SUPABASE_URL;
    env.STRICT_UPLOAD_URLS = true;
    env.SUPABASE_URL = undefined;
    try {
      const res = await request(app)
        .post("/api/applications")
        .set("Authorization", `Bearer ${freelancerAToken}`)
        .send({
          jobId,
          coverLetter: "Strict mode with no storage configured",
          resumeUrl: "https://cdn.example.com/resume.pdf",
        });

      // No origin can be verified without a bucket → reject rather than allow.
      expect(res.status).toBe(400);
      expect(res.body.message).toContain("storage is not configured");
      expect(res.body.message).toContain("STRICT_UPLOAD_URLS");
    } finally {
      env.SUPABASE_URL = previousUrl;
      env.STRICT_UPLOAD_URLS = previousStrict;
    }
  });

  it("should allow Client to reject a pending application exactly once", async () => {
    const res = await request(app)
      .patch(`/api/applications/${applicationBId}/reject`)
      .set("Authorization", `Bearer ${clientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("REJECTED");

    // Compare-and-set guard: the second reject sees a non-PENDING row.
    const again = await request(app)
      .patch(`/api/applications/${applicationBId}/reject`)
      .set("Authorization", `Bearer ${clientToken}`);

    expect(again.status).toBe(400);
    expect(again.body.message).toBe("Only pending applications can be rejected");
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

  it("should let exactly one of two concurrent ACCEPT requests win (race guard)", async () => {
    // Fresh OPEN job with two PENDING applications, set up directly in the DB
    // (mirrors the suite's own setup style and avoids route-schema coupling).
    const raceJob = await prisma.job.create({
      data: {
        title: "Race-guard concurrency job",
        description: "Exercises the in-transaction compare-and-set on accept",
        budgetMin: 100,
        budgetMax: 500,
        ownerId: clientId,
        status: "OPEN",
      },
    });

    const appARes = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${freelancerAToken}`)
      .send({ jobId: raceJob.id, coverLetter: "Race applicant A" });
    expect(appARes.status).toBe(201);

    const appBRes = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${freelancerBToken}`)
      .send({ jobId: raceJob.id, coverLetter: "Race applicant B" });
    expect(appBRes.status).toBe(201);

    const raceAppAId = appARes.body.data.id;
    const raceAppBId = appBRes.body.data.id;

    // Both accepts fire simultaneously. Under READ COMMITTED the job row lock
    // serializes the two CAS updates: whoever commits first flips OPEN ->
    // IN_PROGRESS, so the loser's guarded updateMany matches 0 rows and its
    // whole transaction rolls back.
    const [first, second] = await Promise.all([
      request(app)
        .patch(`/api/applications/${raceAppAId}/accept`)
        .set("Authorization", `Bearer ${clientToken}`),
      request(app)
        .patch(`/api/applications/${raceAppBId}/accept`)
        .set("Authorization", `Bearer ${clientToken}`),
    ]);

    const responses = [first, second];
    const winners = responses.filter((r) => r.status === 200);
    expect(winners).toHaveLength(1);

    // Loser fails via the job CAS (400) or the application CAS (409).
    const losers = responses.filter((r) => r.status !== 200);
    expect(losers).toHaveLength(1);
    expect([400, 409]).toContain(losers[0].status);

    // Exactly one project contract exists for the two applications.
    const projectCount = await prisma.project.count({
      where: { applicationId: { in: [raceAppAId, raceAppBId] } },
    });
    expect(projectCount).toBe(1);

    // Job settled IN_PROGRESS with exactly one ACCEPTED application.
    const finalJob = await prisma.job.findUnique({ where: { id: raceJob.id } });
    expect(finalJob?.status).toBe("IN_PROGRESS");

    const acceptedCount = await prisma.application.count({
      where: { id: { in: [raceAppAId, raceAppBId] }, status: "ACCEPTED" },
    });
    expect(acceptedCount).toBe(1);
  });
});
