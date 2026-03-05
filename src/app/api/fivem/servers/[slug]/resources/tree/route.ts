import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ensureFivemTables, normalizeFivemSlug } from "@/lib/fivem/server-db";
import { workspaceExists, getResourceTree } from "@/lib/fivem/workspace";

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

// GET — return file tree of workspace resources
export async function GET(
  _request: NextRequest,
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

    const tree = getResourceTree(slug, 3, result.server.resourcesLocalPath ?? undefined);
    return NextResponse.json({
      tree,
      canPush: !!result.server.resourcesLocalPath,
    });
  } catch (error) {
    console.error("GET /api/fivem/servers/[slug]/resources/tree error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
