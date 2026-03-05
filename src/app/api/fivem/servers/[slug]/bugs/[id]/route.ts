import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ensureFivemTables, normalizeFivemSlug } from "@/lib/fivem/server-db";
import { setAiProgress, appendAiOutput, finishAiProgress } from "@/lib/fivem/ai-progress";
import { getLogsForPrompt } from "@/lib/fivem/server-logs";
import { getWorkspacePath, workspaceExists, getResourceFolders } from "@/lib/fivem/workspace";
import { parseResources } from "@/lib/fivem/parse-resources";
import { requireRecentBackup } from "@/lib/fivem/backup-guard";
import { randomUUID } from "crypto";
import { spawn } from "child_process";

const FIVEM_WORK_DIR_FALLBACK = process.env.FIVEM_WORK_DIR || "";
const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";

type BugRow = {
  id: string;
  serverId: string;
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
  createdAt: Date;
};

/** Map AI action types to their result column for storing error messages */
const BUG_RESULT_COLUMN: Record<string, string> = {
  diagnosis: "diagnosis",
  fix: "fixResult",
  verification: "testResult",
};

async function failBug(bugId: string, type: string, reason: string) {
  const col = BUG_RESULT_COLUMN[type];
  const now = new Date();
  try {
    if (col === "diagnosis") {
      await prisma.$executeRaw`
        UPDATE FivemBugReport SET status = 'CANT_FIND', diagnosis = ${reason}, updatedAt = ${now} WHERE id = ${bugId}
      `;
    } else if (col === "fixResult") {
      await prisma.$executeRaw`
        UPDATE FivemBugReport SET status = 'FAILED', fixResult = ${reason}, updatedAt = ${now} WHERE id = ${bugId}
      `;
    } else if (col === "testResult") {
      await prisma.$executeRaw`
        UPDATE FivemBugReport SET status = 'FAILED', testResult = ${reason}, updatedAt = ${now} WHERE id = ${bugId}
      `;
    } else {
      await prisma.$executeRaw`
        UPDATE FivemBugReport SET status = 'FAILED', updatedAt = ${now} WHERE id = ${bugId}
      `;
    }
    console.log(`[FiveM AI] Failed bug ${bugId} (${type}): ${reason}`);
  } catch (e) {
    console.error(`[FiveM AI] Failed to update bug ${bugId}:`, e);
  }
}

/**
 * Spawn a `claude -p` process in the FiveM directory.
 * Runs detached so the HTTP response returns immediately.
 * When Claude finishes, the callback POSTs the result back to our claude-response endpoint.
 */
function spawnClaude(
  prompt: string,
  bugId: string,
  slug: string,
  type: "diagnosis" | "fix" | "verification",
) {
  const appUrl = process.env.NEXTAUTH_URL || "http://localhost:4500";

  // Use per-server workspace if available, fall back to hardcoded path
  const workDir = workspaceExists(slug) ? getWorkspacePath(slug) : FIVEM_WORK_DIR_FALLBACK;

  const progressKey = `bug-${bugId}`;
  setAiProgress(progressKey, {
    id: bugId,
    kind: "bug",
    action: type,
    status: "running",
    output: `⚙️ Spawning Claude for ${type}...\n📂 workDir: ${workDir}\n📝 prompt length: ${prompt.length} chars\n\n`,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const cleanEnv = { ...process.env };
  delete cleanEnv.CLAUDECODE;
  delete cleanEnv.CLAUDE_CODE_ENTRYPOINT;

  let child;
  try {
    child = spawn(CLAUDE_BIN, ["-p", "--output-format", "text"], {
      cwd: workDir,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: cleanEnv,
    });
  } catch (e: any) {
    console.error(`[FiveM AI] Failed to spawn Claude for bug ${bugId}:`, e);
    appendAiOutput(progressKey, `\n\n❌ Failed to start Claude: ${e.message || "Unknown error"}`);
    finishAiProgress(progressKey, "error");
    void failBug(bugId, type, `FIX_FAILED: Claude process failed to start — ${e.message || "Unknown error"}`);
    return;
  }

  appendAiOutput(progressKey, `✅ Claude process spawned (pid: ${child.pid})\n\n`);

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d: Buffer) => {
    const chunk = d.toString();
    stdout += chunk;
    appendAiOutput(progressKey, chunk);
  });
  child.stderr.on("data", (d: Buffer) => {
    const chunk = d.toString();
    stderr += chunk;
    appendAiOutput(progressKey, `⚠️ ${chunk}`);
  });

  child.on("error", (err) => {
    console.error(`[FiveM AI] Spawn error for bug ${bugId}:`, err.message);
    appendAiOutput(progressKey, `\n\n❌ Claude process error: ${err.message}`);
    finishAiProgress(progressKey, "error");
    void failBug(bugId, type, `FIX_FAILED: Claude process error — ${err.message}`);
  });

  child.stdin.write(prompt);
  child.stdin.end();

  child.on("close", async (code) => {
    appendAiOutput(progressKey, `\n\n📋 Claude exited with code ${code}\n`);
    const response = stdout.trim();
    if (!response) {
      const errMsg = stderr ? `stderr: ${stderr.slice(0, 500)}` : "no output produced";
      console.error(`[FiveM AI] Claude returned empty for bug ${bugId}. exit=${code} ${errMsg}`);
      appendAiOutput(progressKey, `❌ No stdout output. ${errMsg}`);
      finishAiProgress(progressKey, "error");
      await failBug(bugId, type, `FIX_FAILED: Claude exited with no output (code ${code}). ${errMsg}`);
      return;
    }

    console.log(`[FiveM AI] Claude finished for bug ${bugId} (type=${type}, exit=${code})`);
    finishAiProgress(progressKey, "done");

    try {
      const url = `${appUrl}/api/fivem/servers/${encodeURIComponent(slug)}/bugs/${encodeURIComponent(bugId)}/claude-response`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, content: response }),
      });
      const data = await res.json();
      if (res.ok) {
        console.log(`[FiveM AI] Bug ${bugId} → ${data.status}`);
      } else {
        console.error(`[FiveM AI] Response post failed: ${data.error}`);
        await failBug(bugId, type, `FIX_FAILED: Internal callback error — ${data.error}`);
      }
    } catch (e: any) {
      console.error(`[FiveM AI] Failed to post response for bug ${bugId}: ${e.message}`);
      await failBug(bugId, type, `FIX_FAILED: Internal callback failed — ${e.message}`);
    }
  });

  child.unref();
}

