import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs/promises";
import { createWriteStream, createReadStream } from "fs";
import { pipeline } from "stream/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";
const uploadsBase = path.isAbsolute(UPLOAD_DIR) ? UPLOAD_DIR : path.join(process.cwd(), UPLOAD_DIR);
const CHUNK_DIR = path.join(uploadsBase, "_chunks");

const ALLOWED_EXTENSIONS = [
  ".mp4", ".webm", ".mov", ".avi", ".mkv", ".3gp", ".3g2", ".ogg", ".mpeg", ".mpg", ".m4v",
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg",
];

// POST: Assemble chunks into final file
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { uploadId, totalChunks, fileName } = body;

    if (!uploadId || !totalChunks || !fileName) {
      return NextResponse.json(
        { error: "Missing required fields: uploadId, totalChunks, fileName" },
        { status: 400 }
      );
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(uploadId)) {
      return NextResponse.json({ error: "Invalid uploadId format" }, { status: 400 });
    }

    const chunkDir = path.join(CHUNK_DIR, uploadId);

    // Verify metadata matches current user
    try {
      const metaRaw = await fs.readFile(path.join(chunkDir, "meta.json"), "utf-8");
      const meta = JSON.parse(metaRaw);
      if (meta.userId !== user.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Upload session not found" }, { status: 404 });
    }

    // Verify all chunks exist
    const missingChunks: number[] = [];
    for (let i = 0; i < totalChunks; i++) {
      try {
        await fs.access(path.join(chunkDir, `chunk_${i}`));
      } catch {
        missingChunks.push(i);
      }
    }

    if (missingChunks.length > 0) {
      return NextResponse.json({
        error: `Missing ${missingChunks.length} chunk(s)`,
        missingChunks,
      }, { status: 400 });
    }

    // Create final file destination under user's email
    const finalId = uuidv4();
    const finalDir = path.join(uploadsBase, user.email, "videos", finalId);
    await fs.mkdir(finalDir, { recursive: true });

    // Sanitize filename
    const ext = path.extname(fileName).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      // Cleanup chunks
      await fs.rm(chunkDir, { recursive: true, force: true });
      return NextResponse.json({ error: `File type '${ext}' not allowed` }, { status: 400 });
    }

    const baseName = path.basename(fileName, path.extname(fileName)).replace(/[^a-zA-Z0-9._-]/g, "_") || "upload";
    const originalName = `${baseName}${ext}`;
    const finalPath = path.join(finalDir, originalName);

    // Assemble chunks into final file
    try {
      const writeStream = createWriteStream(finalPath);

      for (let i = 0; i < totalChunks; i++) {
        const chunkPath = path.join(chunkDir, `chunk_${i}`);
        const readStream = createReadStream(chunkPath);
        await pipeline(readStream, writeStream, { end: false });
      }

      writeStream.end();
      await new Promise<void>((resolve, reject) => {
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
      });
    } catch (assembleError) {
      console.error("Assembly error:", assembleError);
      // Cleanup on failure
      try { await fs.rm(finalDir, { recursive: true }); } catch {}
      return NextResponse.json({ error: "Failed to assemble file" }, { status: 500 });
    }

    // Verify assembled file
    try {
      const stat = await fs.stat(finalPath);
      if (stat.size === 0) {
        await fs.rm(finalDir, { recursive: true });
        return NextResponse.json({ error: "Assembled file was empty" }, { status: 500 });
      }
    } catch {
      return NextResponse.json({ error: "Assembly verification failed" }, { status: 500 });
    }

    // Cleanup chunk directory
    try {
      await fs.rm(chunkDir, { recursive: true, force: true });
    } catch {
      // Non-critical, chunks will be cleaned up later
    }

    const relativePath = `uploads/${user.email}/videos/${finalId}/${originalName}`;
    const url = `/${relativePath}`;

    return NextResponse.json({
      url,
      path: relativePath,
      fileName: originalName,
      uploadId: finalId,
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/upload/complete error:", error);
    return NextResponse.json({ error: "Assembly failed" }, { status: 500 });
  }
}
