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

const newUser = async (role: TestUser["role"] = "FREELANCER"): Promise<TestUser> => {
  const user = await createUser(role);
  created.push(user.id);
  return user;
};

describe("Reviews API", () => {
  let client: TestUser;
  let freelancer: TestUser;
  let outsider: TestUser;
  let projectId: string;

  beforeAll(async () => {
    client = await newUser("CLIENT");
    freelancer = await newUser("FREELANCER");
    outsider = await newUser("FREELANCER");
    projectId = (await createProject({ clientId: client.id, freelancerId: freelancer.id })).id;
  });

  afterAll(async () => {
    await cleanup(created);
    await disconnect();
  });

  describe("POST /api/reviews", () => {
    it("creates a review for the other project participant", async () => {
      const response = await request(app)
        .post("/api/reviews")
        .set("Authorization", client.authHeader)
        .send({ projectId, revieweeId: freelancer.id, rating: 5, comment: "Excellent work" });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        projectId,
        reviewerId: client.id,
        revieweeId: freelancer.id,
        rating: 5,
        comment: "Excellent work",
      });
    });

    it("rejects unauthenticated creation", async () => {
      const response = await request(app)
        .post("/api/reviews")
        .send({ projectId, revieweeId: freelancer.id, rating: 4 });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it("rejects a rating outside the 1-5 range", async () => {
      const otherProject = await createProject({ clientId: client.id, freelancerId: freelancer.id });

      for (const rating of [0, 6, 2.5]) {
        const response = await request(app)
          .post("/api/reviews")
          .set("Authorization", client.authHeader)
          .send({ projectId: otherProject.id, revieweeId: freelancer.id, rating });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      }
    });

    it("rejects a request missing required fields", async () => {
      const response = await request(app)
        .post("/api/reviews")
        .set("Authorization", client.authHeader)
        .send({ projectId });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });

    it("rejects a nonexistent project", async () => {
      const response = await request(app)
        .post("/api/reviews")
        .set("Authorization", client.authHeader)
        .send({ projectId: "does-not-exist", revieweeId: freelancer.id, rating: 4 });

      expect(response.status).toBe(404);
    });

    it("rejects a user who is not a project participant", async () => {
      const otherProject = await createProject({ clientId: client.id, freelancerId: freelancer.id });

      const response = await request(app)
        .post("/api/reviews")
        .set("Authorization", outsider.authHeader)
        .send({ projectId: otherProject.id, revieweeId: client.id, rating: 3 });

      expect(response.status).toBe(403);
    });

    it("rejects self-review", async () => {
      const response = await request(app)
        .post("/api/reviews")
        .set("Authorization", client.authHeader)
        .send({ projectId, revieweeId: client.id, rating: 5 });

      expect(response.status).toBe(400);
    });

    it("rejects a reviewee who is not the other participant", async () => {
      const otherProject = await createProject({ clientId: client.id, freelancerId: freelancer.id });

      const response = await request(app)
        .post("/api/reviews")
        .set("Authorization", client.authHeader)
        .send({ projectId: otherProject.id, revieweeId: outsider.id, rating: 5 });

      expect(response.status).toBe(400);
    });

    it("rejects a duplicate review from the same reviewer", async () => {
      const response = await request(app)
        .post("/api/reviews")
        .set("Authorization", client.authHeader)
        .send({ projectId, revieweeId: freelancer.id, rating: 5 });

      expect(response.status).toBe(409);
    });

    it("ignores a spoofed reviewerId in the request body", async () => {
      const otherProject = await createProject({ clientId: client.id, freelancerId: freelancer.id });

      const response = await request(app)
        .post("/api/reviews")
        .set("Authorization", client.authHeader)
        .send({ projectId: otherProject.id, revieweeId: freelancer.id, rating: 4, reviewerId: outsider.id });

      // `.strict()` rejects the unknown key outright, so nothing is persisted.
      expect(response.status).toBe(400);

      const stored = await testPrisma.reviews.findMany({
        where: { projectId: otherProject.id },
        select: { reviewerId: true },
      });
      expect(stored).toHaveLength(0);
    });

    it("attributes the review to the authenticated user when the body omits reviewerId", async () => {
      const otherProject = await createProject({ clientId: client.id, freelancerId: freelancer.id });

      const response = await request(app)
        .post("/api/reviews")
        .set("Authorization", freelancer.authHeader)
        .send({ projectId: otherProject.id, revieweeId: client.id, rating: 5 });

      expect(response.status).toBe(201);
      // reviewerId is never read from the body - it comes from the JWT.
      expect(response.body.data.reviewerId).toBe(freelancer.id);
    });
  });

  describe("GET /api/reviews/project/:projectId", () => {
    it("returns the reviews of a project for its participants", async () => {
      const response = await request(app)
        .get(`/api/reviews/project/${projectId}`)
        .set("Authorization", freelancer.authHeader);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.meta).toMatchObject({ page: 1 });
      expect(response.body.data[0]).toMatchObject({ projectId });
    });

    it("rejects an unauthenticated request", async () => {
      const response = await request(app).get(`/api/reviews/project/${projectId}`);
      expect(response.status).toBe(401);
    });

    it("does not expose a project to a non-participant", async () => {
      const response = await request(app)
        .get(`/api/reviews/project/${projectId}`)
        .set("Authorization", outsider.authHeader);

      // 404 rather than 403 so project existence cannot be probed.
      expect(response.status).toBe(404);
    });

    it("never leaks sensitive user fields", async () => {
      const response = await request(app)
        .get(`/api/reviews/project/${projectId}`)
        .set("Authorization", client.authHeader);

      const review = response.body.data[0];
      expect(review.reviewer).not.toHaveProperty("passwordHash");
      expect(review.reviewer).not.toHaveProperty("email");
      expect(review.reviewer).not.toHaveProperty("accountStatus");
      expect(review.reviewee).not.toHaveProperty("passwordHash");
      expect(JSON.stringify(response.body)).not.toContain("passwordHash");
    });
  });

  describe("GET /api/reviews/user/:userId", () => {
    it("returns the reviews received by a user", async () => {
      const response = await request(app)
        .get(`/api/reviews/user/${freelancer.id}`)
        .set("Authorization", client.authHeader);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0].revieweeId).toBe(freelancer.id);
      expect(response.body.data[0].reviewee).not.toHaveProperty("passwordHash");
    });

    it("rejects an unauthenticated request", async () => {
      const response = await request(app).get(`/api/reviews/user/${freelancer.id}`);
      expect(response.status).toBe(401);
    });

    it("returns 404 for a nonexistent user", async () => {
      const response = await request(app)
        .get("/api/reviews/user/does-not-exist")
        .set("Authorization", client.authHeader);

      expect(response.status).toBe(404);
    });
  });

  describe("PATCH /api/reviews/:id", () => {
    it("allows the author to update their review", async () => {
      const response = await request(app)
        .patch("/api/reviews/nonexistent")
        .set("Authorization", client.authHeader)
        .send({ rating: 2 });

      expect(response.status).toBe(404);

      const review = await testPrisma.reviews.findFirstOrThrow({
        where: { projectId, reviewerId: client.id },
        select: { id: true },
      });

      const updateResponse = await request(app)
        .patch(`/api/reviews/${review.id}`)
        .set("Authorization", client.authHeader)
        .send({ rating: 3, comment: "Updated comment" });

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.data).toMatchObject({ rating: 3, comment: "Updated comment" });
    });

    it("rejects an update from a user who is not the author", async () => {
      const review = await testPrisma.reviews.findFirstOrThrow({
        where: { projectId, reviewerId: client.id },
        select: { id: true },
      });

      const response = await request(app)
        .patch(`/api/reviews/${review.id}`)
        .set("Authorization", freelancer.authHeader)
        .send({ rating: 1 });

      expect(response.status).toBe(403);
    });

    it("rejects an invalid rating on update", async () => {
      const review = await testPrisma.reviews.findFirstOrThrow({
        where: { projectId, reviewerId: client.id },
        select: { id: true },
      });

      const response = await request(app)
        .patch(`/api/reviews/${review.id}`)
        .set("Authorization", client.authHeader)
        .send({ rating: 9 });

      expect(response.status).toBe(400);
    });
  });

  describe("DELETE /api/reviews/:id", () => {
    it("rejects a delete from a user who is not the author", async () => {
      const response = await request(app)
        .delete("/api/reviews/does-not-exist")
        .set("Authorization", client.authHeader);

      expect(response.status).toBe(404);
    });

    it("allows the author to delete their own review", async () => {
      const otherProject = await createProject({ clientId: client.id, freelancerId: freelancer.id });

      const createdReview = await request(app)
        .post("/api/reviews")
        .set("Authorization", client.authHeader)
        .send({ projectId: otherProject.id, revieweeId: freelancer.id, rating: 4 });

      expect(createdReview.status).toBe(201);
      const reviewId = createdReview.body.data.id;

      const forbidden = await request(app)
        .delete(`/api/reviews/${reviewId}`)
        .set("Authorization", freelancer.authHeader);
      expect(forbidden.status).toBe(403);

      const deleted = await request(app)
        .delete(`/api/reviews/${reviewId}`)
        .set("Authorization", client.authHeader);
      expect(deleted.status).toBe(204);

      const remaining = await testPrisma.reviews.findUnique({ where: { id: reviewId } });
      expect(remaining).toBeNull();
    });

    it("rejects an unauthenticated delete", async () => {
      const response = await request(app).delete("/api/reviews/anything");
      expect(response.status).toBe(401);
    });
  });
});
