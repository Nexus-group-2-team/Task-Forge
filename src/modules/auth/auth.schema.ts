import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .email("Invalid email address")
  .max(254)
  .transform((val) => val.toLowerCase());

export const registerSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(128, "Password cannot exceed 128 characters"),
  fullName: z.string().trim().min(2, "Full name must be at least 2 characters"),
  role: z.enum(["CLIENT", "FREELANCER"]).default("FREELANCER"),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required").max(128),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

export const updateUserStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED", "DEACTIVATED"]),
});

export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;

