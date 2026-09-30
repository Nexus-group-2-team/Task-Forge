import request from "supertest";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../../src/app.js";
import {
  cleanup,
  createUser,
  disconnect,
  testPrisma,
  type TestUser,
} from "../helpers/test-utils.js";
// `testPrisma` is built from `@prisma/client`, whose generated client predates
// the Category model, so category fixtures go through the canonical Prisma
// singleton the Jobs services use.
import { prisma as appPrisma } from "../../src/shared/db/prisma.js";

/**
 * Coverage notes for the Jobs module.
 *
 * The Jobs router (src/modules/jobs/jobs.routes.ts) is mounted at /api/jobs and
 * exposes:
 *   GET    /api/jobs              - public listing with query filters
 *   GET    /api/jobs/:id          - public read (drafts hidden from strangers)
 *   POST   /api/jobs              - CLIENT/ADMIN, owner taken from the token
 *   PATCH  /api/jobs/:id          - owner or ADMIN
 *   DELETE /api/jobs/:id          - owner or ADMIN
 *   POST   /api/jobs/skills       - ADMIN
 *   POST   /api/jobs/categories   - ADMIN
 *
 * Every write route is authenticated, so these tests assert real authorization
 * outcomes rather than the previous hardcoded-identity behaviour.
 */

const unique = () => randomUUID().replace(/-/g, "").slice(0, 10);

const userIds: string[] = [];
const createdJobIds: string[] = [];
const createdSkillNames: string[] = [];
const createdCategoryNames: string[] = [];

const newUser = async (role: TestUser["role"]): Promise<TestUser> => {
  const user = await createUser(role);
  userIds.push(user.id);
  return user;
};

type SeededStatus = "OPEN" | "DRAFT" | "COMPLETED";

/** Seeds a job straight through Prisma, bypassing the create endpoint. */
const seedJob = async (
  ownerId: string,
  overrides: {
    title?: string;
    description?: string;
    status?: SeededStatus;
    budgetMin?: number;
    budgetMax?: number;
  } = {}
): Promise<string> => {
  const job = await testPrisma.job.create({
    data: {
      ownerId,
      title: overrides.title ?? `Seeded job ${unique()}`,
      description: overrides.description ?? "Seeded job description long enough for the schema",
      status: overrides.status ?? "OPEN",
      ...(overrides.budgetMin !== undefined && { budgetMin: overrides.budgetMin }),
      ...(overrides.budgetMax !== undefined && { budgetMax: overrides.budgetMax }),
    },
    select: { id: true },
  });
  createdJobIds.push(job.id);
  return job.id;
};

const seedSkill = async (): Promise<string> => {
  const name = `Skill ${unique()}`;
  createdSkillNames.push(name);
  const skill = await appPrisma.skill.create({ data: { name }, select: { id: true } });
  return skill.id;
};

const seedCategory = async (): Promise<string> => {
  const name = `Category ${unique()}`;
  createdCategoryNames.push(name);
  const category = await appPrisma.category.create({ data: { name }, select: { id: true } });
  return category.id;
};

const validJobBody = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  title: `Job ${unique()}`,
  description: "A job description comfortably longer than the schema minimum",
  ...overrides,
});

