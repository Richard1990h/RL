/**
 * Generate a comprehensive TODO tracking file at L:\.youtube\TODO.txt
 * Lists every video from every folder with its status in the database.
 */
import { PrismaClient } from "../../src/generated/prisma";
import { existsSync, readdirSync, writeFileSync, statSync } from "fs";
import { join, extname } from "path";

const prisma = new PrismaClient();
const YOUTUBE_DIR = "L:/.youtube";

const FOLDER_TO_USERNAME: Record<string, string> = {
  aaronfamous1: "aaronowen",
  karebear: "karebear",
  king: "kingrichard",
  tigger_2020: "tigga_2020",
};

const VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".webm", ".mov", ".avi"]);
const SKIP_FILES = new Set(["..mp4.mp4", "nul"]);

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
}

async function main() {
  const videos = await prisma.video.findMany({
    include: { creator: { select: { username: true } } },
  });

  // Build lookup
  const dbByCreator: Record<string, Map<string, any>> = {};
  for (const v of videos) {
    const user = v.creator.username;
    if (!dbByCreator[user]) dbByCreator[user] = new Map();
    dbByCreator[user].set(normalize(v.title), v);
  }

  const lines: string[] = [];
  const now = new Date().toISOString().split("T")[0];

  lines.push("═══════════════════════════════════════════════════════════════");
  lines.push("         RALLY LIVE - VIDEO TRACKING TODO LIST");
  lines.push(`         Generated: ${now}`);
  lines.push(`         Total Videos in Database: ${videos.length}`);
  lines.push("═══════════════════════════════════════════════════════════════");
  lines.push("");

  let totalFiles = 0;
  let totalMatched = 0;
  let totalMissing = 0;

  for (const [folder, username] of Object.entries(FOLDER_TO_USERNAME)) {
    const folderPath = join(YOUTUBE_DIR, folder);
    if (!existsSync(folderPath)) continue;

    const files = readdirSync(folderPath).filter((f) => {
      if (SKIP_FILES.has(f)) return false;
      if (f.startsWith(".")) return false;
      const ext = extname(f).toLowerCase();
      return VIDEO_EXTENSIONS.has(ext) || ext === ".m4a";
    });

    const dbMap = dbByCreator[username] || new Map();

    lines.push("───────────────────────────────────────────────────────────────");
    lines.push(`  FOLDER: ${folder} (${username})`);
    lines.push(`  Files on disk: ${files.length} | In database: ${dbMap.size}`);
    lines.push("───────────────────────────────────────────────────────────────");
    lines.push("");

    for (const file of files.sort()) {
      totalFiles++;
      const nameNoExt = file.replace(/\.[^.]+$/, "");
      const norm = normalize(nameNoExt);
      const fileStat = statSync(join(folderPath, file));
      const sizeMB = (fileStat.size / 1024 / 1024).toFixed(1);

      // Find matching DB entry
      let matchedVideo: any = null;
      for (const [dbNorm, dbVideo] of dbMap.entries()) {
        if (dbNorm === norm || dbNorm.includes(norm) || norm.includes(dbNorm)) {
          matchedVideo = dbVideo;
          break;
        }
      }

      if (matchedVideo) {
        totalMatched++;
        const tags = Array.isArray(matchedVideo.tags) ? matchedVideo.tags : [];
        const hasThumb = matchedVideo.thumbnailUrl ? "✓" : "✗";
        const tagStr = tags.length > 0 ? tags.join(", ") : "none";

        lines.push(`  [✓] ${file}`);
        lines.push(`      Size: ${sizeMB} MB | Status: ${matchedVideo.status} | Tags: ${tagStr} | Thumb: ${hasThumb}`);
      } else {
        totalMissing++;
        const ext = extname(file).toLowerCase();
        const reason = ext === ".m4a" ? "(audio only - skipped)" : "(NOT IN DATABASE)";
        lines.push(`  [✗] ${file}  ${reason}`);
        lines.push(`      Size: ${sizeMB} MB`);
      }
      lines.push("");
    }
  }

  lines.push("");
  lines.push("═══════════════════════════════════════════════════════════════");
  lines.push("                        SUMMARY");
  lines.push("═══════════════════════════════════════════════════════════════");
  lines.push(`  Total video files on disk:    ${totalFiles}`);
  lines.push(`  Matched to database:          ${totalMatched} ✓`);
  lines.push(`  Not in database:              ${totalMissing} ✗`);
  lines.push(`  Total videos in database:     ${videos.length}`);
  lines.push("");

  // Tag distribution
  const tagCounts: Record<string, number> = {};
  for (const v of videos) {
    const tags = Array.isArray(v.tags) ? v.tags : [];
    for (const t of tags as string[]) {
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    }
  }

  lines.push("  TAG DISTRIBUTION:");
  for (const [tag, count] of Object.entries(tagCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`    ${tag}: ${count} videos`);
  }
  lines.push("");

  // Status distribution
  const statusCounts: Record<string, number> = {};
  for (const v of videos) {
    statusCounts[v.status] = (statusCounts[v.status] || 0) + 1;
  }

  lines.push("  STATUS DISTRIBUTION:");
  for (const [status, count] of Object.entries(statusCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`    ${status}: ${count} videos`);
  }
  lines.push("");

  // Per-creator breakdown
  const creatorCounts: Record<string, number> = {};
  for (const v of videos) {
    const user = v.creator.username;
    creatorCounts[user] = (creatorCounts[user] || 0) + 1;
  }

  lines.push("  VIDEOS PER CREATOR:");
  for (const [creator, count] of Object.entries(creatorCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`    ${creator}: ${count} videos`);
  }
  lines.push("");
  lines.push("═══════════════════════════════════════════════════════════════");

  const todoPath = join(YOUTUBE_DIR, "TODO.txt");
  writeFileSync(todoPath, lines.join("\n"), "utf-8");
  console.log(`TODO file written to: ${todoPath}`);
  console.log(`${totalFiles} files checked, ${totalMatched} matched, ${totalMissing} not in DB`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
