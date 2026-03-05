import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureFivemTables, normalizeFivemSlug } from "@/lib/fivem/server-db";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await ensureFivemTables();

    const { slug: rawSlug } = await params;
    const slug = normalizeFivemSlug(rawSlug);
    const serverRows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM FivemServer WHERE slug = ${slug} LIMIT 1
    `;
    const serverId = serverRows[0]?.id;
    if (!serverId) return NextResponse.json({ error: "Server not found" }, { status: 404 });

    const existing = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM FivemServerMember WHERE serverId = ${serverId} AND userId = ${user.id} LIMIT 1
    `;
    if (existing.length > 0) {
      await prisma.$executeRaw`
        UPDATE FivemServerMember
        SET status = ${"ACTIVE"}, updatedAt = ${new Date()}
        WHERE id = ${existing[0].id}
      `;
      return NextResponse.json({ ok: true, saved: true, updated: true });
    }

    const idRows = await prisma.$queryRaw<{ id: string }[]>`SELECT UUID() AS id`;
    const memberId = idRows[0]?.id;
    if (!memberId) return NextResponse.json({ error: "Could not create membership id" }, { status: 500 });

    await prisma.$executeRaw`
      INSERT INTO FivemServerMember
      (id, serverId, userId, role, status, createdAt, updatedAt)
      VALUES
      (${memberId}, ${serverId}, ${user.id}, ${"USER"}, ${"ACTIVE"}, ${new Date()}, ${new Date()})
    `;
    return NextResponse.json({ ok: true, saved: true });
  } catch (error) {
    console.error("POST /api/fivem/servers/[slug]/save error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

