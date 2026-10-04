import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { Role } from "../../src/generated/prisma/enums.js";
import type { User, Project, Milestone } from "../../src/generated/prisma/client.js";
import app from "../../src/app.js";
import { env } from "../../src/shared/config/env.js";
import { prisma } from "../../src/shared/db/prisma.js";

const EMAILS = {
  client: "milestones.client@test.com",
  freelancer: "milestones.freelancer@test.com",
  admin: "milestones.admin@test.com",
  outsider: "milestones.outsider@test.com",
} as const;

const sign = (user: Pick<User, "id" | "role">) =>
  jwt.sign({ id: user.id, email: "test@test.com", role: user.role }, env.JWT_ACCESS_SECRET, {
    expiresIn: "1h",
  });

const asUser = (user: Pick<User, "id" | "role">) => ({
  Authorization: `Bearer ${sign(user)}`,
});

describe("Milestones API (E2E)", () => {
  let client: User;
  let freelancer: User;
  let admin: User;
  let outsider: User;
  let project: Project;
  let otherProject: Project;
  let seedMilestone: Milestone;
  let jobId: string;
  let applicationId: string;
  let otherJobId: string;
  let otherApplicationId: string;
  const createdMilestoneIds = new Set<string>();

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash("password123", 4);

    const upsertUser = async (email: string, role: Role): Promise<User> =>
      prisma.user.upsert({
        where: { email },
        update: { role, accountStatus: "ACTIVE" },
        create: { email, passwordHash, role, accountStatus: "ACTIVE" },
      });

    client = await upsertUser(EMAILS.client, "CLIENT");
    freelancer = await upsertUser(EMAILS.freelancer, "FREELANCER");
    admin = await upsertUser(EMAILS.admin, "ADMIN");
    outsider = await upsertUser(EMAILS.outsider, "FREELANCER");

    const job = await prisma.job.create({
      data: { ownerId: client.id, title: "Milestone Job", description: "d", status: "OPEN" },
    });
    jobId = job.id;

    const application = await prisma.application.create({
      data: {
        jobId: job.id,
        freelancerId: freelancer.id,
        coverLetter: "cover",
        proposedBid: 100,
        status: "ACCEPTED",
      },
    });
    applicationId = application.id;

    project = await prisma.project.create({
      data: {
        applicationId: application.id,
        clientId: client.id,
        freelancerId: freelancer.id,
        title: "Milestone Project",
        status: "ACTIVE",
      },
    });

    const otherJob = await prisma.job.create({
      data: { ownerId: client.id, title: "Other Job", description: "d", status: "OPEN" },
    });
    otherJobId = otherJob.id;

    const otherApplication = await prisma.application.create({
      data: {
        jobId: otherJob.id,
        freelancerId: freelancer.id,
        coverLetter: "cover",
        proposedBid: 200,
        status: "ACCEPTED",
      },
    });
    otherApplicationId = otherApplication.id;

    otherProject = await prisma.project.create({
      data: {
        applicationId: otherApplication.id,
        clientId: client.id,
        freelancerId: freelancer.id,
        title: "Other Milestone Project",
        status: "ACTIVE",
      },
    });

    seedMilestone = await prisma.milestone.create({
      data: { projectId: project.id, title: "Seed Milestone", status: "PENDING" },
    });
    createdMilestoneIds.add(seedMilestone.id);
  }, 60000);

  afterAll(async () => {
    await prisma.milestone.deleteMany({ where: { id: { in: [...createdMilestoneIds] } } });
    for (const id of [project?.id, otherProject?.id]) {
      if (id) await prisma.project.delete({ where: { id } }).catch(() => undefined);
    }
    for (const id of [applicationId, otherApplicationId]) {
      if (id) await prisma.application.delete({ where: { id } }).catch(() => undefined);
    }
    for (const id of [jobId, otherJobId]) {
      if (id) await prisma.job.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });
    await prisma.$disconnect();
  }, 60000);

  const track = (m: { id: string }) => {
    createdMilestoneIds.add(m.id);
    return m;
  };

  const createMilestone = async (user: Pick<User, "id" | "role">, title: string) => {
    const res = await request(app)
      .post(`/api/v1/projects/${project.id}/milestones`)
      .set(asUser(user))
      .send({ title });
    if (res.status === 201) track(res.body.data);
    return res;
  };

  describe("authentication", () => {
    it("rejects unauthenticated create with 401", async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${project.id}/milestones`)
        .send({ title: "nope" });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("rejects a malformed token with 401", async () => {
      const res = await request(app)
        .get(`/api/v1/projects/${project.id}/milestones`)
        .set({ Authorization: "Bearer not-a-real-token" });
      expect(res.status).toBe(401);
    });
  });

  describe("authorization", () => {
    it("allows the client (project owner) full access", async () => {
      const created = await createMilestone(client, "Client Milestone");
      expect(created.status).toBe(201);
      expect(created.body.data.projectId).toBe(project.id);

      const list = await request(app)
        .get(`/api/v1/projects/${project.id}/milestones`)
        .set(asUser(client));
      expect(list.status).toBe(200);
      expect(list.body.data.some((m: Milestone) => m.id === created.body.data.id)).toBe(true);

      const get = await request(app)
        .get(`/api/v1/milestones/${created.body.data.id}`)
        .set(asUser(client));
      expect(get.status).toBe(200);

      const patched = await request(app)
        .patch(`/api/v1/milestones/${created.body.data.id}`)
        .set(asUser(client))
        .send({ title: "Client Milestone Updated" });
      expect(patched.status).toBe(200);

      const removed = await request(app)
        .delete(`/api/v1/milestones/${created.body.data.id}`)
        .set(asUser(client));
      expect(removed.status).toBe(204);
    });

    it("allows the assigned freelancer full access", async () => {
      const created = await createMilestone(freelancer, "Freelancer Milestone");
      expect(created.status).toBe(201);

      const list = await request(app)
        .get(`/api/v1/projects/${project.id}/milestones`)
        .set(asUser(freelancer));
      expect(list.status).toBe(200);

      const patched = await request(app)
        .patch(`/api/v1/milestones/${created.body.data.id}`)
        .set(asUser(freelancer))
        .send({ status: "IN_PROGRESS" });
      expect(patched.status).toBe(200);
      expect(patched.body.data.status).toBe("IN_PROGRESS");
    });

    it("allows an admin full access", async () => {
      const created = await createMilestone(admin, "Admin Milestone");
      expect(created.status).toBe(201);

      const list = await request(app)
        .get(`/api/v1/projects/${project.id}/milestones`)
        .set(asUser(admin));
      expect(list.status).toBe(200);

      const get = await request(app)
        .get(`/api/v1/milestones/${created.body.data.id}`)
        .set(asUser(admin));
      expect(get.status).toBe(200);

      const removed = await request(app)
        .delete(`/api/v1/milestones/${created.body.data.id}`)
        .set(asUser(admin));
      expect(removed.status).toBe(204);
    });

    it("denies an unrelated authenticated user with 403 on every endpoint", async () => {
      const created = await createMilestone(client, "Guarded Milestone");
      expect(created.status).toBe(201);
      const id = created.body.data.id;

      const attempts = [
        await request(app).get(`/api/v1/projects/${project.id}/milestones`).set(asUser(outsider)),
        await request(app).get(`/api/v1/milestones/${id}`).set(asUser(outsider)),
        await request(app)
          .post(`/api/v1/projects/${project.id}/milestones`)
          .set(asUser(outsider))
          .send({ title: "Intruder" }),
        await request(app)
          .patch(`/api/v1/milestones/${id}`)
          .set(asUser(outsider))
          .send({ title: "Hijacked" }),
        await request(app).delete(`/api/v1/milestones/${id}`).set(asUser(outsider)),
      ];

      for (const res of attempts) {
        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
      }

      const stillThere = await prisma.milestone.findUnique({ where: { id } });
      expect(stillThere?.title).toBe("Guarded Milestone");
    });
  });

  describe("projectId immutability", () => {
    it("rejects a PATCH that tries to move the milestone to another real project", async () => {
      const created = await createMilestone(client, "Immutable Project Milestone");
      expect(created.status).toBe(201);
      const id = created.body.data.id;

      const res = await request(app)
        .patch(`/api/v1/milestones/${id}`)
        .set(asUser(client))
        .send({ projectId: otherProject.id });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);

      const unchanged = await prisma.milestone.findUnique({ where: { id } });
      expect(unchanged?.projectId).toBe(project.id);
    });

    it("rejects a PATCH that mixes projectId with otherwise valid fields", async () => {
      const created = await createMilestone(client, "Mixed Payload Milestone");
      const id = created.body.data.id;

      const res = await request(app)
        .patch(`/api/v1/milestones/${id}`)
        .set(asUser(client))
        .send({ title: "Renamed OK", projectId: otherProject.id });
      expect(res.status).toBe(400);

      const unchanged = await prisma.milestone.findUnique({ where: { id } });
      expect(unchanged?.projectId).toBe(project.id);
      expect(unchanged?.title).toBe("Mixed Payload Milestone");
    });

    it("cannot be used to escalate into another project via a crafted payload", async () => {
      const target = await prisma.milestone.create({
        data: { projectId: otherProject.id, title: "Other Project Milestone" },
      });
      createdMilestoneIds.add(target.id);

      const res = await request(app)
        .patch(`/api/v1/milestones/${target.id}`)
        .set(asUser(client))
        .send({ projectId: project.id });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);

      const unchanged = await prisma.milestone.findUnique({ where: { id: target.id } });
      expect(unchanged?.projectId).toBe(otherProject.id);
    });
  });

  describe("validation", () => {
    it("rejects an empty title on create", async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${project.id}/milestones`)
        .set(asUser(client))
        .send({ title: "" });
      expect(res.status).toBe(400);
    });

    it("rejects an unknown status value on create", async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${project.id}/milestones`)
        .set(asUser(client))
        .send({ title: "X", status: "BOGUS" });
      expect(res.status).toBe(400);
    });

    it("rejects an unparseable dueDate on create", async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${project.id}/milestones`)
        .set(asUser(client))
        .send({ title: "X", dueDate: "not-a-date" });
      expect(res.status).toBe(400);
    });

    it("accepts a valid dueDate and optional fields", async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${project.id}/milestones`)
        .set(asUser(client))
        .send({ title: "Full", description: "desc", dueDate: "2026-12-31T00:00:00.000Z" });
      expect(res.status).toBe(201);
      track(res.body.data);
      expect(res.body.data.dueDate).toBe("2026-12-31T00:00:00.000Z");
    });
  });

  describe("not found", () => {
    it("returns 404 for an unknown project", async () => {
      const res = await request(app)
        .post(`/api/v1/projects/doesnotexist/milestones`)
        .set(asUser(client))
        .send({ title: "X" });
      expect(res.status).toBe(404);
    });

    it("returns 404 for an unknown milestone", async () => {
      const res = await request(app).get(`/api/v1/milestones/doesnotexist`).set(asUser(client));
      expect(res.status).toBe(404);
    });

    it("returns 404 when updating an unknown milestone", async () => {
      const res = await request(app)
        .patch(`/api/v1/milestones/doesnotexist`)
        .set(asUser(client))
        .send({ title: "X" });
      expect(res.status).toBe(404);
    });
  });

  describe("crud lifecycle", () => {
    it("updates title, description and status", async () => {
      const res = await request(app)
        .patch(`/api/v1/milestones/${seedMilestone.id}`)
        .set(asUser(client))
        .send({ title: "Updated", description: "new desc" });
      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe("Updated");
      expect(res.body.data.description).toBe("new desc");

      const statusRes = await request(app)
        .patch(`/api/v1/milestones/${seedMilestone.id}`)
        .set(asUser(client))
        .send({ status: "COMPLETED" });
      expect(statusRes.status).toBe(200);
      expect(statusRes.body.data.status).toBe("COMPLETED");
    });

    it("deletes a milestone and it is then unreadable", async () => {
      const created = await createMilestone(client, "Delete Me");
      const id = created.body.data.id;

      const del = await request(app).delete(`/api/v1/milestones/${id}`).set(asUser(client));
      expect(del.status).toBe(204);
      createdMilestoneIds.delete(id);

      const get = await request(app).get(`/api/v1/milestones/${id}`).set(asUser(client));
      expect(get.status).toBe(404);
    });
  });
});
