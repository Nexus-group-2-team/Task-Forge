import { z } from "zod";
import { MAX_FILE_SIZE_BYTES } from "../../shared/config/multer.js";

const MAX_FILE_SIZE_MESSAGE = "File size must not exceed 5MB";

/** Resumes: PDF or Word documents only. */
export const resumeFileSchema = z.object({
  size: z.number().max(MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MESSAGE),
  mimetype: z
    .string()
    .refine(
      (type) =>
        [
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ].includes(type),
      "Only PDF, DOC, and DOCX files are allowed"
    ),
});

/** Attachments: portfolio/case-study PDFs and images. */
export const attachmentFileSchema = z.object({
  size: z.number().max(MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MESSAGE),
  mimetype: z
    .string()
    .refine(
      (type) =>
        ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(type),
      "Only PDF, JPEG, PNG, and WebP files are allowed"
    ),
});

/** Upper bound for a single multi-file attachments request. */
export const MAX_ATTACHMENT_COUNT = 5;

export type ResumeFileInput = z.infer<typeof resumeFileSchema>;
export type AttachmentFileInput = z.infer<typeof attachmentFileSchema>;
