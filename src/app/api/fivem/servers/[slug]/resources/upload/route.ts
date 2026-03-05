import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureFivemTables, normalizeFivemSlug, validateFivemApiKey } from "@/lib/fivem/server-db";
import { extractUpload, copyLocalResources } from "@/lib/fivem/workspace";

// POST — FiveM server uploads resources (requires X-Api-Key)
// Supports two modes:
//   1. { zip: "<base64>" } — traditional zip upload
//   2. { localPath: "C:/path/to/[hk]" } — direct local copy (same machine)
export async function POST(
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

    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    // Mode 2: local path copy (FiveM and web server on same machine)
    const localPath = body?.localPath;
    if (localPath && typeof localPath === "string") {
      // Normalize the path — Lua json.encode may mangle Windows backslashes
      const path = await import("path");
      const normalizedPath = path.resolve(localPath);
      const filesCopied = copyLocalResources(slug, normalizedPath);
      console.log(`[workspace] Copied ${filesCopied} files from local path for server "${slug}"`);

      // Save the normalized path so we can push changes back later
      await prisma.$executeRaw`
        UPDATE FivemServer SET resourcesLocalPath = ${normalizedPath}
        WHERE id = ${authResult.server.id}
      `;

      return NextResponse.json({ ok: true, filesExtracted: filesCopied });
    }

    // Mode 1: base64 zip upload
    const zipBase64 = body?.zip;
    if (!zipBase64 || typeof zipBase64 !== "string") {
      return NextResponse.json({ error: "Missing 'zip' or 'localPath' field" }, { status: 400 });
    }

    const zipBuffer = Buffer.from(zipBase64, "base64");
    // Validate ZIP signature (PK\x03\x04)
    if (zipBuffer.length < 100 || zipBuffer[0] !== 0x50 || zipBuffer[1] !== 0x4B || zipBuffer[2] !== 0x03 || zipBuffer[3] !== 0x04) {
      return NextResponse.json({ error: "Invalid zip data — missing ZIP signature" }, { status: 400 });
    }

    const filesExtracted = extractUpload(slug, zipBuffer);

    console.log(`[workspace] Extracted ${filesExtracted} files for server "${slug}"`);

    // If localPath was also sent alongside zip, save it for push-back support
    const zipLocalPath = body?.localPath;
    if (zipLocalPath && typeof zipLocalPath === "string") {
      const path = await import("path");
      const normalizedZipPath = path.resolve(zipLocalPath);
      await prisma.$executeRaw`
        UPDATE FivemServer SET resourcesLocalPath = ${normalizedZipPath}
        WHERE id = ${authResult.server.id}
      `;
    }

    return NextResponse.json({ ok: true, filesExtracted });
  } catch (error) {
    console.error("POST /api/fivem/servers/[slug]/resources/upload error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}