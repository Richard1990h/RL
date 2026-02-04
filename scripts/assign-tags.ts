/**
 * Assign tags to all videos based on title keywords and creator fallback.
 * Run with: npx tsx scripts/assign-tags.ts
 */
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();

// Keyword → tag mapping (lowercase keywords)
const KEYWORD_TAG_MAP: Record<string, string[]> = {
  // gaming
  rust: ["gaming"],
  "cs:go": ["gaming"],
  csgo: ["gaming"],
  fortnite: ["gaming"],
  h1z1: ["gaming"],
  "escape from tarkov": ["gaming"],
  eft: ["gaming"],
  tarkov: ["gaming"],
  valheim: ["gaming"],
  pubg: ["gaming"],
  "battle royale": ["gaming"],
  pvp: ["gaming"],
  "pvp server": ["gaming"],
  gaming: ["gaming"],
  "tower wars": ["gaming"],
  "timer wars": ["gaming"],
  fps: ["gaming"],
  ranked: ["gaming"],
  competitive: ["gaming"],
  esports: ["gaming"],

  // game-dev
  unity: ["game-dev"],
  "unreal engine": ["game-dev"],
  "map making": ["game-dev"],
  modding: ["game-dev"],
  "server setup": ["game-dev"],
  "server config": ["game-dev"],

  // crypto
  nicehash: ["crypto"],
  bitcoin: ["crypto"],
  mining: ["crypto"],
  "gpu rig": ["crypto"],
  crypto: ["crypto"],
  miner: ["crypto"],
  hashrate: ["crypto"],

  // diy
  "car build": ["diy"],
  trailer: ["diy"],
  solar: ["diy"],
  "boat wrap": ["diy"],
  electrical: ["diy"],
  wiring: ["diy"],
  "fix up": ["diy"],
  fixing: ["diy"],
  repair: ["diy"],
  build: ["diy"],
  engine: ["diy"],
  truck: ["diy"],
  car: ["diy"],
  boat: ["diy"],
  "monster truck": ["diy"],
  welding: ["diy"],
  paint: ["diy"],
  garage: ["diy"],
  mechanic: ["diy"],
  exhaust: ["diy"],
  tire: ["diy"],
  tires: ["diy"],
  "drive shaft": ["diy"],
  suspension: ["diy"],
  brake: ["diy"],
  transmission: ["diy"],
  swap: ["diy"],

  // cooking
  recipe: ["cooking"],
  baking: ["cooking"],
  waffle: ["cooking"],
  waffles: ["cooking"],
  pierog: ["cooking"],
  pierogi: ["cooking"],
  pierogies: ["cooking"],
  sauce: ["cooking"],
  cooking: ["cooking"],
  food: ["cooking"],
  nachos: ["cooking"],
  dinner: ["cooking"],
  "meal prep": ["cooking"],
  homemade: ["cooking"],
  ingredients: ["cooking"],
  beef: ["cooking"],
  bacon: ["cooking"],
  cheesy: ["cooking"],
  "sweet treat": ["cooking"],
  protein: ["cooking"],
  lunch: ["cooking"],

  // lifestyle
  family: ["lifestyle"],
  fam: ["lifestyle"],
  kids: ["lifestyle"],
  holiday: ["lifestyle"],
  christmas: ["lifestyle"],
  easter: ["lifestyle"],
  halloween: ["lifestyle"],
  birthday: ["lifestyle"],
  pet: ["lifestyle"],
  pets: ["lifestyle"],
  vlog: ["lifestyle"],
  memories: ["lifestyle"],
  "the cough": ["lifestyle"],
  "sub for sub": ["lifestyle"],

  // outdoors
  nature: ["outdoors"],
  fishing: ["outdoors"],
  walk: ["outdoors"],
  sunset: ["outdoors"],
  sunrise: ["outdoors"],
  flower: ["outdoors"],
  flowers: ["outdoors"],
  garden: ["outdoors"],
  hike: ["outdoors"],
  hiking: ["outdoors"],
  outdoor: ["outdoors"],
  lake: ["outdoors"],
  river: ["outdoors"],
  camping: ["outdoors"],
  bonfire: ["outdoors"],
  fire: ["outdoors"],

  // crafts
  bracelet: ["crafts"],
  bracelets: ["crafts"],
  origami: ["crafts"],
  bookmark: ["crafts"],
  bookmarks: ["crafts"],
  craft: ["crafts"],
  crafting: ["crafts"],
  "friendship bracelet": ["crafts"],
};

// Creator fallback tags (when no keyword matches)
const CREATOR_FALLBACK: Record<string, string> = {
  kingrichard: "gaming",
  tigga_2020: "cooking",
  karebear: "lifestyle",
};

function assignTagsFromTitle(title: string, creatorUsername: string): string[] {
  const lower = title.toLowerCase();
  const tagSet = new Set<string>();

  // Check each keyword against the title
  for (const [keyword, tags] of Object.entries(KEYWORD_TAG_MAP)) {
    if (lower.includes(keyword)) {
      for (const tag of tags) {
        tagSet.add(tag);
      }
    }
  }

  // If no tags matched, use creator fallback
  if (tagSet.size === 0) {
    const fallback = CREATOR_FALLBACK[creatorUsername];
    if (fallback) {
      tagSet.add(fallback);
    }
  }

  return Array.from(tagSet);
}

async function main() {
  console.log("Assigning tags to all videos...\n");

  const videos = await prisma.video.findMany({
    include: {
      creator: {
        select: { username: true },
      },
    },
  });

  console.log(`Found ${videos.length} videos total.\n`);

  const tagCounts: Record<string, number> = {};
  let updated = 0;

  for (const video of videos) {
    const tags = assignTagsFromTitle(video.title, video.creator.username);

    for (const t of tags) {
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    }

    await prisma.video.update({
      where: { id: video.id },
      data: { tags: tags },
    });

    updated++;
    if (updated % 20 === 0) {
      console.log(`  Updated ${updated}/${videos.length}...`);
    }
  }

  console.log(`\nDone! Updated ${updated} videos.\n`);
  console.log("Tag distribution:");
  for (const [tag, count] of Object.entries(tagCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${tag}: ${count}`);
  }
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
