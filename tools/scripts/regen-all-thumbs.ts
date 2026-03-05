/**
 * Regenerate ALL thumbnails using modern ffmpeg 8.0.1
 * - Extracts a frame at 25% of video duration
 * - Scales to 640px wide with proper aspect ratio
 * - Updates database with new thumbnail URLs
 */
import { PrismaClient } from "../../src/generated/prisma";
import { existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { execSync } from "child_process";
import { v4 as uuidv4 } from "uuid";

const prisma = new PrismaClient();
const UPLOAD_DIR = resolve(process.cwd(), process.env.UPLOAD_DIR || "../uploads");
const THUMB_DIR = join(UPLOAD_DIR, "thumbnails");
const FFMPEG = "C:/Users/Richard/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.0.1-full_build/bin/ffmpeg.exe";
const FFPROBE = "C:/Users/Richard/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.0.1-full_build/bin/ffprobe.exe";

mkdirSync(THUMB_DIR, { recursive: true });

function getVideoDuration(filePath: string): number {
  try {
    const result = execSync(
      `"${FFPROBE}" -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`,
      { encoding: "utf-8", timeout: 30000 }
    ).trim();
    return parseFloat(result) || 0;
  } catch {
    return 0;
  }
}

function generateThumbnail(videoPath: string, outputPath: string, seekSeconds: number): boolean {
  try {
    execSync(
      `"${FFMPEG}" -y -ss ${seekSeconds} -i "${videoPath}" -frames:v 1 -q:v 2 -vf "scale=640:-2" -update 1 "${outputPath}"`,
      { encoding: "utf-8", timeout: 60000, stdio: "pipe" }
    );
    return existsSync(outputPath);
  } catch {
    // Fallback without scale
    try {
      execSync(
        `"${FFMPEG}" -y -ss ${seekSeconds} -i "${videoPath}" -frames:v 1 -q:v 2 -update 1 "${outputPath}"`,
        { encoding: "utf-8", timeout: 60000, stdio: "pipe" }
      );
      return existsSync(outputPath);
    } catch {
      return false;
    }
  }
}

function resolveVideoPath(videoUrl: string): string | null {
  const cleaned = videoUrl.replace(/^\/uploads\//, "");
  const fullPath = join(UPLOAD_DIR, cleaned);
  if (existsSync(fullPath)) return fullPath;
  return null;
}

async function main() {
  const videos = await prisma.video.findMany({
    include: { creator: { select: { username: true } } },
  });

  console.log(`Regenerating thumbnails for ALL ${videos.length} videos using ffmpeg 8.0.1\n`);

  let generated = 0;
  let failed = 0;
  let skipped = 0;

  const byCreator: Record<string, { ok: number; fail: number; skip: number }> = {};

  for (const video of videos) {
    const creator = video.creator.username;
    if (!byCreator[creator]) byCreator[creator] = { ok: 0, fail: 0, skip: 0 };
    const prefix = `[${creator}] "${video.title}"`;

    if (!video.videoUrl) {
      console.log(`  SKIP (no videoUrl): ${prefix}`);
      skipped++;
      byCreator[creator].skip++;
      continue;
    }

    const videoPath = resolveVideoPath(video.videoUrl);
    if (!videoPath) {
      console.log(`  SKIP (file not found): ${prefix}`);
      skipped++;
      byCreator[creator].skip++;
      continue;
    }

    const duration = getVideoDuration(videoPath);
    const seekTime = duration > 2 ? duration * 0.25 : 0;

    const thumbId = uuidv4();
    const thumbFileName = `${thumbId}.jpg`;
    const thumbPath = join(THUMB_DIR, thumbFileName);

    const success = generateThumbnail(videoPath, thumbPath, seekTime);

    if (success) {
      const thumbnailUrl = `/uploads/thumbnails/${thumbFileName}`;
      await prisma.video.update({
        where: { id: video.id },
        data: { thumbnailUrl },
      });
      generated++;
      byCreator[creator].ok++;
    } else {
      // Try at 0s as last resort
      const retrySuccess = generateThumbnail(videoPath, thumbPath, 0);
      if (retrySuccess) {
        const thumbnailUrl = `/uploads/thumbnails/${thumbFileName}`;
        await prisma.video.update({
          where: { id: video.id },
          data: { thumbnailUrl },
        });
        generated++;
        byCreator[creator].ok++;
      } else {
        console.log(`  FAILED: ${prefix}`);
        failed++;
        byCreator[creator].fail++;
      }
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Generated: ${generated}`);
  console.log(`Failed: ${failed}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Total: ${videos.length}`);

  console.log(`\n=== PER CREATOR ===`);
  for (const [creator, stats] of Object.entries(byCreator).sort()) {
    const total = stats.ok + stats.fail + stats.skip;
    console.log(`  ${creator}: ${total} total, ${stats.ok} OK, ${stats.fail} failed, ${stats.skip} skipped`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
