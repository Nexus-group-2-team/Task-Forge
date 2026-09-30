import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],

    // Integration tests use PostgreSQL and perform real authentication,
    // authorization, and database operations.
    testTimeout: 60000,
    hookTimeout: 120000,
    teardownTimeout: 60000,

    // Tests share database state, so avoid running test files in parallel.
    fileParallelism: false,
  },
});