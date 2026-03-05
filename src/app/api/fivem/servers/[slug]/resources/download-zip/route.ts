import { NextRequest, NextResponse } from "next/server";
import { ensureFivemTables, normalizeFivemSlug, validateFivemApiKey } from "@/lib/fivem/server-db";
import { getResourcesPath, workspaceExists } from "@/lib/fivem/workspace";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

// GET — serves a zip of specified workspace resource folders for the remote FiveM server to download
// Query: ?folders=[hk],[system] (comma-separated top-level folder names)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    await ensureFivemTables();
    const { slug: rawSlug } = await params;
    const slug = normalizeFivemSlug(rawSlug);

    const result = await validateFivemApiKey(slug, request);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    if (!workspaceExists(slug)) {
      return NextResponse.json({ error: "No workspace — sync files first" }, { status: 404 });
    }

    const foldersParam = request.nextUrl.searchParams.get("folders") || "";
    const folders = foldersParam.split(",").map(f => f.trim()).filter(Boolean);

    if (folders.length === 0) {
      return NextResponse.json({ error: "Provide 'folders' query param (comma-separated)" }, { status: 400 });
    }

    const resourcesDir = getResourcesPath(slug);
    const pathsToZip: string[] = [];

    for (const folder of folders) {
      // Prevent path traversal
      if (folder.includes("..") || folder.includes("/") || folder.includes("\\")) continue;
      const folderPath = path.join(resourcesDir, folder);
      if (fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
        pathsToZip.push(folderPath);
      }
    }

    if (pathsToZip.length === 0) {
      return NextResponse.json({ error: "No matching folders found in workspace" }, { status: 404 });
    }

    // Create zip in temp directory
    const tmpZip = path.join(os.tmpdir(), `workspace-download-${Date.now()}.zip`);
    const literalPaths = pathsToZip.map(p => `'${p}'`).join(", ");
    const psCmd = `Compress-Archive -LiteralPath @(${literalPaths}) -DestinationPath '${tmpZip}' -Force`;
    execSync(`powershell -NoProfile -Command "${psCmd}"`, { timeout: 180000 });

    const zipBuffer = fs.readFileSync(tmpZip);

    // Cleanup
    try { fs.unlinkSync(tmpZip); } catch { /* ignore */ }

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="resources-${slug}.zip"`,
        "Content-Length": String(zipBuffer.length),
      },
    });
  } catch (error) {
    console.error("GET /api/fivem/servers/[slug]/resources/download-zip error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
