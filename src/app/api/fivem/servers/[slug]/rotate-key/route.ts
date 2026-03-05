import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ensureFivemTables, normalizeFivemSlug, generateApiKey } from "@/lib/fivem/server-db";

// POST — Admin generates/rotates the API key for this server.
// Updates the DB immediately so the F8 commands show the new key.
// Admin copies the commands and pastes into their FiveM server to link it.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    await ensureFivemTables();
    const { slug: rawSlug } = await params;
    const slug = normalizeFivemSlug(rawSlug);
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Must be admin
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT s.id
      FROM FivemServer s
      INNER JOIN FivemServerMember m ON m.serverId = s.id
      WHERE s.slug = ${slug} AND m.userId = ${user.id} AND m.role = 'ADMIN' AND m.status = 'ACTIVE'
      LIMIT 1
    `;
    const serverId = rows[0]?.id;
    if (!serverId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Generate new key and update DB immediately
    const newKey = generateApiKey();
    await prisma.$executeRaw`
      UPDATE FivemServer SET apiKey = ${newKey}, updatedAt = ${new Date()} WHERE id = ${serverId}
    `;

    console.log(`[FiveM] API key rotated for server ${slug} by user ${user.id}`);

    return NextResponse.json({ ok: true, apiKey: newKey });
  } catch (error) {
    console.error("POST /api/fivem/servers/[slug]/rotate-key error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
