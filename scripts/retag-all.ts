/**
 * Enhanced re-tagging of ALL videos.
 * - Better keyword matching with word-boundary awareness
 * - Creator-context-aware fallback tagging
 * - Explicit overrides for known misclassifications
 * - Prints full before/after report
 */
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();

// ─── EXPLICIT OVERRIDES (highest priority) ───────────────────────────
// Title -> tags (exact match on title)
const TITLE_OVERRIDES: Record<string, string[]> = {
  // aaronowen - shrinkwrap boat is DIY, not outdoors
  "shrinkwrap-boat-cover-daytime": ["diy"],
  "shrinkwrap-boat-heat-gun-night": ["diy"],
  "shrinkwrap-boat-short-clip": ["diy"],
  "yard-view-covered-boat-summer": ["outdoors"],
  "trailer-jack-hitting-right-spot": ["diy"],
  "forest-clearing-sandy-worksite": ["outdoors"],
  "ontario-forest-aerial-winter-drone": ["outdoors"],
  "elvis-presley-king-poster": ["lifestyle"],
  "green-to-purple-transition": ["lifestyle"],

  // karebear - cooking videos miscategorized as lifestyle
  "Cookies all baked for the week and can have some for the freezer too!": ["cooking"],
  "From undercooked first loaf 😅 to soft sandwich loaves, crackers, brow...": ["cooking"],
  "nothing like fresh bread and hamburger buns already made on this beau...": ["cooking"],
  "#Eastervibes@Tiggatriggaxo Great weekend with family and friends! Cou...": ["lifestyle", "cooking"],
  "Animal lovins!!": ["lifestyle"],
  "love watching Brayden in action!": ["lifestyle"],
  "#fyp": ["lifestyle"],
  "#lovewatchingmygolaie!": ["lifestyle"],
  "#mykids#fyp#foryou": ["lifestyle"],
  "#photogalleryeffect #mycutie, Maxi boy!!": ["lifestyle"],
  "TikTok video #6970719952802221317": ["lifestyle"],
  "TikTok video #7218189380727377157": ["lifestyle"],
  "Missing hockey already!!": ["lifestyle"],
  "my boys fishing ❤️ ": ["outdoors"],

  // kingrichard - specific fixes
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
  "When the snow so deep your plow just gets it": ["outdoors"],
  "The cough Part 1": ["lifestyle"],
  "The cough Part 2": ["lifestyle"],
  "The cough Part 3": ["lifestyle"],
  "Monster trucks": ["diy"],
  "sub for sub": ["lifestyle"],
  "BIG D": ["gaming"],
  "BIG D Live Stream Rust.f136": ["gaming"],
  "BIG D Live Stream Rust.temp": ["gaming"],
  "BIG D Live Stream Rust.f140": ["gaming"],
  "NEW WPRLD": ["gaming"],
  "Ottawa Live": ["gaming"],
  "When Farmer Go out to play": ["gaming"],

  // tigga_2020 fixes
  "Our first time up in the air. Niagara falls helicopter ride.": ["lifestyle", "outdoors"],
  "TEMU CANADA.  IT WORKS": ["lifestyle"],
  "April 5, 2023": ["lifestyle"],
  "First time attempting to grow seeds into Herbs instead of buying them already grown.": ["outdoors", "cooking"],
  "Growing herbs⧸ peppers part 2": ["outdoors", "cooking"],
};

// ─── ENHANCED KEYWORD RULES ─────────────────────────────────────────
// [pattern, tag, options]
// pattern can be a string (substring match) or regex
interface TagRule {
  pattern: string | RegExp;
  tag: string;
}

