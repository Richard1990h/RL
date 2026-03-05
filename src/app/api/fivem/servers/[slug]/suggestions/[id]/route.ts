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

type SuggestionRow = {
  id: string;
  serverId: string;
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
  analysis: string | null;
  implementationPlan: string | null;
  implementationResult: string | null;
  verifyResult: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
};

const ALL_STATUSES = [
  "NEW", "ANALYZING", "ANALYZED", "CANT_ANALYZE",
  "CONSIDERING", "PLANNED", "IMPLEMENTING", "IMPLEMENTED",
  "VERIFYING", "ADDED", "FAILED", "DECLINED",
];

/** Map AI action types to their result column for storing error messages */
const SUGGESTION_RESULT_COLUMN: Record<string, string> = {
  analysis: "analysis",
  implement: "implementationResult",
  verification: "verifyResult",
};

async function failSuggestion(suggestionId: string, type: string, reason: string) {
  const col = SUGGESTION_RESULT_COLUMN[type];
  const now = new Date();
  try {
    if (col === "analysis") {
      await prisma.$executeRaw`
        UPDATE FivemSuggestion SET status = 'CANT_ANALYZE', analysis = ${reason}, updatedAt = ${now} WHERE id = ${suggestionId}
      `;
    } else if (col === "implementationResult") {
      await prisma.$executeRaw`
        UPDATE FivemSuggestion SET status = 'FAILED', implementationResult = ${reason}, updatedAt = ${now} WHERE id = ${suggestionId}
      `;
    } else if (col === "verifyResult") {
      await prisma.$executeRaw`
        UPDATE FivemSuggestion SET status = 'FAILED', verifyResult = ${reason}, updatedAt = ${now} WHERE id = ${suggestionId}
      `;
    } else {
      await prisma.$executeRaw`
        UPDATE FivemSuggestion SET status = 'FAILED', updatedAt = ${now} WHERE id = ${suggestionId}
      `;
    }
    console.log(`[FiveM AI] Failed suggestion ${suggestionId} (${type}): ${reason}`);
  } catch (e) {
    console.error(`[FiveM AI] Failed to update suggestion ${suggestionId}:`, e);
  }
}

