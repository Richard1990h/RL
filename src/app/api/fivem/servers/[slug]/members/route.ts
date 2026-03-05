import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ensureFivemTables, isValidMemberRole, normalizeFivemSlug } from "@/lib/fivem/server-db";

type MemberRow = {
  id: string;
  userId: string;
  role: string;
  status: string;
  username: string;
  displayName: string;
};

async function getAdminServerId(slug: string, userId: string): Promise<string | null> {
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

export async function GET(
  _request: NextRequest,
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
    const serverId = await getAdminServerId(slug, user.id);
    if (!serverId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const members = await prisma.$queryRaw<MemberRow[]>`
      SELECT m.id, m.userId, m.role, m.status, u.username, u.displayName
      FROM FivemServerMember m
      INNER JOIN User u ON u.id = m.userId
      WHERE m.serverId = ${serverId}
      ORDER BY FIELD(m.role, 'ADMIN', 'MODERATOR', 'USER'), u.username ASC
      LIMIT 300
    `;

    return NextResponse.json({ members });
  } catch (error) {
    console.error("GET /api/fivem/servers/[slug]/members error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
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
    const serverId = await getAdminServerId(slug, user.id);
    if (!serverId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
    const username = String(body?.username || "").trim().toLowerCase();
    const roleRaw = String(body?.role || "USER").trim().toUpperCase();
    if (!username || !isValidMemberRole(roleRaw)) {
      return NextResponse.json({ error: "Valid username and role are required" }, { status: 400 });
    }

    const users = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM User WHERE LOWER(username) = ${username} LIMIT 1
    `;
    const targetUserId = users[0]?.id;
    if (!targetUserId) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const existing = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM FivemServerMember
      WHERE serverId = ${serverId} AND userId = ${targetUserId}
      LIMIT 1
    `;

    if (existing.length > 0) {
      await prisma.$executeRaw`
        UPDATE FivemServerMember
        SET role = ${roleRaw}, status = ${"ACTIVE"}, updatedAt = ${new Date()}
        WHERE id = ${existing[0].id}
      `;
      return NextResponse.json({ ok: true, updated: true });
    }

    const ids = await prisma.$queryRaw<{ id: string }[]>`SELECT UUID() AS id`;
    const memberId = ids[0]?.id;
    if (!memberId) {
      return NextResponse.json({ error: "Unable to create member id" }, { status: 500 });
    }

    await prisma.$executeRaw`
      INSERT INTO FivemServerMember
      (id, serverId, userId, role, status, createdAt, updatedAt)
      VALUES
      (${memberId}, ${serverId}, ${targetUserId}, ${roleRaw}, ${"ACTIVE"}, ${new Date()}, ${new Date()})
    `;

    return NextResponse.json({ ok: true, created: true });
  } catch (error) {
    console.error("POST /api/fivem/servers/[slug]/members error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
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
    const serverId = await getAdminServerId(slug, user.id);
    if (!serverId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
    const memberId = String(body?.memberId || "").trim();
    const roleRaw = String(body?.role || "").trim().toUpperCase();
    const statusRaw = String(body?.status || "ACTIVE").trim().toUpperCase();

    const validRole = isValidMemberRole(roleRaw);
    const validStatus = statusRaw === "BANNED" || statusRaw === "ACTIVE";
    if (!memberId || (!validRole && !validStatus)) {
      return NextResponse.json({ error: "Invalid member update" }, { status: 400 });
    }

    if (validRole) {
      await prisma.$executeRaw`
        UPDATE FivemServerMember
        SET role = ${roleRaw}, updatedAt = ${new Date()}
        WHERE id = ${memberId} AND serverId = ${serverId}
      `;
    }
    if (validStatus) {
      await prisma.$executeRaw`
        UPDATE FivemServerMember
        SET status = ${statusRaw}, updatedAt = ${new Date()}
        WHERE id = ${memberId} AND serverId = ${serverId}
      `;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/fivem/servers/[slug]/members error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

