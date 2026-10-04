import { z } from "zod";
import { ApplicationStatus } from "../../generated/prisma/enums.js";

// Only http(s) URLs are accepted: blocks javascript:, data:, ftp: schemes that
// could become an XSS/content-spoofing vector when rendered as links.
const httpUrl = z
  .string()
  .url("Must be a valid URL")
  .regex(/^https?:\/\//, "URL must start with http:// or https://");

export const createApplicationSchema = z.object({
  jobId: z.string().min(1, "Job ID is required"),
  coverLetter: z
    .string()
    .min(10, "Cover letter must be at least 10 characters")
    .max(2000, "Cover letter cannot exceed 2000 characters"),
  proposedBid: z
    .number()
    .positive("Proposed bid must be a positive number")
    .max(100_000_000, "Proposed bid is unreasonably large")
    .optional(),
  estimatedDays: z
    .number()
    .int()
    .positive("Estimated days must be a positive integer")
    .max(1825, "Estimated days cannot exceed 1825 (5 years)")
    .optional(),
  resumeUrl: httpUrl.optional(),
  // Matches the Uploads Module limit: POST /api/uploads/attachments accepts at most 5 files.
  attachmentUrls: z
    .array(httpUrl, { message: "Each attachment must be a valid URL" })
    .max(5, "A maximum of 5 attachments is allowed")
    .optional(),
});

export const listApplicationsQuerySchema = z.object({
  status: z.nativeEnum(ApplicationStatus).optional(),
  jobId: z.string().optional(),
});

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
export type ListApplicationsQuery = z.infer<typeof listApplicationsQuerySchema>;
