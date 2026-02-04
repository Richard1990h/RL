import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs/promises";

export const runtime = "nodejs";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";

// POST: Save a base64 thumbnail image to disk
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { dataUrl } = await request.json();

    if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
      return NextResponse.json({ error: "Invalid thumbnail data" }, { status: 400 });
    }

    // Parse the data URL
    const matches = dataUrl.match(/^data:image\/(jpeg|png|webp|gif);base64,(.+)$/);
    if (!matches) {
      return NextResponse.json({ error: "Invalid image format" }, { status: 400 });
    }

    const ext = matches[1] === "jpeg" ? "jpg" : matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, "base64");

    // Limit thumbnail size to 2MB
    if (buffer.length > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "Thumbnail too large" }, { status: 400 });
    }

    // Save to disk under user's pictures folder
    const thumbId = uuidv4();
    const uploadsDir = path.isAbsolute(UPLOAD_DIR) ? UPLOAD_DIR : path.join(process.cwd(), UPLOAD_DIR);
    const thumbDir = path.join(uploadsDir, user.email, "pictures");
    await fs.mkdir(thumbDir, { recursive: true });

    const fileName = `${thumbId}.${ext}`;
    const filePath = path.join(thumbDir, fileName);
    await fs.writeFile(filePath, buffer);

    const url = `/uploads/${user.email}/pictures/${fileName}`;

    return NextResponse.json({ url }, { status: 201 });
  } catch (error) {
    console.error("POST /api/upload/thumbnail error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
