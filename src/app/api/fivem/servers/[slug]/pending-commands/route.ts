import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureFivemTables, normalizeFivemSlug, validateFivemApiKey } from "@/lib/fivem/server-db";
import { checkLogsForErrors } from "@/lib/fivem/server-logs";

// GET — FiveM polls for next pending command (requires X-Api-Key)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    await ensureFivemTables();
    const { slug: rawSlug } = await params;
    const slug = normalizeFivemSlug(rawSlug);

    const result = await validateFivemApiKey(slug, _req);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const server = result.server;

    const commands = await prisma.$queryRaw<
      { id: string; type: string; resources: string; folders: string | null; reason: string | null; sourceType: string | null; sourceId: string | null }[]
    >`
      SELECT id, type, resources, folders, reason, sourceType, sourceId
      FROM FivemPendingCommand
      WHERE serverId = ${server.id} AND status = 'PENDING'
      ORDER BY createdAt ASC
      LIMIT 1
    `;

    if (!commands[0]) {
      return NextResponse.json({ command: null });
    }

    const cmd = commands[0];
    let resources: string[];
    try {
      resources = typeof cmd.resources === "string" ? JSON.parse(cmd.resources) : cmd.resources;
    } catch {
      resources = [];
    }

    return NextResponse.json({
      command: {
        id: cmd.id,
        type: cmd.type,
        resources,
        folders: cmd.folders || undefined,
        reason: cmd.reason,
        sourceType: cmd.sourceType,
        sourceId: cmd.sourceId,
      },
    });
  } catch (error) {
    console.error("GET /api/fivem/servers/[slug]/pending-commands error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH — mark command done or failed (requires X-Api-Key)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    await ensureFivemTables();
    const { slug: rawSlug } = await params;
    const slug = normalizeFivemSlug(rawSlug);

    const result = await validateFivemApiKey(slug, req);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const server = result.server;

    let body;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    const { id, status } = body;
    if (!id || (status !== "DONE" && status !== "FAILED")) {
      return NextResponse.json({ error: "Provide id and status (DONE|FAILED)" }, { status: 400 });
    }

    const now = new Date();
    await prisma.$executeRaw`
      UPDATE FivemPendingCommand
      SET status = ${status}, executedAt = ${now}
      WHERE id = ${id} AND serverId = ${server.id}
    `;

    // After UPDATE command completes, update the source bug/suggestion status
    const cmds = await prisma.$queryRaw<
      { type: string; sourceType: string | null; sourceId: string | null }[]
    >`
      SELECT type, sourceType, sourceId FROM FivemPendingCommand
      WHERE id = ${id} AND serverId = ${server.id} LIMIT 1
    `;
    const cmd = cmds[0];
    // BACKUP: track when the last backup completed
    if (cmd && cmd.type === "BACKUP" && status === "DONE") {
      await prisma.$executeRaw`
        UPDATE FivemServer SET lastBackupAt = ${now} WHERE id = ${server.id}
      `;
      console.log(`[FiveM] Backup completed for server ${server.id}`);
    }

    if (cmd && cmd.type === "UPDATE" && cmd.sourceId) {
      if (status === "DONE") {
        // Deploy succeeded — mark as RESOLVED/ADDED
        if (cmd.sourceType === "BUG") {
          await prisma.$executeRaw`
            UPDATE FivemBugReport
            SET status = 'RESOLVED', resolvedAt = ${now}, updatedAt = ${now}
            WHERE id = ${cmd.sourceId}
          `;
          console.log(`[FiveM] Bug ${cmd.sourceId} deployed successfully`);
        } else if (cmd.sourceType === "SUGGESTION") {
          await prisma.$executeRaw`
            UPDATE FivemSuggestion
            SET status = 'ADDED', resolvedAt = ${now}, updatedAt = ${now}
            WHERE id = ${cmd.sourceId}
          `;
          console.log(`[FiveM] Suggestion ${cmd.sourceId} deployed successfully`);
        }

        // Schedule a delayed log check (~45s) to catch post-ensure errors
        // The remote server flushes logs 30s after ensure
        const resources = await (async () => {
          try {
            const rows = await prisma.$queryRaw<{ resources: string }[]>`
              SELECT resources FROM FivemPendingCommand WHERE id = ${id} LIMIT 1
            `;
            return JSON.parse(rows[0]?.resources || "[]");
          } catch { return []; }
        })();

        if (resources.length > 0) {
          const sourceType = cmd.sourceType;
          const sourceId = cmd.sourceId;
          setTimeout(async () => {
            try {
              const errors = checkLogsForErrors(slug, resources, 120000);
              if (errors.length > 0) {
                const errorSummary = `DEPLOY_ERRORS: Found ${errors.length} error(s) in server logs after deploy:\n${errors.slice(0, 10).join("\n")}`;
                console.log(`[FiveM] Post-deploy errors detected for ${sourceType} ${sourceId}:`, errorSummary);
                const errNow = new Date();
                if (sourceType === "BUG") {
                  await prisma.$executeRaw`
                    UPDATE FivemBugReport
                    SET status = 'FAILED', testResult = ${errorSummary}, updatedAt = ${errNow}
                    WHERE id = ${sourceId}
                  `;
                } else if (sourceType === "SUGGESTION") {
                  await prisma.$executeRaw`
                    UPDATE FivemSuggestion
                    SET status = 'FAILED', verifyResult = ${errorSummary}, updatedAt = ${errNow}
                    WHERE id = ${sourceId}
                  `;
                }
              } else {
                console.log(`[FiveM] Post-deploy log check clean for ${sourceType} ${sourceId}`);
              }
            } catch (e) {
              console.error(`[FiveM] Post-deploy log check failed:`, e);
            }
          }, 45000);
        }
      } else if (status === "FAILED") {
        // Deploy failed — mark source back to previous state
        if (cmd.sourceType === "BUG") {
          await prisma.$executeRaw`
            UPDATE FivemBugReport
            SET status = 'FAILED', testResult = ${"DEPLOY_FAILED: Remote server failed to apply the update"}, updatedAt = ${now}
            WHERE id = ${cmd.sourceId}
          `;
          console.log(`[FiveM] Bug ${cmd.sourceId} deploy FAILED`);
        } else if (cmd.sourceType === "SUGGESTION") {
          await prisma.$executeRaw`
            UPDATE FivemSuggestion
            SET status = 'FAILED', verifyResult = ${"DEPLOY_FAILED: Remote server failed to apply the update"}, updatedAt = ${now}
            WHERE id = ${cmd.sourceId}
          `;
          console.log(`[FiveM] Suggestion ${cmd.sourceId} deploy FAILED`);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/fivem/servers/[slug]/pending-commands error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
