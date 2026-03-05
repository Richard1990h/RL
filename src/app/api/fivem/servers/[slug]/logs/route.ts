import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ensureFivemTables, normalizeFivemSlug, validateFivemApiKey } from "@/lib/fivem/server-db";
import { appendLogs, getRecentLogs } from "@/lib/fivem/server-logs";

// POST — FiveM server pushes console logs (requires X-Api-Key)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    await ensureFivemTables();
    const { slug: rawSlug } = await params;
    const slug = normalizeFivemSlug(rawSlug);

    const authResult = await validateFivemApiKey(slug, request);
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    const lines = body?.lines;
    if (!Array.isArray(lines)) {
      return NextResponse.json({ error: "lines must be an array" }, { status: 400 });
    }

    const cleaned = lines
      .filter((l: unknown) => typeof l === "string")
      .map((l: string) => l.slice(0, 2000)); // cap line length

    appendLogs(slug, cleaned);
    return NextResponse.json({ ok: true, stored: cleaned.length });
  } catch (error) {
    console.error("POST /api/fivem/servers/[slug]/logs error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET — admin fetches recent logs
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    await ensureFivemTables();
    const { slug: rawSlug } = await params;
    const slug = normalizeFivemSlug(rawSlug);

    const servers = await prisma.$queryRaw<{ id: string; ownerId: string }[]>`
      SELECT id, ownerId FROM FivemServer WHERE slug = ${slug} LIMIT 1
    `;
    const server = servers[0];
    if (!server) return NextResponse.json({ error: "Server not found" }, { status: 404 });

    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let isAdmin = server.ownerId === user.id;
    if (!isAdmin) {
      const memberRows = await prisma.$queryRaw<{ role: string }[]>`
        SELECT role FROM FivemServerMember
        WHERE serverId = ${server.id} AND userId = ${user.id} AND status = 'ACTIVE'
        LIMIT 1
      `;
      isAdmin = memberRows[0]?.role === "ADMIN" || memberRows[0]?.role === "MODERATOR";
    }
    if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const lines = getRecentLogs(slug);
    return NextResponse.json({ lines });
  } catch (error) {
    console.error("GET /api/fivem/servers/[slug]/logs error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
