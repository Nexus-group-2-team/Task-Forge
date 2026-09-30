import { z } from "zod";

/** CUIDs are the primary keys for every TaskForge model. */
export const idSchema = z.string().trim().min(1, "Identifier is required").max(64, "Identifier is too long");

export const ratingSchema = z
  .number({ message: "Rating must be a number" })
  .int("Rating must be an integer")
  .min(1, "Rating must be between 1 and 5")
  .max(5, "Rating must be between 1 and 5");

export const commentSchema = z
  .string()
  .trim()
  .max(2000, "Comment must be 2000 characters or fewer")
  .optional()
  .nullable();

export const createReviewSchema = z
  .object({
    projectId: idSchema,
    revieweeId: idSchema,
    rating: ratingSchema,
    comment: commentSchema,
  })
  .strict();

export const updateReviewSchema = z
  .object({
    rating: ratingSchema.optional(),
    comment: commentSchema,
  })
  .refine((data) => data.rating !== undefined || data.comment !== undefined, {
    message: "At least one of rating or comment must be provided",
  });

export const reviewIdParamSchema = z.object({
  id: idSchema,
});

export const projectReviewsParamSchema = z.object({
  projectId: idSchema,
});

export const userReviewsParamSchema = z.object({
  userId: idSchema,
});

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1, "Page must be 1 or greater").optional(),
  limit: z.coerce.number().int().min(1, "Limit must be 1 or greater").max(100, "Limit must be 100 or fewer").optional(),
});

export const reviewListQuerySchema = paginationQuerySchema;

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;
export type ReviewListQuery = z.infer<typeof reviewListQuerySchema>;
