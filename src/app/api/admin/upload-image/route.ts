import { NextRequest, NextResponse } from "next/server";
import { requireOwnerWithDevice } from "@/lib/auth";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const ADMIN_IMAGES_DIR = path.join(
  process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads"),
  "admin-images"
);

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp"];
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

export async function POST(req: NextRequest) {
  try {
    await requireOwnerWithDevice();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Only images allowed (jpeg, png, gif, webp)" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large (max 20MB)" }, { status: 400 });
    }

    await fs.mkdir(ADMIN_IMAGES_DIR, { recursive: true });

    const ext = path.extname(file.name) || ".png";
    const filename = `${randomUUID()}${ext.toLowerCase()}`;
    const filePath = path.join(ADMIN_IMAGES_DIR, filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, buffer);

    // Return the absolute path on disk (for Claude Code to read)
    return NextResponse.json({
      absolutePath: filePath,
      filename,
    });
  } catch (error) {
    console.error("Admin image upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
