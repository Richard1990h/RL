/**
 * Migration Script: Move all videos from ../uploads to L:/.youtube/{email}/videos/
 *
 * This script:
 * 1. Queries all videos from DB with their creator emails
 * 2. Moves video folders from the old location to email-based paths on L: drive
 * 3. Moves thumbnails to user pictures folders
 * 4. Updates all DB paths (videoUrl, thumbnailUrl, storagePath, resolutions)
 * 5. Moves _chunks to L:/.youtube/_chunks
 *
 * Run: npx tsx scripts/migrate-videos.ts
 */

import { PrismaClient } from "../../src/generated/prisma";
import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";

const prisma = new PrismaClient();

const OLD_UPLOADS_DIR = path.resolve("C:/Users/Richard/Desktop/Rally Live/uploads");
const NEW_UPLOADS_DIR = "L:/.youtube";

interface MigrationResult {
  videoId: string;
  status: "moved" | "skipped" | "error";
  message: string;
}

async function moveDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await moveDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

function replaceUploadPath(url: string, email: string, uuid: string): string {
  // /uploads/{uuid}/file.mp4 → /uploads/{email}/videos/{uuid}/file.mp4
  return url.replace(`/uploads/${uuid}/`, `/uploads/${email}/videos/${uuid}/`);
}

async function main() {
  console.log("=== Video Migration Script ===");
  console.log(`Old uploads dir: ${OLD_UPLOADS_DIR}`);
  console.log(`New uploads dir: ${NEW_UPLOADS_DIR}`);
  console.log("");

  // 1. Query all videos with creator info
  const videos = await prisma.video.findMany({
    include: {
      creator: {
        select: {
          id: true,
          email: true,
          username: true,
        },
      },
    },
  });

  console.log(`Found ${videos.length} videos to migrate`);
  const results: MigrationResult[] = [];

  // 2. Create user folder structures
  const userEmails = [...new Set<string>(videos.map((v: any) => v.creator.email as string))];
  for (const email of userEmails) {
    const userDir = path.join(NEW_UPLOADS_DIR, email);
    for (const sub of ["videos", "streams", "conversations", "pictures", "_audit"]) {
      await fs.mkdir(path.join(userDir, sub), { recursive: true });
    }
    console.log(`Created folder structure for ${email}`);
  }

  // 3. Migrate each video
  for (const video of videos) {
    const email = video.creator.email;

    try {
      // Extract UUID from video URL or storagePath
      // videoUrl format: /uploads/{uuid}/processed_720_xxxxx.mp4
      let uuid: string | null = null;

      if (video.videoUrl) {
        const match = video.videoUrl.match(/\/uploads\/([^/]+)\//);
        if (match) uuid = match[1];
      }

      if (!uuid && video.storagePath) {
        // storagePath might be absolute: C:\...\uploads\{uuid}\file.mp4
        const normalized = video.storagePath.replace(/\\/g, "/");
        const match = normalized.match(/uploads\/([^/]+)\//);
        if (match) uuid = match[1];
      }

      if (!uuid) {
        results.push({ videoId: video.id, status: "skipped", message: "Could not determine UUID from videoUrl or storagePath" });
        continue;
      }

      // Check if already migrated (path contains email)
      if (video.videoUrl?.includes(`/${email}/videos/`)) {
        results.push({ videoId: video.id, status: "skipped", message: "Already migrated" });
        continue;
      }

      const oldDir = path.join(OLD_UPLOADS_DIR, uuid);
      const newDir = path.join(NEW_UPLOADS_DIR, email, "videos", uuid);

      // Move files
      if (existsSync(oldDir)) {
        await moveDir(oldDir, newDir);
        console.log(`  Moved ${uuid} → ${email}/videos/${uuid}/`);
      } else {
        console.log(`  Source dir not found: ${oldDir} (may already be moved)`);
      }

      // Update DB paths
      const updateData: Record<string, unknown> = {};

      if (video.videoUrl) {
        updateData.videoUrl = replaceUploadPath(video.videoUrl, email, uuid);
      }

      if (video.storagePath) {
        // Update storagePath to new absolute location
        const fileName = path.basename(video.storagePath);
        updateData.storagePath = path.join(newDir, fileName);
      }

      if (video.thumbnailUrl) {
        // Move thumbnail: /uploads/thumbnails/{file} → /uploads/{email}/pictures/{file}
        const thumbMatch = video.thumbnailUrl.match(/\/uploads\/thumbnails\/(.+)$/);
        if (thumbMatch) {
          const thumbFileName = thumbMatch[1];
          const oldThumbPath = path.join(OLD_UPLOADS_DIR, "thumbnails", thumbFileName);
          const newThumbPath = path.join(NEW_UPLOADS_DIR, email, "pictures", thumbFileName);

          if (existsSync(oldThumbPath)) {
            await fs.mkdir(path.dirname(newThumbPath), { recursive: true });
            await fs.copyFile(oldThumbPath, newThumbPath);
          }

          updateData.thumbnailUrl = `/uploads/${email}/pictures/${thumbFileName}`;
        } else {
          // Thumbnail might be in the video folder itself
          const thumbUuidMatch = video.thumbnailUrl.match(/\/uploads\/([^/]+)\//);
          if (thumbUuidMatch) {
            updateData.thumbnailUrl = replaceUploadPath(video.thumbnailUrl, email, thumbUuidMatch[1]);
          }
        }
      }

      // Update resolutions JSON
      if (video.resolutions && Array.isArray(video.resolutions)) {
        const updatedResolutions = (video.resolutions as any[]).map((r: any) => {
          if (r.url && typeof r.url === "string") {
            return { ...r, url: replaceUploadPath(r.url, email, uuid!) };
          }
          return r;
        });
        updateData.resolutions = updatedResolutions;
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.video.update({
          where: { id: video.id },
          data: updateData,
        });
      }

      results.push({ videoId: video.id, status: "moved", message: `Moved to ${email}/videos/${uuid}/` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ videoId: video.id, status: "error", message: msg });
      console.error(`  ERROR migrating video ${video.id}: ${msg}`);
    }
  }

  // 4. Move _chunks directory
  const oldChunksDir = path.join(OLD_UPLOADS_DIR, "_chunks");
  const newChunksDir = path.join(NEW_UPLOADS_DIR, "_chunks");
  if (existsSync(oldChunksDir)) {
    try {
      await moveDir(oldChunksDir, newChunksDir);
      console.log("\nMoved _chunks directory");
    } catch (err) {
      console.error("Failed to move _chunks:", err);
    }
  }

  // 5. Summary
  const moved = results.filter((r) => r.status === "moved").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errors = results.filter((r) => r.status === "error").length;

  console.log("\n=== Migration Complete ===");
  console.log(`  Moved: ${moved}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors: ${errors}`);

  if (errors > 0) {
    console.log("\nErrors:");
    for (const r of results.filter((r) => r.status === "error")) {
      console.log(`  ${r.videoId}: ${r.message}`);
    }
  }

  // 6. Verification — check that all migrated videos are accessible
  console.log("\n=== Verifying migrated files ===");
  let verified = 0;
  let missing = 0;
  for (const r of results.filter((r) => r.status === "moved")) {
    const video = await prisma.video.findUnique({ where: { id: r.videoId } });
    if (video?.storagePath && existsSync(video.storagePath)) {
      verified++;
    } else {
      missing++;
      console.log(`  MISSING: ${r.videoId} — ${video?.storagePath}`);
    }
  }
  console.log(`  Verified: ${verified}/${moved}`);
  if (missing > 0) {
    console.log(`  Missing: ${missing}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
