import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ensureFivemTables, normalizeFivemSlug } from "@/lib/fivem/server-db";
import { isAiProgressStale, removeAiProgress } from "@/lib/fivem/ai-progress";

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
  analysis: string | null;
  implementationPlan: string | null;
  implementationResult: string | null;
  verifyResult: string | null;
  resolvedAt: Date | null;
  lastAiProcessedAt: Date | null;
  votes: number;
  createdAt: Date;
  updatedAt: Date;
};

const ALL_STATUSES = [
  "NEW", "ANALYZING", "ANALYZED", "CANT_ANALYZE",
  "CONSIDERING", "PLANNED", "IMPLEMENTING", "IMPLEMENTED",
  "VERIFYING", "ADDED", "FAILED", "DECLINED",
];

// GET — admin fetches all suggestions for a server
export async function GET(
  _request: NextRequest,
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

    const servers = await prisma.$queryRaw<{ id: string; ownerId: string }[]>`
      SELECT id, ownerId FROM FivemServer WHERE slug = ${slug} LIMIT 1
    `;
    const server = servers[0];
    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    // Check admin/mod access
    let isAdmin = server.ownerId === user.id;
    if (!isAdmin) {
      const memberRows = await prisma.$queryRaw<{ role: string }[]>`
        SELECT role FROM FivemServerMember
        WHERE serverId = ${server.id} AND userId = ${user.id} AND status = 'ACTIVE'
        LIMIT 1
      `;
      isAdmin = memberRows[0]?.role === "ADMIN" || memberRows[0]?.role === "MODERATOR";
    }
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const suggestions = await prisma.$queryRaw<SuggestionRow[]>`
      SELECT id, playerName, playerId, title, description, howItWorks, whyItsGood,
             priority, category, status, adminNotes, screenshots,
             analysis, implementationPlan, implementationResult, verifyResult, resolvedAt, lastAiProcessedAt,
             votes, createdAt, updatedAt
      FROM FivemSuggestion
      WHERE serverId = ${server.id}
      ORDER BY createdAt DESC
      LIMIT 200
    `;

    // Reset stale AI-processing suggestions
    const aiStatuses = ["ANALYZING", "IMPLEMENTING", "VERIFYING"];
    const STALE_MS = 10 * 60 * 1000; // 10 minutes
    for (const sug of suggestions) {
      if (!aiStatuses.includes(sug.status)) continue;
      const progressKey = `suggestion-${sug.id}`;
      const timeSinceUpdate = Date.now() - new Date(sug.updatedAt).getTime();
      const staleByTime = timeSinceUpdate > STALE_MS;
      const staleByProgress = isAiProgressStale(progressKey);
      if (staleByTime || staleByProgress) {
        const fallback = sug.status === "ANALYZING" ? "NEW"
          : sug.status === "IMPLEMENTING" ? "PLANNED"
          : sug.status === "VERIFYING" ? "IMPLEMENTED"
          : "NEW";
        const now = new Date();
        try {
          await prisma.$executeRaw`
            UPDATE FivemSuggestion SET status = ${fallback}, updatedAt = ${now} WHERE id = ${sug.id}
          `;
          sug.status = fallback;
          removeAiProgress(progressKey);
          console.log(`Reset stale suggestion ${sug.id} from ${sug.status} to ${fallback} (time: ${staleByTime}, progress: ${staleByProgress})`);
        } catch (e) {
          console.error(`Failed to reset stale suggestion ${sug.id}:`, e);
        }
      }
    }

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("GET /api/fivem/servers/[slug]/suggestions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST — FiveM server submits a suggestion (no auth required, uses server slug)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    await ensureFivemTables();
    const { slug: rawSlug } = await params;
    const slug = normalizeFivemSlug(rawSlug);

    const servers = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM FivemServer WHERE slug = ${slug} LIMIT 1
    `;
    const server = servers[0];
    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
    const playerName = String(body?.playerName ?? "Unknown").trim().slice(0, 100);
    const playerId = body?.playerId ? String(body.playerId).trim().slice(0, 100) : null;
    const title = String(body?.title ?? "").trim().slice(0, 200);
    const description = String(body?.description ?? "").trim().slice(0, 5000);
    const howItWorks = String(body?.howItWorks ?? "").trim().slice(0, 5000);
    const whyItsGood = body?.whyItsGood ? String(body.whyItsGood).trim().slice(0, 2000) : null;
    const priority = ["NICE_TO_HAVE", "WOULD_BE_COOL", "REALLY_WANT", "NEED_THIS"].includes(body?.priority)
      ? String(body.priority)
      : "NICE_TO_HAVE";
    const category = body?.category ? String(body.category).trim().slice(0, 100) : null;
    const screenshots = Array.isArray(body?.screenshots) ? body.screenshots.slice(0, 5) : null;

    if (!title || !description || !howItWorks) {
      return NextResponse.json(
        { error: "Title, description, and howItWorks are required." },
        { status: 400 },
      );
    }

    const id = crypto.randomUUID();
    const now = new Date();
    const screenshotsJson = screenshots ? JSON.stringify(screenshots) : null;

    await prisma.$executeRaw`
      INSERT INTO FivemSuggestion (id, serverId, playerName, playerId, title, description,
        howItWorks, whyItsGood, priority, category, status, screenshots, votes, createdAt, updatedAt)
      VALUES (${id}, ${server.id}, ${playerName}, ${playerId}, ${title}, ${description},
        ${howItWorks}, ${whyItsGood}, ${priority}, ${category}, 'NEW', ${screenshotsJson}, 0, ${now}, ${now})
    `;

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error("POST /api/fivem/servers/[slug]/suggestions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH — admin updates suggestion status or notes
export async function PATCH(
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

    const servers = await prisma.$queryRaw<{ id: string; ownerId: string }[]>`
      SELECT id, ownerId FROM FivemServer WHERE slug = ${slug} LIMIT 1
    `;
    const server = servers[0];
    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    let isAdmin = server.ownerId === user.id;
    if (!isAdmin) {
      const memberRows = await prisma.$queryRaw<{ role: string }[]>`
        SELECT role FROM FivemServerMember
        WHERE serverId = ${server.id} AND userId = ${user.id} AND status = 'ACTIVE'
        LIMIT 1
      `;
      isAdmin = memberRows[0]?.role === "ADMIN" || memberRows[0]?.role === "MODERATOR";
    }
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
    const suggestionId = String(body?.suggestionId ?? "");
    const status = ALL_STATUSES.includes(body?.status)
      ? String(body.status)
      : undefined;
    const adminNotes = body?.adminNotes !== undefined
      ? String(body.adminNotes).trim().slice(0, 5000)
      : undefined;

    if (!suggestionId) {
      return NextResponse.json({ error: "suggestionId required" }, { status: 400 });
    }

    // Verify suggestion belongs to this server
    const suggestionRows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM FivemSuggestion WHERE id = ${suggestionId} AND serverId = ${server.id} LIMIT 1
    `;
    if (!suggestionRows[0]) {
      return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });
    }

    if (status) {
      await prisma.$executeRaw`
        UPDATE FivemSuggestion SET status = ${status}, updatedAt = ${new Date()} WHERE id = ${suggestionId}
      `;
    }
    if (adminNotes !== undefined) {
      await prisma.$executeRaw`
        UPDATE FivemSuggestion SET adminNotes = ${adminNotes || null}, updatedAt = ${new Date()} WHERE id = ${suggestionId}
      `;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/fivem/servers/[slug]/suggestions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE — admin deletes a suggestion
export async function DELETE(
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

    const servers = await prisma.$queryRaw<{ id: string; ownerId: string }[]>`
      SELECT id, ownerId FROM FivemServer WHERE slug = ${slug} LIMIT 1
    `;
    const server = servers[0];
    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    let isAdmin = server.ownerId === user.id;
    if (!isAdmin) {
      const memberRows = await prisma.$queryRaw<{ role: string }[]>`
        SELECT role FROM FivemServerMember
        WHERE serverId = ${server.id} AND userId = ${user.id} AND status = 'ACTIVE'
        LIMIT 1
      `;
      isAdmin = memberRows[0]?.role === "ADMIN" || memberRows[0]?.role === "MODERATOR";
    }
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
    const suggestionId = String(body?.suggestionId ?? "");
    if (!suggestionId) {
      return NextResponse.json({ error: "suggestionId required" }, { status: 400 });
    }

    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM FivemSuggestion WHERE id = ${suggestionId} AND serverId = ${server.id} LIMIT 1
    `;
    if (!rows[0]) {
      return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });
    }

    // Delete associated comments first
    await prisma.$executeRaw`
      DELETE FROM FivemAdminComment WHERE targetType = 'SUGGESTION' AND targetId = ${suggestionId}
    `;
    await prisma.$executeRaw`
      DELETE FROM FivemSuggestion WHERE id = ${suggestionId}
    `;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/fivem/servers/[slug]/suggestions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
