import { z } from "zod";

/**
 * `Report.targetType` is a free-text column in the Prisma schema, so the set of
 * reportable entities is enforced here at the application boundary.
 */
export const REPORT_TARGET_TYPES = [
  "USER",
  "JOB",
  "PROJECT",
  "APPLICATION",
  "MILESTONE",
  "REVIEW",
] as const;

export const reportTargetTypeSchema = z.enum(REPORT_TARGET_TYPES, {
  message: `targetType must be one of: ${REPORT_TARGET_TYPES.join(", ")}`,
});

/** Only terminal outcomes may be applied by a moderator. */
export const reportResolutionStatusSchema = z.enum(["RESOLVED", "DISMISSED"], {
  message: "status must be either RESOLVED or DISMISSED",
});

export const createReportSchema = z
  .object({
    targetType: reportTargetTypeSchema,
    targetId: z.string().trim().min(1, "targetId is required").max(64, "targetId is too long"),
    reason: z.string().trim().min(3, "reason must be at least 3 characters").max(300, "reason must be 300 characters or fewer"),
    description: z
      .string()
      .trim()
      .max(2000, "description must be 2000 characters or fewer")
      .optional()
      .nullable(),
  })
  .strict();

export const resolveReportSchema = z
  .object({
    status: reportResolutionStatusSchema,
    resolutionNote: z
      .string()
      .trim()
      .max(2000, "resolutionNote must be 2000 characters or fewer")
      .optional()
      .nullable(),
  })
  .strict();

export const reportIdParamSchema = z.object({
  id: z.string().trim().min(1, "id is required").max(64, "id is too long"),
});

export const reportListQuerySchema = z.object({
  status: z
    .enum(["PENDING", "RESOLVED", "DISMISSED"], { message: "status filter is invalid" })
    .optional(),
  targetType: reportTargetTypeSchema.optional(),
  page: z.coerce.number().int().min(1, "page must be 1 or greater").optional(),
  limit: z.coerce.number().int().min(1, "limit must be 1 or greater").max(100, "limit must be 100 or fewer").optional(),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;
export type ResolveReportInput = z.infer<typeof resolveReportSchema>;
export type ReportListQuery = z.infer<typeof reportListQuerySchema>;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];