describe("Jobs API", () => {
  let owner: TestUser;
  let client: TestUser;
  let other: TestUser;
  let openJobId: string;
  let draftJobId: string;

  beforeAll(async () => {
    owner = await newUser("ADMIN");
    client = await newUser("CLIENT");
    other = await newUser("FREELANCER");
    openJobId = await seedJob(client.id, { status: "OPEN" });
    draftJobId = await seedJob(client.id, { status: "DRAFT" });
  });

  afterAll(async () => {
    if (createdSkillNames.length > 0) {
      await appPrisma.skill.deleteMany({ where: { name: { in: createdSkillNames } } });
    }
    if (createdCategoryNames.length > 0) {
      await appPrisma.category.deleteMany({ where: { name: { in: createdCategoryNames } } });
    }
    if (createdJobIds.length > 0) {
      await testPrisma.job.deleteMany({ where: { id: { in: createdJobIds } } });
    }
    await cleanup(userIds);
    await disconnect();
    await appPrisma.$disconnect();
  });

  describe("GET /api/jobs", () => {
    it("serves the listing without authentication", async () => {
      const response = await request(app).get("/api/jobs");

      expect(response.status).toBe(200);
    });

    it("accepts an explicit page and limit", async () => {
      const response = await request(app).get("/api/jobs?page=2&limit=3");

      expect(response.status).toBe(200);
    });

    it("accepts each supported status filter value", async () => {
      for (const status of ["OPEN", "COMPLETED", "IN_PROGRESS", "DRAFT"]) {
        const response = await request(app).get(`/api/jobs?status=${status}`);

        expect(response.status).toBe(200);
      }
    });

    it("accepts CANCELLED as a status filter value", async () => {
      const response = await request(app).get("/api/jobs?status=CANCELLED");

      // CANCELLED is a real JobStatus member and must be filterable.
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it("rejects an unknown status filter value", async () => {
      const response = await request(app).get("/api/jobs?status=ARCHIVED");

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it("rejects a title shorter than the 5 character minimum", async () => {
      const response = await request(app).get("/api/jobs?title=abcd");

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it("rejects a description shorter than the 10 character minimum", async () => {
      const response = await request(app).get("/api/jobs?description=short");

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it("rejects a limit below the minimum of 3", async () => {
      const response = await request(app).get("/api/jobs?limit=1");

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it("rejects a limit above the maximum of 100", async () => {
      const response = await request(app).get("/api/jobs?limit=101");

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it("rejects a non-numeric limit", async () => {
      const response = await request(app).get("/api/jobs?limit=lots");

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it("rejects a page below 1", async () => {
      const response = await request(app).get("/api/jobs?page=0");

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it("rejects a budget range where minBudget exceeds maxBudget", async () => {
      const response = await request(app).get("/api/jobs?minBudget=900&maxBudget=10");

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it("leaves the seeded jobs untouched", async () => {
      await request(app).get("/api/jobs?status=OPEN");

      const stored = await testPrisma.job.findUniqueOrThrow({
        where: { id: openJobId },
        select: { status: true },
      });
      expect(stored.status).toBe("OPEN");
    });

    it("returns a machine-readable page of jobs with pagination metadata", async () => {
      const response = await request(app).get("/api/jobs?page=1&limit=3");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeLessThanOrEqual(3);
      expect(response.body.meta).toMatchObject({
        page: 1,
        limit: 3,
      });
      expect(typeof response.body.meta.total).toBe("number");
      expect(typeof response.body.meta.totalPages).toBe("number");
    });

    it("excludes DRAFT jobs by default and includes them on demand", async () => {
      const anonymous = await request(app).get("/api/jobs");
      const anonymousIds = anonymous.body.data.map((job: { id: string }) => job.id);
      expect(anonymousIds).not.toContain(draftJobId);

      const onDemand = await request(app).get("/api/jobs?status=DRAFT");
      const onDemandIds = onDemand.body.data.map((job: { id: string }) => job.id);
      expect(onDemandIds).toContain(draftJobId);
    });

    it("filters by title, description and budget range", async () => {
      const marker = `Filterable ${unique()}`;
      const descriptionMarker = `Narration ${unique()}`;
      const cheapId = await seedJob(client.id, {
        title: `${marker} cheap`,
        description: descriptionMarker,
        budgetMin: 100,
        budgetMax: 500,
      });
      const priceyId = await seedJob(client.id, {
        title: `${marker} pricey`,
        description: descriptionMarker,
        budgetMin: 800,
        budgetMax: 1200,
      });

      const byTitle = await request(app).get(`/api/jobs?title=${marker}`);
      const titleIds = byTitle.body.data.map((job: { id: string }) => job.id);
      expect(titleIds).toContain(cheapId);
      expect(titleIds).toContain(priceyId);
      expect(titleIds).not.toContain(openJobId);

      const byDescription = await request(app).get(`/api/jobs?description=${descriptionMarker}`);
      const descriptionIds = byDescription.body.data.map((job: { id: string }) => job.id);
      expect(descriptionIds).toContain(cheapId);

      const aboveFourHundred = await request(app).get("/api/jobs?minBudget=400");
      const aboveIds = aboveFourHundred.body.data.map((job: { id: string }) => job.id);
      expect(aboveIds).toContain(priceyId);
      expect(aboveIds).not.toContain(cheapId);

      const belowSixHundred = await request(app).get("/api/jobs?maxBudget=600");
      const belowIds = belowSixHundred.body.data.map((job: { id: string }) => job.id);
      expect(belowIds).toContain(cheapId);
      expect(belowIds).not.toContain(priceyId);
    });
  });

  describe("GET /api/jobs/:id", () => {
    it("returns a published job", async () => {
      const response = await request(app).get(`/api/jobs/${openJobId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(openJobId);
    });

    it("returns 404 for a job that does not exist", async () => {
      const response = await request(app).get(`/api/jobs/${unique()}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it("hides a DRAFT job behind a 404 from a stranger", async () => {
      const response = await request(app).get(`/api/jobs/${draftJobId}`);

      expect(response.status).toBe(404);
    });

    it("still shows a DRAFT job to its owner", async () => {
      const response = await request(app)
        .get(`/api/jobs/${draftJobId}`)
        .set("Authorization", client.authHeader);

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe(draftJobId);
    });
  });

  describe("POST /api/jobs", () => {
    const post = (body: Record<string, unknown>, user: TestUser = client) =>
      request(app).post("/api/jobs").set("Authorization", user.authHeader).send(body);

    it("rejects a body without a description", async () => {
      const response = await post({ title: "No description" });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Validation Error");
      expect(response.body.errors).toBeDefined();
    });

    it("rejects a title shorter than 3 characters", async () => {
      const response = await post({ title: "ab", description: "x".repeat(30) });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it("rejects a title longer than 100 characters", async () => {
      const response = await post({ title: "x".repeat(101), description: "x".repeat(30) });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it("rejects a body that tries to set ownerId", async () => {
      // Ownership is derived from the token; the field is not client-writable.
      const response = await post(validJobBody({ ownerId: other.id }));

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it("rejects an unknown status value", async () => {
      const response = await post(validJobBody({ status: "ARCHIVED" }));

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it("rejects minBudget greater than maxBudget", async () => {
      const response = await post(validJobBody({ minBudget: 900, maxBudget: 10 }));

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it("rejects more than 20 skillIds", async () => {
      const response = await post(
        validJobBody({ skillIds: Array.from({ length: 21 }, () => "skill-id") })
      );

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it("rejects a deadline in the past", async () => {
      const response = await post(
        validJobBody({ deadline: new Date(Date.now() - 86_400_000).toISOString() })
      );

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it("stores nothing when validation fails", async () => {
      const title = `Rejected job ${unique()}`;
      await post({ title, description: "ab" });

      const stored = await testPrisma.job.findFirst({ where: { title }, select: { id: true } });
      expect(stored).toBeNull();
    });

    it("creates a job owned by the authenticated user", async () => {
      const title = `Created job ${unique()}`;
      const response = await post(validJobBody({ title, status: "OPEN" }));

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe(title);
      expect(response.body.data.ownerId).toBe(client.id);
      createdJobIds.push(response.body.data.id);

      const stored = await testPrisma.job.findUniqueOrThrow({
        where: { id: response.body.data.id },
        select: { ownerId: true, title: true },
      });
      expect(stored.ownerId).toBe(client.id);
      expect(stored.title).toBe(title);
    });

    it("attaches skillIds as jobSkills rows", async () => {
      const skillId = await seedSkill();
      const response = await post(validJobBody({ status: "OPEN", skillIds: [skillId] }));

      expect(response.status).toBe(201);
      createdJobIds.push(response.body.data.id);
      expect(response.body.data.jobSkills).toHaveLength(1);
      expect(response.body.data.jobSkills[0].skillId).toBe(skillId);

      const stored = await testPrisma.jobSkill.count({
        where: { jobId: response.body.data.id },
      });
      expect(stored).toBe(1);
    });

    it("rejects an unauthenticated creation", async () => {
      const response = await request(app).post("/api/jobs").send(validJobBody());

      expect(response.status).toBe(401);
    });

    it("rejects a creation from a non-client role", async () => {
      const response = await post(validJobBody(), other);

      expect(response.status).toBe(403);
    });
  });

  describe("PATCH /api/jobs/:id", () => {
    const patch = (id: string, body: Record<string, unknown>, user: TestUser = client) =>
      request(app).patch(`/api/jobs/${id}`).set("Authorization", user.authHeader).send(body);

    it("rejects a title shorter than 3 characters", async () => {
      const response = await patch(openJobId, { title: "ab" });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Validation Error");
      expect(response.body.errors).toBeDefined();
    });

    it("rejects minBudget greater than maxBudget", async () => {
      const response = await patch(openJobId, { minBudget: 900, maxBudget: 10 });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it("leaves the stored job untouched when validation fails", async () => {
      const before = await testPrisma.job.findUniqueOrThrow({
        where: { id: openJobId },
        select: { title: true },
      });

      await patch(openJobId, { title: "ab" });

      const after = await testPrisma.job.findUniqueOrThrow({
        where: { id: openJobId },
        select: { title: true },
      });
      expect(after.title).toBe(before.title);
    });

    it("updates the addressed job", async () => {
      const targetId = await seedJob(client.id);
      const title = `Renamed job ${unique()}`;

      const response = await patch(targetId, { title });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(targetId);
      expect(response.body.data.title).toBe(title);

      const stored = await testPrisma.job.findUniqueOrThrow({
        where: { id: targetId },
        select: { title: true },
      });
      expect(stored.title).toBe(title);
    });

    it("replaces jobSkills when skillIds are supplied", async () => {
      const targetId = await seedJob(client.id);
      const firstSkillId = await seedSkill();
      const secondSkillId = await seedSkill();

      await patch(targetId, { skillIds: [firstSkillId] });
      const response = await patch(targetId, { skillIds: [secondSkillId] });

      expect(response.status).toBe(200);

      const stored = await testPrisma.jobSkill.findMany({
        where: { jobId: targetId },
        select: { skillId: true },
      });
      expect(stored).toHaveLength(1);
      expect(stored[0].skillId).toBe(secondSkillId);
    });

    it("returns 404 for a job that does not exist", async () => {
      const response = await patch(unique(), { title: "Nowhere" });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it("forbids a user who does not own the job", async () => {
      const response = await patch(openJobId, { title: "Hijacked" }, other);

      expect(response.status).toBe(403);
    });

    it("rejects an unauthenticated update", async () => {
      const response = await request(app).patch(`/api/jobs/${openJobId}`).send({ title: "Anon" });

      expect(response.status).toBe(401);
    });
  });

  describe("DELETE /api/jobs/:id", () => {
    const del = (id: string, user: TestUser) =>
      request(app).delete(`/api/jobs/${id}`).set("Authorization", user.authHeader);

    it("deletes the addressed job and answers 204", async () => {
      const targetId = await seedJob(client.id);

      const response = await del(targetId, client);

      expect(response.status).toBe(204);
      const stored = await testPrisma.job.findUnique({ where: { id: targetId } });
      expect(stored).toBeNull();
    });

    it("returns 404 for a job that does not exist", async () => {
      const response = await del(unique(), client);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it("forbids a user who does not own the job", async () => {
      const targetId = await seedJob(client.id);

      const response = await del(targetId, other);

      expect(response.status).toBe(403);
      const stored = await testPrisma.job.findUnique({ where: { id: targetId } });
      expect(stored).not.toBeNull();
    });

    it("lets an administrator delete any job", async () => {
      const targetId = await seedJob(client.id);

      const response = await del(targetId, owner);

      expect(response.status).toBe(204);
      const stored = await testPrisma.job.findUnique({ where: { id: targetId } });
      expect(stored).toBeNull();
    });

    it("rejects an unauthenticated delete", async () => {
      const targetId = await seedJob(client.id);

      const response = await request(app).delete(`/api/jobs/${targetId}`);

      expect(response.status).toBe(401);
    });
  });

  describe("POST /api/jobs/categories", () => {
    const postCategory = (body: Record<string, unknown>, user: TestUser = owner) =>
      request(app).post("/api/jobs/categories").set("Authorization", user.authHeader).send(body);

    it("creates a category with a description", async () => {
      const name = `Category ${unique()}`;
      createdCategoryNames.push(name);

      const response = await postCategory({ name, description: "A description of the category" });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);

      const stored = await appPrisma.category.findUniqueOrThrow({
        where: { name },
        select: { name: true, description: true },
      });
      expect(stored.description).toBe("A description of the category");
    });

    it("creates a category without a description", async () => {
      const name = `Category ${unique()}`;
      createdCategoryNames.push(name);

      const response = await postCategory({ name });

      expect(response.status).toBe(201);

      const stored = await appPrisma.category.findUniqueOrThrow({
        where: { name },
        select: { description: true },
      });
      expect(stored.description).toBeNull();
    });

    it("rejects a duplicate category name", async () => {
      const name = `Category ${unique()}`;
      createdCategoryNames.push(name);
      await postCategory({ name });

      const response = await postCategory({ name });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Category already exists");
    });

    it("rejects a name shorter than 5 characters", async () => {
      const response = await postCategory({ name: "abc" });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Validation Error");
    });

    it("rejects a name longer than 100 characters", async () => {
      const response = await postCategory({ name: `Category ${"x".repeat(120)}` });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it("rejects a description shorter than 10 characters", async () => {
      const response = await postCategory({ name: `Category ${unique()}`, description: "short" });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it("rejects an unauthenticated creation", async () => {
      const response = await request(app)
        .post("/api/jobs/categories")
        .send({ name: `Category ${unique()}` });

      expect(response.status).toBe(401);
    });

    it("rejects a creation from a non-admin role", async () => {
      const response = await postCategory({ name: `Category ${unique()}` }, client);

      expect(response.status).toBe(403);
    });
  });

  describe("POST /api/jobs/skills", () => {
    const postSkill = (body: Record<string, unknown>, user: TestUser = owner) =>
      request(app).post("/api/jobs/skills").set("Authorization", user.authHeader).send(body);

    it("creates a skill attached to a category", async () => {
      const categoryId = await seedCategory();
      const name = `Skill ${unique()}`;
      createdSkillNames.push(name);

      const response = await postSkill({ name, categoryId });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);

      const stored = await appPrisma.skill.findUniqueOrThrow({
        where: { name },
        select: { name: true, categoryId: true },
      });
      expect(stored.categoryId).toBe(categoryId);
    });

    it("creates a skill without a category", async () => {
      const name = `Skill ${unique()}`;
      createdSkillNames.push(name);

      const response = await postSkill({ name });

      expect(response.status).toBe(201);

      const stored = await appPrisma.skill.findUniqueOrThrow({
        where: { name },
        select: { categoryId: true },
      });
      expect(stored.categoryId).toBeNull();
    });

    it("rejects a duplicate skill name", async () => {
      const name = `Skill ${unique()}`;
      createdSkillNames.push(name);
      await postSkill({ name });

      const response = await postSkill({ name });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Skill already exists");
    });

    it("returns 404 for a category that does not exist", async () => {
      const name = `Skill ${unique()}`;
      createdSkillNames.push(name);

      const response = await postSkill({ name, categoryId: "no-such-category" });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe("Category not found");

      const stored = await appPrisma.skill.findUnique({ where: { name }, select: { id: true } });
      expect(stored).toBeNull();
    });

    it("rejects a name shorter than 5 characters", async () => {
      const response = await postSkill({ name: "abc" });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Validation Error");
    });

    it("rejects a name longer than 100 characters", async () => {
      const response = await postSkill({ name: `Skill ${"x".repeat(120)}` });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it("rejects an unauthenticated creation", async () => {
      const response = await request(app).post("/api/jobs/skills").send({ name: `Skill ${unique()}` });

      expect(response.status).toBe(401);
    });

    it("rejects a creation from a non-admin role", async () => {
      const response = await postSkill({ name: `Skill ${unique()}` }, client);

      expect(response.status).toBe(403);
    });
  });
});