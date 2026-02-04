/**
 * Bulk import YouTube videos into Rally Live for a specific creator.
 *
 * For each .mp4 in the source directory:
 *   1. Copies the file into L:/uploads/<uuid>/<filename>
 *   2. Creates a Video record in the database (status: PROCESSING)
 *   3. Triggers ffmpeg processing (re-encode to H.264 + faststart)
 *
 * Usage:
 *   node scripts/bulk-import-youtube.mjs
 */

import { PrismaClient } from "../src/generated/prisma/index.js";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";

const CREATOR_ID = "3c1b1547-34df-4187-9b63-ec8f7dcc777d"; // KIngRichard
const SOURCE_DIR = "L:/.youtube/king";
const UPLOAD_DIR = "L:/uploads";

const prisma = new PrismaClient();

// ── helpers ─────────────────────────────────────────────────────────

function probeDuration(inputPath) {
  return new Promise((resolve) => {
    const proc = spawn("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      inputPath,
    ]);
    let stdout = "";
    proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    proc.on("close", () => {
      try {
        const info = JSON.parse(stdout);
        const dur = parseFloat(info?.format?.duration);
        resolve(isNaN(dur) ? 0 : Math.round(dur));
      } catch { resolve(0); }
    });
    proc.on("error", () => resolve(0));
  });
}

function probeResolution(inputPath) {
  return new Promise((resolve) => {
    const proc = spawn("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_streams",
      "-select_streams", "v:0",
      inputPath,
    ]);
    let stdout = "";
    proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    proc.on("close", () => {
      try {
        const info = JSON.parse(stdout);
        const stream = info?.streams?.[0];
        resolve({ width: stream?.width || 0, height: stream?.height || 0 });
      } catch { resolve({ width: 0, height: 0 }); }
    });
    proc.on("error", () => resolve({ width: 0, height: 0 }));
  });
}

function runFfmpeg(args, label) {
  return new Promise((resolve, reject) => {
    console.log(`  [ffmpeg] Starting ${label}`);
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    proc.on("close", (code) => {
      if (code === 0) { console.log(`  [ffmpeg] ${label} done`); resolve(); }
      else { reject(new Error(`ffmpeg ${label} failed (code ${code}): ${stderr.slice(-300)}`)); }
    });
    proc.on("error", reject);
  });
}

