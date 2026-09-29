import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../../src/app.js";

/**
 * Regression tests for the hardening headers configured in src/app.ts.
 * The CSP must stay strict enough that an injected payload cannot execute
 * (no inline scripts, no third-party script origins) while still matching
 * what the static frontend actually uses (same-origin scripts + inline styles).
 */
describe("Security headers", () => {
  const parseCsp = (header: string | undefined): string[] => {
    expect(header).toBeDefined();
    return header!.split(";").map((d) => d.trim()).filter(Boolean);
  };

  it("serves pages with the exact tailored Content-Security-Policy", async () => {
    const response = await request(app).get("/reset-password");
    expect(response.status).toBe(200);

    const directives = parseCsp(response.headers["content-security-policy"]);
    const expected = [
      "base-uri 'self'",
      "connect-src 'self'",
      "default-src 'self'",
      "font-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "img-src 'self' data:",
      "object-src 'none'",
      "script-src 'self'",
      "script-src-attr 'none'",
      "style-src 'self' 'unsafe-inline'",
    ];
    // Exact set match: catches both accidental relaxations (an extra
    // directive appearing) and accidental breakage (one going missing).
    expect([...directives].sort()).toEqual([...expected].sort());
  });

  it("never allows inline/external scripts (token-exfiltration guard)", async () => {
    const csp = parseCsp((await request(app).get("/")).headers["content-security-policy"]).join(";");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("script-src-attr 'none'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toContain("https:");
  });

  it("does not force HTTPS upgrades outside production (plain-HTTP dev)", async () => {
    const csp = (await request(app).get("/health")).headers["content-security-policy"];
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("sends Referrer-Policy: no-referrer so secrets never leak via Referer", async () => {
    const response = await request(app).get("/reset-password");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
  });

  it("sends the remaining hardening headers", async () => {
    const response = await request(app).get("/login");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["cross-origin-opener-policy"]).toBeDefined();
    expect(response.headers["cross-origin-resource-policy"]).toBe("same-origin");
    expect(response.headers["strict-transport-security"]).toBeDefined();
  });
});
