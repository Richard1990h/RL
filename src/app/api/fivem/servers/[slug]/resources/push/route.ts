import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ensureFivemTables, normalizeFivemSlug } from "@/lib/fivem/server-db";
import { workspaceExists, pushResourcesToLocal } from "@/lib/fivem/workspace";
import crypto from "crypto";

async function getServerAndCheckAdmin(slug: string) {
  const servers = await prisma.$queryRaw<{ id: string; ownerId: string; resourcesLocalPath: string | null }[]>`
    SELECT id, ownerId, resourcesLocalPath FROM FivemServer WHERE slug = ${slug} LIMIT 1
  `;
  const server = servers[0];
  if (!server) return { error: "Server not found", status: 404 };

  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized", status: 401 };

  let isAdmin = server.ownerId === user.id;
  if (!isAdmin) {
    const memberRows = await prisma.$queryRaw<{ role: string }[]>`
      SELECT role FROM FivemServerMember
      WHERE serverId = ${server.id} AND userId = ${user.id} AND status = 'ACTIVE'
      LIMIT 1
    `;
    isAdmin = memberRows[0]?.role === "ADMIN" || memberRows[0]?.role === "MODERATOR";
  }
  if (!isAdmin) return { error: "Forbidden", status: 403 };

  return { server, user };
}

// POST — push selected resource folders from workspace back to FiveM server
// Body: { resources: ["[hk]", "oxmysql", ...] }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    await ensureFivemTables();
    const { slug: rawSlug } = await params;
    const slug = normalizeFivemSlug(rawSlug);

    const result = await getServerAndCheckAdmin(slug);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    if (!workspaceExists(slug)) {
      return NextResponse.json({ error: "No workspace — sync files first" }, { status: 404 });
    }

    const localPath = result.server.resourcesLocalPath;
    if (!localPath) {
      return NextResponse.json({ error: "No local path stored — re-sync from FiveM first" }, { status: 400 });
    }

    // Verify the destination path actually exists on disk
    const fs = await import("fs");
    const resolvedPath = (await import("path")).resolve(localPath);
    if (!fs.existsSync(resolvedPath)) {
      return NextResponse.json(
        { error: `FiveM resources path not found on disk: ${resolvedPath}` },
        { status: 400 },
      );
    }

    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    const resources: string[] = body?.resources;
    if (!Array.isArray(resources) || resources.length === 0) {
      return NextResponse.json({ error: "Provide 'resources' array of folder names to push" }, { status: 400 });
    }

    // Copy selected folders from workspace to FiveM local path
    const filesCopied = pushResourcesToLocal(slug, localPath, resources);
    console.log(`[workspace] Pushed ${filesCopied} files (${resources.length} folders) to ${localPath}`);

    // Create an ENSURE pending command so FiveM restarts the affected resources
    // For category folders like [hk], we need to list the child resources inside them
    const ensureResources: string[] = [];
    for (const name of resources) {
      if (name.startsWith("[")) {
        // Category folder — list its children as individual resource names
        const fs = await import("fs");
        const path = await import("path");
        const catPath = path.join(localPath, name);
        if (fs.existsSync(catPath)) {
          for (const child of fs.readdirSync(catPath, { withFileTypes: true })) {
            if (child.isDirectory()) ensureResources.push(child.name);
          }
        }
      } else {
        ensureResources.push(name);
      }
    }

    if (ensureResources.length > 0) {
      const cmdId = crypto.randomUUID();
      const now = new Date();
      const resourcesJson = JSON.stringify(ensureResources);
      await prisma.$executeRaw`
        INSERT INTO FivemPendingCommand (id, serverId, type, resources, reason, status, createdAt)
        VALUES (${cmdId}, ${result.server.id}, 'ENSURE', ${resourcesJson}, 'Admin pushed resources from workspace', 'PENDING', ${now})
      `;
    }

    return NextResponse.json({ ok: true, filesCopied, resourcesPushed: resources });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("POST /api/fivem/servers/[slug]/resources/push error:", error);

    // Detect file-lock / permission errors (FiveM holding files open)
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "EBUSY" || code === "EPERM" || code === "EACCES") {
      return NextResponse.json(
        { error: `File locked by FiveM — stop the resource first or restart the server. (${code}: ${msg})` },
        { status: 409 },
      );
    }

    return NextResponse.json({ error: msg || "Internal server error" }, { status: 500 });
  }
}
