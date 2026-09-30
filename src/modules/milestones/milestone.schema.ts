import { z } from "zod";

const dueDateSchema = z
  .string()
  .refine((val) => !Number.isNaN(Date.parse(val)), "dueDate must be a valid date string");

export const createMilestoneBodySchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  dueDate: dueDateSchema.optional(),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]).optional(),
});

export const updateMilestoneBodySchema = z
  .object({
    title: z.string().min(1, "Title is required").optional(),
    description: z.string().optional(),
    dueDate: dueDateSchema.optional(),
    status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]).optional(),
  })
  .strict();

export const milestoneIdParamSchema = z.object({
  id: z.string().min(1, "Milestone ID is required"),
});

export const projectIdParamSchema = z.object({
  projectId: z.string().min(1, "Project ID is required"),
});
