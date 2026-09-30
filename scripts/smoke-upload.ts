import { randomUUID } from "node:crypto";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { prisma } from "../src/shared/db/prisma.js";
import { env } from "../src/shared/config/env.js";
import { StorageService, toObjectPath } from "../src/shared/services/storage.service.js";

const PDF_BYTES = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  "utf-8"
);
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

let userId = "";
let uploadedPaths: string[] = [];

const main = async () => {
  console.log("Bucket:", env.SUPABASE_STORAGE_BUCKET, "| Project:", env.SUPABASE_URL);

  const email = `smoke.${randomUUID().slice(0, 8)}@taskforge.test`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: "smoke-test-not-a-real-credential",
      role: "FREELANCER",
      accountStatus: "ACTIVE",
      profile: { create: { fullName: "Smoke Tester" } },
    },
    select: { id: true, email: true, role: true },
  });
  userId = user.id;
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, env.JWT_ACCESS_SECRET, {
    expiresIn: "15m",
  });

  // 1) Resume upload -> expect 201 + public URL
  const resumeRes = await request(app)
    .post("/api/uploads/resume")
    .set("Authorization", `Bearer ${token}`)
    .attach("resume", PDF_BYTES, { filename: "smoke-resume.pdf", contentType: "application/pdf" });
  console.log("POST /api/uploads/resume ->", resumeRes.status, JSON.stringify(resumeRes.body.data ?? resumeRes.body.message));
  if (resumeRes.status !== 201) throw new Error("resume upload failed");
  const resumeUrl: string = resumeRes.body.data.url;

  // 2) Attachments upload (PDF + PNG) -> expect 201 + 2 URLs
  const attachRes = await request(app)
    .post("/api/uploads/attachments")
    .set("Authorization", `Bearer ${token}`)
    .attach("attachments", PDF_BYTES, { filename: "case-study.pdf", contentType: "application/pdf" })
    .attach("attachments", PNG_1x1, { filename: "design.png", contentType: "image/png" });
  console.log("POST /api/uploads/attachments ->", attachRes.status, JSON.stringify(attachRes.body.data?.files?.map((f: { url: string }) => f.url) ?? attachRes.body.message));
  if (attachRes.status !== 201) throw new Error("attachments upload failed");

  const urls: string[] = [resumeUrl, ...attachRes.body.data.files.map((f: { url: string }) => f.url)];
  uploadedPaths = urls.map(toObjectPath);

  // 3) Fetch each public URL back from the bucket and verify content length
  for (const [i, url] of urls.entries()) {
    const get = await fetch(url);
    const buf = Buffer.from(await get.arrayBuffer());
    const expected = i === 2 ? PNG_1x1 : PDF_BYTES; // index 2 is the PNG
    const ok = get.status === 200 && buf.equals(expected);
    console.log(`public URL #${i + 1}: HTTP ${get.status}, ${buf.length} bytes, bytes-match=${buf.equals(expected)} ${ok ? "OK" : ""}`);
    if (!ok) throw new Error(`failed to verify public URL: ${url}`);
  }

  // 4) Cleanup: remove uploaded objects + temp user
  for (const p of uploadedPaths) await StorageService.deleteFile(p);
  console.log("deleted", uploadedPaths.length, "objects from bucket");

  console.log("\nSMOKE TEST PASSED: full pipeline works against the real Supabase bucket.");
};

main()
  .catch((err) => {
    console.error("\nSMOKE TEST FAILED:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.$disconnect();
  });
