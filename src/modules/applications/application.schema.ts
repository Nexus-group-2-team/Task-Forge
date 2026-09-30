import { z } from "zod";
import { ApplicationStatus } from "@prisma/client";

export const createApplicationSchema = z.object({
  jobId: z.string().min(1, "Job ID is required"),
  coverLetter: z
    .string()
    .min(10, "Cover letter must be at least 10 characters")
    .max(2000, "Cover letter cannot exceed 2000 characters"),
  proposedBid: z.number().positive("Proposed bid must be a positive number").optional(),
  estimatedDays: z.number().int().positive("Estimated days must be a positive integer").optional(),
  resumeUrl: z.string().url("Resume URL must be a valid URL").optional(),
  attachmentUrls: z.array(z.string().url("Each attachment must be a valid URL")).optional(),
});

export const listApplicationsQuerySchema = z.object({
  status: z.nativeEnum(ApplicationStatus).optional(),
  jobId: z.string().optional(),
});

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
export type ListApplicationsQuery = z.infer<typeof listApplicationsQuerySchema>;
