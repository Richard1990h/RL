/**
 * Full audit: check every video's thumbnail URL, verify file on disk,
 * and print detailed report per creator.
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { existsSync, readdirSync } from "fs";
import { join, resolve } from "path";

const prisma = new PrismaClient();
const UPLOAD_DIR = resolve(process.cwd(), process.env.UPLOAD_DIR || "../uploads");

async function main() {
  const videos = await prisma.video.findMany({
    include: { creator: { select: { username: true } } },
  });

  console.log(`Total videos in DB: ${videos.length}\n`);

  // List actual thumbnail files on disk
  const thumbDir = join(UPLOAD_DIR, "thumbnails");
  const thumbFiles = existsSync(thumbDir) ? new Set(readdirSync(thumbDir)) : new Set<string>();
  console.log(`Thumbnail files on disk: ${thumbFiles.size}\n`);

  const byCreator: Record<string, typeof videos> = {};
  for (const v of videos) {
    const u = v.creator.username;
    if (!byCreator[u]) byCreator[u] = [];
    byCreator[u].push(v);
  }

  for (const [creator, vids] of Object.entries(byCreator).sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`\n=== ${creator} (${vids.length} videos) ===`);

    let okCount = 0;
    let noUrlCount = 0;
    let fileMissingCount = 0;
    let videoFileMissingCount = 0;

    for (const v of vids) {
      const issues: string[] = [];

      // Check video file
      if (v.videoUrl) {
        const cleaned = v.videoUrl.replace(/^\/uploads\//, "");
        const videoPath = join(UPLOAD_DIR, cleaned);
        if (!existsSync(videoPath)) {
          issues.push("VIDEO FILE MISSING");
          videoFileMissingCount++;
        }
      } else {
        issues.push("NO VIDEO URL");
      }

      // Check thumbnail
      if (!v.thumbnailUrl || v.thumbnailUrl === "") {
        issues.push("NO THUMBNAIL URL");
        noUrlCount++;
      } else {
        const thumbCleaned = v.thumbnailUrl.replace(/^\/uploads\//, "");
        const thumbPath = join(UPLOAD_DIR, thumbCleaned);
        if (!existsSync(thumbPath)) {
          issues.push(`THUMB FILE MISSING (${v.thumbnailUrl})`);
          fileMissingCount++;
        }
      }

      // Check tags
      const tags = Array.isArray(v.tags) ? v.tags : [];
      if (tags.length === 0) {
        issues.push("NO TAGS");
      }

      if (issues.length > 0) {
        console.log(`  [ISSUE] "${v.title}" (id: ${v.id})`);
        console.log(`          thumbnailUrl: ${v.thumbnailUrl || "(null)"}`);
        console.log(`          videoUrl: ${v.videoUrl || "(null)"}`);
        console.log(`          tags: ${JSON.stringify(tags)}`);
        console.log(`          status: ${v.status}`);
        for (const issue of issues) {
          console.log(`          -> ${issue}`);
        }
      } else {
        okCount++;
      }
    }

    console.log(`  Summary: ${okCount} OK, ${noUrlCount} no thumb URL, ${fileMissingCount} thumb file missing, ${videoFileMissingCount} video file missing`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
