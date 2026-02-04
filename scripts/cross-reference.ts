import { PrismaClient } from "../src/generated/prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

const YOUTUBE_DIR = "L:/.youtube";
const FOLDER_TO_USERNAME: Record<string, string> = {
  "aaronfamous1": "aaronowen",
  "karebear": "karebear", 
  "king": "kingrichard",
  "tigger_2020": "tigga_2020",
};

function normalize(s: string): string {
  return s.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  // Get all videos from DB
  const videos = await prisma.video.findMany({
    include: { creator: { select: { username: true } } }
  });

  console.log(`Database videos: ${videos.length}\n`);

  // Build normalized title map per creator
  const dbByCreator: Record<string, Map<string, any>> = {};
  for (const v of videos) {
    const user = v.creator.username;
    if (!dbByCreator[user]) dbByCreator[user] = new Map();
    dbByCreator[user].set(normalize(v.title), v);
  }

  // Scan disk
  const folders = fs.readdirSync(YOUTUBE_DIR);
  
  for (const folder of folders) {
    const folderPath = path.join(YOUTUBE_DIR, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;
    
    const username = FOLDER_TO_USERNAME[folder];
    if (!username) {
      console.log(`WARNING: Unknown folder ${folder}, no username mapping`);
      continue;
    }

    const files = fs.readdirSync(folderPath).filter(f => 
      /\.(mp4|mkv|webm|mov|avi)$/i.test(f)
    );

    const dbMap = dbByCreator[username] || new Map();
    
    console.log(`\n=== ${folder} -> ${username} ===`);
    console.log(`  Disk files: ${files.length}`);
    console.log(`  DB videos: ${dbMap.size}`);

    // Find disk files not in DB
    const notInDb: string[] = [];
    const matched: string[] = [];
    for (const file of files) {
      const nameNoExt = file.replace(/\.[^.]+$/, '');
      const norm = normalize(nameNoExt);
      
      // Try exact normalized match
      let found = false;
      for (const [dbNorm, dbVideo] of dbMap.entries()) {
        if (dbNorm === norm || dbNorm.includes(norm) || norm.includes(dbNorm)) {
          matched.push(`${file} <-> "${dbVideo.title}"`);
          found = true;
          break;
        }
      }
      if (!found) {
        notInDb.push(file);
      }
    }

    console.log(`  Matched: ${matched.length}`);
    console.log(`  NOT in DB: ${notInDb.length}`);
    if (notInDb.length > 0) {
      for (const f of notInDb) {
        console.log(`    MISSING: ${f}`);
      }
    }
  }

  // Check videoUrl file existence
  console.log(`\n\n=== VIDEO FILE EXISTENCE CHECK ===`);
  let existCount = 0;
  let missingCount = 0;
  for (const v of videos) {
    if (v.videoUrl) {
      const fullPath = path.join("C:/Users/Richard/Desktop/Rally Live/rally-live", v.videoUrl.startsWith('/') ? v.videoUrl.slice(1) : v.videoUrl);
      if (fs.existsSync(fullPath)) {
        existCount++;
      } else {
        missingCount++;
        if (missingCount <= 10) {
          console.log(`  MISSING FILE: [${v.creator.username}] "${v.title}" -> ${v.videoUrl}`);
        }
      }
    }
  }
  console.log(`  Files exist: ${existCount}`);
  console.log(`  Files missing: ${missingCount}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
