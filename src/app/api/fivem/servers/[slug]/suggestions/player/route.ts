import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureFivemTables, normalizeFivemSlug } from "@/lib/fivem/server-db";

type SuggestionRow = {
  id: string;
  playerName: string;
  playerId: string | null;
  title: string;
  description: string;
  howItWorks: string;
  whyItsGood: string | null;
  priority: string;
  category: string | null;
  status: string;
  adminNotes: string | null;
  screenshots: string | null;
  votes: number;
  createdAt: Date;
};

// PATCH — player appends a follow-up to their own suggestion
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    await ensureFivemTables();
    const { slug: rawSlug } = await params;
    const slug = normalizeFivemSlug(rawSlug);

    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    const { id, playerId, text } = body;
    if (!id || !playerId || !text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json({ error: "id, playerId, and text required" }, { status: 400 });
    }

    const servers = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM FivemServer WHERE slug = ${slug} LIMIT 1
    `;
    const server = servers[0];
    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    const now = new Date();
    const timestamp = now.toISOString().replace("T", " ").slice(0, 16);
    const followupChunk = `\n\n--- Player Follow-up (${timestamp}) ---\n${text.trim()}`;

    const affected = await prisma.$executeRaw`
      UPDATE FivemSuggestion
      SET description = CONCAT(description, ${followupChunk}), updatedAt = ${now}
      WHERE id = ${id} AND serverId = ${server.id} AND playerId = ${playerId}
    `;

    if (affected === 0) {
      return NextResponse.json({ error: "Suggestion not found or not yours" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/fivem/servers/[slug]/suggestions/player error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET — player fetches their own suggestions (no auth, playerId required)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    await ensureFivemTables();
    const { slug: rawSlug } = await params;
    const slug = normalizeFivemSlug(rawSlug);

    const playerId = request.nextUrl.searchParams.get("playerId");
    if (!playerId) {
      return NextResponse.json({ error: "playerId query param required" }, { status: 400 });
    }

    const servers = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM FivemServer WHERE slug = ${slug} LIMIT 1
    `;
    const server = servers[0];
    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    const suggestions = await prisma.$queryRaw<SuggestionRow[]>`
      SELECT id, playerName, playerId, title, description, howItWorks, whyItsGood,
             priority, category, status, adminNotes, screenshots, votes, createdAt
      FROM FivemSuggestion
      WHERE serverId = ${server.id} AND playerId = ${playerId}
      ORDER BY createdAt DESC
      LIMIT 50
    `;

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("GET /api/fivem/servers/[slug]/suggestions/player error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
