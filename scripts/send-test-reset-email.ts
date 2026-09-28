/**
 * Live Resend delivery test — sends a REAL password reset email.
 *
 * Usage:
 *   npx tsx scripts/send-test-reset-email.ts bekamyoseph1@gmail.com
 *
 * What it verifies:
 *   1. RESEND_API_KEY is loaded from .env and accepted by Resend (401 otherwise).
 *   2. RESEND_FROM_EMAIL is allowed for this key (sandbox restriction otherwise).
 *   3. The email is accepted for delivery -> prints the Resend message id,
 *      which you can then track under https://resend.com/logs
 */
import { EmailService } from "../src/shared/services/email.service.js";
import { env } from "../src/shared/config/env.js";

async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error("Usage: npx tsx scripts/send-test-reset-email.ts <recipient-email>");
    process.exit(1);
  }

  const demoToken = "a".repeat(64);
  const resetLink = `${env.FRONTEND_URL}/reset-password?token=${demoToken}`;

  console.log(`From   : ${env.RESEND_FROM_EMAIL}`);
  console.log(`To     : ${to}`);
  console.log(`API key: ${env.RESEND_API_KEY ? env.RESEND_API_KEY.slice(0, 6) + "..." + env.RESEND_API_KEY.slice(-4) : "MISSING"}`);
  console.log(`Link   : ${resetLink}`);
  console.log("---");

  try {
    const messageId = await EmailService.sendPasswordResetEmail(to, resetLink, "Test User");
    console.log("SUCCESS: Resend accepted the email.");
    console.log(`Message id: ${messageId}`);
    console.log("Track delivery status at: https://resend.com/logs");
  } catch (err) {
    console.error("FAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
