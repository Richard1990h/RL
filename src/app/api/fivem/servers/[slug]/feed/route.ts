import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ensureFivemTables, normalizeFivemSlug } from "@/lib/fivem/server-db";

type FeedRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  createdAt: Date;
};

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

    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM FivemServer WHERE slug = ${slug} LIMIT 1
    `;
    const serverId = rows[0]?.id;
    if (!serverId) return NextResponse.json({ error: "Server not found" }, { status: 404 });

    const feed = await prisma.$queryRaw<FeedRow[]>`
      SELECT id, type, title, body, createdAt
      FROM FivemServerFeed
      WHERE serverId = ${serverId}
      ORDER BY createdAt DESC
      LIMIT 80
    `;
    return NextResponse.json({ feed });
  } catch (error) {
    console.error("GET /api/fivem/servers/[slug]/feed error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
