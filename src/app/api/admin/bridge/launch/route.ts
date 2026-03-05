import { NextRequest, NextResponse } from "next/server";
import { requireOwnerWithDevice } from "@/lib/auth";
import { exec, spawn } from "child_process";
import fs from "fs";
import path from "path";

const CLAUDE_EXE = "C:\\Users\\Richard\\.local\\bin\\claude.exe";
const DEFAULT_WORK_DIR = "C:\\Users\\Richard\\Desktop\\RallyLive.ca\\rally-live";

// Only allow paths under these roots
const ALLOWED_ROOTS = [
  "C:\\Users\\Richard\\Desktop",
  "C:\\Users\\Richard\\Documents",
  "C:\\Users\\Richard\\Projects",
];

function isValidWorkDir(dir: string): boolean {
  // Block shell metacharacters entirely
  if (/[;&|`$(){}[\]<>!^"'\r\n]/.test(dir)) return false;
  // Must look like an absolute Windows path
  if (!/^[A-Z]:\\[A-Za-z0-9 _\-.\\/]+$/.test(dir)) return false;
  // Normalize and check it's under an allowed root
  const normalized = path.resolve(dir);
  return ALLOWED_ROOTS.some((root) => normalized.toLowerCase().startsWith(root.toLowerCase()));
}

export async function POST(req: NextRequest) {
  try {
    await requireOwnerWithDevice();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { action, workDir, pid } = body;

  if (action === "launch") {
    const dir = workDir || DEFAULT_WORK_DIR;
    if (!isValidWorkDir(dir)) {
      return NextResponse.json({ ok: false, error: "Invalid working directory" }, { status: 400 });
    }
    if (!fs.existsSync(dir)) {
      return NextResponse.json({ ok: false, error: "Directory does not exist" }, { status: 400 });
    }
    if (!fs.existsSync(CLAUDE_EXE)) {
      return NextResponse.json({ ok: false, error: "Claude executable not found" }, { status: 500 });
    }
    try {
      // Launch in a visible terminal so bridge window discovery can target it.
      const child = spawn(
        "cmd.exe",
        ["/c", "start", "", "cmd.exe", "/k", `cd /d "${dir}" && "${CLAUDE_EXE}"`],
        { cwd: dir, detached: true, stdio: "ignore", windowsHide: true }
      );
      child.unref();
      return NextResponse.json({ ok: true, message: `Launching Claude in ${dir}` });
    } catch (err: any) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
    }
  }

  if (action === "kill" && pid) {
    const numericPid = parseInt(pid);
    if (isNaN(numericPid) || numericPid <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid PID" }, { status: 400 });
    }
    try {
      exec(`taskkill /PID ${numericPid} /T /F`);
      return NextResponse.json({ ok: true, message: `Killed process ${numericPid}` });
    } catch (err: any) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
