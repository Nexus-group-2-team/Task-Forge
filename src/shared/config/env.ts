import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_ACCESS_SECRET: z.string().min(16).default("taskforge_default_jwt_access_secret_key_min_32_characters"),
  JWT_REFRESH_SECRET: z.string().min(16).default("taskforge_default_jwt_refresh_secret_key_min_32_characters"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN_DAYS: z.coerce.number().default(7),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().default("TaskForge <onboarding@resend.dev>"),
  FRONTEND_URL: z.string().url().default("http://localhost:4000"),

  // Supabase Storage — cloud object storage for resumes and application
  // attachments. Optional so the server and test suite boot without storage
  // credentials; StorageService throws a clear 500 if an upload is attempted
  // while these are unset. The service role key is backend-only — never ship
  // it to a browser or mobile client.
  SUPABASE_URL: z.url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default("taskforge-assets"),
});


const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const env = parsed.data;

// Fail fast in production instead of silently accepting development defaults:
// the JWT fallbacks above are publicly known values, so a production deploy
// running on them would let anyone forge access tokens for any account.
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
