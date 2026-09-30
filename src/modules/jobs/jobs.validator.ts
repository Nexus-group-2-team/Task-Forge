import { z } from "zod";

/** Mirrors the `JobStatus` enum declared in prisma/schema.prisma. */
const jobStatusSchema = z.enum(["DRAFT", "OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);

/**
 * Unrefined base so `updateJobSchema` can call `.partial()`: in Zod v4 `.partial()`
 * throws on object schemas that already carry refinements.
 *
 * `ownerId` is deliberately absent — ownership is always derived from the
 * authenticated principal in the controller, never from client input.
 */
const baseJobSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Title should be at least 3 characters long!")
      .max(100, "Title must not exceed 100 characters!"),
    description: z.string().trim().min(25, "Description should be at least 25 characters long!"),
    status: jobStatusSchema.default("DRAFT"),
    skillIds: z.array(z.string().trim().min(1)).max(20, "You can attach at most 20 skills").optional(),
    minBudget: z.number().int().positive().optional(),
    maxBudget: z.number().int().positive().optional(),
    deadline: z
      .coerce.date()
      .refine((date) => date > new Date(), { message: "Deadline cannot be a past date!" })
      .optional(),
  })
  .strict();

const budgetRangeIsOrdered = (data: {
  minBudget?: number;
  maxBudget?: number;
}): boolean => !data.minBudget || !data.maxBudget || data.minBudget <= data.maxBudget;

export const createJobSchema = baseJobSchema.refine(budgetRangeIsOrdered, {
  message: "minBudget must be less than or equal to maxBudget",
  path: ["minBudget"],
});

export const updateJobSchema = baseJobSchema.partial().refine(budgetRangeIsOrdered, {
  message: "minBudget must be less than or equal to maxBudget",
  path: ["minBudget"],
});

export const querySchema = z
  .object({
    page: z.coerce.number().int().positive("page must be 1 or greater").default(1),
    limit: z.coerce
      .number()
      .int()
      .min(3, "No less than 3 elements are allowed!")
      .max(100, "No more than 100 elements are allowed!")
      .default(20),
    status: jobStatusSchema.optional(),
    minBudget: z.coerce.number().int().positive().optional(),
    maxBudget: z.coerce.number().int().positive().optional(),
    title: z
      .string()
      .min(5, "No less than 5 characters!")
      .max(100, "No more than 100 characters!")
      .optional(),
    description: z.string().min(10).max(1000).optional(),
  })
  .refine(budgetRangeIsOrdered, {
    message: "minBudget must be less than or equal to maxBudget",
    path: ["minBudget"],
  });

export const createSkillSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(5, "Name should be at least 5 characters long!")
      .max(100, "Name must not exceed 100 characters!"),
    categoryId: z.string().trim().min(1).optional(),
  })
  .strict();

export const createCategorySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(5, "Name should be at least 5 characters long!")
      .max(100, "Name must not exceed 100 characters!"),
    description: z.string().trim().min(10).max(1000).optional(),
  })
  .strict();

export const jobIdParamSchema = z.object({
  id: z.string().trim().min(1, "id is required").max(64, "id is too long"),
});

<<<<<<< HEAD
export const skillIdParamSchema = z.object({
  id: z.string().trim().min(1, "id is required").max(64, "id is too long"),
});

/** Bounded page/limit shared by every taxonomy listing. */
const paginationShape = {
  page: z.coerce.number().int().positive("page must be 1 or greater").default(1),
  limit: z.coerce
    .number()
    .int()
    .min(3, "No less than 3 elements are allowed!")
    .max(100, "No more than 100 elements are allowed!")
    .default(20),
};

export const skillsQuerySchema = z.object({
  ...paginationShape,
  name: z.string().trim().min(1).max(100).optional(),
  categoryId: z.string().trim().min(1).max(64).optional(),
});

=======
>>>>>>> df1f762 (fix(jobs): complete jobs module and e2e coverage)
export type CreateJobInput = z.infer<typeof createJobSchema>;
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
export type JobListQuery = z.infer<typeof querySchema>;
export type CreateSkillInput = z.infer<typeof createSkillSchema>;
<<<<<<< HEAD
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type SkillListQuery = z.infer<typeof skillsQuerySchema>;
=======
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
>>>>>>> df1f762 (fix(jobs): complete jobs module and e2e coverage)
