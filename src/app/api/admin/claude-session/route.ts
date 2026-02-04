import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOwnerWithDevice } from "@/lib/auth";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

const CLAUDE_PROJECTS_BASE = path.join(
  process.env.USERPROFILE || "C:\\Users\\Richard",
  ".claude",
  "projects"
);

const DEFAULT_PROJECT_DIR = path.join(CLAUDE_PROJECTS_BASE, "C--Users-Richard-Desktop-Rally-Live");

interface QuestionOption {
  label: string;
  description?: string;
}

interface ClaudeQuestion {
  question: string;
  header?: string;
  options: QuestionOption[];
  multiSelect?: boolean;
}

interface ParsedMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  thinking?: string;
  timestamp: string;
  toolUses?: { name: string; status: string; input?: Record<string, unknown> }[];
  isAdminNote?: boolean;
  adminFrom?: string;
  viaBridge?: boolean;
  pendingQuestions?: ClaudeQuestion[];
}

function resolveClaudeDir(projectDir: string): string | null {
  if (!projectDir) return null;
  try {
    const normalized = projectDir.replace(/\//g, "\\").replace(/\\+$/, "");
    const converted = normalized.replace(/[:\\\/]/g, "-").replace(/\s+/g, "-");
    const candidatePath = path.join(CLAUDE_PROJECTS_BASE, converted);
    if (fs.existsSync(candidatePath)) return candidatePath;

    const dirs = fs.readdirSync(CLAUDE_PROJECTS_BASE);
    for (const dir of dirs) {
      const dirPath = path.join(CLAUDE_PROJECTS_BASE, dir);
      const stat = fs.statSync(dirPath);
      if (!stat.isDirectory()) continue;
      const segments = normalized.split("\\").filter(Boolean);
      const lastTwo = segments.slice(-2).join("-");
      if (dir.includes(lastTwo)) return dirPath;
    }
    return null;
  } catch {
    return null;
  }
}

function getNotesFile(claudeDir: string): string {
  return path.join(claudeDir, "admin-notes.json");
}

function getQueueFile(claudeDir: string): string {
  return path.join(claudeDir, "message-queue.json");
}

function findLatestSession(claudeDir: string): string | null {
  try {
    if (!fs.existsSync(claudeDir)) return null;
    const files = fs.readdirSync(claudeDir)
      .filter((f) => {
        if (!f.endsWith(".jsonl")) return false;
        try {
          const fullPath = path.join(claudeDir, f);
          return fs.statSync(fullPath).isFile();
        } catch { return false; }
      })
      .map((f) => ({
        name: f,
        path: path.join(claudeDir, f),
        mtime: fs.statSync(path.join(claudeDir, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);
    return files.length > 0 ? files[0].path : null;
  } catch {
    return null;
  }
}

function parseJSONLFile(filePath: string, afterLine?: number): { messages: ParsedMessage[]; totalLines: number } {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());
  const totalLines = lines.length;

  const startLine = afterLine ? Math.max(0, afterLine) : Math.max(0, lines.length - 100);
  const messages: ParsedMessage[] = [];

  for (let i = startLine; i < lines.length; i++) {
    try {
      const entry = JSON.parse(lines[i]);
      if (entry.type !== "user" && entry.type !== "assistant") continue;

      const msg = entry.message;
      if (!msg || !msg.content) continue;

      const parsed: ParsedMessage = {
        id: entry.uuid || `line-${i}`,
        role: msg.role || entry.type,
        content: "",
        timestamp: entry.timestamp || "",
        toolUses: [],
      };

      if (typeof msg.content === "string") {
        parsed.content = msg.content;
      } else if (Array.isArray(msg.content)) {
        const textParts: string[] = [];
        const toolParts: { name: string; status: string; input?: Record<string, unknown> }[] = [];
        const questions: ClaudeQuestion[] = [];

        for (const block of msg.content) {
          if (block.type === "text" && block.text && block.text !== "(no content)") {
            textParts.push(block.text);
          } else if (block.type === "thinking" && block.thinking) {
            parsed.thinking = block.thinking.substring(0, 500) + (block.thinking.length > 500 ? "..." : "");
          } else if (block.type === "tool_use") {
            toolParts.push({ name: block.name || "unknown", status: "called", input: block.input });
            // Extract AskUserQuestion data
            if (block.name === "AskUserQuestion" && block.input?.questions) {
              for (const q of block.input.questions as ClaudeQuestion[]) {
                questions.push({
                  question: q.question,
                  header: q.header,
                  options: (q.options || []).map((o: QuestionOption) => ({
                    label: o.label,
                    description: o.description,
                  })),
                  multiSelect: q.multiSelect || false,
                });
              }
            }
          }
        }

        parsed.content = textParts.join("\n");
        if (toolParts.length > 0) parsed.toolUses = toolParts;
        if (questions.length > 0) parsed.pendingQuestions = questions;
      }

      if (parsed.content || (parsed.toolUses && parsed.toolUses.length > 0) || parsed.thinking) {
        messages.push(parsed);
      }
    } catch {
      // Skip unparseable lines
    }
  }

  // Only mark questions as pending if it's the very last assistant message
  // and no user message follows it (meaning Claude is waiting for an answer)
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.pendingQuestions && msg.pendingQuestions.length > 0) {
      // Check if there's a subsequent user message (answer was given)
      const hasFollowUp = messages.slice(i + 1).some((m) => m.role === "user" && !m.isAdminNote);
      if (hasFollowUp) {
        delete msg.pendingQuestions; // Already answered
      }
    }
  }

  return { messages, totalLines };
}

export async function GET(req: NextRequest) {
  try {
    await requireOwnerWithDevice();

    const afterLine = parseInt(req.nextUrl.searchParams.get("after") || "0") || 0;
    const projectDir = req.nextUrl.searchParams.get("projectDir") || "";

    // Resolve the Claude project directory
    const claudeDir = (projectDir ? resolveClaudeDir(projectDir) : null) || DEFAULT_PROJECT_DIR;

    const sessionFile = findLatestSession(claudeDir);
    if (!sessionFile) {
      return NextResponse.json({
        messages: [],
        totalLines: 0,
        sessionFile: null,
        claudeDir: path.basename(claudeDir),
        error: "No active Claude session found"
      });
    }

    const { messages, totalLines } = parseJSONLFile(sessionFile, afterLine || undefined);

    // Load admin notes for THIS specific project
    const notesFile = getNotesFile(claudeDir);
    let adminNotes: { text: string; from: string; timestamp: string; viaBridge?: boolean }[] = [];
    try {
      if (fs.existsSync(notesFile)) {
        adminNotes = JSON.parse(fs.readFileSync(notesFile, "utf-8"));
      }
    } catch {}

    const noteMessages: ParsedMessage[] = adminNotes.map((note, i) => ({
      id: `admin-note-${i}`,
      role: "user" as const,
      content: note.text,
      timestamp: note.timestamp,
      isAdminNote: true,
      adminFrom: note.from,
      ...(note.viaBridge ? { viaBridge: true } : {}),
    }));

    const allMessages = [...messages, ...noteMessages].sort((a, b) => {
      const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tA - tB;
    });

    return NextResponse.json({
      messages: allMessages,
      totalLines,
      sessionFile: path.basename(sessionFile),
      claudeDir: path.basename(claudeDir),
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (error?.message === "Forbidden" || error?.message === "Device not allowed") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("Claude session error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST: Save admin note — per project
export async function POST(req: NextRequest) {
  try {
    const fullUser = await requireOwnerWithDevice();

    const { message, projectDir, viaBridge } = await req.json();
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }

    // Resolve the Claude project directory
    const claudeDir = (projectDir ? resolveClaudeDir(projectDir) : null) || DEFAULT_PROJECT_DIR;
    const notesFile = getNotesFile(claudeDir);
    const queueFile = getQueueFile(claudeDir);

    // Read existing notes for this project
    let notes: { text: string; from: string; timestamp: string; viaBridge?: boolean }[] = [];
    try {
      if (fs.existsSync(notesFile)) {
        notes = JSON.parse(fs.readFileSync(notesFile, "utf-8"));
      }
    } catch {}

    notes.push({
      text: message.trim(),
      from: fullUser.displayName || "Admin",
      timestamp: new Date().toISOString(),
      ...(viaBridge ? { viaBridge: true } : {}),
    });

    if (notes.length > 100) notes = notes.slice(-100);
    fs.writeFileSync(notesFile, JSON.stringify(notes, null, 2), "utf-8");

    // Write to message queue only when viaBridge — bridge poll loop picks this up and types it
    if (viaBridge) {
      let queue: { id: string; text: string; from: string; timestamp: string; processed?: boolean }[] = [];
      try {
        if (fs.existsSync(queueFile)) {
          queue = JSON.parse(fs.readFileSync(queueFile, "utf-8"));
        }
      } catch {}

      queue.push({
        id: randomUUID(),
        text: message.trim(),
        from: fullUser.displayName || "Admin",
        timestamp: new Date().toISOString(),
      });

      if (queue.length > 50) queue = queue.slice(-50);
      fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2), "utf-8");
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (error?.message === "Forbidden" || error?.message === "Device not allowed") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE: Clear admin notes for a project (session "Clear" button)
export async function DELETE(req: NextRequest) {
  try {
    await requireOwnerWithDevice();

    const projectDir = req.nextUrl.searchParams.get("projectDir") || "";
    const claudeDir = (projectDir ? resolveClaudeDir(projectDir) : null) || DEFAULT_PROJECT_DIR;
    const notesFile = getNotesFile(claudeDir);

    // Clear admin notes
    if (fs.existsSync(notesFile)) {
      fs.writeFileSync(notesFile, "[]", "utf-8");
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (error?.message === "Forbidden" || error?.message === "Device not allowed") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
