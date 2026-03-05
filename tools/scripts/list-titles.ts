import { PrismaClient } from "../../src/generated/prisma";
const prisma = new PrismaClient();
async function main() {
  const videos = await prisma.video.findMany({
    include: { creator: { select: { username: true } } },
    orderBy: { title: "asc" },
  });
  const byCreator: Record<string, string[]> = {};
  for (const v of videos) {
    const u = v.creator.username;
    if (!byCreator[u]) byCreator[u] = [];
    const tags = Array.isArray(v.tags) ? v.tags : [];
    byCreator[u].push(`  "${v.title}" -> [${(tags as string[]).join(", ")}]`);
  }
  for (const [creator, titles] of Object.entries(byCreator).sort()) {
    console.log(`\n=== ${creator} (${titles.length}) ===`);
    for (const t of titles) console.log(t);
  }
  await prisma.$disconnect();
}
main().catch(console.error);
