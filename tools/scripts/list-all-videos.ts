import { PrismaClient } from "../../src/generated/prisma";
const prisma = new PrismaClient();

async function main() {
  const videos = await prisma.video.findMany({
    include: {
      creator: {
        select: { username: true, displayName: true }
      }
    },
    orderBy: [{ creator: { username: "asc" } }, { uploadDate: "desc" }]
  });

  console.log(`Total videos in database: ${videos.length}\n`);

  // Group by creator
  const byCreator: Record<string, any[]> = {};
  for (const v of videos) {
    const key = v.creator.username;
    if (!byCreator[key]) byCreator[key] = [];
    byCreator[key].push(v);
  }

  for (const [creator, vids] of Object.entries(byCreator)) {
    console.log(`=== ${creator} (${vids.length} videos) ===`);
  }

  // Check for issues
  const noTags = videos.filter(v => {
    const tags = v.tags;
    if (Array.isArray(tags)) return tags.length === 0;
    if (typeof tags === "string") {
      try { const p = JSON.parse(tags); return !Array.isArray(p) || p.length === 0; } catch { return true; }
    }
    return true;
  });

  const noThumbnail = videos.filter(v => !v.thumbnailUrl);
  const noVideoUrl = videos.filter(v => !v.videoUrl);

  // Check for duplicates by title+creator
  const seen = new Map<string, string[]>();
  for (const v of videos) {
    const key = `${v.title.trim().toLowerCase()}|||${v.creatorId}`;
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key)!.push(v.id);
  }
  const duplicates = Array.from(seen.entries()).filter(([_, ids]) => ids.length > 1);

  console.log(`\n=== ISSUES ===`);
  console.log(`Videos without tags: ${noTags.length}`);
  if (noTags.length > 0) {
    for (const v of noTags) {
      console.log(`  - [${v.creator.username}] "${v.title}" (${v.id})`);
    }
  }

  console.log(`\nVideos without thumbnail: ${noThumbnail.length}`);
  if (noThumbnail.length > 0) {
    for (const v of noThumbnail.slice(0, 30)) {
      console.log(`  - [${v.creator.username}] "${v.title}" (${v.id})`);
    }
    if (noThumbnail.length > 30) console.log(`  ... and ${noThumbnail.length - 30} more`);
  }

  console.log(`\nVideos without videoUrl: ${noVideoUrl.length}`);
  if (noVideoUrl.length > 0) {
    for (const v of noVideoUrl.slice(0, 30)) {
      console.log(`  - [${v.creator.username}] "${v.title}" (${v.id})`);
    }
    if (noVideoUrl.length > 30) console.log(`  ... and ${noVideoUrl.length - 30} more`);
  }

  console.log(`\nDuplicate titles (same creator): ${duplicates.length}`);
  if (duplicates.length > 0) {
    for (const [key, ids] of duplicates) {
      const title = key.split("|||")[0];
      console.log(`  - "${title}" has ${ids.length} copies: ${ids.join(", ")}`);
    }
  }

  // Print full video list
  console.log(`\n\n=== FULL VIDEO LIST ===`);
  for (const [creator, vids] of Object.entries(byCreator)) {
    console.log(`\n--- ${creator} (${vids.length}) ---`);
    for (const v of vids) {
      const tags = Array.isArray(v.tags) ? v.tags : [];
      const hasThumb = v.thumbnailUrl ? "THUMB" : "NO_THUMB";
      const hasVideo = v.videoUrl ? "VIDEO" : "NO_VIDEO";
      const tagStr = tags.length > 0 ? tags.join(",") : "NO_TAGS";
      console.log(`  "${v.title}" | ${hasThumb} | ${hasVideo} | ${tagStr} | ${v.status}`);
    }
  }

  // Also list all users
  const users = await prisma.user.findMany({
    select: { id: true, username: true, displayName: true, isCreator: true, email: true }
  });
  console.log(`\n\n=== ALL USERS ===`);
  for (const u of users) {
    console.log(`  ${u.username} (${u.displayName}) | creator:${u.isCreator} | id:${u.id}`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
