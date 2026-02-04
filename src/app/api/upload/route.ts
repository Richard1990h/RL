import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Allow large file uploads and long processing time
export const maxDuration = 300;

const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";
const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || "5000", 10);
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
  "video/3gpp",
  "video/3gpp2",
  "video/ogg",
  "video/mpeg",
];

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
];

const ALLOWED_TYPES = [...ALLOWED_VIDEO_TYPES, ...ALLOWED_IMAGE_TYPES];

// Android and some browsers send non-standard MIME types or octet-stream
// Detect by file extension as fallback
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".avi", ".mkv", ".3gp", ".3g2", ".ogg", ".mpeg", ".mpg", ".m4v"];
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"];

function isAllowedByExtension(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return VIDEO_EXTENSIONS.includes(ext) || IMAGE_EXTENSIONS.includes(ext);
}

// POST: Handle file upload
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type - check MIME type first, fall back to extension
    const mimeAllowed = ALLOWED_TYPES.includes(file.type);
    const extAllowed = isAllowedByExtension(file.name);

    if (!mimeAllowed && !extAllowed) {
      return NextResponse.json(
        { error: `File type '${file.type}' (${file.name}) not allowed. Supported: video (mp4, webm, mov, avi, mkv, 3gp), images (jpeg, png, gif, webp)` },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File too large (${(file.size / (1024 * 1024)).toFixed(0)}MB). Maximum size is ${MAX_FILE_SIZE_MB}MB` },
        { status: 400 }
      );
    }

    // Create a unique folder for this upload under user's email
    const uploadId = uuidv4();
    const uploadDir = path.isAbsolute(UPLOAD_DIR) ? UPLOAD_DIR : path.join(process.cwd(), UPLOAD_DIR);
    const uploadPath = path.join(uploadDir, user.email, "videos", uploadId);

    // Ensure base uploads directory exists
    await fs.mkdir(uploadPath, { recursive: true });

    // Sanitize filename - preserve extension
    const ext = path.extname(file.name) || ".mp4";
    const baseName = path.basename(file.name, ext).replace(/[^a-zA-Z0-9._-]/g, "_") || "upload";
    const originalName = `${baseName}${ext.toLowerCase()}`;
    const filePath = path.join(uploadPath, originalName);

    // Stream file to disk to handle large files without buffering entire file in memory
    try {
      const arrayBuffer = await file.arrayBuffer();
      const nodeBuffer = Buffer.from(arrayBuffer);
      const readable = Readable.from(nodeBuffer);
      const writable = createWriteStream(filePath);
      await pipeline(readable, writable);
    } catch (writeError) {
      console.error("File write error:", writeError);
      // Cleanup on failure
      try { await fs.rm(uploadPath, { recursive: true }); } catch {}
      return NextResponse.json(
        { error: "Failed to save file. Please try again." },
        { status: 500 }
      );
    }

    // Verify the file was written
    try {
      const stat = await fs.stat(filePath);
      if (stat.size === 0) {
        await fs.rm(uploadPath, { recursive: true });
        return NextResponse.json(
          { error: "File was empty after upload. Please try again." },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Upload verification failed. Please try again." },
        { status: 500 }
      );
    }

    const relativePath = `uploads/${user.email}/videos/${uploadId}/${originalName}`;
    const url = `/${relativePath}`;

    return NextResponse.json({
      url,
      path: relativePath,
      fileName: originalName,
      fileSize: file.size,
      fileType: file.type,
      uploadId,
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/upload error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Upload failed: ${message}` },
      { status: 500 }
    );
  }
}
