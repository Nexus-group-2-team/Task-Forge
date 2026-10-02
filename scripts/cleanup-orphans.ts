import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../src/shared/config/env.js";
import { prisma } from "../src/shared/db/prisma.js";
import { toObjectPath } from "../src/shared/services/storage.service.js";

const FOLDERS = ["resumes", "attachments"] as const;

interface StoredObject {
  objectPath: string;
  publicUrl: string;
  createdAt: number | null;
  size: number | null;
}

function parseArgs(argv: string[]) {
  const prune = argv.includes("--prune");
  let graceHours = 24;

  for (const arg of argv) {
    const match = arg.match(/^--grace-hours=(\d+)$/);
    if (match) graceHours = Number(match[1]);
  }

  return { prune, graceHours };
}

function getClient(): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to sweep the storage bucket."
    );
    process.exit(1);
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Paginates storage.list() for a top-level folder. */
async function listFolder(supabase: SupabaseClient, folder: string): Promise<StoredObject[]> {
  const objects: StoredObject[] = [];
  const limit = 1000;
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase.storage
      .from(env.SUPABASE_STORAGE_BUCKET)
      .list(folder, { limit, offset });

    if (error) {
      throw new Error(`Failed to list '${folder}': ${error.message}`);
    }
    if (!data || data.length === 0) break;

    for (const entry of data) {
      // Skip folder-like entries; application assets are flat files.
      if (entry.name.endsWith("/")) continue;

      const objectPath = `${folder}/${entry.name}`;
      const metadata = entry.metadata as { size?: number; mimetype?: string } | null;
      const rawCreatedAt =
        (entry as { createdAt?: string; created_at?: string }).createdAt ??
        (entry as { created_at?: string }).created_at;

      objects.push({
        objectPath,
        publicUrl: `${env.SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(
          env.SUPABASE_STORAGE_BUCKET
        )}/${objectPath}`,
        createdAt: rawCreatedAt ? Date.parse(rawCreatedAt) : null,
        size: metadata?.size ?? null,
      });
    }

    if (data.length < limit) break;
    offset += limit;
  }

  return objects;
}

/** Object paths still referenced by at least one application row. */
async function getReferencedPaths(): Promise<Set<string>> {
  const applications = await prisma.application.findMany({
    select: { resumeUrl: true, attachmentUrls: true },
  });

  const referenced = new Set<string>();
  for (const application of applications) {
    const urls = [
      ...(application.resumeUrl ? [application.resumeUrl] : []),
      ...application.attachmentUrls,
    ];
    for (const url of urls) {
      const objectPath = toObjectPath(url);
      // toObjectPath returns the input unchanged for non-bucket URLs; only
      // bucket-hosted paths can match objects we listed above.
      if (objectPath !== url) referenced.add(objectPath);
    }
  }
  return referenced;
}

const main = async () => {
  const { prune, graceHours } = parseArgs(process.argv.slice(2));
  const supabase = getClient();

  console.log(
    `Bucket: ${env.SUPABASE_STORAGE_BUCKET} | mode: ${prune ? "PRUNE" : "dry-run"} | grace: ${hours(
      graceHours
    )}`
  );

  const referenced = await getReferencedPaths();
  const cutoff = Date.now() - graceHours * 60 * 60 * 1000;

  let orphanCount = 0;
  let skippedRecent = 0;
  let prunedCount = 0;

  for (const folder of FOLDERS) {
    const objects = await listFolder(supabase, folder);
    for (const object of objects) {
      if (referenced.has(object.objectPath)) continue;

      // Grace period: don't touch recently created objects (may be mid-upload).
      if (object.createdAt !== null && object.createdAt > cutoff) {
        skippedRecent++;
        continue;
      }

      orphanCount++;
      const age =
        object.createdAt === null
          ? "unknown age"
          : `${hours(Math.round((Date.now() - object.createdAt) / 3_600_000))} old`;
      console.log(
        `  orphan: ${object.objectPath} (${object.size ?? "?"} bytes, ${age})`
      );

      if (prune) {
        const { error } = await supabase.storage
          .from(env.SUPABASE_STORAGE_BUCKET)
          .remove([object.objectPath]);
        if (error) {
          console.error(`    delete failed: ${error.message}`);
        } else {
          prunedCount++;
        }
      }
    }
  }

  console.log(
    `\nReferenced paths: ${referenced.size} | orphans found: ${orphanCount} | recent (within grace): ${skippedRecent}`
  );
  if (!prune) {
    console.log("Dry-run only — re-run with --prune to delete the orphans above.");
  } else {
    console.log(`Deleted: ${prunedCount}/${orphanCount}`);
  }
};

/** Formats a duration expressed in whole hours. */
function hours(value: number): string {
  return `${value}h`;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
