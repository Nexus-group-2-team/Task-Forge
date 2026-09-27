import { z } from "zod";

export const updateProjectSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(100).optional(),
});

export const updateProjectStatusSchema = z.object({
  status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED"]),
});

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type UpdateProjectStatusInput = z.infer<typeof updateProjectStatusSchema>;

