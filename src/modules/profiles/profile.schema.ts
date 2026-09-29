import { z } from "zod";

export const updateProfileSchema = z.object({
  fullName: z.string().min(2).optional(),
  bio: z.string().nullable().optional(),
  headline: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  portfolioUrl: z.string().url("Must be a valid URL").nullable().or(z.literal("")).optional(),
  experienceYears: z.number().int().min(0).optional(),
});

export const updateSkillsSchema = z.object({
  skills: z.array(z.string().min(1, "Skill name cannot be empty")),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdateSkillsInput = z.infer<typeof updateSkillsSchema>;
