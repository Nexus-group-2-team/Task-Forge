import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../src/app.js";

describe("Health endpoint", () => {
  it("returns API health status", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe("TaskForge API is running");
  });
});
