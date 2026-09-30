import { createHash } from "crypto";

const RANGE_API_BASE = "https://api.pwnedpasswords.com/range";
const TIMEOUT_MS = 3000;

export class PasswordBreachService {
  /** Returns true when the password appears in known breach data (count > 0). */
  static async isBreached(password: string): Promise<boolean> {
    try {
      const sha1 = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
      const prefix = sha1.slice(0, 5);
      const suffix = sha1.slice(5);

      const response = await fetch(`${RANGE_API_BASE}/${prefix}`, {
        // Constant-size responses (padded entries carry count 0 and never match).
        headers: { "Add-Padding": "true" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!response.ok) {
        console.warn(`[PasswordBreachService] range API returned HTTP ${response.status}; skipping breach check`);
        return false;
      }

      const body = await response.text();
      for (const line of body.split(/\r?\n/)) {
        const [candidate, rawCount] = line.split(":");
        if (!candidate || !rawCount) continue;
        if (candidate.trim().toUpperCase() === suffix && Number.parseInt(rawCount, 10) > 0) {
          return true;
        }
      }
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("[PasswordBreachService] breach check unavailable, skipping:", message);
      return false;
    }
  }
}
