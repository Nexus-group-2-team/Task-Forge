import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../../src/app.js";
import {
  cleanup,
  createProject,
  createUser,
  disconnect,
  testPrisma,
  type TestUser,
} from "../helpers/test-utils.js";

const created: string[] = [];

const newUser = async (role: TestUser["role"]): Promise<TestUser> => {
  const user = await createUser(role);
  created.push(user.id);
  return user;
};

describe("Reports API", () => {
  let reporter: TestUser;
  let other: TestUser;
  let admin: TestUser;
  let projectId: string;

  /**
   * Each submission targets a fresh user by default: the module rejects a second
   * pending report on the same target, so a shared target would make later cases
   * fail for the wrong reason.
   */
  const submitReport = async (
    token: string,
    overrides: Record<string, unknown> = {}
  ): Promise<request.Response> => {
    const target = await newUser("FREELANCER");
    return request(app)
      .post("/api/reports")
      .set("Authorization", token)
      .send({ targetType: "USER", targetId: target.id, reason: "Spam behaviour", ...overrides });
  };

  beforeAll(async () => {
    reporter = await newUser("FREELANCER");
    other = await newUser("FREELANCER");
    admin = await newUser("ADMIN");
    projectId = (await createProject({ clientId: reporter.id, freelancerId: other.id })).id;
  });

  afterAll(async () => {
    await cleanup(created);
    await disconnect();
  });

  describe("POST /api/reports", () => {
    it("creates a pending report from the authenticated user", async () => {
      const target = await newUser("FREELANCER");

      const response = await request(app)
        .post("/api/reports")
        .set("Authorization", reporter.authHeader)
        .send({
          targetType: "USER",
          targetId: target.id,
          reason: "Spam behaviour",
          description: "Repeated spam messages",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        reporterId: reporter.id,
        targetType: "USER",
        targetId: target.id,
        status: "PENDING",
        resolvedById: null,
        resolutionNote: null,
        description: "Repeated spam messages",
      });
    });

    it("rejects unauthenticated creation", async () => {
      const response = await request(app)
        .post("/api/reports")
        .send({ targetType: "USER", targetId: other.id, reason: "Spam behaviour" });

      expect(response.status).toBe(401);
    });

    it("rejects an invalid targetType", async () => {
      const response = await submitReport(reporter.authHeader, { targetType: "PLANET" });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it("rejects a missing reason", async () => {
      const response = await request(app)
        .post("/api/reports")
        .set("Authorization", reporter.authHeader)
        .send({ targetType: "USER", targetId: other.id });

      expect(response.status).toBe(400);
    });

    it("rejects a nonexistent target", async () => {
      const response = await submitReport(reporter.authHeader, { targetId: "does-not-exist" });

      expect(response.status).toBe(404);
    });

    it("rejects self-reporting", async () => {
      const response = await submitReport(reporter.authHeader, { targetId: reporter.id });

      expect(response.status).toBe(400);
    });

    it("ignores a spoofed reporterId in the request body", async () => {
      const response = await submitReport(reporter.authHeader, {
        targetType: "PROJECT",
        targetId: projectId,
        reporterId: admin.id,
      });

      // `.strict()` rejects the unknown key, so nothing is persisted for it.
      expect(response.status).toBe(400);

      const stored = await testPrisma.report.findFirst({
        where: { targetType: "PROJECT", targetId: projectId },
        select: { reporterId: true },
      });
      expect(stored).toBeNull();
    });

    it("attributes the report to the authenticated user when reporterId is omitted", async () => {
      const response = await submitReport(reporter.authHeader, {
        targetType: "PROJECT",
        targetId: projectId,
        reason: "Project misbehaviour",
      });

      expect(response.status).toBe(201);
      // reporterId is never read from the body - it comes from the JWT.
      expect(response.body.data.reporterId).toBe(reporter.id);
    });

    it("rejects a duplicate pending report for the same target", async () => {
      const project = await createProject({ clientId: reporter.id, freelancerId: other.id });
      const payload = {
        targetType: "PROJECT",
        targetId: project.id,
        reason: "Duplicate guard check",
      };

      const first = await submitReport(reporter.authHeader, payload);
      expect(first.status).toBe(201);

      const second = await submitReport(reporter.authHeader, payload);
      expect(second.status).toBe(409);
    });
  });

  describe("GET /api/reports", () => {
    it("rejects a non-admin listing", async () => {
      const response = await request(app)
        .get("/api/reports")
        .set("Authorization", reporter.authHeader);

      expect(response.status).toBe(403);
    });

    it("rejects an unauthenticated listing", async () => {
      const response = await request(app).get("/api/reports");
      expect(response.status).toBe(401);
    });

    it("allows an admin to list and filter reports", async () => {
      const response = await request(app)
        .get("/api/reports?status=PENDING&limit=5")
        .set("Authorization", admin.authHeader);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.meta).toMatchObject({ page: 1, limit: 5 });
      for (const report of response.body.data) {
        expect(report.status).toBe("PENDING");
      }
    });

    it("never leaks sensitive fields in the admin listing", async () => {
      const response = await request(app)
        .get("/api/reports")
        .set("Authorization", admin.authHeader);

      expect(JSON.stringify(response.body)).not.toContain("passwordHash");
      expect(JSON.stringify(response.body)).not.toContain("refreshTokenDigest");
      for (const report of response.body.data) {
        expect(report.reporter).not.toHaveProperty("passwordHash");
        if (report.resolver) {
          expect(report.resolver).not.toHaveProperty("passwordHash");
        }
      }
    });
  });

  describe("GET /api/reports/:id", () => {
    it("lets the reporter read their own report", async () => {
      const created1 = await submitReport(reporter.authHeader, { reason: "Read own report" });
      const reportId = created1.body.data.id;

      const response = await request(app)
        .get(`/api/reports/${reportId}`)
        .set("Authorization", reporter.authHeader);

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe(reportId);
      expect(response.body.data.reporter).not.toHaveProperty("passwordHash");
    });

    it("lets an admin read any report", async () => {
      const created1 = await submitReport(reporter.authHeader, { reason: "Admin read check" });
      const reportId = created1.body.data.id;

      const response = await request(app)
        .get(`/api/reports/${reportId}`)
        .set("Authorization", admin.authHeader);

      expect(response.status).toBe(200);
    });

    it("rejects an unrelated user reading the report", async () => {
      const created1 = await submitReport(reporter.authHeader, { reason: "Unauthorized read check" });
      const reportId = created1.body.data.id;

      const response = await request(app)
        .get(`/api/reports/${reportId}`)
        .set("Authorization", other.authHeader);

      expect(response.status).toBe(403);
    });

    it("returns 404 for a nonexistent report", async () => {
      const response = await request(app)
        .get("/api/reports/does-not-exist")
        .set("Authorization", admin.authHeader);

      expect(response.status).toBe(404);
    });
  });

  describe("PATCH /api/reports/:id/resolve", () => {
    // `submitReport` already allocates a unique target per call.
    const pendingReport = async (reason: string): Promise<string> => {
      const response = await submitReport(reporter.authHeader, { reason });
      expect(response.status).toBe(201);
      return response.body.data.id as string;
    };

    it("lets an admin resolve a report and records the resolver", async () => {
      const reportId = await pendingReport("Resolve me");

      const response = await request(app)
        .patch(`/api/reports/${reportId}/resolve`)
        .set("Authorization", admin.authHeader)
        .send({ status: "RESOLVED", resolutionNote: "Account suspended" });

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        id: reportId,
        status: "RESOLVED",
        resolvedById: admin.id,
        resolutionNote: "Account suspended",
      });
      expect(response.body.data.resolver).not.toHaveProperty("passwordHash");
    });

    it("lets an admin dismiss a report", async () => {
      const reportId = await pendingReport("Dismiss me");

      const response = await request(app)
        .patch(`/api/reports/${reportId}/resolve`)
        .set("Authorization", admin.authHeader)
        .send({ status: "DISMISSED" });

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ status: "DISMISSED", resolvedById: admin.id });
    });

    it("rejects a non-admin resolution attempt", async () => {
      const reportId = await pendingReport("Non admin resolve");

      const response = await request(app)
        .patch(`/api/reports/${reportId}/resolve`)
        .set("Authorization", reporter.authHeader)
        .send({ status: "RESOLVED" });

      expect(response.status).toBe(403);

      const stored = await testPrisma.report.findUniqueOrThrow({
        where: { id: reportId },
        select: { status: true, resolvedById: true },
      });
      expect(stored.status).toBe("PENDING");
      expect(stored.resolvedById).toBeNull();
    });

    it("rejects a transition back to PENDING", async () => {
      const response = await request(app)
        .patch("/api/reports/whatever/resolve")
        .set("Authorization", admin.authHeader)
        .send({ status: "PENDING" });

      expect(response.status).toBe(400);
    });

    it("rejects re-resolving an already resolved report", async () => {
      const reportId = await pendingReport("Double resolve guard");

      const first = await request(app)
        .patch(`/api/reports/${reportId}/resolve`)
        .set("Authorization", admin.authHeader)
        .send({ status: "RESOLVED" });
      expect(first.status).toBe(200);

      const second = await request(app)
        .patch(`/api/reports/${reportId}/resolve`)
        .set("Authorization", admin.authHeader)
        .send({ status: "DISMISSED" });

      expect(second.status).toBe(409);
    });

    it("rejects an unauthenticated resolution attempt", async () => {
      const reportId = await pendingReport("Unauthenticated resolve");

      const response = await request(app)
        .patch(`/api/reports/${reportId}/resolve`)
        .send({ status: "RESOLVED" });

      expect(response.status).toBe(401);
    });
  });
});