function spawnClaude(
  prompt: string,
  suggestionId: string,
  slug: string,
  type: "analysis" | "implement" | "verification",
) {
  const appUrl = process.env.NEXTAUTH_URL || "http://localhost:4500";

  // Use per-server workspace if available, fall back to hardcoded path
  const workDir = workspaceExists(slug) ? getWorkspacePath(slug) : FIVEM_WORK_DIR_FALLBACK;

  const progressKey = `suggestion-${suggestionId}`;

  setAiProgress(progressKey, {
    id: suggestionId,
    kind: "suggestion",
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
    console.error(`[FiveM AI] Failed to spawn Claude for suggestion ${suggestionId}:`, e);
    appendAiOutput(progressKey, `\n\n❌ Failed to start Claude: ${e.message || "Unknown error"}`);
    finishAiProgress(progressKey, "error");
    void failSuggestion(suggestionId, type, `IMPLEMENT_FAILED: Claude process failed to start — ${e.message || "Unknown error"}`);
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
    console.error(`[FiveM AI] Spawn error for suggestion ${suggestionId}:`, err.message);
    appendAiOutput(progressKey, `\n\n❌ Claude process error: ${err.message}`);
    finishAiProgress(progressKey, "error");
    void failSuggestion(suggestionId, type, `IMPLEMENT_FAILED: Claude process error — ${err.message}`);
  });

  child.stdin.write(prompt);
  child.stdin.end();

  child.on("close", async (code) => {
    appendAiOutput(progressKey, `\n\n📋 Claude exited with code ${code}\n`);
    const response = stdout.trim();
    if (!response) {
      const errMsg = stderr ? `stderr: ${stderr.slice(0, 500)}` : "no output produced";
      console.error(`[FiveM AI] Claude returned empty for suggestion ${suggestionId}. exit=${code} ${errMsg}`);
      appendAiOutput(progressKey, `❌ No stdout output. ${errMsg}`);
      finishAiProgress(progressKey, "error");
      await failSuggestion(suggestionId, type, `IMPLEMENT_FAILED: Claude exited with no output (code ${code}). ${errMsg}`);
      return;
    }

    console.log(`[FiveM AI] Claude finished for suggestion ${suggestionId} (type=${type}, exit=${code})`);
    finishAiProgress(progressKey, "done");

    try {
      const url = `${appUrl}/api/fivem/servers/${encodeURIComponent(slug)}/suggestions/${encodeURIComponent(suggestionId)}/claude-response`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, content: response }),
      });
      const data = await res.json();
      if (res.ok) {
        console.log(`[FiveM AI] Suggestion ${suggestionId} → ${data.status}`);
      } else {
        console.error(`[FiveM AI] Response post failed: ${data.error}`);
        await failSuggestion(suggestionId, type, `IMPLEMENT_FAILED: Internal callback error — ${data.error}`);
      }
    } catch (e: any) {
      console.error(`[FiveM AI] Failed to post response for suggestion ${suggestionId}: ${e.message}`);
      await failSuggestion(suggestionId, type, `IMPLEMENT_FAILED: Internal callback failed — ${e.message}`);
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

// GET — fetch single suggestion with all AI fields
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

    const rows = await prisma.$queryRaw<SuggestionRow[]>`
      SELECT id, serverId, playerName, playerId, title, description, howItWorks, whyItsGood,
             priority, category, status, adminNotes, analysis, implementationPlan,
             implementationResult, verifyResult, resolvedAt, createdAt
      FROM FivemSuggestion
      WHERE id = ${id} AND serverId = ${result.server.id}
      LIMIT 1
    `;
    if (!rows[0]) {
      return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });
    }

    return NextResponse.json({ suggestion: rows[0] });
  } catch (error) {
    console.error("GET /api/fivem/servers/[slug]/suggestions/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH — trigger AI actions (analyze, implement, verify)
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

    const rows = await prisma.$queryRaw<SuggestionRow[]>`
      SELECT id, serverId, playerName, playerId, title, description, howItWorks, whyItsGood,
             priority, category, status, adminNotes, analysis, implementationPlan,
             implementationResult, verifyResult, resolvedAt, createdAt
      FROM FivemSuggestion
      WHERE id = ${id} AND serverId = ${result.server.id}
      LIMIT 1
    `;
    const sug = rows[0];
    if (!sug) {
      return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });
    }

    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
    const action = body?.action;
    const now = new Date();

    // Fetch admin comments for this suggestion
    const comments = await prisma.$queryRaw<{ authorName: string; text: string; createdAt: Date }[]>`
      SELECT authorName, text, createdAt FROM FivemAdminComment
      WHERE serverId = ${result.server.id} AND targetType = 'SUGGESTION' AND targetId = ${id}
      ORDER BY createdAt ASC LIMIT 50
    `;
    const commentsCtx = comments.length > 0
      ? `\n\nADMIN COMMENTS (additional context from the team — pay attention to these):\n${comments.map(c => `[${c.authorName}]: ${c.text}`).join("\n")}`
      : "";

    if (action === "analyze") {
      if (sug.status !== "NEW" && sug.status !== "CANT_ANALYZE" && sug.status !== "FAILED") {
        return NextResponse.json({ error: `Cannot analyze from status ${sug.status}` }, { status: 400 });
      }

      const prompt = `You are analyzing a player suggestion for a FiveM roleplay server. READ-ONLY mode.
DO NOT edit, create, or delete any files.
ONLY use Read, Glob, Grep tools to examine the codebase.

CRITICAL ANALYSIS RULES:
- The player's suggestion is their IDEA, but they may not know how the server is built. They may reference systems by nickname, describe features that partially exist, or ask for something that overlaps with existing functionality.
- NEVER assume you understand the suggestion from the title alone. ALWAYS search the ENTIRE project first.
- Search ALL resource folders — not just the one that seems obvious. The suggestion may affect or interact with multiple resources. Understanding the full server architecture is required before you can assess feasibility.
- List ALL resource folders to understand the project structure. Check every [category] folder: [hk], [local], [managers], [system], [test], and any top-level resources.
- Read existing related systems COMPLETELY before suggesting an approach. Understand how similar features are already built so your approach is consistent.

Player Suggestion:
Title: ${sug.title}
Description: ${sug.description}
How It Should Work: ${sug.howItWorks}
Why It Would Be Good: ${sug.whyItsGood || "Not specified"}
Priority: ${sug.priority}
Category: ${sug.category || "Not specified"}
${commentsCtx}
${getLogsForPrompt(slug)}

FIRST STEP — Read the system map:
Read the file at ../../docs/fivem-hk-system-map.md — it contains a complete map of ALL resources on this server including their events, exports, database tables, and dependencies. Use it to quickly identify which resources are relevant to this suggestion.

Analysis Steps (follow ALL of these):
1. Understand what the player is asking for in plain language. If admin comments provide extra detail, use it.
2. Read the system map (../../docs/fivem-hk-system-map.md) to identify related resources.
3. Search the ENTIRE resources directory for anything related. Use broad terms — the feature may partially exist under a different name.
4. List ALL resource folders to understand the full server architecture.
5. If related systems exist, read them COMPLETELY to understand existing patterns, database schemas, event naming conventions, and UI approaches.
6. Assess what already exists vs what needs to be built.

Respond in this EXACT format:

ANALYSIS:
FEASIBILITY: Yes/No/Partial — one sentence why
DIFFICULTY: X/10
ESTIMATED TIME: e.g. "~30 min", "~2 hours", "~1 day"

INVESTIGATION TRAIL:
Brief description of what you searched across all resources and what you found.

FILES TO MODIFY:
- path/to/file1.lua — what needs to change here
- path/to/file2.js — what needs to change here

NEW FILES NEEDED:
- path/to/new/file.lua — what this file does (or "None")

APPROACH:
Brief 2-3 sentence implementation strategy.

If you cannot analyze, respond with:
CANT_ANALYZE: <reason>`;

      spawnClaude(prompt, id, slug, "analysis");
      await prisma.$executeRaw`
        UPDATE FivemSuggestion SET status = 'ANALYZING', updatedAt = ${now} WHERE id = ${id}
      `;
      return NextResponse.json({ ok: true, status: "ANALYZING" });
    }

    if (action === "implement") {
      if (sug.status !== "PLANNED" && sug.status !== "FAILED") {
        return NextResponse.json({ error: `Cannot implement from status ${sug.status}` }, { status: 400 });
      }

      // Require a recent backup before allowing code changes
      const backupError = await requireRecentBackup(result.server.id);
      if (backupError) {
        return NextResponse.json({ error: backupError, needsBackup: true }, { status: 400 });
      }

      const adminNotesCtx = sug.adminNotes
        ? `\n\nADMIN NOTES (extra context — follow these instructions):\n${sug.adminNotes}`
        : "";

      const prompt = `You are implementing a player suggestion for a FiveM roleplay server.

Suggestion: ${sug.title}
Description: ${sug.description}
How It Should Work: ${sug.howItWorks}
Analysis: ${sug.analysis || "No analysis available"}${adminNotesCtx}${commentsCtx}

STRICT RULES:
1. ONLY make changes directly related to this suggestion
2. No refactoring, no unrelated improvements, no cleanup
3. Add the minimum code necessary
4. Do not modify comments, formatting, or whitespace outside your changes
5. If the suggestion involves any in-game UI, it MUST be a new NUI page (HTML/CSS/JS) that the player can click and interact with — never just Lua prints or chat messages
6. No shadows or dark overlays behind UI elements — keep backgrounds clean and transparent where appropriate
7. If you modify a resource folder that does not already contain a SYSTEM_MAP.md file, create one. The system map should document: what the resource does, its file structure, key events/exports, and dependencies on other resources
8. When any NUI is closed, remove ALL ground markers, blips, and 3D text labels that were placed by that resource — clean up completely on close
9. All NUI must use a uniform blue color scheme (primary #2563EB, darker #1E40AF, lighter #3B82F6, bg accents #1E3A5F) to match the shop UI — every UI in the project must look consistent
10. UI icons should be 25% larger than default size (e.g. if default is 16px, use 20px)
11. NEVER use stock DrawMarker() for interaction points. Instead, create custom 3D DUI sprites (CreateDui + DrawSprite) as floating icons. If the feature is similar to an existing one (e.g. another apartment), reuse the same sprite. If it's a new feature type (new job, new system), create a unique new DUI sprite icon
12. Do NOT place any GTA stock circle/cylinder markers on the ground. The only acceptable visual indicator is the custom 3D DUI sprite floating above the interaction point

Implement the suggestion. When done, respond in this EXACT format:

IMPLEMENTED:
FILES CHANGED:
- path/to/file1.lua — what was changed
- path/to/file2.js — what was changed

NEW FILES CREATED:
- path/to/new/file.lua — what this file does (or "None")

SUMMARY: 1-2 sentence summary of what was done.

RESOURCES: resource1, resource2

If it failed, respond with:
IMPLEMENT_FAILED: <reason>${getLogsForPrompt(slug)}`;

      spawnClaude(prompt, id, slug, "implement");
      await prisma.$executeRaw`
        UPDATE FivemSuggestion SET status = 'IMPLEMENTING', updatedAt = ${now} WHERE id = ${id}
      `;
      return NextResponse.json({ ok: true, status: "IMPLEMENTING" });
    }

    if (action === "verify") {
      if (sug.status !== "IMPLEMENTED") {
        return NextResponse.json({ error: `Cannot verify from status ${sug.status}` }, { status: 400 });
      }

      const prompt = `You are verifying a FiveM suggestion implementation. READ-ONLY mode.
DO NOT edit any files.

Suggestion: ${sug.title}
How It Should Work: ${sug.howItWorks}
Analysis: ${sug.analysis || "N/A"}
Implementation: ${sug.implementationResult || "N/A"}

Verify the implementation was done correctly and matches what the player requested. Respond with EXACTLY one of:
VERIFIED: <confirmation the implementation looks correct>
or
VERIFY_FAILED: <what's wrong or missing>

Keep your response under 150 words. Be concise and direct.`;

      spawnClaude(prompt, id, slug, "verification");
      await prisma.$executeRaw`
        UPDATE FivemSuggestion SET status = 'VERIFYING', updatedAt = ${now} WHERE id = ${id}
      `;
      return NextResponse.json({ ok: true, status: "VERIFYING" });
    }

    if (action === "deploy") {
      if (sug.status !== "IMPLEMENTED" && sug.status !== "ADDED") {
        return NextResponse.json({ error: `Cannot deploy from status ${sug.status}` }, { status: 400 });
      }

      // Require a recent backup before deploying
      const deployBackupError = await requireRecentBackup(result.server.id);
      if (deployBackupError) {
        return NextResponse.json({ error: deployBackupError, needsBackup: true }, { status: 400 });
      }

      let resources: string[];
      try {
        resources = parseResources(sug.implementationResult || "");
      } catch (e: any) {
        console.error(`[FiveM Deploy] parseResources failed for suggestion ${id}:`, e);
        return NextResponse.json({ error: `Failed to parse resources from implementation: ${e.message}` }, { status: 500 });
      }
      if (resources.length === 0) {
        return NextResponse.json({ error: "No resources found in implementation — nothing to deploy" }, { status: 400 });
      }

      let folders: string[];
      try {
        folders = getResourceFolders(slug, resources);
      } catch (e: any) {
        console.error(`[FiveM Deploy] getResourceFolders failed for suggestion ${id}:`, e);
        return NextResponse.json({ error: `Failed to locate resource folders: ${e.message}` }, { status: 500 });
      }
      if (folders.length === 0) {
        return NextResponse.json({ error: "Could not find resource folders in workspace" }, { status: 400 });
      }

      try {
        const cmdId = randomUUID();
        const resourcesJson = JSON.stringify(resources);
        const foldersStr = folders.join(",");
        await prisma.$executeRaw`
          INSERT INTO FivemPendingCommand (id, serverId, type, resources, folders, reason, sourceType, sourceId, status, createdAt)
          VALUES (${cmdId}, ${result.server.id}, 'UPDATE', ${resourcesJson}, ${foldersStr}, ${"Deploy suggestion: " + id}, 'SUGGESTION', ${id}, 'PENDING', ${now})
        `;
      } catch (e: any) {
        console.error(`[FiveM Deploy] DB insert failed for suggestion ${id}:`, e);
        return NextResponse.json({ error: `Failed to queue deploy command: ${e.message}` }, { status: 500 });
      }

      try {
        await prisma.$executeRaw`
          UPDATE FivemSuggestion SET status = 'DEPLOYING', updatedAt = ${now} WHERE id = ${id}
        `;
      } catch (e: any) {
        console.error(`[FiveM Deploy] Status update failed for suggestion ${id}:`, e);
      }

      return NextResponse.json({ ok: true, status: "DEPLOYING", resources, folders });
    }

    return NextResponse.json({ error: "Invalid action. Use: analyze, implement, verify, deploy" }, { status: 400 });
  } catch (error) {
    console.error("PATCH /api/fivem/servers/[slug]/suggestions/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
