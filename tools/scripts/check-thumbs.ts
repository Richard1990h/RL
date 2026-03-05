import { PrismaClient } from "../../src/generated/prisma";
import { existsSync } from "fs";
import { join, resolve } from "path";

const prisma = new PrismaClient();
const UPLOAD_DIR = resolve(process.cwd(), process.env.UPLOAD_DIR || "../uploads");

async function main() {
  const videos = await prisma.video.findMany({
    include: { creator: { select: { username: true } } },
    orderBy: { uploadDate: "desc" },
  });

  const byCreator: Record<string, { total: number; noThumb: number; badThumb: number; titles: string[] }> = {};

  for (const v of videos) {
    const user = v.creator.username;
    if (!byCreator[user]) byCreator[user] = { total: 0, noThumb: 0, badThumb: 0, titles: [] };
    byCreator[user].total++;

    if (!v.thumbnailUrl || v.thumbnailUrl === "") {
      byCreator[user].noThumb++;
      byCreator[user].titles.push(`  [NO THUMB] "${v.title}" (id: ${v.id})`);
    } else {
      // Check if the thumbnail file actually exists on disk
      const thumbPath = join(UPLOAD_DIR, v.thumbnailUrl.replace(/^\/uploads\//, ""));
      if (!existsSync(thumbPath)) {
        byCreator[user].badThumb++;
        byCreator[user].titles.push(`  [FILE MISSING] "${v.title}" -> ${v.thumbnailUrl} (id: ${v.id})`);
      }
    }
  }

  console.log("=== THUMBNAIL AUDIT ===\n");
  let totalMissing = 0;
  for (const [user, data] of Object.entries(byCreator).sort((a, b) => a[0].localeCompare(b[0]))) {
    const issues = data.noThumb + data.badThumb;
    totalMissing += issues;
    console.log(`${user}: ${data.total} videos, ${data.noThumb} no thumbnailUrl, ${data.badThumb} file missing on disk`);
    for (const t of data.titles) console.log(t);
    if (data.titles.length > 0) console.log("");
  }

  console.log(`\nTotal videos: ${videos.length}`);
  console.log(`Total with thumbnail issues: ${totalMissing}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
