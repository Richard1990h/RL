import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ensureFivemTables, normalizeFivemSlug } from "@/lib/fivem/server-db";
import { FIVEM_PLATFORM_FEE_PCT } from "@/lib/fivem/fees";

type ServerRow = { id: string; ownerId: string; role: string | null };

async function getServerAccess(slug: string, userId: string): Promise<ServerRow | null> {
  const rows = await prisma.$queryRaw<ServerRow[]>`
    SELECT s.id, s.ownerId,
      (
        SELECT role
        FROM FivemServerMember m
        WHERE m.serverId = s.id AND m.userId = ${userId} AND m.status = 'ACTIVE'
        LIMIT 1
      ) AS role
    FROM FivemServer s
    WHERE s.slug = ${slug}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    await ensureFivemTables();
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { slug: rawSlug } = await params;
    const slug = normalizeFivemSlug(rawSlug);
    const access = await getServerAccess(slug, user.id);
    if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });

    const rows = await prisma.$queryRaw<{ jobApplicationFeeCredits: number; ruleApplicationFeeCredits: number }[]>`
      SELECT jobApplicationFeeCredits, ruleApplicationFeeCredits
      FROM FivemServerFeeConfig
      WHERE serverId = ${access.id}
      LIMIT 1
    `;
    return NextResponse.json({
      fees: rows[0] ?? { jobApplicationFeeCredits: 0, ruleApplicationFeeCredits: 0 },
      platformFeePct: FIVEM_PLATFORM_FEE_PCT,
    });
  } catch (error) {
    console.error("GET /api/fivem/servers/[slug]/fees error:", error);
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
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { slug: rawSlug } = await params;
    const slug = normalizeFivemSlug(rawSlug);
    const access = await getServerAccess(slug, user.id);
    if (!access) return NextResponse.json({ error: "Server not found" }, { status: 404 });
    const isAdmin = access.ownerId === user.id || access.role === "ADMIN" || access.role === "MODERATOR";
    if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
    const jobApplicationFeeCredits = Math.max(0, Math.trunc(Number(body?.jobApplicationFeeCredits ?? 0)));
    const ruleApplicationFeeCredits = Math.max(0, Math.trunc(Number(body?.ruleApplicationFeeCredits ?? 0)));

    const existing = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM FivemServerFeeConfig WHERE serverId = ${access.id} LIMIT 1
    `;
    if (existing.length > 0) {
      await prisma.$executeRaw`
        UPDATE FivemServerFeeConfig
        SET jobApplicationFeeCredits = ${jobApplicationFeeCredits},
            ruleApplicationFeeCredits = ${ruleApplicationFeeCredits},
            vipFeePct = ${FIVEM_PLATFORM_FEE_PCT},
            updatedAt = ${new Date()}
        WHERE id = ${existing[0].id}
      `;
    } else {
      const ids = await prisma.$queryRaw<{ id: string }[]>`SELECT UUID() AS id`;
      const id = ids[0]?.id;
      if (!id) return NextResponse.json({ error: "Unable to create config id" }, { status: 500 });
      await prisma.$executeRaw`
        INSERT INTO FivemServerFeeConfig
        (id, serverId, jobApplicationFeeCredits, ruleApplicationFeeCredits, vipFeePct, updatedAt)
        VALUES
        (${id}, ${access.id}, ${jobApplicationFeeCredits}, ${ruleApplicationFeeCredits}, ${FIVEM_PLATFORM_FEE_PCT}, ${new Date()})
      `;
    }
    return NextResponse.json({ ok: true, platformFeePct: FIVEM_PLATFORM_FEE_PCT });
  } catch (error) {
    console.error("PATCH /api/fivem/servers/[slug]/fees error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

