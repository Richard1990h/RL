import { NextRequest, NextResponse } from "next/server";
import { getResourcesPath, workspaceExists } from "@/lib/fivem/workspace";
import fs from "fs";
import path from "path";

const RESOURCES_DIR_FALLBACK = "C:\\Users\\Richard\\Desktop\\Five M server\\txData\\FiveMBasicServerCFXDefault_90B233.base\\resources\\[hk]";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".htm": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

// GET — serve NUI files: /api/fivem/nui/ResourceName/html/file.ext?slug=xxx
// Accepts optional ?slug= param for per-server workspace, falls back to local path
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path: segments } = await params;
    if (!segments || segments.length < 2) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    const slug = request.nextUrl.searchParams.get("slug");
    const RESOURCES_DIR = slug && workspaceExists(slug)
      ? getResourcesPath(slug)
      : RESOURCES_DIR_FALLBACK;

    const resourceName = segments[0];
    const filePath = segments.slice(1).join("/");

    // Directory traversal protection
    const resolved = path.resolve(RESOURCES_DIR, resourceName, filePath);
    const resourceRoot = path.resolve(RESOURCES_DIR, resourceName);
    if (!resolved.startsWith(resourceRoot)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const ext = path.extname(resolved).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    const content = fs.readFileSync(resolved);
    return new NextResponse(content, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("GET /api/fivem/nui/[...path] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
