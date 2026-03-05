import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureFivemTables, normalizeFivemSlug, validateFivemApiKey } from "@/lib/fivem/server-db";
import { getResourcesPath, workspaceExists } from "@/lib/fivem/workspace";
import fs from "fs";
import path from "path";

// GET — FiveM server downloads a single file from workspace (requires X-Api-Key)
// Query: ?path=HK-debug/server/main.lua
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    await ensureFivemTables();
    const { slug: rawSlug } = await params;
    const slug = normalizeFivemSlug(rawSlug);

    const authResult = await validateFivemApiKey(slug, request);
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    if (!workspaceExists(slug)) {
      return NextResponse.json({ error: "Workspace not found — upload resources first" }, { status: 404 });
    }

    const filePath = request.nextUrl.searchParams.get("path");
    if (!filePath) {
      return NextResponse.json({ error: "Missing 'path' query parameter" }, { status: 400 });
    }

    // Directory traversal protection
    const resourcesDir = getResourcesPath(slug);
    const resolved = path.resolve(resourcesDir, filePath);
    if (!resolved.startsWith(path.resolve(resourcesDir))) {
      return NextResponse.json({ error: "Forbidden — path traversal detected" }, { status: 403 });
    }

    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const content = fs.readFileSync(resolved, "utf-8");
    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("GET /api/fivem/servers/[slug]/resources/download error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
