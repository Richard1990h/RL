// TODO: Video bytes currently transit through Node.js on every request
// via the next.config.ts rewrite (/uploads/* -> /api/uploads/*).
// For production, video files should be served directly by a static file
// server (nginx, Caddy) or a CDN, bypassing Node.js entirely. This would
// eliminate per-chunk event loop overhead and enable kernel-level sendfile.
import { NextRequest, NextResponse } from "next/server";
import { createReadStream, existsSync, statSync } from "fs";
import { join, isAbsolute, resolve } from "path";
import { Readable } from "stream";

const UPLOAD_DIR_RAW = process.env.UPLOAD_DIR || "./uploads";
const UPLOAD_DIR = isAbsolute(UPLOAD_DIR_RAW) ? UPLOAD_DIR_RAW : resolve(process.cwd(), UPLOAD_DIR_RAW);

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/mp4", // Serve as mp4 — browsers handle mp4 better than quicktime
  ".avi": "video/mp4",
  ".mkv": "video/webm",
  ".3gp": "video/mp4",
  ".3g2": "video/mp4",
  ".ogg": "video/ogg",
  ".ogv": "video/ogg",
  ".mpeg": "video/mpeg",
  ".mpg": "video/mpeg",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg_a": "audio/ogg",
  ".m4a": "audio/mp4",
};

function nodeStreamToWeb(nodeStream: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      nodeStream.on("end", () => {
        controller.close();
      });
      nodeStream.on("error", (err) => {
        controller.error(err);
      });
    },
    cancel() {
      nodeStream.destroy();
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const filePath = resolve(join(UPLOAD_DIR, ...path));

    // Security: prevent directory traversal
    const resolvedBase = resolve(UPLOAD_DIR);
    if (!filePath.startsWith(resolvedBase)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }

    if (!existsSync(filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    const stat = statSync(filePath);
    const fileSize = stat.size;
    const ext = "." + path[path.length - 1].split(".").pop()?.toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    // Handle Range requests for video/audio streaming
    const range = req.headers.get("range");

    if (range && (contentType.startsWith("video/") || contentType.startsWith("audio/"))) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      const stream = createReadStream(filePath, { start, end });

      return new Response(nodeStreamToWeb(stream), {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunkSize),
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    // Non-range request: stream the full file
    const stream = createReadStream(filePath);

    return new Response(nodeStreamToWeb(stream), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(fileSize),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to serve file" }, { status: 500 });
  }
}
