import { NextRequest, NextResponse } from "next/server";
import { requireOwnerWithDevice } from "@/lib/auth";
import { exec } from "child_process";
import path from "path";

const PROJECT_DIR = path.resolve(process.cwd());

// Persistent working directory across requests
let currentWorkingDir = PROJECT_DIR;

export async function POST(req: NextRequest) {
  try {
    await requireOwnerWithDevice();

    const { command, type } = await req.json();

    if (!command || typeof command !== "string") {
      return NextResponse.json({ error: "command is required" }, { status: 400 });
    }

    // Handle cd commands to persist directory changes
    const cdMatch = command.trim().match(/^cd\s+(.+)/);
    if (cdMatch) {
      const target = cdMatch[1].replace(/['"]/g, "");
      const resolved = path.resolve(currentWorkingDir, target);
      try {
        const fs = await import("fs");
        if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
          currentWorkingDir = resolved;
          return NextResponse.json({
            stdout: "",
            stderr: "",
            exitCode: 0,
            cwd: currentWorkingDir,
          });
        } else {
          return NextResponse.json({
            stdout: "",
            stderr: `cd: no such directory: ${target}`,
            exitCode: 1,
            cwd: currentWorkingDir,
          });
        }
      } catch {
        return NextResponse.json({
          stdout: "",
          stderr: `cd: error accessing ${target}`,
          exitCode: 1,
          cwd: currentWorkingDir,
        });
      }
    }

    // Execute the command
    const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
      const child = exec(command, {
        cwd: currentWorkingDir,
        timeout: 30000,
        maxBuffer: 1024 * 1024 * 5, // 5MB
        shell: "cmd.exe",
        env: { ...process.env, FORCE_COLOR: "0" },
      }, (error, stdout, stderr) => {
        resolve({
          stdout: stdout || "",
          stderr: stderr || "",
          exitCode: error?.code ?? 0,
        });
      });
    });

    return NextResponse.json({
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      cwd: currentWorkingDir,
    });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (error?.message === "Forbidden" || error?.message === "Device not allowed") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("Terminal error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET: Return current working directory
export async function GET() {
  try {
    await requireOwnerWithDevice();

    return NextResponse.json({ cwd: currentWorkingDir });
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
