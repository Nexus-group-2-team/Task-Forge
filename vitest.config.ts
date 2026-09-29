import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // The suite runs against a remote Postgres instance, so every request pays
    // real network round-trips (auth lookup + authorization lookup per call) and
    // a single multi-request test can legitimately take tens of seconds.
    testTimeout: 60000,
    hookTimeout: 120000,
    teardownTimeout: 60000,
  },
});
