import { z } from "zod";

export const updateProjectStatusSchema = z.object({
  status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED"]),
});

export type UpdateProjectStatusInput = z.infer<typeof updateProjectStatusSchema>;
