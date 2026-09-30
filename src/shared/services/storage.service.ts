import crypto from "node:crypto";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";
import { InternalServerError } from "../errors/app-error.js";
import { logger } from "../utils/logger.js";

export type StorageFolder = "resumes" | "attachments";

let cachedClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new InternalServerError(
      "File uploads are not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment."
    );
  }

  cachedClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  return cachedClient;
}

/** Extracts the `<folder>/<object>` path from a public URL of our bucket. */
export function toObjectPath(publicUrl: string): string {
  const bucketPrefix = `${env.SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(
    env.SUPABASE_STORAGE_BUCKET
  )}/`;
  return publicUrl.startsWith(bucketPrefix)
    ? decodeURIComponent(publicUrl.slice(bucketPrefix.length))
    : publicUrl;
}

export class StorageService {
  static async uploadFile(file: Express.Multer.File, folder: StorageFolder): Promise<string> {
    const supabase = getSupabaseClient();
    const fileExtension = path.extname(file.originalname).toLowerCase();
    const objectPath = `${folder}/${crypto.randomUUID()}${fileExtension}`;

    const { data, error } = await supabase.storage
      .from(env.SUPABASE_STORAGE_BUCKET)
      .upload(objectPath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      throw new InternalServerError(`Cloud storage upload failed: ${error.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from(env.SUPABASE_STORAGE_BUCKET)
      .getPublicUrl(data.path);

    return publicUrlData.publicUrl;
  }

  static async deleteFile(objectPath: string): Promise<void> {
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.storage
        .from(env.SUPABASE_STORAGE_BUCKET)
        .remove([objectPath]);

      if (error) {
        logger.error(`Failed to delete asset '${objectPath}' from bucket: ${error.message}`);
      }
    } catch (error) {
      logger.error(`Failed to delete asset '${objectPath}' from bucket:`, error);
    }
  }
}
