import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ensureFivemTables, normalizeFivemSlug } from "@/lib/fivem/server-db";

type VipRow = {
  id: string;
  name: string;
  description: string | null;
  priceCredits: number;
  durationDays: number;
  isActive: boolean;
};

async function getServerRole(slug: string, userId: string | null): Promise<{ serverId: string; ownerId: string; role: string | null } | null> {
  const rows = await prisma.$queryRaw<{ id: string; ownerId: string; role: string | null }[]>`
    SELECT s.id, s.ownerId,
      (
        SELECT role
        FROM FivemServerMember m
        WHERE m.serverId = s.id AND m.userId = ${userId || ""} AND m.status = 'ACTIVE'
        LIMIT 1
      ) AS role
    FROM FivemServer s
    WHERE s.slug = ${slug}
    LIMIT 1
  `;
  return rows[0] ? { serverId: rows[0].id, ownerId: rows[0].ownerId, role: rows[0].role } : null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    await ensureFivemTables();
    const { slug: rawSlug } = await params;
    const slug = normalizeFivemSlug(rawSlug);
    const row = await getServerRole(slug, null);
    if (!row) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    const vipPackages = await prisma.$queryRaw<VipRow[]>`
      SELECT id, name, description, priceCredits, durationDays, isActive
      FROM FivemServerVipPackage
      WHERE serverId = ${row.serverId} AND isActive = true
      ORDER BY sortOrder ASC, createdAt ASC
      LIMIT 25
    `;
    return NextResponse.json({ vipPackages });
  } catch (error) {
    console.error("GET /api/fivem/servers/[slug]/vip error:", error);
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
    const row = await getServerRole(slug, user.id);
    if (!row || (row.ownerId !== user.id && row.role !== "ADMIN" && row.role !== "MODERATOR")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
    const name = String(body?.name || "").trim();
    const description = String(body?.description || "").trim();
    const priceCredits = Math.max(1, Math.trunc(Number(body?.priceCredits || 0)));
    const durationDays = Math.max(1, Math.trunc(Number(body?.durationDays || 30)));
    if (!name || !Number.isFinite(priceCredits)) {
      return NextResponse.json({ error: "Invalid VIP package" }, { status: 400 });
    }

    const ids = await prisma.$queryRaw<{ id: string }[]>`SELECT UUID() AS id`;
    const vipId = ids[0]?.id;
    if (!vipId) {
      return NextResponse.json({ error: "Unable to create VIP package id" }, { status: 500 });
    }

    await prisma.$executeRaw`
      INSERT INTO FivemServerVipPackage
      (id, serverId, name, description, priceCredits, durationDays, isActive, sortOrder, createdAt, updatedAt)
      VALUES
      (${vipId}, ${row.serverId}, ${name.slice(0, 120)}, ${description.slice(0, 1000)}, ${priceCredits}, ${durationDays}, ${true}, ${0}, ${new Date()}, ${new Date()})
    `;
    return NextResponse.json({ ok: true, id: vipId }, { status: 201 });
  } catch (error) {
    console.error("POST /api/fivem/servers/[slug]/vip error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

