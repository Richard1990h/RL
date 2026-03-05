/**
 * Check every thumbnail URL pattern and verify the file serving works.
 */
import { PrismaClient } from "../../src/generated/prisma";
import { existsSync } from "fs";
import { join, resolve } from "path";

const prisma = new PrismaClient();
const UPLOAD_DIR = resolve(process.cwd(), process.env.UPLOAD_DIR || "../uploads");

async function main() {
  const videos = await prisma.video.findMany({
    include: { creator: { select: { username: true } } },
  });

  // Group by thumbnail URL pattern
  const patterns: Record<string, number> = {};
  const broken: { title: string; creator: string; thumbnailUrl: string; exists: boolean }[] = [];

  for (const v of videos) {
    const url = v.thumbnailUrl || "(null)";

    // Categorize the URL pattern
    let pattern: string;
    if (!v.thumbnailUrl) {
      pattern = "NULL";
    } else if (v.thumbnailUrl.startsWith("/uploads/thumbnails/")) {
      pattern = "/uploads/thumbnails/{file}";
    } else if (v.thumbnailUrl.match(/^\/uploads\/[a-f0-9-]+\//)) {
      pattern = "/uploads/{uuid}/{file}";
    } else {
      pattern = `OTHER: ${v.thumbnailUrl.substring(0, 50)}`;
    }
    patterns[pattern] = (patterns[pattern] || 0) + 1;

    // Verify file exists
    if (v.thumbnailUrl) {
      const cleaned = v.thumbnailUrl.replace(/^\/uploads\//, "");
      const fullPath = join(UPLOAD_DIR, cleaned);
      const exists = existsSync(fullPath);
      if (!exists) {
        broken.push({ title: v.title, creator: v.creator.username, thumbnailUrl: v.thumbnailUrl, exists });
      }
    }
  }

  console.log("=== THUMBNAIL URL PATTERNS ===");
  for (const [p, count] of Object.entries(patterns).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${p}: ${count}`);
  }

  console.log(`\n=== BROKEN THUMBNAIL URLS (file not found on disk) ===`);
  if (broken.length === 0) {
    console.log("  None found");
  } else {
    for (const b of broken) {
      console.log(`  [${b.creator}] "${b.title}" -> ${b.thumbnailUrl}`);
    }
  }

  // Now let's also check: do all /uploads/{uuid}/thumbnail.jpg style paths actually resolve?
  // And sample some URLs to show what they look like
  console.log("\n=== SAMPLE THUMBNAIL URLS PER CREATOR ===");
  const byCreator: Record<string, typeof videos> = {};
  for (const v of videos) {
    const u = v.creator.username;
    if (!byCreator[u]) byCreator[u] = [];
    byCreator[u].push(v);
  }

  for (const [creator, vids] of Object.entries(byCreator).sort()) {
    console.log(`\n  ${creator}:`);
    // Show first 5
    for (const v of vids.slice(0, 5)) {
      const url = v.thumbnailUrl || "(null)";
      const cleaned = url.replace(/^\/uploads\//, "");
      const fullPath = join(UPLOAD_DIR, cleaned);
      const exists = existsSync(fullPath);
      console.log(`    "${v.title.substring(0, 50)}" -> ${url.substring(0, 80)} [${exists ? "OK" : "MISSING"}]`);
    }
    if (vids.length > 5) console.log(`    ... and ${vids.length - 5} more`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
