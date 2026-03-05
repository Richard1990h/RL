import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ensureFivemTables, normalizeFivemSlug } from "@/lib/fivem/server-db";

type CommentRow = {
  id: string;
  serverId: string;
  targetType: string;
  targetId: string;
  authorName: string;
  authorId: string;
  text: string;
  createdAt: Date;
};

async function getServerAndCheckAdmin(slug: string, userId: string) {
  const servers = await prisma.$queryRaw<{ id: string; ownerId: string }[]>`
    SELECT id, ownerId FROM FivemServer WHERE slug = ${slug} LIMIT 1
  `;
  const server = servers[0];
  if (!server) return { server: null, isAdmin: false };

  let isAdmin = server.ownerId === userId;
  if (!isAdmin) {
    const memberRows = await prisma.$queryRaw<{ role: string }[]>`
      SELECT role FROM FivemServerMember
      WHERE serverId = ${server.id} AND userId = ${userId} AND status = 'ACTIVE'
      LIMIT 1
    `;
    isAdmin = memberRows[0]?.role === "ADMIN" || memberRows[0]?.role === "MODERATOR";
  }
  return { server, isAdmin };
}

// GET — fetch comments for a bug or suggestion
export async function GET(
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

    const { server, isAdmin } = await getServerAndCheckAdmin(slug, user.id);
    if (!server) return NextResponse.json({ error: "Server not found" }, { status: 404 });
    if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const targetType = request.nextUrl.searchParams.get("targetType");
    const targetId = request.nextUrl.searchParams.get("targetId");

    if (!targetType || !targetId || !["BUG", "SUGGESTION"].includes(targetType)) {
      return NextResponse.json({ error: "targetType (BUG|SUGGESTION) and targetId are required" }, { status: 400 });
    }

    const comments = await prisma.$queryRaw<CommentRow[]>`
      SELECT id, serverId, targetType, targetId, authorName, authorId, text, createdAt
      FROM FivemAdminComment
      WHERE serverId = ${server.id} AND targetType = ${targetType} AND targetId = ${targetId}
      ORDER BY createdAt ASC
      LIMIT 200
    `;

    return NextResponse.json({ comments });
  } catch (error) {
    console.error("GET /api/fivem/servers/[slug]/comments error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST — add a comment
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

    const { server, isAdmin } = await getServerAndCheckAdmin(slug, user.id);
    if (!server) return NextResponse.json({ error: "Server not found" }, { status: 404 });
    if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    const targetType = String(body?.targetType ?? "");
    const targetId = String(body?.targetId ?? "");
    const text = String(body?.text ?? "").trim().slice(0, 5000);

    if (!["BUG", "SUGGESTION"].includes(targetType) || !targetId || !text) {
      return NextResponse.json({ error: "targetType, targetId, and text are required" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const now = new Date();

    await prisma.$executeRaw`
      INSERT INTO FivemAdminComment (id, serverId, targetType, targetId, authorName, authorId, text, createdAt)
      VALUES (${id}, ${server.id}, ${targetType}, ${targetId}, ${user.displayName}, ${user.id}, ${text}, ${now})
    `;

    return NextResponse.json({
      comment: { id, serverId: server.id, targetType, targetId, authorName: user.displayName, authorId: user.id, text, createdAt: now },
    });
  } catch (error) {
    console.error("POST /api/fivem/servers/[slug]/comments error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE — delete own comment
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

    const { server, isAdmin } = await getServerAndCheckAdmin(slug, user.id);
    if (!server) return NextResponse.json({ error: "Server not found" }, { status: 404 });
    if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    const commentId = String(body?.commentId ?? "");
    if (!commentId) {
      return NextResponse.json({ error: "commentId is required" }, { status: 400 });
    }

    // Only allow deleting own comments (or server owner can delete any)
    const rows = await prisma.$queryRaw<{ id: string; authorId: string }[]>`
      SELECT id, authorId FROM FivemAdminComment
      WHERE id = ${commentId} AND serverId = ${server.id}
      LIMIT 1
    `;
    if (!rows[0]) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }
    if (rows[0].authorId !== user.id && server.ownerId !== user.id) {
      return NextResponse.json({ error: "Can only delete your own comments" }, { status: 403 });
    }

    await prisma.$executeRaw`
      DELETE FROM FivemAdminComment WHERE id = ${commentId}
    `;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/fivem/servers/[slug]/comments error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
