import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number(),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRES_IN: z.string(),
  JWT_REFRESH_EXPIRES_IN_DAYS: z.coerce.number(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string(),
  FRONTEND_URL: z.string().url(),

  // Supabase Storage — cloud object storage for resumes and application attachments. 
  SUPABASE_URL: z.url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string(),

  STRICT_UPLOAD_URLS: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const env = parsed.data;

if (env.NODE_ENV === "production") {
  const usesKnownDefault = (value: string) => value.startsWith("taskforge_default");
  if (!process.env.JWT_ACCESS_SECRET || usesKnownDefault(env.JWT_ACCESS_SECRET)) {
    console.error("JWT_ACCESS_SECRET must be set to a unique value in production.");
    process.exit(1);
  }
  if (!process.env.JWT_REFRESH_SECRET || usesKnownDefault(env.JWT_REFRESH_SECRET)) {
    console.error("JWT_REFRESH_SECRET must be set to a unique value in production.");
    process.exit(1);
  }
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    console.error("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values.");
    process.exit(1);
  }
  if (!env.RESEND_API_KEY) {
    console.warn("[env] RESEND_API_KEY is not set — password reset emails will not be delivered.");
  }
}
