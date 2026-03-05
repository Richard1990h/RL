import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";
const uploadsDir = path.isAbsolute(UPLOAD_DIR) ? UPLOAD_DIR : path.join(process.cwd(), UPLOAD_DIR);
const CHUNK_DIR = path.join(uploadsDir, "_chunks");

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => null) as {
      uploadId?: string;
      fileName?: string;
      mimeType?: string;
      totalChunks?: number;
    } | null;

    if (!body?.uploadId || !body.fileName || !body.totalChunks) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(body.uploadId)) {
      return NextResponse.json({ error: "Invalid uploadId format" }, { status: 400 });
    }

    const chunkDir = path.join(CHUNK_DIR, body.uploadId);
    await fs.mkdir(chunkDir, { recursive: true });
    await fs.writeFile(path.join(chunkDir, "meta.json"), JSON.stringify({
      userId: user.id,
      fileName: body.fileName,
      mimeType: body.mimeType ?? "application/octet-stream",
      totalChunks: body.totalChunks,
      createdAt: new Date().toISOString(),
    }));

    return NextResponse.json({ ok: true, uploadId: body.uploadId });
  } catch (error) {
    console.error("POST /api/upload/session error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
