import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ensureFivemTables, normalizeFivemSlug } from "@/lib/fivem/server-db";
import { workspaceExists, getResourcesPath, copyLocalResources } from "@/lib/fivem/workspace";
import crypto from "crypto";
import fs from "fs";
import path from "path";

function countFiles(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile()) count++;
    else if (entry.isDirectory()) count += countFiles(path.join(dir, entry.name));
  }
  return count;
}

function countResourceFolders(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('[')) {
      // Category folder — count its children as individual resources
      const catPath = path.join(dir, entry.name);
      count += fs.readdirSync(catPath, { withFileTypes: true }).filter(e => e.isDirectory()).length;
    } else {
      // Standalone resource (e.g. oxmysql)
      count++;
    }
  }
  return count;
}

async function getServerAndCheckAdmin(slug: string) {
  const servers = await prisma.$queryRaw<{ id: string; ownerId: string }[]>`
    SELECT id, ownerId FROM FivemServer WHERE slug = ${slug} LIMIT 1
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

// GET — check workspace status and sync command progress
// Optional: ?commandId=xxx to check a specific command
export async function GET(
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

    const hasWorkspace = workspaceExists(slug);
    const resourcesDir = getResourcesPath(slug);
    const fileCount = hasWorkspace ? countFiles(resourcesDir) : 0;
    const resourceCount = hasWorkspace ? countResourceFolders(resourcesDir) : 0;

    // Check specific command if requested
    const commandId = request.nextUrl.searchParams.get("commandId");
    let commandStatus: { id: string; status: string; createdAt: Date; executedAt: Date | null } | null = null;

    if (commandId) {
      const cmds = await prisma.$queryRaw<{ id: string; status: string; createdAt: Date; executedAt: Date | null }[]>`
        SELECT id, status, createdAt, executedAt
        FROM FivemPendingCommand
        WHERE id = ${commandId} AND serverId = ${result.server.id}
        LIMIT 1
      `;
      commandStatus = cmds[0] || null;
    }

    // Get the most recent sync-related command
    const recentCmds = await prisma.$queryRaw<{ id: string; type: string; status: string; createdAt: Date; executedAt: Date | null }[]>`
      SELECT id, type, status, createdAt, executedAt
      FROM FivemPendingCommand
      WHERE serverId = ${result.server.id} AND type = 'REQUEST_UPLOAD'
      ORDER BY createdAt DESC
      LIMIT 1
    `;
    const lastSync = recentCmds[0] || null;

    // Check if server has heartbeated recently (within 2 min)
    const serverRows = await prisma.$queryRaw<{ lastHeartbeatAt: Date | null }[]>`
      SELECT lastHeartbeatAt FROM FivemServer WHERE id = ${result.server.id} LIMIT 1
    `;
    const lastHb = serverRows[0]?.lastHeartbeatAt;
    const serverOnline = lastHb ? (Date.now() - new Date(lastHb).getTime()) < 120000 : false;

    return NextResponse.json({
      workspace: {
        exists: hasWorkspace,
        fileCount,
        resourceCount,
      },
      serverOnline,
      command: commandStatus,
      lastSync: lastSync ? {
        id: lastSync.id,
        status: lastSync.status,
        createdAt: lastSync.createdAt,
        executedAt: lastSync.executedAt,
      } : null,
    });
  } catch (error) {
    console.error("GET /api/fivem/servers/[slug]/resources/sync error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST — admin triggers a REQUEST_UPLOAD pending command so HK-debug re-uploads resources
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

    let body;
    try { body = await request.json(); } catch { body = {}; }
    const commandType = body?.type === "BACKUP" ? "BACKUP" : "REQUEST_UPLOAD";
    const reason = commandType === "BACKUP" ? "Admin requested backup" : "Admin requested resource sync";

    // For REQUEST_UPLOAD: try direct local copy if resourcesLocalPath is set (same machine)
    if (commandType === "REQUEST_UPLOAD") {
      const serverRows = await prisma.$queryRaw<{ resourcesLocalPath: string | null }[]>`
        SELECT resourcesLocalPath FROM FivemServer WHERE id = ${result.server.id} LIMIT 1
      `;
      const localPath = serverRows[0]?.resourcesLocalPath;
      if (localPath && fs.existsSync(localPath)) {
        try {
          const filesCopied = copyLocalResources(slug, localPath);
          console.log(`[sync] Direct local copy: ${filesCopied} files from ${localPath}`);
          return NextResponse.json({ ok: true, type: "LOCAL_COPY", filesCopied });
        } catch (e: any) {
          console.error(`[sync] Local copy failed, falling back to pending command:`, e);
          // Fall through to pending command
        }
      }
    }

    const id = crypto.randomUUID();
    const now = new Date();
    await prisma.$executeRaw`
      INSERT INTO FivemPendingCommand (id, serverId, type, resources, reason, status, createdAt)
      VALUES (${id}, ${result.server.id}, ${commandType}, '[]', ${reason}, 'PENDING', ${now})
    `;

    return NextResponse.json({ ok: true, commandId: id, type: commandType });
  } catch (error) {
    console.error("POST /api/fivem/servers/[slug]/resources/sync error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
