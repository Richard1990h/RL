import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ensureFivemTables, normalizeFivemSlug } from "@/lib/fivem/server-db";

const VALID_REASONS = [
  "RDM",
  "VDM",
  "FAILRP",
  "METAGAMING",
  "POWERGAMING",
  "COMBAT_LOGGING",
  "NLR",
  "FEAR_RP",
  "EXPLOITING",
  "HARASSMENT",
  "COP_BAITING",
  "STREAM_SNIPING",
  "BREAKING_CHARACTER",
  "OTHER",
] as const;

type ReportRow = {
  id: string;
  reporterName: string;
  reporterId: string | null;
  reportedPlayer: string;
  reasons: string;
  description: string;
  screenshots: string | null;
  status: string;
  adminNotes: string | null;
  createdAt: Date;
};

// GET — admin fetches all player reports for a server
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

    const reports = await prisma.$queryRaw<ReportRow[]>`
      SELECT id, reporterName, reporterId, reportedPlayer, reasons, description,
             screenshots, status, adminNotes, createdAt
      FROM FivemPlayerReport
      WHERE serverId = ${server.id}
      ORDER BY createdAt DESC
      LIMIT 200
    `;

    return NextResponse.json({ reports });
  } catch (error) {
    console.error("GET /api/fivem/servers/[slug]/reports error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST — FiveM server submits a player report (no auth required, uses server slug)
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
    const reporterName = String(body?.reporterName ?? "Unknown").trim().slice(0, 100);
    const reporterId = body?.reporterId ? String(body.reporterId).trim().slice(0, 100) : null;
    const reportedPlayer = String(body?.reportedPlayer ?? "").trim().slice(0, 100);
    const description = String(body?.description ?? "").trim().slice(0, 5000);
    const screenshots = Array.isArray(body?.screenshots) ? body.screenshots.slice(0, 5) : null;

    // Validate reasons
    const rawReasons = Array.isArray(body?.reasons) ? body.reasons : [];
    const reasons = rawReasons
      .map((r: unknown) => String(r))
      .filter((r: string) => (VALID_REASONS as readonly string[]).includes(r));

    if (!reportedPlayer || reasons.length === 0 || !description) {
      return NextResponse.json(
        { error: "reportedPlayer, at least one valid reason, and description are required." },
        { status: 400 },
      );
    }

    const id = crypto.randomUUID();
    const now = new Date();
    const reasonsJson = JSON.stringify(reasons);
    const screenshotsJson = screenshots ? JSON.stringify(screenshots) : null;

    await prisma.$executeRaw`
      INSERT INTO FivemPlayerReport (id, serverId, reporterName, reporterId, reportedPlayer,
        reasons, description, screenshots, status, createdAt, updatedAt)
      VALUES (${id}, ${server.id}, ${reporterName}, ${reporterId}, ${reportedPlayer},
        ${reasonsJson}, ${description}, ${screenshotsJson}, 'OPEN', ${now}, ${now})
    `;

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error("POST /api/fivem/servers/[slug]/reports error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH — admin updates report status or notes
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
    const reportId = String(body?.reportId ?? "");
    const status = ["OPEN", "INVESTIGATING", "RESOLVED", "DISMISSED"].includes(body?.status)
      ? String(body.status)
      : undefined;
    const adminNotes = body?.adminNotes !== undefined
      ? String(body.adminNotes).trim().slice(0, 5000)
      : undefined;

    if (!reportId) {
      return NextResponse.json({ error: "reportId required" }, { status: 400 });
    }

    // Verify report belongs to this server
    const reportRows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM FivemPlayerReport WHERE id = ${reportId} AND serverId = ${server.id} LIMIT 1
    `;
    if (!reportRows[0]) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    if (status) {
      await prisma.$executeRaw`
        UPDATE FivemPlayerReport SET status = ${status}, updatedAt = ${new Date()} WHERE id = ${reportId}
      `;
    }
    if (adminNotes !== undefined) {
      await prisma.$executeRaw`
        UPDATE FivemPlayerReport SET adminNotes = ${adminNotes || null}, updatedAt = ${new Date()} WHERE id = ${reportId}
      `;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/fivem/servers/[slug]/reports error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE — admin deletes a player report
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
    const reportId = String(body?.reportId ?? "");
    if (!reportId) {
      return NextResponse.json({ error: "reportId required" }, { status: 400 });
    }

    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM FivemPlayerReport WHERE id = ${reportId} AND serverId = ${server.id} LIMIT 1
    `;
    if (!rows[0]) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    await prisma.$executeRaw`
      DELETE FROM FivemPlayerReport WHERE id = ${reportId}
    `;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/fivem/servers/[slug]/reports error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
