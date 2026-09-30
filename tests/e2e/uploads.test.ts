import request from "supertest";
import { describe, expect, it, vi, beforeEach } from "vitest";
import app from "../../src/app.js";
import { createUser, cleanup, disconnect, type TestUser } from "../helpers/test-utils.js";

// Mock the storage boundary so the pipeline (Multer -> Zod -> controller ->
// response contract) is exercised without real Supabase credentials. The
// validation/rejection tests below all happen BEFORE StorageService is called,
// so they cover the unmocked paths too.
const { mockUploadFile, mockDeleteFile } = vi.hoisted(() => ({
  mockUploadFile: vi.fn(
    async (_file: unknown, folder: string) =>
      `https://mock.supabase.co/storage/v1/object/public/taskforge-assets/${folder}/mock-file.pdf`
  ),
  mockDeleteFile: vi.fn(async () => undefined),
}));

vi.mock("../../src/shared/services/storage.service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/shared/services/storage.service.js")>();
  return {
    ...actual,
    StorageService: { uploadFile: mockUploadFile, deleteFile: mockDeleteFile },
  };
});

vi.mock("../../src/shared/services/password-breach.service.js", () => ({
  PasswordBreachService: { isBreached: vi.fn().mockResolvedValue(false) },
}));

const PDF_MAGIC_PDF = Buffer.from("%PDF-1.4 fake resume content", "utf-8");

describe("Uploads API contract & integration tests", { timeout: 30000 }, () => {
  const createdUserIds: string[] = [];
  let freelancer: TestUser;
  let client: TestUser;

  it("should setup a freelancer and a client", async () => {
    freelancer = await createUser("FREELANCER");
    client = await createUser("CLIENT");
    createdUserIds.push(freelancer.id, client.id);
  });

  beforeEach(() => {
    mockUploadFile.mockClear();
  });

  it("should reject uploads without an auth token (401)", async () => {
    const res = await request(app)
      .post("/api/uploads/resume")
      .attach("resume", PDF_MAGIC_PDF, "resume.pdf");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("should reject uploads from a non-freelancer role (403)", async () => {
    const res = await request(app)
      .post("/api/uploads/resume")
      .set("Authorization", client.authHeader)
      .attach("resume", PDF_MAGIC_PDF, "resume.pdf");
    expect(res.status).toBe(403);
  });

  it("should reject a request with no file attached (400)", async () => {
    const res = await request(app)
      .post("/api/uploads/resume")
      .set("Authorization", freelancer.authHeader)
      .field("foo", "bar");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/File is required/i);
  });

  it("should reject a wrong field name via Multer LIMIT_UNEXPECTED_FILE (400)", async () => {
    const res = await request(app)
      .post("/api/uploads/resume")
      .set("Authorization", freelancer.authHeader)
      .attach("avatar", PDF_MAGIC_PDF, "resume.pdf");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/avatar/);
  });

  it("should reject a file larger than 5MB via LIMIT_FILE_SIZE (400)", async () => {
    const oversized = Buffer.alloc(6 * 1024 * 1024, 1);
    const res = await request(app)
      .post("/api/uploads/resume")
      .set("Authorization", freelancer.authHeader)
      .attach("resume", oversized, "huge.pdf");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/5MB/i);
  });

  it("should reject a disallowed MIME type for a resume (400)", async () => {
    const res = await request(app)
      .post("/api/uploads/resume")
      .set("Authorization", freelancer.authHeader)
      .attach("resume", Buffer.from("not a resume"), {
        filename: "notes.txt",
        contentType: "text/plain",
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/File validation failed/i);
    expect(res.body.errors?.[0]?.message).toMatch(/PDF, DOC, and DOCX/i);
  });

  it("should reject a disallowed MIME type for attachments (400)", async () => {
    const res = await request(app)
      .post("/api/uploads/attachments")
      .set("Authorization", freelancer.authHeader)
      .attach("attachments", Buffer.from("not an image"), {
        filename: "demo.mp4",
        contentType: "video/mp4",
      });
    expect(res.status).toBe(400);
    expect(res.body.errors?.[0]?.message).toMatch(/PDF, JPEG, PNG, and WebP/i);
  });

  it("should upload a resume and return a public URL (201)", async () => {
    const res = await request(app)
      .post("/api/uploads/resume")
      .set("Authorization", freelancer.authHeader)
      .attach("resume", PDF_MAGIC_PDF, {
        filename: "My Resume.PDF",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.url).toMatch(/^https:\/\//);
    expect(res.body.data.fileName).toBe("My Resume.PDF");
    expect(res.body.data.objectPath).toContain("resumes/");
    expect(mockUploadFile).toHaveBeenCalledTimes(1);
  });

  it("should upload multiple attachments and return URLs (201)", async () => {
    const res = await request(app)
      .post("/api/uploads/attachments")
      .set("Authorization", freelancer.authHeader)
      .attach("attachments", PDF_MAGIC_PDF, {
        filename: "case-study.pdf",
        contentType: "application/pdf",
      })
      .attach("attachments", Buffer.from("fake png bytes"), {
        filename: "design.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.files).toHaveLength(2);
    expect(res.body.data.files.every((f: { url: string }) => /^https:\/\//.test(f.url))).toBe(true);
    expect(mockUploadFile).toHaveBeenCalledTimes(2);
  });

  it("cleanup test users", async () => {
    await cleanup(createdUserIds);
    await disconnect();
  });
});
