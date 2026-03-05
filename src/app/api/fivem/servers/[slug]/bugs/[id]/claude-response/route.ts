import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureFivemTables, normalizeFivemSlug } from "@/lib/fivem/server-db";

// POST: Save Claude's parsed response back to a FiveM bug record
// Called by the Claude Bridge when it parses a [FIVEM-BUG-RESPONSE:{id}] prefix
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  try {
    await ensureFivemTables();
    const { slug: rawSlug, id } = await params;
    const slug = normalizeFivemSlug(rawSlug);

    // Verify server exists
    const servers = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM FivemServer WHERE slug = ${slug} LIMIT 1
    `;
    const server = servers[0];
    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    // Fetch current bug
    const bugs = await prisma.$queryRaw<{ id: string; status: string }[]>`
      SELECT id, status FROM FivemBugReport
      WHERE id = ${id} AND serverId = ${server.id}
      LIMIT 1
    `;
    const bug = bugs[0];
    if (!bug) {
      return NextResponse.json({ error: "Bug not found" }, { status: 404 });
    }

    let body;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
    const { type, content } = body;
    const now = new Date();

    if (type === "diagnosis" && (bug.status === "INVESTIGATING" || bug.status === "OPEN" || bug.status === "CANT_FIND")) {
      // Check for CANT_FIND: prefix — couldn't locate the issue at all
      const cantFindMatch = content.match(/CANT_FIND:\s*([\s\S]*)/i);
      if (cantFindMatch) {
        await prisma.$executeRaw`
          UPDATE FivemBugReport
          SET status = 'CANT_FIND', diagnosis = ${content}, lastAiProcessedAt = ${now}, updatedAt = ${now}
          WHERE id = ${id}
        `;
        return NextResponse.json({ ok: true, status: "CANT_FIND" });
      }

      // All other diagnoses (including missing features) go to DIAGNOSED
      // so the admin can review and decide to fix/build
      await prisma.$executeRaw`
        UPDATE FivemBugReport
        SET status = 'DIAGNOSED', diagnosis = ${content}, lastAiProcessedAt = ${now}, updatedAt = ${now}
        WHERE id = ${id}
      `;
      return NextResponse.json({ ok: true, status: "DIAGNOSED" });

    } else if (type === "fix" && (bug.status === "FIXING" || bug.status === "DIAGNOSED" || bug.status === "FAILED")) {
      const failedMatch = content.match(/FIX_FAILED:\s*([\s\S]*)/i);
      if (failedMatch) {
        await prisma.$executeRaw`
          UPDATE FivemBugReport
          SET status = 'FAILED', fixResult = ${content}, lastAiProcessedAt = ${now}, updatedAt = ${now}
          WHERE id = ${id}
        `;
        return NextResponse.json({ ok: true, status: "FAILED" });
      }

      // Default: fix applied
      await prisma.$executeRaw`
        UPDATE FivemBugReport
        SET status = 'FIXED', fixResult = ${content}, lastAiProcessedAt = ${now}, updatedAt = ${now}
        WHERE id = ${id}
      `;

      return NextResponse.json({ ok: true, status: "FIXED" });

    } else if (type === "verification" && (bug.status === "TESTING" || bug.status === "FIXED")) {
      const failedMatch = content.match(/VERIFY_FAILED:\s*([\s\S]*)/i);
      if (failedMatch) {
        await prisma.$executeRaw`
          UPDATE FivemBugReport
          SET status = 'FAILED', testResult = ${content}, lastAiProcessedAt = ${now}, updatedAt = ${now}
          WHERE id = ${id}
        `;
        return NextResponse.json({ ok: true, status: "FAILED" });
      }

      // Verified → FIXED (ready for admin to click "Apply to Server")
      // The admin will use the "deploy" action to push changes to the remote server
      await prisma.$executeRaw`
        UPDATE FivemBugReport
        SET status = 'FIXED', testResult = ${content}, lastAiProcessedAt = ${now}, updatedAt = ${now}
        WHERE id = ${id}
      `;

      return NextResponse.json({ ok: true, status: "FIXED" });

    } else {
      return NextResponse.json(
        { error: `Invalid type "${type}" for bug in status "${bug.status}"` },
        { status: 400 },
      );
    }
  } catch (error) {
    console.error("POST /api/fivem/servers/[slug]/bugs/[id]/claude-response error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
