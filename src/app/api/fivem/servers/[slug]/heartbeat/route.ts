import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureFivemTables, normalizeFivemSlug, validateFivemApiKey } from "@/lib/fivem/server-db";
import { workspaceExists } from "@/lib/fivem/workspace";

// POST — FiveM server sends heartbeat (requires X-Api-Key)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    await ensureFivemTables();
    const { slug: rawSlug } = await params;
    const slug = normalizeFivemSlug(rawSlug);

    const result = await validateFivemApiKey(slug, request);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const server = result.server;

    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
    const onlinePlayers = Math.max(0, Math.trunc(Number(body?.onlinePlayers ?? 0)));
    const maxPlayers = Math.max(1, Math.trunc(Number(body?.maxPlayers ?? 64)));

    const now = new Date();
    await prisma.$executeRaw`
      UPDATE FivemServer
      SET onlinePlayers = ${onlinePlayers},
          maxPlayers = ${maxPlayers},
          lastHeartbeatAt = ${now},
          updatedAt = ${now}
      WHERE id = ${server.id}
    `;

    const needsSync = !workspaceExists(slug);
    return NextResponse.json({ ok: true, needsSync });
  } catch (error) {
    console.error("POST /api/fivem/servers/[slug]/heartbeat error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
