import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import path from "path";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";
const uploadsDir = path.isAbsolute(UPLOAD_DIR) ? UPLOAD_DIR : path.join(process.cwd(), UPLOAD_DIR);
const CHUNK_DIR = path.join(uploadsDir, "_chunks");

// GET: Check which chunks exist for an upload (for resume)
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const uploadId = request.nextUrl.searchParams.get("uploadId");
    if (!uploadId || !/^[a-zA-Z0-9_-]+$/.test(uploadId)) {
      return NextResponse.json({ error: "Invalid uploadId" }, { status: 400 });
    }

    const chunkDir = path.join(CHUNK_DIR, uploadId);

    try {
      const files = await fs.readdir(chunkDir);
      const completedChunks = files
        .filter((f) => f.startsWith("chunk_"))
        .map((f) => parseInt(f.replace("chunk_", ""), 10))
        .filter((n) => !isNaN(n))
        .sort((a, b) => a - b);

      return NextResponse.json({ uploadId, completedChunks });
    } catch {
      // Directory doesn't exist yet — no chunks uploaded
      return NextResponse.json({ uploadId, completedChunks: [] });
    }
  } catch (error) {
    console.error("GET /api/upload/chunk error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST: Upload a single chunk
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const chunk = formData.get("chunk") as File | null;
    const uploadId = formData.get("uploadId") as string | null;
    const chunkIndex = parseInt(formData.get("chunkIndex") as string, 10);
    const totalChunks = parseInt(formData.get("totalChunks") as string, 10);
    const fileName = formData.get("fileName") as string | null;

    if (!chunk || !uploadId || isNaN(chunkIndex) || isNaN(totalChunks) || !fileName) {
      return NextResponse.json(
        { error: "Missing required fields: chunk, uploadId, chunkIndex, totalChunks, fileName" },
        { status: 400 }
      );
    }

    // Validate uploadId format (prevent path traversal)
    if (!/^[a-zA-Z0-9_-]+$/.test(uploadId)) {
      return NextResponse.json({ error: "Invalid uploadId format" }, { status: 400 });
    }

    if (chunkIndex < 0 || chunkIndex >= totalChunks || totalChunks < 1) {
      return NextResponse.json({ error: "Invalid chunk index or total" }, { status: 400 });
    }

    // Cap at 10000 chunks (50MB * 10000 = ~500GB theoretical max)
    if (totalChunks > 10000) {
      return NextResponse.json({ error: "Too many chunks" }, { status: 400 });
    }

    const chunkDir = path.join(CHUNK_DIR, uploadId);
    await fs.mkdir(chunkDir, { recursive: true });

    // Save metadata on first chunk
    const metaPath = path.join(chunkDir, "meta.json");
    try {
      const metaRaw = await fs.readFile(metaPath, "utf-8");
      const meta = JSON.parse(metaRaw) as { userId?: string; totalChunks?: number; fileName?: string };
      if (meta.userId !== user.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
      if (meta.totalChunks !== totalChunks) {
        return NextResponse.json({ error: "Chunk total mismatch" }, { status: 400 });
      }
    } catch {
      await fs.writeFile(metaPath, JSON.stringify({
        userId: user.id,
        fileName,
        totalChunks,
        createdAt: new Date().toISOString(),
      }));
    }

    // Write chunk to disk
    const chunkPath = path.join(chunkDir, `chunk_${chunkIndex}`);
    const arrayBuffer = await chunk.arrayBuffer();
    const nodeBuffer = Buffer.from(arrayBuffer);
    const readable = Readable.from(nodeBuffer);
    const writable = createWriteStream(chunkPath);
    await pipeline(readable, writable);

    // Verify chunk was written
    const stat = await fs.stat(chunkPath);
    if (stat.size === 0) {
      await fs.unlink(chunkPath);
      return NextResponse.json({ error: "Chunk was empty" }, { status: 400 });
    }

    return NextResponse.json({
      uploadId,
      chunkIndex,
      received: true,
      size: stat.size,
    });
  } catch (error) {
    console.error("POST /api/upload/chunk error:", error);
    return NextResponse.json({ error: "Chunk upload failed" }, { status: 500 });
  }
}