async function processVideo(videoId, rawFilePath) {
  const absoluteInput = rawFilePath;
  const dir = path.dirname(absoluteInput);
  const ts = Date.now();
  const output720Name = `processed_720_${ts}.mp4`;
  const output360Name = `processed_360_${ts}.mp4`;
  const absoluteOutput720 = path.join(dir, output720Name);
  const absoluteOutput360 = path.join(dir, output360Name);

  const [durationSec, sourceRes] = await Promise.all([
    probeDuration(absoluteInput),
    probeResolution(absoluteInput),
  ]);

  const sourceHeight = sourceRes.height || 1080;
  // Old ffmpeg doesn't support force_divisible_by — use trunc(x/2)*2 instead
  const mainScale = sourceHeight > 720
    ? "scale='trunc(min(1280,iw)/2)*2':'trunc(min(720,ih)/2)*2'"
    : "scale='trunc(iw/2)*2':'trunc(ih/2)*2'";

  const baseArgs = [
    "-i", absoluteInput,
    "-c:v", "libx264", "-preset", "fast",
    "-profile:v", "main", "-level", "3.1",
    "-g", "48", "-keyint_min", "48", "-sc_threshold", "0",
    "-c:a", "aac", "-strict", "-2", "-b:a", "128k",
    "-movflags", "+faststart",
    "-y",
  ];

  await runFfmpeg([...baseArgs, "-crf", "23", "-vf", mainScale, absoluteOutput720], `720p`);

  const stat720 = await fs.stat(absoluteOutput720);
  if (stat720.size === 0) throw new Error("720p output is empty");

  // Build URL relative to CWD (the rally-live directory)
  // Since UPLOAD_DIR is L:/uploads, we need path relative from CWD
  const cwd = process.cwd();
  const relativeDir = path.relative(cwd, dir).replace(/\\/g, "/");
  const url720 = `/${relativeDir}/${output720Name}`;

  const resolutions = [];

  if (sourceHeight > 480) {
    resolutions.push({ label: "720p", url: url720, height: 720 });
    try {
      await runFfmpeg([
        ...baseArgs, "-crf", "28",
        "-vf", "scale='trunc(min(640,iw)/2)*2':'trunc(min(360,ih)/2)*2'",
        absoluteOutput360,
      ], `360p`);
      const stat360 = await fs.stat(absoluteOutput360);
      if (stat360.size > 0) {
        const url360 = `/${relativeDir}/${output360Name}`;
        resolutions.push({ label: "360p", url: url360, height: 360 });
      }
    } catch (err360) {
      console.log(`  [ffmpeg] 360p failed (non-fatal)`);
    }
  } else {
    const label = sourceHeight <= 360 ? "360p" : sourceHeight <= 480 ? "480p" : "720p";
    resolutions.push({ label, url: url720, height: sourceHeight });
  }

  const updateData = {
    videoUrl: url720,
    storagePath: absoluteOutput720,
    status: "READY",
    resolutions: resolutions,
  };
  if (durationSec > 0) updateData.durationSec = durationSec;

  await prisma.video.update({ where: { id: videoId }, data: updateData });

  // Delete the copy in uploads (keep original in .youtube/king)
  try { await fs.unlink(absoluteInput); } catch {}
}

// ── main ────────────────────────────────────────────────────────────

async function main() {
  const files = await fs.readdir(SOURCE_DIR);
  const mp4Files = files.filter(f => f.endsWith(".mp4") && !f.startsWith("."));

  console.log(`Found ${mp4Files.length} MP4 files to import.\n`);

  // Check which titles already exist to avoid duplicates
  const existingVideos = await prisma.video.findMany({
    where: { creatorId: CREATOR_ID },
    select: { title: true },
  });
  const existingTitles = new Set(existingVideos.map(v => v.title));

  let imported = 0;
  let skipped = 0;

  for (const file of mp4Files) {
    const title = path.basename(file, ".mp4").slice(0, 200);

    if (existingTitles.has(title)) {
      console.log(`[SKIP] "${title}" already exists`);
      skipped++;
      continue;
    }

    console.log(`[${imported + skipped + 1}/${mp4Files.length}] Importing: ${title}`);

    try {
      // 1. Copy file to uploads/<uuid>/
      const uploadId = randomUUID();
      const uploadDir = path.join(UPLOAD_DIR, uploadId);
      await fs.mkdir(uploadDir, { recursive: true });

      const sourcePath = path.join(SOURCE_DIR, file);
      const destPath = path.join(uploadDir, file);
      await fs.copyFile(sourcePath, destPath);

      // 2. Get duration before creating record
      const durationSec = await probeDuration(sourcePath);

      // 3. Create Video record
      const video = await prisma.video.create({
        data: {
          title,
          description: `Imported from YouTube - King Richard`,
          creatorId: CREATOR_ID,
          videoUrl: null,
          durationSec: durationSec || 0,
          tags: ["youtube", "import"],
          visibility: "PUBLIC",
          status: "PROCESSING",
        },
      });

      console.log(`  Created video record: ${video.id}`);

      // 4. Process video (re-encode for web)
      await processVideo(video.id, destPath);

      console.log(`  ✓ READY\n`);
      existingTitles.add(title);
      imported++;
    } catch (err) {
      console.error(`  ✗ FAILED: ${err.message}\n`);
    }
  }

  console.log(`\nDone! Imported: ${imported}, Skipped: ${skipped}, Total MP4s: ${mp4Files.length}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
