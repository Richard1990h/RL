/**
 * Fix specific misclassified tags and review all tags for accuracy.
 * Run after assign-tags.ts and upload-missing.ts.
 */
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();

// Manual overrides for known misclassifications
const TITLE_OVERRIDES: Record<string, string[]> = {
  // aaronowen videos - these are outdoors/diy content, not gaming
  "elvis-presley-king-poster": ["lifestyle"],
  "green-to-purple-transition": ["lifestyle"],

  // tigga_2020 - fix non-cooking content
  "Our first time up in the air. Niagara falls helicopter ride.": ["lifestyle", "outdoors"],
  "TEMU CANADA.  IT WORKS": ["lifestyle"],
  "April 5, 2023": ["lifestyle"],
  "First time attempting to grow seeds into Herbs instead of buying them already grown.": ["outdoors"],
  "Growing herbs⧸ peppers part 2": ["outdoors"],

  // kingrichard - fix misclassified videos
  "Creating a Car-Building Game!": ["game-dev"],
  "Creating a Car-Building Game! Galaxy Gift": ["game-dev"],
  "Unreal Engine 5 2023 02 07   17 44 00 01": ["game-dev"],
  "Rust quick build": ["gaming"],
  "Copy of SGK2 & Steam Advanced Sessions & dedicated server Windows": ["game-dev"],
  "UNET 'Server + MySQL and Clients'": ["game-dev"],
  "Last Contingency Map 2023 08 01": ["game-dev"],
  "LastContingency": ["game-dev"],
  "Last Coningency": ["game-dev"],
  "Last Coningency part 2": ["game-dev"],
  "Last contingency": ["game-dev"],
  "unity man for Farm Them all": ["game-dev"],
  "Farm The All": ["game-dev"],
  "Making a rust puzzle": ["game-dev"],
  "Working on a map": ["game-dev"],
  "Rust map im makeing": ["game-dev"],
  "putting a Dodge Dakota on a 2500 Ram frame": ["diy"],
  "400 SB camaro 79": ["diy"],
  "120v in to 1.5 v boom lol": ["diy"],
  "Mx3 vs sled on ice": ["diy"],
  "R1 2000 1000cc": ["diy"],
  "R1 2000 1000cc cool start -2": ["diy"],
  "My GTX 760 running with the extra physics card": ["diy"],
  "Growatt inverted  thick it a 48v when it a 24": ["diy"],
  "IRS": ["lifestyle"],
  "me and Aaron": ["lifestyle"],
  "February 8, 2024": ["lifestyle"],
  "Every year, the gay blows stuff onto where I'm working.": ["lifestyle"],
  "New intro": ["lifestyle"],
  "when you get pulled over for doing the speed limit": ["lifestyle"],
  "Hey   ...    .you can't park there": ["lifestyle"],
  "fireworks 2": ["outdoors"],
  "fierworks": ["outdoors"],
  "fast YouTube Donate Button 2017": ["lifestyle"],
  "apg": ["gaming"],
  "F1k": ["gaming"],
  "June 11, 2023": ["game-dev"],
  "June 15, 2023": ["game-dev"],
  "June 21, 2023": ["game-dev"],
  "July 11, 2023": ["game-dev"],
  "old server what can we do ？？？？？？？？？？": ["game-dev"],
  "testing gopro 1": ["diy"],
  "Earth 2 Game": ["gaming"],
  "ripping apart trailer": ["diy"],
  "BIG D Live Stream CSGO": ["gaming"],

  // karebear - refine tags
  "Animal lovins!!": ["lifestyle"],
  "#photogalleryeffect #mycutie, Maxi boy!!": ["lifestyle"],
  "TikTok video #6970719952802221317": ["lifestyle"],
  "TikTok video #7218189380727377157": ["lifestyle"],
  "#fyp": ["lifestyle"],
  "#lovewatchingmygolaie!": ["lifestyle"],
  "love watching Brayden in action!": ["lifestyle"],
  "#mykids#fyp#foryou": ["lifestyle"],
};

async function main() {
  console.log("Fixing misclassified tags...\n");

  const videos = await prisma.video.findMany({
    include: { creator: { select: { username: true } } },
  });

  let fixed = 0;

  for (const v of videos) {
    const override = TITLE_OVERRIDES[v.title];
    if (override) {
      await prisma.video.update({
        where: { id: v.id },
        data: { tags: override },
      });
      console.log(`Fixed: "${v.title}" -> [${override.join(", ")}]`);
      fixed++;
    }
  }

  console.log(`\nFixed ${fixed} videos.\n`);

  // Print final tag distribution
  const allVideos = await prisma.video.findMany();
  const tagCounts: Record<string, number> = {};
  for (const v of allVideos) {
    const tags = Array.isArray(v.tags) ? v.tags : [];
    for (const t of tags as string[]) {
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    }
  }

  console.log("=== FINAL TAG DISTRIBUTION ===");
  for (const [tag, count] of Object.entries(tagCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${tag}: ${count}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
