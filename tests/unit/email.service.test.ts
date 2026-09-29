import { afterEach, describe, expect, it, vi } from "vitest";
import { EmailService } from "../../src/shared/services/email.service.js";

/**
 * The real config module is replaced so we can flip NODE_ENV and omit the
 * Resend API key: with no key, the service warns before throwing — that
 * warning must NEVER contain the reset link (it carries the raw token)
 * when NODE_ENV is production.
 */
const envMock = vi.hoisted(() => ({
  NODE_ENV: "production",
  RESEND_API_KEY: "",
  RESEND_FROM_EMAIL: "TaskForge <onboarding@resend.dev>",
}));
vi.mock("../../src/shared/config/env.js", () => ({ env: envMock }));

const RESET_LINK = "http://localhost:4000/reset-password#token=SECRET_TOKEN_VALUE";

const loggedWarnings = (spy: { mock: { calls: unknown[][] } }): string[] =>
  spy.mock.calls.flat().map(String);

describe("EmailService logging safety", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    envMock.NODE_ENV = "production";
  });

  it("does not log the reset link when NODE_ENV is production", async () => {
    envMock.NODE_ENV = "production";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      EmailService.sendPasswordResetEmail("user@example.com", RESET_LINK)
    ).rejects.toThrow("RESEND_API_KEY is not configured");

    const logged = loggedWarnings(warn).join(" ");
    expect(logged).toContain("RESEND_API_KEY not configured");
    expect(logged).not.toContain("SECRET_TOKEN_VALUE");
    expect(logged).not.toContain("#token=");
  });

  it("still prints the reset link outside production (dev convenience)", async () => {
    envMock.NODE_ENV = "test";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      EmailService.sendPasswordResetEmail("user@example.com", RESET_LINK)
    ).rejects.toThrow("RESEND_API_KEY is not configured");

    expect(loggedWarnings(warn).join(" ")).toContain("SECRET_TOKEN_VALUE");
  });
});
