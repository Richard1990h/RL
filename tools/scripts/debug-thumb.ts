import { PrismaClient } from "../../src/generated/prisma";
import { existsSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { execSync } from "child_process";

const prisma = new PrismaClient();
const UPLOAD_DIR = resolve(process.cwd(), process.env.UPLOAD_DIR || "../uploads");

async function main() {
  const v = await prisma.video.findFirst({ where: { thumbnailUrl: null } });
  if (!v) { console.log("No videos without thumbnails"); return; }

  console.log("Title:", v.title);
  console.log("videoUrl:", v.videoUrl);

  const cleaned = v.videoUrl!.replace(/^\/uploads\//, "");
  const parts = cleaned.split("/");
  const dir = join(UPLOAD_DIR, parts[0]);
  console.log("Upload dir:", dir);
  console.log("Dir exists:", existsSync(dir));
  if (existsSync(dir)) {
    console.log("Dir contents:", readdirSync(dir));
  }

  const fullPath = join(UPLOAD_DIR, cleaned);
  console.log("Full path:", fullPath);
  console.log("File exists:", existsSync(fullPath));

  // Try ffprobe
  if (existsSync(fullPath)) {
    try {
      const result = execSync(
        `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${fullPath}"`,
        { encoding: "utf-8", timeout: 15000 }
      );
      console.log("Duration:", result.trim());
    } catch (e: any) {
      console.log("ffprobe error:", e.stderr?.substring(0, 500) || e.message?.substring(0, 500));
    }

    // Try ffmpeg thumbnail
    const outPath = join(UPLOAD_DIR, "thumbnails", "test_thumb.jpg");
    try {
      execSync(
        `ffmpeg -y -ss 1 -i "${fullPath}" -vframes 1 -q:v 2 -vf "scale=640:-2" "${outPath}" 2>&1`,
        { encoding: "utf-8", timeout: 30000 }
      );
      console.log("Thumb generated:", existsSync(outPath));
    } catch (e: any) {
      console.log("ffmpeg error:", e.stdout?.substring(0, 500) || e.message?.substring(0, 500));
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
