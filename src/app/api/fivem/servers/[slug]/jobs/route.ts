import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ensureFivemTables, normalizeFivemSlug } from "@/lib/fivem/server-db";

async function getEditorServerId(slug: string, userId: string): Promise<string | null> {
  // Check if user is server owner
  const ownerRows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM FivemServer WHERE slug = ${slug} AND ownerId = ${userId} LIMIT 1
  `;
  if (ownerRows[0]) return ownerRows[0].id;
  // Check if user has ADMIN or MODERATOR role
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT s.id
    FROM FivemServer s
    INNER JOIN FivemServerMember m ON m.serverId = s.id
    WHERE s.slug = ${slug}
      AND m.userId = ${userId}
      AND m.role IN ('ADMIN', 'MODERATOR')
      AND m.status = 'ACTIVE'
    LIMIT 1
  `;
  return rows[0]?.id ?? null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    await ensureFivemTables();
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { slug: rawSlug } = await params;
    const slug = normalizeFivemSlug(rawSlug);
    const serverId = await getEditorServerId(slug, user.id);
    if (!serverId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
    const title = String(body?.title || "").trim();
    const description = String(body?.description || "").trim();
    const whitelistOnly = Boolean(body?.whitelistOnly);
    const sortOrder = Number(body?.sortOrder || 0);
    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const ids = await prisma.$queryRaw<{ id: string }[]>`SELECT UUID() AS id`;
    const jobId = ids[0]?.id;
    if (!jobId) {
      return NextResponse.json({ error: "Unable to create job id" }, { status: 500 });
    }

    await prisma.$executeRaw`
      INSERT INTO FivemServerJob
      (id, serverId, title, description, whitelistOnly, isActive, sortOrder, createdAt, updatedAt)
      VALUES
      (${jobId}, ${serverId}, ${title.slice(0, 120)}, ${description.slice(0, 1000)}, ${whitelistOnly}, ${true}, ${Math.max(0, Math.trunc(sortOrder))}, ${new Date()}, ${new Date()})
    `;

    return NextResponse.json({ ok: true, id: jobId }, { status: 201 });
  } catch (error) {
    console.error("POST /api/fivem/servers/[slug]/jobs error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

