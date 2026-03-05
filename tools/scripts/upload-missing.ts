/**
 * Upload all missing videos from L:\.youtube to the database.
 * - Makes aaronowen a creator
 * - Creates new video records for files not in the database
 * - Copies files to uploads directory and processes with ffmpeg
 */
import { PrismaClient } from "../../src/generated/prisma";
import { existsSync, readdirSync, statSync, mkdirSync, copyFileSync } from "fs";
import { join, resolve, extname } from "path";
import { v4 as uuidv4 } from "uuid";
import { generateTagsFromTitle } from "../../src/lib/auto-tags";

const prisma = new PrismaClient();
const YOUTUBE_DIR = "L:/.youtube";
const UPLOAD_DIR = resolve(process.cwd(), process.env.UPLOAD_DIR || "../uploads");

const FOLDER_TO_USERNAME: Record<string, string> = {
  aaronfamous1: "aaronowen",
  karebear: "karebear",
  king: "kingrichard",
  tigger_2020: "tigga_2020",
};

// Files to skip (junk or audio-only)
const SKIP_FILES = new Set([
  "..mp4.mp4",
  "Sunday in the kitchen quick tip!.m4a",
]);

const VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".webm", ".mov", ".avi"]);

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  console.log("=== Uploading missing videos ===\n");

  // Step 1: Make aaronowen a creator
  const aaronUser = await prisma.user.findUnique({ where: { username: "aaronowen" } });
  if (aaronUser && !aaronUser.isCreator) {
    await prisma.user.update({
      where: { id: aaronUser.id },
      data: { isCreator: true },
    });
    console.log("Made aaronowen a creator\n");
  }

  // Step 2: Get all existing videos from DB
  const existingVideos = await prisma.video.findMany({
    include: { creator: { select: { username: true } } },
  });

  // Build lookup by normalized title per creator
  const dbLookup: Record<string, Set<string>> = {};
  for (const v of existingVideos) {
    const user = v.creator.username;
    if (!dbLookup[user]) dbLookup[user] = new Set();
    dbLookup[user].add(normalize(v.title));
  }

  // Step 3: Get all users
  const users = await prisma.user.findMany({
    where: { username: { in: Object.values(FOLDER_TO_USERNAME) } },
  });
  const userMap = new Map(users.map((u) => [u.username, u]));

  // Step 4: Scan each folder for missing videos
  let totalUploaded = 0;

  for (const [folder, username] of Object.entries(FOLDER_TO_USERNAME)) {
    const folderPath = join(YOUTUBE_DIR, folder);
    if (!existsSync(folderPath)) {
      console.log(`Folder not found: ${folderPath}`);
      continue;
    }

    const user = userMap.get(username);
    if (!user) {
      console.log(`User not found: ${username}`);
      continue;
    }

    const files = readdirSync(folderPath).filter((f) => {
      if (SKIP_FILES.has(f)) return false;
      const ext = extname(f).toLowerCase();
      return VIDEO_EXTENSIONS.has(ext);
    });

    const existingTitles = dbLookup[username] || new Set();

    console.log(`\n--- ${folder} (${username}) ---`);
    console.log(`  Files on disk: ${files.length}`);
    console.log(`  Videos in DB: ${existingTitles.size}`);

    for (const file of files) {
      const nameNoExt = file.replace(/\.[^.]+$/, "");
      const normName = normalize(nameNoExt);

      // Check if this video already exists in the DB
      let found = false;
      for (const dbTitle of existingTitles) {
        if (dbTitle === normName || dbTitle.includes(normName) || normName.includes(dbTitle)) {
          found = true;
          break;
        }
      }

      if (found) continue;

      // This video is missing from the DB — upload it
      const sourcePath = join(folderPath, file);
      const fileStat = statSync(sourcePath);

      // Create upload directory
      const uploadId = uuidv4();
      const uploadPath = join(UPLOAD_DIR, uploadId);
      mkdirSync(uploadPath, { recursive: true });

      // Copy file to uploads directory
      const destFileName = file.replace(/[^\w\s.\-]/g, "_");
      const destPath = join(uploadPath, destFileName);

      console.log(`  Uploading: "${nameNoExt}" (${(fileStat.size / 1024 / 1024).toFixed(1)} MB)...`);
      copyFileSync(sourcePath, destPath);

      const videoUrl = `/uploads/${uploadId}/${destFileName}`;

      // Generate tags
      const tags = generateTagsFromTitle(nameNoExt);

      // Creator-based fallback tags
      if (tags.length === 0) {
        const fallbacks: Record<string, string> = {
          kingrichard: "gaming",
          karebear: "lifestyle",
          tigga_2020: "cooking",
          aaronowen: "outdoors",
        };
        if (fallbacks[username]) tags.push(fallbacks[username]);
      }

      // Create video record
      await prisma.video.create({
        data: {
          title: nameNoExt,
          description: "",
          videoUrl,
          thumbnailUrl: null, // Will need thumbnail generation later
          durationSec: 0,
          creatorId: user.id,
          tags,
          status: "READY",
          visibility: "PUBLIC",
          uploadDate: new Date(fileStat.mtime),
        },
      });

      totalUploaded++;
      console.log(`    -> Created: "${nameNoExt}" [${tags.join(", ")}]`);
    }
  }

  console.log(`\n=== DONE ===`);
  console.log(`Total new videos uploaded: ${totalUploaded}`);

  // Final count
  const finalCount = await prisma.video.count();
  console.log(`Total videos in database: ${finalCount}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
