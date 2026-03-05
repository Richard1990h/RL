import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureFivemTables, normalizeFivemSlug } from "@/lib/fivem/server-db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  try {
    await ensureFivemTables();
    const { slug: rawSlug, id } = await params;
    const slug = normalizeFivemSlug(rawSlug);

    const servers = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM FivemServer WHERE slug = ${slug} LIMIT 1
    `;
    const server = servers[0];
    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    const suggestions = await prisma.$queryRaw<{ id: string; status: string }[]>`
      SELECT id, status FROM FivemSuggestion
      WHERE id = ${id} AND serverId = ${server.id}
      LIMIT 1
    `;
    const sug = suggestions[0];
    if (!sug) {
      return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });
    }

    let body;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
    const { type, content } = body;
    const now = new Date();

    if (type === "analysis" && (sug.status === "ANALYZING" || sug.status === "NEW" || sug.status === "CANT_ANALYZE")) {
      const cantFind = /CANT_ANALYZE:/i.test(content);
      if (cantFind) {
        await prisma.$executeRaw`
          UPDATE FivemSuggestion
          SET status = 'CANT_ANALYZE', analysis = ${content}, lastAiProcessedAt = ${now}, updatedAt = ${now}
          WHERE id = ${id}
        `;
        return NextResponse.json({ ok: true, status: "CANT_ANALYZE" });
      }

      await prisma.$executeRaw`
        UPDATE FivemSuggestion
        SET status = 'ANALYZED', analysis = ${content}, lastAiProcessedAt = ${now}, updatedAt = ${now}
        WHERE id = ${id}
      `;
      return NextResponse.json({ ok: true, status: "ANALYZED" });

    } else if (type === "implement" && (sug.status === "IMPLEMENTING" || sug.status === "PLANNED" || sug.status === "FAILED")) {
      const failed = /IMPLEMENT_FAILED:/i.test(content);
      if (failed) {
        await prisma.$executeRaw`
          UPDATE FivemSuggestion
          SET status = 'FAILED', implementationResult = ${content}, lastAiProcessedAt = ${now}, updatedAt = ${now}
          WHERE id = ${id}
        `;
        return NextResponse.json({ ok: true, status: "FAILED" });
      }

      await prisma.$executeRaw`
        UPDATE FivemSuggestion
        SET status = 'IMPLEMENTED', implementationResult = ${content}, lastAiProcessedAt = ${now}, updatedAt = ${now}
        WHERE id = ${id}
      `;

      return NextResponse.json({ ok: true, status: "IMPLEMENTED" });

    } else if (type === "verification" && (sug.status === "VERIFYING" || sug.status === "IMPLEMENTED")) {
      const failed = /VERIFY_FAILED:/i.test(content);
      if (failed) {
        await prisma.$executeRaw`
          UPDATE FivemSuggestion
          SET status = 'FAILED', verifyResult = ${content}, lastAiProcessedAt = ${now}, updatedAt = ${now}
          WHERE id = ${id}
        `;
        return NextResponse.json({ ok: true, status: "FAILED" });
      }

      // Verified → IMPLEMENTED (ready for admin to click "Apply to Server")
      await prisma.$executeRaw`
        UPDATE FivemSuggestion
        SET status = 'IMPLEMENTED', verifyResult = ${content}, lastAiProcessedAt = ${now}, updatedAt = ${now}
        WHERE id = ${id}
      `;

      return NextResponse.json({ ok: true, status: "IMPLEMENTED" });

    } else {
      return NextResponse.json(
        { error: `Invalid type "${type}" for suggestion in status "${sug.status}"` },
        { status: 400 },
      );
    }
  } catch (error) {
    console.error("POST /api/fivem/servers/[slug]/suggestions/[id]/claude-response error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