async function getServerAndCheckAdmin(slug: string) {
  const servers = await prisma.$queryRaw<{ id: string; ownerId: string }[]>`
    SELECT id, ownerId FROM FivemServer WHERE slug = ${slug} LIMIT 1
  `;
  const server = servers[0];
  if (!server) return { error: "Server not found", status: 404 };

  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized", status: 401 };

  let isAdmin = server.ownerId === user.id;
  if (!isAdmin) {
    const memberRows = await prisma.$queryRaw<{ role: string }[]>`
      SELECT role FROM FivemServerMember
      WHERE serverId = ${server.id} AND userId = ${user.id} AND status = 'ACTIVE'
      LIMIT 1
    `;
    isAdmin = memberRows[0]?.role === "ADMIN" || memberRows[0]?.role === "MODERATOR";
  }
  if (!isAdmin) return { error: "Forbidden", status: 403 };

  return { server, user };
}

// GET — fetch single bug with all AI fields
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  try {
    await ensureFivemTables();
    const { slug: rawSlug, id } = await params;
    const slug = normalizeFivemSlug(rawSlug);

    const result = await getServerAndCheckAdmin(slug);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const bugs = await prisma.$queryRaw<BugRow[]>`
      SELECT id, serverId, playerName, playerId, title, description, stepsToRepro, expected,
             severity, status, location, adminNotes, screenshots,
             diagnosis, fixPlan, fixResult, testResult, resolvedAt, createdAt
      FROM FivemBugReport
      WHERE id = ${id} AND serverId = ${result.server.id}
      LIMIT 1
    `;
    if (!bugs[0]) {
      return NextResponse.json({ error: "Bug not found" }, { status: 404 });
    }

    return NextResponse.json({ bug: bugs[0] });
  } catch (error) {
    console.error("GET /api/fivem/servers/[slug]/bugs/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH — trigger AI actions (investigate, fix, verify)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  try {
    await ensureFivemTables();
    const { slug: rawSlug, id } = await params;
    const slug = normalizeFivemSlug(rawSlug);

    const result = await getServerAndCheckAdmin(slug);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const bugs = await prisma.$queryRaw<BugRow[]>`
      SELECT id, serverId, playerName, playerId, title, description, stepsToRepro, expected,
             severity, status, location, adminNotes, screenshots,
             diagnosis, fixPlan, fixResult, testResult, resolvedAt, createdAt
      FROM FivemBugReport
      WHERE id = ${id} AND serverId = ${result.server.id}
      LIMIT 1
    `;
    const bug = bugs[0];
    if (!bug) {
      return NextResponse.json({ error: "Bug not found" }, { status: 404 });
    }

    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
    const action = body?.action;
    const now = new Date();

    // Fetch admin comments for this bug (used by investigate + fix prompts)
    const comments = await prisma.$queryRaw<{ authorName: string; text: string; createdAt: Date }[]>`
      SELECT authorName, text, createdAt FROM FivemAdminComment
      WHERE serverId = ${result.server.id} AND targetType = 'BUG' AND targetId = ${id}
      ORDER BY createdAt ASC LIMIT 50
    `;
    const commentsCtx = comments.length > 0
      ? `\n\nADMIN COMMENTS (additional context from the team — pay attention to these):\n${comments.map(c => `[${c.authorName}]: ${c.text}`).join("\n")}`
      : "";

    if (action === "investigate") {
      if (bug.status !== "OPEN" && bug.status !== "CANT_FIND" && bug.status !== "NOT_A_BUG" && bug.status !== "FAILED") {
        return NextResponse.json({ error: `Cannot investigate from status ${bug.status}` }, { status: 400 });
      }

      const prompt = `You are investigating a player-submitted bug report for a FiveM roleplay server. READ-ONLY mode.
DO NOT edit, create, or delete any files. DO NOT run any commands that modify state.
ONLY use Read, Glob, Grep tools to examine the codebase.

CRITICAL INVESTIGATION RULES:
- The player's description is a CLUE, not a diagnosis. They are telling you their experience — what they saw, what they expected. They may use wrong terminology, reference systems by nickname, or misidentify the cause. Your job is to figure out what they actually encountered.
- NEVER assume you know what's wrong from the title alone. ALWAYS search the ENTIRE project first.
- Search ALL resource folders — not just the one that seems obvious. The bug could be caused by an interaction between multiple resources, a missing export, a database issue, or a system the player didn't name.
- Read the FULL code path end-to-end: client trigger → server handler → database query → response → client callback. Trace every step.
- If you find what looks like the bug, keep searching — there may be additional causes or the real root cause may be elsewhere.
- Admin comments below contain CRUCIAL context from the server team — they often know exactly which system or resource is involved. READ THEM CAREFULLY and use them to guide your search.

Bug Report:
Title: ${bug.title}
Description: ${bug.description}
Steps to Reproduce: ${bug.stepsToRepro}
Expected Behavior: ${bug.expected || "Not specified"}
Severity: ${bug.severity}
Location: ${bug.location || "Not specified"}
${commentsCtx}
${getLogsForPrompt(slug)}

FIRST STEP — Read the system map:
Read the file at ../../docs/fivem-hk-system-map.md — it contains a complete map of ALL resources on this server including their events, exports, database tables, and dependencies. Use it to quickly identify which resources are relevant to this bug report.

Investigation Steps (follow ALL of these):
1. First, understand what the player is describing in plain language. What action did they take? What did they expect? What happened instead? If admin comments provide extra detail, use it.
2. Read the system map (../../docs/fivem-hk-system-map.md) to identify which resources handle the system the player is describing.
3. Search the ENTIRE resources directory for anything related to what the player describes. Use broad search terms — the system might have a different name than what the player called it. Search for keywords from their description, related game mechanics, item names, location names, event names.
4. List ALL resource folders in the project to understand the full server architecture. Check every [category] folder: [hk], [local], [managers], [system], [test], and any top-level resources.
5. Once you find relevant resources, read the COMPLETE server-side AND client-side code. Trace the full flow: what event triggers the action, how the server processes it, what database queries run, what gets sent back to the client.
6. Check for cross-resource dependencies: Does this resource call exports from another resource? Are those exports actually defined? Does the other resource need to be running?
7. Check the database schema: Are the right tables and columns present? Could a query return unexpected results?
8. Look for race conditions, missing error handling, silent failures (pcall swallowing errors), and edge cases.
9. Check config files for misconfiguration — wrong coordinates, missing item definitions, disabled features.
10. If the system genuinely doesn't exist, explain what you searched and what the closest related system is.

Respond in EXACTLY one of these formats:

FORMAT 1 — Bug confirmed (code issue found):
DIAGNOSIS:
ROOT CAUSE: One sentence describing the bug cause.
DIFFICULTY: X/10

INVESTIGATION TRAIL:
Brief description of what you searched, which resources you examined, and how you traced the issue.

FILES INVOLVED:
- path/to/file1.lua:lineNum — what's wrong here
- path/to/file2.js:lineNum — what's wrong here

FIX APPROACH:
Brief 2-3 sentence fix strategy.

FORMAT 2 — System not found, but here's what we can do:
DIAGNOSIS:
ROOT CAUSE: The system/feature the player is describing does not currently exist in the codebase. <Explain what you searched for across ALL resources and what related systems you DID find.>
DIFFICULTY: X/10

INVESTIGATION TRAIL:
List every resource folder you checked and what search terms you used. Show your work.

FILES INVOLVED:
- path/to/relevant/resource/ — what exists here that's related (or "No existing files — new feature needed")

FIX APPROACH:
Brief 2-3 sentence plan for what could be built or configured to address the player's report.

FORMAT 3 — Cannot locate the issue:
CANT_FIND: <what you searched across ALL resources and why you couldn't locate the root cause>`;

      spawnClaude(prompt, id, slug, "diagnosis");
      await prisma.$executeRaw`
        UPDATE FivemBugReport SET status = 'INVESTIGATING', updatedAt = ${now} WHERE id = ${id}
      `;
      return NextResponse.json({ ok: true, status: "INVESTIGATING" });
    }

    if (action === "fix") {
      if (bug.status !== "DIAGNOSED" && bug.status !== "FAILED") {
        return NextResponse.json({ error: `Cannot fix from status ${bug.status}` }, { status: 400 });
      }

      // Require a recent backup before allowing code changes
      const backupError = await requireRecentBackup(result.server.id);
      if (backupError) {
        return NextResponse.json({ error: backupError, needsBackup: true }, { status: 400 });
      }

      const failureContext = bug.status === "FAILED" && bug.testResult
        ? `\n\nPrevious fix attempt FAILED verification:\n${bug.testResult}\nPlease address the issues found during verification.`
        : "";

      const adminNotesCtx = bug.adminNotes
        ? `\n\nADMIN NOTES (extra context — follow these instructions):\n${bug.adminNotes}`
        : "";

      const prompt = `You are fixing a diagnosed FiveM bug. Apply the minimum change needed.

Bug: ${bug.title}
Description: ${bug.description}
Steps to Reproduce: ${bug.stepsToRepro}
Expected Behavior: ${bug.expected || "Not specified"}
Diagnosis: ${bug.diagnosis || "No diagnosis available"}${failureContext}${adminNotesCtx}${commentsCtx}

BEFORE YOU START:
1. Re-read the diagnosis and understand the root cause
2. Read ALL files mentioned in the diagnosis to understand the current code
3. If the diagnosis references other files or systems, read those too so you understand the full picture
4. Plan your changes before editing — know exactly what you're changing and why
5. After editing, re-read your changes to make sure they're correct

STRICT RULES:
1. ONLY edit code directly related to the diagnosed issue
2. No refactoring, no unrelated improvements, no cleanup
3. Add the minimum code necessary
4. Do not modify comments, formatting, or whitespace outside the changes
5. If the fix involves any in-game UI, it MUST be a proper NUI page (HTML/CSS/JS) that the player can click and interact with — never just Lua prints or chat messages
6. No shadows or dark overlays behind UI elements — keep backgrounds clean and transparent where appropriate
7. If you modify a resource folder that does not already contain a SYSTEM_MAP.md file, create one. The system map should document: what the resource does, its file structure, key events/exports, and dependencies on other resources
8. When any NUI is closed, remove ALL ground markers, blips, and 3D text labels that were placed by that resource — clean up completely on close
9. All NUI must use a uniform blue color scheme (primary #2563EB, darker #1E40AF, lighter #3B82F6, bg accents #1E3A5F) to match the shop UI — every UI in the project must look consistent
10. UI icons should be 25% larger than default size (e.g. if default is 16px, use 20px)
11. NEVER use stock DrawMarker() for interaction points. Instead, create custom 3D DUI sprites (CreateDui + DrawSprite) as floating icons. If the feature is similar to an existing one (e.g. another apartment), reuse the same sprite. If it's a new feature type (new job, new system), create a unique new DUI sprite icon
12. Do NOT place any GTA stock circle/cylinder markers on the ground. The only acceptable visual indicator is the custom 3D DUI sprite floating above the interaction point
13. Test your logic mentally: trace through the code path the player would hit based on the steps to reproduce and confirm your fix addresses it

Fix the issue. When done, respond in this EXACT format:

FIX_APPLIED:
FILES CHANGED:
- path/to/file1.lua — what was changed
- path/to/file2.js — what was changed

NEW FILES CREATED:
- path/to/new/file.lua — what this file does (or "None")

SUMMARY: 1-2 sentence summary of the fix.

RESOURCES: resource1, resource2

If it failed, respond with:
FIX_FAILED: <reason>${getLogsForPrompt(slug)}`;

      spawnClaude(prompt, id, slug, "fix");
      await prisma.$executeRaw`
        UPDATE FivemBugReport SET status = 'FIXING', updatedAt = ${now} WHERE id = ${id}
      `;
      return NextResponse.json({ ok: true, status: "FIXING" });
    }

    if (action === "verify") {
      if (bug.status !== "FIXED") {
        return NextResponse.json({ error: `Cannot verify from status ${bug.status}` }, { status: 400 });
      }

      const prompt = `You are verifying a FiveM bug fix. READ-ONLY mode.
DO NOT edit any files. ONLY use Read, Glob, Grep tools.

Bug: ${bug.title}
Description: ${bug.description}
Steps to Reproduce: ${bug.stepsToRepro}
Expected Behavior: ${bug.expected || "Not specified"}
Original Diagnosis: ${bug.diagnosis || "N/A"}
Fix Applied: ${bug.fixResult || "N/A"}

VERIFICATION STEPS:
1. Read every file that was changed in the fix — confirm the edits are actually there
2. Mentally trace the player's steps to reproduce: walk through the code path and confirm the fix addresses each step
3. Check for side effects: did the fix break anything else in the same file or related files?
4. Verify no syntax errors, missing commas, unclosed brackets, or typos were introduced
5. If the fix created new files, verify they are properly referenced (fxmanifest, HTML includes, etc.)

Respond with EXACTLY one of:
VERIFIED: <1-2 sentences confirming the fix is correct and why it solves the reported issue>
or
VERIFY_FAILED: <specifically what's wrong, what file/line, and what needs to change>`;

      spawnClaude(prompt, id, slug, "verification");
      await prisma.$executeRaw`
        UPDATE FivemBugReport SET status = 'TESTING', updatedAt = ${now} WHERE id = ${id}
      `;
      return NextResponse.json({ ok: true, status: "TESTING" });
    }

    if (action === "deploy") {
      if (bug.status !== "FIXED" && bug.status !== "RESOLVED") {
        return NextResponse.json({ error: `Cannot deploy from status ${bug.status}` }, { status: 400 });
      }

      // Require a recent backup before deploying
      const deployBackupError = await requireRecentBackup(result.server.id);
      if (deployBackupError) {
        return NextResponse.json({ error: deployBackupError, needsBackup: true }, { status: 400 });
      }

      // Parse affected resources from fixResult
      let resources: string[];
      try {
        resources = parseResources(bug.fixResult || "");
      } catch (e: any) {
        console.error(`[FiveM Deploy] parseResources failed for bug ${id}:`, e);
        return NextResponse.json({ error: `Failed to parse resources from fix result: ${e.message}` }, { status: 500 });
      }
      if (resources.length === 0) {
        return NextResponse.json({ error: "No resources found in fix result — nothing to deploy" }, { status: 400 });
      }

      // Determine which workspace folders contain these resources
      let folders: string[];
      try {
        folders = getResourceFolders(slug, resources);
      } catch (e: any) {
        console.error(`[FiveM Deploy] getResourceFolders failed for bug ${id}:`, e);
        return NextResponse.json({ error: `Failed to locate resource folders: ${e.message}` }, { status: 500 });
      }
      if (folders.length === 0) {
        return NextResponse.json({ error: "Could not find resource folders in workspace" }, { status: 400 });
      }

      // Queue UPDATE command — remote server will: backup → download zip → extract → ensure
      try {
        const cmdId = randomUUID();
        const resourcesJson = JSON.stringify(resources);
        const foldersStr = folders.join(",");
        await prisma.$executeRaw`
          INSERT INTO FivemPendingCommand (id, serverId, type, resources, folders, reason, sourceType, sourceId, status, createdAt)
          VALUES (${cmdId}, ${result.server.id}, 'UPDATE', ${resourcesJson}, ${foldersStr}, ${"Deploy bug fix: " + id}, 'BUG', ${id}, 'PENDING', ${now})
        `;
      } catch (e: any) {
        console.error(`[FiveM Deploy] DB insert failed for bug ${id}:`, e);
        return NextResponse.json({ error: `Failed to queue deploy command: ${e.message}` }, { status: 500 });
      }

      try {
        await prisma.$executeRaw`
          UPDATE FivemBugReport SET status = 'DEPLOYING', updatedAt = ${now} WHERE id = ${id}
        `;
      } catch (e: any) {
        console.error(`[FiveM Deploy] Status update failed for bug ${id}:`, e);
        // Command was already queued, so don't fail — just warn
      }

      return NextResponse.json({ ok: true, status: "DEPLOYING", resources, folders });
    }

    return NextResponse.json({ error: "Invalid action. Use: investigate, fix, verify, deploy" }, { status: 400 });
  } catch (error) {
    console.error("PATCH /api/fivem/servers/[slug]/bugs/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
