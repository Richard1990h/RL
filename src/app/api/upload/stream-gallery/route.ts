import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import path from "path";
import fs from "fs/promises";

export const runtime = "nodejs";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

// POST: Upload a stream gallery image (camera off / mute overlay)
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const type = formData.get("type") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!type || !["camera", "microphone"].includes(type)) {
      return NextResponse.json({ error: "Invalid type. Must be 'camera' or 'microphone'" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Must be JPEG, PNG, GIF, or WebP" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large. Maximum 10MB" }, { status: 400 });
    }

    // Build save path
    const uploadsDir = path.isAbsolute(UPLOAD_DIR) ? UPLOAD_DIR : path.join(process.cwd(), UPLOAD_DIR);
    const ext = path.extname(file.name) || ".png";
    const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const galleryDir = path.join(uploadsDir, user.id, "stream-gallery", type);

    await fs.mkdir(galleryDir, { recursive: true });

    const filePath = path.join(galleryDir, safeName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, buffer);

    // Return the URL path that the uploads static route can serve
    const url = `/uploads/${user.id}/stream-gallery/${type}/${safeName}`;

    return NextResponse.json({ url });
  } catch (error) {
    console.error("POST /api/upload/stream-gallery error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
