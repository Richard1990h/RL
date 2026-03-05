import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ensureFivemTables, normalizeFivemSlug } from "@/lib/fivem/server-db";
import { isAiProgressStale, removeAiProgress } from "@/lib/fivem/ai-progress";

type BugRow = {
  id: string;
  playerName: string;
  playerId: string | null;
  title: string;
  description: string;
  stepsToRepro: string;
  expected: string | null;
  severity: string;
  status: string;
  location: string | null;
  adminNotes: string | null;
  screenshots: string | null;
  diagnosis: string | null;
  fixPlan: string | null;
  fixResult: string | null;
  testResult: string | null;
  resolvedAt: Date | null;
  lastAiProcessedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const ALL_BUG_STATUSES = [
  "OPEN", "INVESTIGATING", "DIAGNOSED", "CANT_FIND", "NOT_A_BUG",
  "FIXING", "FIXED", "TESTING",
  "RESOLVED", "FAILED", "DISMISSED",
];

// GET — admin fetches all bug reports for a server
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

    const bugs = await prisma.$queryRaw<BugRow[]>`
      SELECT id, playerName, playerId, title, description, stepsToRepro, expected,
             severity, status, location, adminNotes, screenshots,
             diagnosis, fixPlan, fixResult, testResult, resolvedAt, lastAiProcessedAt, createdAt, updatedAt
      FROM FivemBugReport
      WHERE serverId = ${server.id}
      ORDER BY createdAt DESC
      LIMIT 200
    `;

    // Reset stale AI-processing bugs
    const aiStatuses = ["INVESTIGATING", "FIXING", "TESTING"];
    const STALE_MS = 10 * 60 * 1000; // 10 minutes
    for (const bug of bugs) {
      if (!aiStatuses.includes(bug.status)) continue;
      const progressKey = `bug-${bug.id}`;
      const timeSinceUpdate = Date.now() - new Date(bug.updatedAt).getTime();
      const staleByTime = timeSinceUpdate > STALE_MS;
      const staleByProgress = isAiProgressStale(progressKey);
      if (staleByTime || staleByProgress) {
        const fallback = bug.status === "INVESTIGATING" ? "OPEN"
          : bug.status === "FIXING" ? "DIAGNOSED"
          : bug.status === "TESTING" ? "FIXED"
          : "OPEN";
        const now = new Date();
        try {
          await prisma.$executeRaw`
            UPDATE FivemBugReport SET status = ${fallback}, updatedAt = ${now} WHERE id = ${bug.id}
          `;
          bug.status = fallback;
          removeAiProgress(progressKey);
          console.log(`Reset stale bug ${bug.id} from ${bug.status} to ${fallback} (time: ${staleByTime}, progress: ${staleByProgress})`);
        } catch (e) {
          console.error(`Failed to reset stale bug ${bug.id}:`, e);
        }
      }
    }

    return NextResponse.json({ bugs });
  } catch (error) {
    console.error("GET /api/fivem/servers/[slug]/bugs error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST — FiveM server submits a bug report (no auth required, uses server slug)
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
    const stepsToRepro = String(body?.stepsToRepro ?? "").trim().slice(0, 5000);
    const expected = body?.expected ? String(body.expected).trim().slice(0, 2000) : null;
    const severity = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(body?.severity)
      ? String(body.severity)
      : "MEDIUM";
    const location = body?.location ? String(body.location).trim().slice(0, 200) : null;
    const screenshots = Array.isArray(body?.screenshots) ? body.screenshots.slice(0, 5) : null;

    if (!title || !description || !stepsToRepro) {
      return NextResponse.json(
        { error: "Title, description, and steps to reproduce are required." },
        { status: 400 },
      );
    }

    const id = crypto.randomUUID();
    const now = new Date();

    const screenshotsJson = screenshots ? JSON.stringify(screenshots) : null;

    await prisma.$executeRaw`
      INSERT INTO FivemBugReport (id, serverId, playerName, playerId, title, description,
        stepsToRepro, expected, severity, status, location, screenshots, createdAt, updatedAt)
      VALUES (${id}, ${server.id}, ${playerName}, ${playerId}, ${title}, ${description},
        ${stepsToRepro}, ${expected}, ${severity}, 'OPEN', ${location}, ${screenshotsJson}, ${now}, ${now})
    `;

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error("POST /api/fivem/servers/[slug]/bugs error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH — admin updates bug status or notes
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
    const bugId = String(body?.bugId ?? "");
    const status = ALL_BUG_STATUSES.includes(body?.status)
      ? String(body.status)
      : undefined;
    const adminNotes = body?.adminNotes !== undefined
      ? String(body.adminNotes).trim().slice(0, 5000)
      : undefined;

    if (!bugId) {
      return NextResponse.json({ error: "bugId required" }, { status: 400 });
    }

    // Verify bug belongs to this server
    const bugRows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM FivemBugReport WHERE id = ${bugId} AND serverId = ${server.id} LIMIT 1
    `;
    if (!bugRows[0]) {
      return NextResponse.json({ error: "Bug not found" }, { status: 404 });
    }

    const now = new Date();

    if (status) {
      const resolvedAt = (status === "RESOLVED" || status === "DISMISSED") ? now : null;
      await prisma.$executeRaw`
        UPDATE FivemBugReport SET status = ${status}, resolvedAt = ${resolvedAt}, updatedAt = ${now} WHERE id = ${bugId}
      `;
    }
    if (adminNotes !== undefined) {
      await prisma.$executeRaw`
        UPDATE FivemBugReport SET adminNotes = ${adminNotes || null}, updatedAt = ${now} WHERE id = ${bugId}
      `;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/fivem/servers/[slug]/bugs error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE — admin deletes a bug report
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
    const bugId = String(body?.bugId ?? "");
    if (!bugId) {
      return NextResponse.json({ error: "bugId required" }, { status: 400 });
    }

    const bugRows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM FivemBugReport WHERE id = ${bugId} AND serverId = ${server.id} LIMIT 1
    `;
    if (!bugRows[0]) {
      return NextResponse.json({ error: "Bug not found" }, { status: 404 });
    }

    // Delete associated comments first
    await prisma.$executeRaw`
      DELETE FROM FivemAdminComment WHERE targetType = 'BUG' AND targetId = ${bugId}
    `;
    await prisma.$executeRaw`
      DELETE FROM FivemBugReport WHERE id = ${bugId}
    `;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/fivem/servers/[slug]/bugs error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
