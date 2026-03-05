/**
 * Generate thumbnails for all videos that are missing them.
 * Uses ffmpeg to extract a frame at 25% of the video duration.
 */
import { PrismaClient } from "../../src/generated/prisma";
import { existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { execSync } from "child_process";
import { v4 as uuidv4 } from "uuid";

const prisma = new PrismaClient();
const UPLOAD_DIR = resolve(process.cwd(), process.env.UPLOAD_DIR || "../uploads");
const THUMB_DIR = join(UPLOAD_DIR, "thumbnails");

// Ensure thumbnails directory exists
mkdirSync(THUMB_DIR, { recursive: true });

function getVideoDuration(filePath: string): number {
  try {
    const result = execSync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`,
      { encoding: "utf-8", timeout: 30000 }
    ).trim();
    return parseFloat(result) || 0;
  } catch {
    return 0;
  }
}

function generateThumbnail(videoPath: string, outputPath: string, seekSeconds: number): boolean {
  // Try multiple command variants - old ffmpeg versions may not support all options
  const commands = [
    // Try with scale filter first (modern ffmpeg)
    `ffmpeg -y -ss ${seekSeconds} -i "${videoPath}" -vframes 1 -q:v 2 -vf "scale=640:-2" "${outputPath}"`,
    // Without scale filter
    `ffmpeg -y -ss ${seekSeconds} -i "${videoPath}" -vframes 1 -q:v 2 "${outputPath}"`,
    // Most basic: input-seeking, single frame output
    `ffmpeg -y -i "${videoPath}" -ss ${seekSeconds} -vframes 1 "${outputPath}"`,
    // Absolute minimal
    `ffmpeg -y -i "${videoPath}" -vframes 1 "${outputPath}"`,
  ];

  for (const cmd of commands) {
    try {
      execSync(cmd, { encoding: "utf-8", timeout: 60000, stdio: "pipe" });
      if (existsSync(outputPath)) return true;
    } catch {
      // Try next command variant
    }
  }
  return false;
}

function resolveVideoPath(videoUrl: string): string | null {
  const cleaned = videoUrl.replace(/^\/uploads\//, "");
  const fullPath = join(UPLOAD_DIR, cleaned);
  if (existsSync(fullPath)) return fullPath;
  return null;
}

async function main() {
  // Find all videos without thumbnails
  const videos = await prisma.video.findMany({
    where: {
      OR: [
        { thumbnailUrl: null },
        { thumbnailUrl: "" },
      ],
    },
    include: { creator: { select: { username: true } } },
  });

  console.log(`Found ${videos.length} videos without thumbnails.\n`);

  if (videos.length === 0) {
    console.log("Nothing to do!");
    await prisma.$disconnect();
    return;
  }

  let generated = 0;
  let failed = 0;

  for (const video of videos) {
    const prefix = `[${video.creator.username}] "${video.title}"`;

    if (!video.videoUrl) {
      console.log(`  SKIP (no videoUrl): ${prefix}`);
      failed++;
      continue;
    }

    const videoPath = resolveVideoPath(video.videoUrl);
    if (!videoPath) {
      console.log(`  SKIP (file not found): ${prefix} -> ${video.videoUrl}`);
      failed++;
      continue;
    }

    // Get duration and seek to 25%
    const duration = getVideoDuration(videoPath);
    const seekTime = duration > 2 ? duration * 0.25 : 0;

    // Generate thumbnail
    const thumbId = uuidv4();
    const thumbFileName = `${thumbId}.jpg`;
    const thumbPath = join(THUMB_DIR, thumbFileName);

    console.log(`  Generating: ${prefix} (seek=${seekTime.toFixed(1)}s)...`);

    const success = generateThumbnail(videoPath, thumbPath, seekTime);

    if (success) {
      const thumbnailUrl = `/uploads/thumbnails/${thumbFileName}`;
      await prisma.video.update({
        where: { id: video.id },
        data: { thumbnailUrl },
      });
      generated++;
      console.log(`    -> OK: ${thumbnailUrl}`);
    } else {
      // Try again at 0 seconds (first frame)
      console.log(`    -> Retry at 0s...`);
      const retrySuccess = generateThumbnail(videoPath, thumbPath, 0);
      if (retrySuccess) {
        const thumbnailUrl = `/uploads/thumbnails/${thumbFileName}`;
        await prisma.video.update({
          where: { id: video.id },
          data: { thumbnailUrl },
        });
        generated++;
        console.log(`    -> OK (first frame): ${thumbnailUrl}`);
      } else {
        console.log(`    -> FAILED`);
        failed++;
      }
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Generated: ${generated}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${videos.length}`);

  // Verify remaining
  const stillMissing = await prisma.video.count({
    where: {
      OR: [
        { thumbnailUrl: null },
        { thumbnailUrl: "" },
      ],
    },
  });
  console.log(`\nVideos still without thumbnails: ${stillMissing}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
