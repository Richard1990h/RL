/**
 * Fix all video issues:
 * 1. Set FAILED/PROCESSING videos with existing files to READY
 * 2. Fix videoUrl paths with /./uploads/ prefix to /uploads/
 * 3. Fix thumbnailUrl paths with /./uploads/ prefix
 */
import { PrismaClient } from "../../src/generated/prisma";
import { existsSync } from "fs";
import { join, resolve } from "path";

const prisma = new PrismaClient();
const UPLOAD_DIR = resolve(process.cwd(), process.env.UPLOAD_DIR || "../uploads");

function checkFileExists(url: string | null): boolean {
  if (!url) return false;
  // Handle both /uploads/... and /./uploads/... patterns
  const cleaned = url.replace(/^\/\.\/uploads\//, "").replace(/^\/uploads\//, "");
  const fullPath = join(UPLOAD_DIR, cleaned);
  return existsSync(fullPath);
}

function fixUrl(url: string | null): string | null {
  if (!url) return null;
  // Fix /./uploads/ to /uploads/
  return url.replace(/^\/\.\/uploads\//, "/uploads/");
}

async function main() {
  const videos = await prisma.video.findMany({
    include: { creator: { select: { username: true } } },
  });

  let fixedStatus = 0;
  let fixedVideoUrl = 0;
  let fixedThumbUrl = 0;

  for (const v of videos) {
    const updates: Record<string, unknown> = {};

    // Fix /./uploads/ prefix in videoUrl
    if (v.videoUrl && v.videoUrl.startsWith("/./uploads/")) {
      const fixed = fixUrl(v.videoUrl);
      if (fixed && checkFileExists(fixed)) {
        updates.videoUrl = fixed;
        fixedVideoUrl++;
      }
    }

    // Fix /./uploads/ prefix in thumbnailUrl
    if (v.thumbnailUrl && v.thumbnailUrl.startsWith("/./uploads/")) {
      const fixed = fixUrl(v.thumbnailUrl);
      updates.thumbnailUrl = fixed;
      fixedThumbUrl++;
    }

    // Set FAILED/PROCESSING videos to READY if they have valid video files
    if (v.status === "FAILED" || v.status === "PROCESSING") {
      const videoUrl = (updates.videoUrl as string) || v.videoUrl;
      if (videoUrl && checkFileExists(videoUrl)) {
        updates.status = "READY";
        fixedStatus++;
      }
    }

    if (Object.keys(updates).length > 0) {
      await prisma.video.update({
        where: { id: v.id },
        data: updates,
      });
      console.log(`Fixed [${v.creator.username}] "${v.title}" -> ${Object.keys(updates).join(", ")}`);
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Status fixed (FAILED/PROCESSING -> READY): ${fixedStatus}`);
  console.log(`Video URLs fixed (/./uploads/ -> /uploads/): ${fixedVideoUrl}`);
  console.log(`Thumbnail URLs fixed: ${fixedThumbUrl}`);

  // Verify final state
  const remaining = await prisma.video.findMany({
    where: { status: { not: "READY" } },
    include: { creator: { select: { username: true } } },
  });

  if (remaining.length > 0) {
    console.log(`\nRemaining non-READY videos: ${remaining.length}`);
    for (const v of remaining) {
      console.log(`  [${v.creator.username}] "${v.title}" - ${v.status}`);
    }
  } else {
    console.log(`\nAll videos are now READY!`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
