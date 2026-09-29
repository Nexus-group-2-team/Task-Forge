import { afterEach, describe, expect, it, vi } from "vitest";
import { PasswordBreachService } from "../../src/shared/services/password-breach.service.js";

/**
 * SHA-1 of the literal password "password" is the well-known constant
 * 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8, so the k-anonymity prefix used in
 * assertions is verified independently of the implementation.
 */
const KNOWN_SHA1 = {
  prefix: "5BAA6",
  suffix: "1E4C9B93F3F0682250B6CF8331B7EE68FD8",
};

function stubFetch(body: string, ok = true, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({ ok, status, text: async () => body });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PasswordBreachService (HIBP k-anonymity range API)", () => {
  it("queries only the 5-char SHA-1 prefix, never the password or full hash", async () => {
    const fetchMock = stubFetch("");

    await PasswordBreachService.isBreached("password");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${KNOWN_SHA1.prefix}`);
    expect(url).not.toContain(KNOWN_SHA1.suffix);
    expect(JSON.stringify(fetchMock.mock.calls[0]![1])).toContain("Add-Padding");
  });

  it("returns true when the suffix matches with a non-zero count", async () => {
    stubFetch(`00000000000000000000000000000000000A:7\n${KNOWN_SHA1.suffix}:4242\n`);

    expect(await PasswordBreachService.isBreached("password")).toBe(true);
  });

  it("is case-insensitive on the returned suffix", async () => {
    stubFetch(`${KNOWN_SHA1.suffix.toLowerCase()}:4242`);

    expect(await PasswordBreachService.isBreached("password")).toBe(true);
  });

  it("returns false when the suffix matches only a padded (count 0) entry", async () => {
    stubFetch(`${KNOWN_SHA1.suffix}:0`);

    expect(await PasswordBreachService.isBreached("password")).toBe(false);
  });

  it("returns false when the suffix is not in the range at all", async () => {
    stubFetch("00000000000000000000000000000000000A:12\n11111111111111111111111111111111111B:3");

    expect(await PasswordBreachService.isBreached("password")).toBe(false);
  });

  it("fails open (false) when the API returns an HTTP error", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    stubFetch("", false, 503);

    expect(await PasswordBreachService.isBreached("password")).toBe(false);
    expect(console.warn).toHaveBeenCalled();
  });

  it("fails open (false) when the network is unavailable", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    expect(await PasswordBreachService.isBreached("password")).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(
      "[PasswordBreachService] breach check unavailable, skipping:",
      "network down"
    );
  });
});
