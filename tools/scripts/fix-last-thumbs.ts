import { PrismaClient } from "../../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  const videos = await prisma.video.findMany({
    where: {
      OR: [
        { thumbnailUrl: null },
        { thumbnailUrl: "" },
      ],
    },
    select: { id: true, title: true, videoUrl: true },
  });

  console.log(`Found ${videos.length} videos without thumbnails`);

  const thumbMap: Record<string, string> = {
    "shrinkwrap-boat-short-clip": "/uploads/thumbnails/shrinkwrap-boat-short-clip.jpg",
    "green-to-purple-transition": "/uploads/thumbnails/green-to-purple-transition.jpg",
  };

  for (const v of videos) {
    for (const [key, thumbUrl] of Object.entries(thumbMap)) {
      if (v.title.includes(key) || v.videoUrl?.includes(key)) {
        await prisma.video.update({
          where: { id: v.id },
          data: { thumbnailUrl: thumbUrl },
        });
        console.log(`Updated: "${v.title}" -> ${thumbUrl}`);
      }
    }
  }

  const remaining = await prisma.video.count({
    where: {
      OR: [
        { thumbnailUrl: null },
        { thumbnailUrl: "" },
      ],
    },
  });
  console.log(`\nVideos still without thumbnails: ${remaining}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
