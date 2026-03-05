import { PrismaClient } from "../../src/generated/prisma";
import { existsSync, statSync } from "fs";
import { join, resolve } from "path";

const prisma = new PrismaClient();
const UPLOAD_DIR = resolve(process.cwd(), process.env.UPLOAD_DIR || "../uploads");

async function main() {
  const videos = await prisma.video.findMany({
    include: { creator: { select: { username: true } } },
    orderBy: { uploadDate: "desc" },
  });

  console.log(`Upload dir: ${UPLOAD_DIR}`);
  console.log(`Total videos: ${videos.length}\n`);

  let readyOk = 0, readyBroken = 0;
  let failedOk = 0, failedBroken = 0;
  let processingOk = 0, processingBroken = 0;

  const failedWithFile: any[] = [];
  const failedNoFile: any[] = [];
  const processingWithFile: any[] = [];

  for (const v of videos) {
    const videoPath = v.videoUrl
      ? join(UPLOAD_DIR, v.videoUrl.replace(/^\/uploads\//, ""))
      : null;
    const fileExists = videoPath ? existsSync(videoPath) : false;
    const fileSize = fileExists && videoPath ? statSync(videoPath).size : 0;

    if (v.status === "READY") {
      if (fileExists && fileSize > 0) readyOk++;
      else {
        readyBroken++;
        console.log(`READY but broken: [${v.creator.username}] "${v.title}" -> ${v.videoUrl}`);
      }
    } else if (v.status === "FAILED") {
      if (fileExists && fileSize > 0) {
        failedOk++;
        failedWithFile.push(v);
      } else {
        failedBroken++;
        failedNoFile.push(v);
      }
    } else if (v.status === "PROCESSING") {
      if (fileExists && fileSize > 0) {
        processingOk++;
        processingWithFile.push(v);
      } else {
        processingBroken++;
      }
    }
  }

  console.log(`\n=== STATUS SUMMARY ===`);
  console.log(`READY + file exists: ${readyOk}`);
  console.log(`READY + file MISSING: ${readyBroken}`);
  console.log(`FAILED + file exists (can fix to READY): ${failedOk}`);
  console.log(`FAILED + file MISSING: ${failedBroken}`);
  console.log(`PROCESSING + file exists: ${processingOk}`);
  console.log(`PROCESSING + file MISSING: ${processingBroken}`);

  if (failedWithFile.length > 0) {
    console.log(`\n=== FAILED videos with files (can be set to READY) ===`);
    for (const v of failedWithFile) {
      console.log(`  [${v.creator.username}] "${v.title}" (${v.id})`);
    }
  }

  if (failedNoFile.length > 0) {
    console.log(`\n=== FAILED videos WITHOUT files (need re-upload) ===`);
    for (const v of failedNoFile) {
      console.log(`  [${v.creator.username}] "${v.title}" -> ${v.videoUrl}`);
    }
  }

  if (processingWithFile.length > 0) {
    console.log(`\n=== PROCESSING videos with files ===`);
    for (const v of processingWithFile) {
      console.log(`  [${v.creator.username}] "${v.title}" (${v.id})`);
    }
  }

  // Check thumbnails too
  let thumbOk = 0, thumbMissing = 0;
  const missingThumbs: any[] = [];
  for (const v of videos) {
    if (!v.thumbnailUrl) { thumbMissing++; missingThumbs.push(v); continue; }
    // Data URLs are always "ok"
    if (v.thumbnailUrl.startsWith("data:")) { thumbOk++; continue; }
    const thumbPath = join(UPLOAD_DIR, v.thumbnailUrl.replace(/^\/uploads\//, ""));
    if (existsSync(thumbPath)) thumbOk++;
    else {
      thumbMissing++;
      missingThumbs.push(v);
    }
  }
  console.log(`\n=== THUMBNAILS ===`);
  console.log(`Thumbnails OK: ${thumbOk}`);
  console.log(`Thumbnails MISSING: ${thumbMissing}`);
  if (missingThumbs.length > 0 && missingThumbs.length <= 20) {
    for (const v of missingThumbs) {
      console.log(`  [${v.creator.username}] "${v.title}" -> ${v.thumbnailUrl?.substring(0, 60) || "NULL"}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
