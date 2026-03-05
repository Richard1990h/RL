import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import fs from "fs";
import path from "path";

const MESSAGE_QUEUE_FILE = path.join(
  process.env.USERPROFILE || "C:\\Users\\Richard",
  ".claude",
  "projects",
  "C--Users-Richard-Desktop-RallyLive-ca",
  "message-queue.json"
);

const ALL_STATUSES = [
  "OPEN",
  "INVESTIGATING",
  "DIAGNOSED",
  "FIXING",
  "FIXED",
  "TESTING",
  "RESOLVED",
  "FAILED",
  "DISMISSED",
];

function sendToMessageQueue(text: string, from: string, bugReportId: string) {
  let queue: any[] = [];
  if (fs.existsSync(MESSAGE_QUEUE_FILE)) {
    queue = JSON.parse(fs.readFileSync(MESSAGE_QUEUE_FILE, "utf-8"));
  }

  queue.push({
    id: `bug-${bugReportId}-${Date.now()}`,
    text,
    from,
    timestamp: new Date().toISOString(),
    bugReportId,
  });

  if (queue.length > 50) {
    queue = queue.slice(-50);
  }

  fs.writeFileSync(MESSAGE_QUEUE_FILE, JSON.stringify(queue, null, 2), "utf-8");
}

// PATCH: Update bug status (admin only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { isOwner: true, displayName: true },
    });

    if (!fullUser?.isOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const { status, adminNotes } = body;

    const bug = await prisma.bugReport.findUnique({ where: { id } });
    if (!bug) {
      return NextResponse.json({ error: "Bug report not found" }, { status: 404 });
    }

    // Admin notes-only update (no status change)
    if (adminNotes !== undefined && !status) {
      const updated = await prisma.bugReport.update({
        where: { id },
        data: { adminNotes },
      });
      return NextResponse.json(updated);
    }

    if (!ALL_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    // Build update data
    const data: any = {
      status,
      resolvedAt:
        status === "RESOLVED" || status === "DISMISSED" ? new Date() : null,
    };

    // Reset all progress fields when cancelling back to OPEN
    if (status === "OPEN") {
      data.diagnosis = null;
      data.upgradeRequest = null;
      data.fixResult = null;
      data.testResult = null;
      data.adminNotes = null;
      data.resolvedAt = null;
    }

    const adminName = fullUser.displayName || "Admin";

    // Handle transitions that send prompts to Claude
    try {
      if (status === "INVESTIGATING" && bug.status === "OPEN") {
        // Investigator prompt — classifies as BUG, UPGRADE, or BOTH
        const prompt = `[BUG-REPORT:${id}] [BUG INVESTIGATION REQUEST]
A user has submitted a report. Your ONLY job is to INVESTIGATE, CLASSIFY, and DIAGNOSE. Do NOT fix anything yet.

The report might be:
1. A real BUG — something is broken or not working correctly
2. An UPGRADE request — they want a new feature or a change to existing behavior
3. BOTH — a real bug AND a feature request mixed together

Report Title: ${bug.title}
Report Description: ${bug.description}

NOTE: The user reported this on their app. Ignore any page references in the description — search the codebase based on the description itself, not a URL.

Instructions:
1. Search the codebase for the relevant files related to this report
2. Read the code carefully to understand the current behavior
3. Classify the report as BUG, UPGRADE, or BOTH
4. Your response MUST begin with [BUG-RESPONSE:${id}] on the very first line
5. Then provide a structured response in this EXACT format:

[BUG-RESPONSE:${id}]
CATEGORY: BUG / UPGRADE / BOTH

BUG: (only include this section if CATEGORY is BUG or BOTH)
- Root Cause: [one-line summary]
- Files Involved: [list of file paths]
- What's Wrong: [detailed explanation of the bug]
- Suggested Fix: [what needs to change, without making changes]

UPGRADE: (only include this section if CATEGORY is UPGRADE or BOTH)
- What They Want: [one-line summary of the requested feature/change]
- Details: [brief explanation]

IMPORTANT: Do NOT edit any files. Investigation only. You MUST start your response with [BUG-RESPONSE:${id}] so the system can route it back to the correct bug report. Keep your entire response under 200 words — this will be read aloud via TTS. Be concise and direct.`;
        sendToMessageQueue(prompt, adminName, id);
      } else if (status === "FIXING" && (bug.status === "DIAGNOSED" || bug.status === "FAILED")) {
        // Fix prompt — adapts based on whether it's a bug fix, upgrade, or both
        const failureContext =
          bug.status === "FAILED" && bug.testResult
            ? `\n\nPrevious fix attempt FAILED verification:\n${bug.testResult}\n\nPlease address the issues found during verification.`
            : "";

        const hasBug = !!bug.diagnosis;
        const hasUpgrade = !!bug.upgradeRequest;

        let taskDescription = "";
        if (hasBug && hasUpgrade) {
          taskDescription = `This report contains BOTH a bug fix and a feature upgrade request.

BUG TO FIX:
${bug.diagnosis}

UPGRADE TO IMPLEMENT:
${bug.upgradeRequest}

Apply the bug fix AND implement the upgrade request.`;
        } else if (hasUpgrade) {
          taskDescription = `This is a FEATURE UPGRADE REQUEST (not a bug fix).

UPGRADE TO IMPLEMENT:
${bug.upgradeRequest}

Implement the requested feature/change.`;
        } else {
          taskDescription = `BUG TO FIX:
Diagnosis: ${bug.diagnosis || "No diagnosis available"}`;
        }

        const adminNotesContext = bug.adminNotes ? `\n\nADMIN NOTES (extra context from the admin — follow these instructions):\n${bug.adminNotes}` : "";

        const prompt = `[BUG-REPORT:${id}] [${hasUpgrade && !hasBug ? "UPGRADE IMPLEMENTATION" : "BUG FIX"} REQUEST]
${hasBug ? "You previously diagnosed this issue." : "A feature upgrade has been approved."} Now apply the changes.

Original Report: ${bug.title}
${taskDescription}${failureContext}${adminNotesContext}

STRICT RULES:
1. ONLY edit code — never delete functions, components, imports, or logic that isn't directly related
2. ONLY ${hasBug ? "fix the specific diagnosed issue" : "implement the requested feature"} — no refactoring, no unrelated "improvements", no cleanup
3. If you need to add code, add the minimum necessary
4. Do not modify comments, formatting, or whitespace outside the changes
5. If the fix requires database schema changes (new fields, new models, enums, etc.), update prisma/schema.prisma AND run \`npx prisma db push\` to sync the MySQL database. Then run \`npx prisma generate\` to regenerate the Prisma client.
6. Your response MUST begin with [BUG-RESPONSE:${id}] on the very first line
7. After making changes, summarize exactly what you changed in this format:

[BUG-RESPONSE:${id}]
FIX APPLIED:
- File: [path] — [what changed and why]
- File: [path] — [what changed and why]

IMPORTANT: You MUST start your response with [BUG-RESPONSE:${id}] so the system can route it back to the correct bug report. Keep your entire response under 150 words — this will be read aloud via TTS. Be concise and direct.`;
        sendToMessageQueue(prompt, adminName, id);
      } else if (status === "TESTING" && bug.status === "FIXED") {
        // Verification prompt
        const prompt = `[BUG-REPORT:${id}] [BUG VERIFICATION REQUEST]
A fix was applied for a bug. Verify it is correct and introduced no regressions.

Original Bug: ${bug.title}
Description: ${bug.description}

Diagnosis: ${bug.diagnosis || "N/A"}
Fix Applied: ${bug.fixResult || "N/A"}

Instructions:
1. Read the files that were changed
2. Verify the original bug is actually fixed by the changes
3. Check that no other functionality was broken or removed
4. Check for any new issues introduced by the changes
5. Your response MUST begin with [BUG-RESPONSE:${id}] on the very first line

Respond in this EXACT format:

[BUG-RESPONSE:${id}]
VERIFICATION:
- Status: PASS or FAIL
- Original Bug Fixed: Yes/No — [explanation]
- Regressions Found: None / [list any issues]
- Details: [any additional notes]

IMPORTANT: You MUST start your response with [BUG-RESPONSE:${id}] so the system can route it back to the correct bug report. Keep your entire response under 150 words — this will be read aloud via TTS. Be concise and direct.`;
        sendToMessageQueue(prompt, adminName, id);
      }
    } catch (err) {
      console.error("Failed to queue bug prompt for Claude:", err);
    }

    const updated = await prisma.bugReport.update({
      where: { id },
      data,
    });

    return NextResponse.json({ bug: updated, ok: true });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
