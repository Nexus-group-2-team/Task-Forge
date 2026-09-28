import crypto from "crypto";
import { prisma } from "../src/shared/db/prisma.js";

const token = process.argv[2];
if (!token) {
  console.error("Usage: npx tsx scripts/verify-reset-token.ts <raw-token>");
  process.exit(1);
}

const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
const record = await prisma.passwordResetToken.findUnique({
  where: { tokenHash },
  include: { user: { select: { email: true, accountStatus: true } } },
});

if (!record) {
  console.log("RESULT: INVALID — no token row found (fake/expired-link token)");
} else if (record.usedAt) {
  console.log(`RESULT: ALREADY USED at ${record.usedAt.toISOString()}`);
} else if (record.expiresAt < new Date()) {
  console.log(`RESULT: EXPIRED at ${record.expiresAt.toISOString()}`);
} else {
  console.log(
    `RESULT: VALID — user=${record.user.email} status=${record.user.accountStatus} expires=${record.expiresAt.toISOString()} (usable until then)`
  );
}

await prisma.$disconnect();
