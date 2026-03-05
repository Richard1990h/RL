import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";
const uploadsDir = path.isAbsolute(UPLOAD_DIR) ? UPLOAD_DIR : path.join(process.cwd(), UPLOAD_DIR);
const CHUNK_DIR = path.join(uploadsDir, "_chunks");

function decodeBase64(base64: string): Buffer {
  return Buffer.from(base64, "base64");
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => null) as {
      uploadId?: string;
      chunkIndex?: number;
      totalChunks?: number;
      fileName?: string;
      chunkBase64?: string;
    } | null;

    if (!body?.uploadId || typeof body.chunkIndex !== "number" || typeof body.totalChunks !== "number" || !body.fileName || !body.chunkBase64) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(body.uploadId)) {
      return NextResponse.json({ error: "Invalid uploadId format" }, { status: 400 });
    }

    if (body.chunkIndex < 0 || body.chunkIndex >= body.totalChunks || body.totalChunks < 1) {
      return NextResponse.json({ error: "Invalid chunk index or total" }, { status: 400 });
    }

    const chunkDir = path.join(CHUNK_DIR, body.uploadId);
    const metaPath = path.join(chunkDir, "meta.json");

    try {
      const metaRaw = await fs.readFile(metaPath, "utf-8");
      const meta = JSON.parse(metaRaw) as { userId?: string; totalChunks?: number };
      if (meta.userId !== user.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
      if (meta.totalChunks !== body.totalChunks) {
        return NextResponse.json({ error: "Chunk total mismatch" }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "Upload session not found" }, { status: 404 });
    }

    const chunkBytes = decodeBase64(body.chunkBase64);
    if (chunkBytes.byteLength === 0) {
      return NextResponse.json({ error: "Chunk was empty" }, { status: 400 });
    }

    await fs.writeFile(path.join(chunkDir, `chunk_${body.chunkIndex}`), chunkBytes);

    return NextResponse.json({
      uploadId: body.uploadId,
      chunkIndex: body.chunkIndex,
      received: true,
      size: chunkBytes.byteLength,
    });
  } catch (error) {
    console.error("POST /api/upload/chunk-json error:", error);
    return NextResponse.json({ error: "Chunk upload failed" }, { status: 500 });
  }
}