const TAG_RULES: TagRule[] = [
  // gaming - game titles and gaming terms
  { pattern: /\brust\b/i, tag: "gaming" },
  { pattern: /\brusty\b/i, tag: "gaming" },
  { pattern: /\brustafied\b/i, tag: "gaming" },
  { pattern: /cs[\s-]*go/i, tag: "gaming" },
  { pattern: /csgo/i, tag: "gaming" },
  { pattern: /\bfortnite\b/i, tag: "gaming" },
  { pattern: /\bh1z1\b/i, tag: "gaming" },
  { pattern: /\btarkov\b/i, tag: "gaming" },
  { pattern: /\beft\b/i, tag: "gaming" },
  { pattern: /\bvalheim\b/i, tag: "gaming" },
  { pattern: /\bpubg\b/i, tag: "gaming" },
  { pattern: /\bpugd\b/i, tag: "gaming" },
  { pattern: /battle royale/i, tag: "gaming" },
  { pattern: /\bpvp\b/i, tag: "gaming" },
  { pattern: /soda dungeon/i, tag: "gaming" },
  { pattern: /creativerse/i, tag: "gaming" },
  { pattern: /supreme commander/i, tag: "gaming" },
  { pattern: /king of the kill/i, tag: "gaming" },
  { pattern: /\braid\b/i, tag: "gaming" },
  { pattern: /oil rig/i, tag: "gaming" },
  { pattern: /solo survival/i, tag: "gaming" },
  { pattern: /\bdorms\b/i, tag: "gaming" },
  { pattern: /\bapg\b/i, tag: "gaming" },
  { pattern: /live stream/i, tag: "gaming" },
  { pattern: /new world/i, tag: "gaming" },
  { pattern: /\bwprld\b/i, tag: "gaming" },
  { pattern: /kill or be/i, tag: "gaming" },
  { pattern: /\bfps\b/i, tag: "gaming" },
  { pattern: /\besports\b/i, tag: "gaming" },
  { pattern: /\branked\b/i, tag: "gaming" },
  { pattern: /competitive/i, tag: "gaming" },
  { pattern: /minecraft/i, tag: "gaming" },
  { pattern: /warzone/i, tag: "gaming" },
  { pattern: /apex legends/i, tag: "gaming" },
  { pattern: /overwatch/i, tag: "gaming" },
  { pattern: /destiny\s*\d/i, tag: "gaming" },
  { pattern: /call of duty/i, tag: "gaming" },
  { pattern: /\bcod\b/i, tag: "gaming" },
  { pattern: /gta\s*(v|5|online)/i, tag: "gaming" },
  { pattern: /league of legends/i, tag: "gaming" },
  { pattern: /\blol\b.*\bgame\b/i, tag: "gaming" },
  { pattern: /\bvalorant\b/i, tag: "gaming" },
  { pattern: /rocket league/i, tag: "gaming" },
  { pattern: /dead by daylight/i, tag: "gaming" },
  { pattern: /among us/i, tag: "gaming" },
  { pattern: /sea of thieves/i, tag: "gaming" },
  { pattern: /ark survival/i, tag: "gaming" },
  { pattern: /\bfarmers?\b.*\bplay\b/i, tag: "gaming" },

  // game-dev - development tools and creation
  { pattern: /\bunity\b/i, tag: "game-dev" },
  { pattern: /unreal engine/i, tag: "game-dev" },
  { pattern: /\bunet\b/i, tag: "game-dev" },
  { pattern: /\bue[45]\b/i, tag: "game-dev" },
  { pattern: /\bgodot\b/i, tag: "game-dev" },
  { pattern: /contingency/i, tag: "game-dev" },
  { pattern: /coningency/i, tag: "game-dev" },
  { pattern: /dedicated server/i, tag: "game-dev" },
  { pattern: /map making/i, tag: "game-dev" },
  { pattern: /\bmodding\b/i, tag: "game-dev" },
  { pattern: /working on a map/i, tag: "game-dev" },
  { pattern: /car-building game/i, tag: "game-dev" },
  { pattern: /\bsgk2\b/i, tag: "game-dev" },
  { pattern: /steam.+sessions/i, tag: "game-dev" },
  { pattern: /farm the\w* all/i, tag: "game-dev" },

  // crypto - mining and cryptocurrency
  { pattern: /\bnicehash\b/i, tag: "crypto" },
  { pattern: /\bbitcoin\b/i, tag: "crypto" },
  { pattern: /mining rig/i, tag: "crypto" },
  { pattern: /mining bitcoin/i, tag: "crypto" },
  { pattern: /mining on/i, tag: "crypto" },
  { pattern: /hashrate/i, tag: "crypto" },
  { pattern: /gpu rig/i, tag: "crypto" },
  { pattern: /\br9 200\b/i, tag: "crypto" },
  { pattern: /rtx 3070.*mining/i, tag: "crypto" },
  { pattern: /mining.*rtx/i, tag: "crypto" },
  { pattern: /\bcrypto\b/i, tag: "crypto" },
  { pattern: /\bethereum\b/i, tag: "crypto" },
  { pattern: /\beth mining\b/i, tag: "crypto" },

  // diy - building, fixing, vehicles, electronics
  { pattern: /\btrailer\b/i, tag: "diy" },
  { pattern: /\bsolar\b/i, tag: "diy" },
  { pattern: /wrap(ping)?\s*(a\s*)?(boat|pontoon)/i, tag: "diy" },
  { pattern: /shrinkwrap/i, tag: "diy" },
  { pattern: /\belectrical\b/i, tag: "diy" },
  { pattern: /\bwiring\b/i, tag: "diy" },
  { pattern: /\bfixing\b/i, tag: "diy" },
  { pattern: /\brepair\b/i, tag: "diy" },
  { pattern: /\bengine\b/i, tag: "diy" },
  { pattern: /monster truck/i, tag: "diy" },
  { pattern: /\bwelding\b/i, tag: "diy" },
  { pattern: /\bgarage\b/i, tag: "diy" },
  { pattern: /\bmechanic\b/i, tag: "diy" },
  { pattern: /\bcamaro\b/i, tag: "diy" },
  { pattern: /\bdodge\b/i, tag: "diy" },
  { pattern: /\bram frame\b/i, tag: "diy" },
  { pattern: /car amp/i, tag: "diy" },
  { pattern: /\bgopro\b/i, tag: "diy" },
  { pattern: /\bgrowatt\b/i, tag: "diy" },
  { pattern: /\binvert(er|ed)\b/i, tag: "diy" },
  { pattern: /\bgtx\b/i, tag: "diy" },
  { pattern: /\b1000cc\b/i, tag: "diy" },
  { pattern: /\b120v\b/i, tag: "diy" },
  { pattern: /\bplow\b/i, tag: "diy" },
  { pattern: /ripping apart/i, tag: "diy" },
  { pattern: /\bbuild\b/i, tag: "diy" },
  { pattern: /woodwork/i, tag: "diy" },
  { pattern: /renovation/i, tag: "diy" },
  { pattern: /restore/i, tag: "diy" },

  // cooking - food, recipes, baking
  { pattern: /\brecipe\b/i, tag: "cooking" },
  { pattern: /\bbaking\b/i, tag: "cooking" },
  { pattern: /\bwaffle/i, tag: "cooking" },
  { pattern: /\bpierogi/i, tag: "cooking" },
  { pattern: /\bsauce\b/i, tag: "cooking" },
  { pattern: /\bcooking\b/i, tag: "cooking" },
  { pattern: /\bnachos\b/i, tag: "cooking" },
  { pattern: /\bdinner\b/i, tag: "cooking" },
  { pattern: /\bhomemade\b/i, tag: "cooking" },
  { pattern: /\bingredient/i, tag: "cooking" },
  { pattern: /\bburger/i, tag: "cooking" },
  { pattern: /\blasagna\b/i, tag: "cooking" },
  { pattern: /\bbread\b/i, tag: "cooking" },
  { pattern: /\bcookies?\b/i, tag: "cooking" },
  { pattern: /sweet treat/i, tag: "cooking" },
  { pattern: /\byummy\b/i, tag: "cooking" },
  { pattern: /\blunch\b/i, tag: "cooking" },
  { pattern: /\bfood\b/i, tag: "cooking" },
  { pattern: /\bsoup\b/i, tag: "cooking" },
  { pattern: /\bskewer/i, tag: "cooking" },
  { pattern: /pork chop/i, tag: "cooking" },
  { pattern: /\bpie\b/i, tag: "cooking" },
  { pattern: /\boreo\b/i, tag: "cooking" },
  { pattern: /\bnutella\b/i, tag: "cooking" },
  { pattern: /crunch wrap/i, tag: "cooking" },
  { pattern: /potato.*salad/i, tag: "cooking" },
  { pattern: /egg salad/i, tag: "cooking" },
  { pattern: /\bherbs?\b/i, tag: "cooking" },
  { pattern: /\bpeppers?\b/i, tag: "cooking" },
  { pattern: /\bmeal\b/i, tag: "cooking" },
  { pattern: /\bbaked\b/i, tag: "cooking" },
  { pattern: /\bloaf\b/i, tag: "cooking" },
  { pattern: /\bbuns?\b/i, tag: "cooking" },
  { pattern: /\bcrackers?\b/i, tag: "cooking" },
  { pattern: /sandwich/i, tag: "cooking" },
  { pattern: /easy\s*(dinner|yummy|homemade)/i, tag: "cooking" },
  { pattern: /#easyyummy/i, tag: "cooking" },
  { pattern: /dinnerrecipes/i, tag: "cooking" },
  { pattern: /\bbeef\b/i, tag: "cooking" },
  { pattern: /\bveggie/i, tag: "cooking" },
  { pattern: /\bvegetable/i, tag: "cooking" },
  { pattern: /caramel/i, tag: "cooking" },
  { pattern: /cameral/i, tag: "cooking" }, // typo in title

  // lifestyle - family, personal, vlogs
  { pattern: /\bfamily\b/i, tag: "lifestyle" },
  { pattern: /\bfam\b/i, tag: "lifestyle" },
  { pattern: /\bkids?\b/i, tag: "lifestyle" },
  { pattern: /\bkiddos\b/i, tag: "lifestyle" },
  { pattern: /\bholiday\b/i, tag: "lifestyle" },
  { pattern: /christmas/i, tag: "lifestyle" },
  { pattern: /\beaster\b/i, tag: "lifestyle" },
  { pattern: /halloween/i, tag: "lifestyle" },
  { pattern: /\bbirthday\b/i, tag: "lifestyle" },
  { pattern: /\bpet\b/i, tag: "lifestyle" },
  { pattern: /\bvlog\b/i, tag: "lifestyle" },
  { pattern: /memor(y|ies)/i, tag: "lifestyle" },
  { pattern: /\bhockey\b/i, tag: "lifestyle" },
  { pattern: /my babies/i, tag: "lifestyle" },
  { pattern: /my person/i, tag: "lifestyle" },
  { pattern: /my rock/i, tag: "lifestyle" },
  { pattern: /\bfyp\b/i, tag: "lifestyle" },
  { pattern: /\btiktok\b/i, tag: "lifestyle" },
  { pattern: /fam jam/i, tag: "lifestyle" },
  { pattern: /\blovins?\b/i, tag: "lifestyle" },
  { pattern: /\bcutie\b/i, tag: "lifestyle" },
  { pattern: /\bfriends?\b/i, tag: "lifestyle" },
  { pattern: /pulled over/i, tag: "lifestyle" },
  { pattern: /\bheart\b/i, tag: "lifestyle" },
  { pattern: /\bsoul\b/i, tag: "lifestyle" },
  { pattern: /\bcough\b/i, tag: "lifestyle" },
  { pattern: /\btemu\b/i, tag: "lifestyle" },
  { pattern: /photo\s*gallery/i, tag: "lifestyle" },
  { pattern: /goalie/i, tag: "lifestyle" },

  // outdoors - nature, outdoor activities
  { pattern: /\bnature\b/i, tag: "outdoors" },
  { pattern: /\bfishing\b/i, tag: "outdoors" },
  { pattern: /\bsunset\b/i, tag: "outdoors" },
  { pattern: /\bsunrise\b/i, tag: "outdoors" },
  { pattern: /\bflower/i, tag: "outdoors" },
  { pattern: /\bgarden\b/i, tag: "outdoors" },
  { pattern: /\bhike\b/i, tag: "outdoors" },
  { pattern: /\blake\b/i, tag: "outdoors" },
  { pattern: /\bcamping\b/i, tag: "outdoors" },
  { pattern: /\bbonfire\b/i, tag: "outdoors" },
  { pattern: /\bfirework/i, tag: "outdoors" },
  { pattern: /fierwork/i, tag: "outdoors" },
  { pattern: /\bdrone\b/i, tag: "outdoors" },
  { pattern: /\baerial\b/i, tag: "outdoors" },
  { pattern: /\bforest\b/i, tag: "outdoors" },
  { pattern: /\bwalk\b/i, tag: "outdoors" },
  { pattern: /niagara/i, tag: "outdoors" },
  { pattern: /helicopter/i, tag: "outdoors" },
  { pattern: /planter/i, tag: "outdoors" },
  { pattern: /\bseeds?\b/i, tag: "outdoors" },
  { pattern: /\bgrow(ing)?\b/i, tag: "outdoors" },

  // crafts - handmade items
  { pattern: /\bbracelet/i, tag: "crafts" },
  { pattern: /\borigami\b/i, tag: "crafts" },
  { pattern: /\bbookmark/i, tag: "crafts" },
  { pattern: /\bcraft\b/i, tag: "crafts" },
  { pattern: /\bcrochet/i, tag: "crafts" },
  { pattern: /\bknitting\b/i, tag: "crafts" },
  { pattern: /\bsewing\b/i, tag: "crafts" },
  { pattern: /friendship\s*bracelet/i, tag: "crafts" },
];

// ─── CREATOR FALLBACK TAGS ──────────────────────────────────────────
// If no tags matched from keywords, use these as defaults
const CREATOR_DEFAULTS: Record<string, string[]> = {
  kingrichard: ["gaming"],
  karebear: ["lifestyle"],
  tigga_2020: ["cooking"],
  aaronowen: ["outdoors"],
};

function assignTags(title: string, creatorUsername: string): string[] {
  // 1. Check explicit overrides first
  const override = TITLE_OVERRIDES[title];
  if (override) return override;

  // Also check partial title match for truncated titles
  for (const [overrideTitle, tags] of Object.entries(TITLE_OVERRIDES)) {
    if (title.startsWith(overrideTitle.substring(0, 30)) && overrideTitle.length > 30) {
      return tags;
    }
  }

  // 2. Apply keyword rules
  const tagSet = new Set<string>();
  for (const rule of TAG_RULES) {
    const matches = typeof rule.pattern === "string"
      ? title.toLowerCase().includes(rule.pattern.toLowerCase())
      : rule.pattern.test(title);
    if (matches) {
      tagSet.add(rule.tag);
    }
  }

  // 3. Resolve conflicts - if both gaming and game-dev matched, keep both
  // But if "rust" matched gaming but it's about puzzle/map making, game-dev takes priority
  // This is handled by overrides above

  // 4. If no tags found, use creator default
  if (tagSet.size === 0) {
    const defaults = CREATOR_DEFAULTS[creatorUsername];
    if (defaults) return defaults;
    return ["lifestyle"]; // ultimate fallback
  }

  return Array.from(tagSet);
}

async function main() {
  const videos = await prisma.video.findMany({
    include: { creator: { select: { username: true } } },
  });

  console.log(`Re-tagging ${videos.length} videos with enhanced system...\n`);

  let changed = 0;
  let unchanged = 0;
  const changes: string[] = [];

  for (const v of videos) {
    const oldTags = Array.isArray(v.tags) ? (v.tags as string[]).sort() : [];
    const newTags = assignTags(v.title, v.creator.username).sort();

    const oldStr = oldTags.join(",");
    const newStr = newTags.join(",");

    if (oldStr !== newStr) {
      await prisma.video.update({
        where: { id: v.id },
        data: { tags: newTags },
      });
      changes.push(`  [${v.creator.username}] "${v.title}": [${oldStr}] -> [${newStr}]`);
      changed++;
    } else {
      unchanged++;
    }
  }

  if (changes.length > 0) {
    console.log("=== CHANGES ===");
    for (const c of changes) console.log(c);
  }

  console.log(`\nChanged: ${changed}`);
  console.log(`Unchanged: ${unchanged}`);

  // Final tag distribution
  const allVideos = await prisma.video.findMany();
  const tagCounts: Record<string, number> = {};
  for (const v of allVideos) {
    const tags = Array.isArray(v.tags) ? v.tags : [];
    for (const t of tags as string[]) {
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    }
  }

  console.log("\n=== FINAL TAG DISTRIBUTION ===");
  for (const [tag, count] of Object.entries(tagCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${tag}: ${count}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
