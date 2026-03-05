/**
 * Claude Bridge v6 - Project Labels, Direct Console Injection, Better Screenshots
 *
 * Shows only Claude Code terminal windows with live screenshot thumbnails.
 * Web UI for selecting target window + WriteConsoleInput for keystroke injection.
 * Identifies each window by its project directory from the process command line.
 *
 * USAGE: node claude-bridge.js
 * Then open http://localhost:9876 in your browser
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const net = require("net");
const { execSync, execFileSync } = require("child_process");

// Load .env from the rally-live project root
const ENV_PATH = path.join(__dirname, "..", "..", ".env");
try {
  const envContent = fs.readFileSync(ENV_PATH, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
} catch {}

const QUEUE_FILE = path.join(
  process.env.USERPROFILE || "C:\\Users\\Richard",
  ".claude",
  "projects",
  "C--Users-Richard-Desktop-RallyLive-ca",
  "message-queue.json"
);

const FIVEM_QUEUE_FILE = path.join(
  process.env.USERPROFILE || "C:\\Users\\Richard",
  ".claude",
  "projects",
  "C--Users-Richard-Desktop-Five-M-server-txData-FiveMBasicServerCFXDefault-90B233-base",
  "message-queue.json"
);

const POLL_INTERVAL = 2000;
const PORT = 9876;
const BRIDGE_SECRET = process.env.BRIDGE_SECRET || "rally-bridge-secret-change-me";
const SCANNER_FILE = path.join(
  process.env.TEMP || "C:\\Users\\Richard\\AppData\\Local\\Temp",
  "claude-bridge-windows.json"
);
const SCANNER_SCRIPT = path.join(__dirname, "window-scanner.py");

// Auto-start Python scanner if not running (so bridge works standalone without watchdog)
let scannerChild = null;
function ensureScannerRunning() {
  // If scanner file is fresh (< 15s old), scanner is already running
  try {
    if (fs.existsSync(SCANNER_FILE)) {
      const stat = fs.statSync(SCANNER_FILE);
      if (Date.now() - stat.mtimeMs < 15000) return;
    }
  } catch {}
  // Don't spawn if already spawned and alive
  if (scannerChild && !scannerChild.killed) return;
  if (!fs.existsSync(SCANNER_SCRIPT)) return;
  try {
    const { spawn } = require("child_process");
    scannerChild = spawn("python", [SCANNER_SCRIPT], {
      cwd: __dirname,
      stdio: "ignore",
      windowsHide: true,
      detached: false,
    });
    scannerChild.on("exit", () => { scannerChild = null; });
    scannerChild.on("error", () => { scannerChild = null; });
    console.log(`  [Scanner] Auto-started window scanner (PID ${scannerChild.pid})`);
  } catch (err) {
    console.log(`  [Scanner] Failed to auto-start: ${err.message}`);
  }
}

let lastProcessedTimestamp = new Date().toISOString();
const processedIds = new Set();
let fivemLastProcessedTimestamp = new Date().toISOString();
const fivemProcessedIds = new Set();
let TARGET_HWND = null;
let TARGET_PID = null;
let TARGET_TITLE = null;
let TARGET_LABEL = null;
let TARGET_PROJECT_DIR = null;
let messageLog = [];
let debugLog = []; // Detailed debug log for send operations
let status = "waiting"; // waiting | active | error
let statusReason = "No target selected";
let statusUpdatedAt = new Date().toISOString();

// Monitor targets: additional windows to watch (view-only, no message sending)
let monitorTargets = []; // Array of { hwnd, pid, title, label, projectDir }
let monitorBuffers = {}; // { hwnd: { text: "current visible text", prevText: "previous" } }

function setBridgeStatus(nextStatus, reason) {
  status = nextStatus;
  statusReason = reason || statusReason;
  statusUpdatedAt = new Date().toISOString();
}

// Set our own window title
process.title = "CLAUDE_BRIDGE";
try { process.stdout.write("\x1b]0;CLAUDE_BRIDGE\x07"); } catch {}

// ─── Queue helpers ─────────────────────────────────────────────────

function readQueue() {
  try {
    if (!fs.existsSync(QUEUE_FILE)) return [];
    return JSON.parse(fs.readFileSync(QUEUE_FILE, "utf-8")) || [];
  } catch { return []; }
}

function markProcessed(timestamp) {
  try {
    const queue = readQueue();
    const updated = queue.map((msg) =>
      msg.timestamp === timestamp ? { ...msg, processed: true } : msg
    );
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(updated, null, 2), "utf-8");
  } catch (e) {
    console.error(`[markProcessed] Failed for ${timestamp}: ${e.message}`);
  }
}

function readFivemQueue() {
  try {
    if (!fs.existsSync(FIVEM_QUEUE_FILE)) return [];
    return JSON.parse(fs.readFileSync(FIVEM_QUEUE_FILE, "utf-8")) || [];
  } catch { return []; }
}

function markFivemProcessed(timestamp) {
  try {
    const queue = readFivemQueue();
    const updated = queue.map((msg) =>
      msg.timestamp === timestamp ? { ...msg, processed: true } : msg
    );
    fs.writeFileSync(FIVEM_QUEUE_FILE, JSON.stringify(updated, null, 2), "utf-8");
  } catch (e) {
    console.error(`[markFivemProcessed] Failed for ${timestamp}: ${e.message}`);
  }
}

// ─── FiveM Bug Response Parser ────────────────────────────────────
// Parses [FIVEM-BUG-RESPONSE:{id}] prefix from Claude responses in monitor buffers
// and POSTs parsed content back to the FiveM admin API

const FIVEM_APP_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";
const FIVEM_SERVER_SLUG = "hkc"; // Default FiveM server slug

function parseFivemBugResponse(text) {
  // Look for [FIVEM-BUG-RESPONSE:{id}] prefix
  const match = text.match(/\[FIVEM-BUG-RESPONSE:([^\]]+)\]/);
  if (!match) return null;

  const bugId = match[1];
  const afterPrefix = text.substring(match.index + match[0].length).trim();

  // Determine response type
  if (/DIAGNOSIS:/i.test(afterPrefix)) {
    return { bugId, type: "diagnosis", content: afterPrefix };
  }
  if (/CANT_FIND:/i.test(afterPrefix)) {
    return { bugId, type: "diagnosis", content: afterPrefix };
  }
  if (/FIX_APPLIED:/i.test(afterPrefix)) {
    return { bugId, type: "fix", content: afterPrefix };
  }
  if (/FIX_FAILED:/i.test(afterPrefix)) {
    return { bugId, type: "fix", content: afterPrefix };
  }
  if (/VERIFIED:/i.test(afterPrefix)) {
    return { bugId, type: "verification", content: afterPrefix };
  }
  if (/VERIFY_FAILED:/i.test(afterPrefix)) {
    return { bugId, type: "verification", content: afterPrefix };
  }

  return null;
}

const fivemPostedResponses = new Set();

async function postFivemBugResponse(parsed) {
  const key = `${parsed.bugId}-${parsed.type}-${parsed.content.substring(0, 50)}`;
  if (fivemPostedResponses.has(key)) return;
  fivemPostedResponses.add(key);
  // Cap dedup set
  if (fivemPostedResponses.size > 200) {
    const arr = [...fivemPostedResponses];
    arr.splice(0, arr.length - 100);
    fivemPostedResponses.clear();
    for (const k of arr) fivemPostedResponses.add(k);
  }

  const url = `${FIVEM_APP_URL}/api/fivem/servers/${FIVEM_SERVER_SLUG}/bugs/${parsed.bugId}/claude-response`;
  console.log(`  [FiveM] Posting ${parsed.type} response for bug ${parsed.bugId}`);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: parsed.type, content: parsed.content }),
    });
    const data = await res.json();
    if (res.ok) {
      console.log(`  [FiveM] Posted OK — status: ${data.status}`);
    } else {
      console.error(`  [FiveM] Post failed: ${data.error}`);
    }
  } catch (e) {
    console.error(`  [FiveM] Post error: ${e.message}`);
  }
}

// ─── PowerShell helper ─────────────────────────────────────────────

let psFileCounter = 0;
function runPsFile(scriptContent) {
  const id = `${process.pid}-${++psFileCounter}`;
  const tmpFile = path.join(
    process.env.TEMP || "C:\\Users\\Richard\\AppData\\Local\\Temp",
    `claude-bridge-${id}.ps1`
  );
  fs.writeFileSync(tmpFile, scriptContent, "utf-8");
  try {
    // Use execFileSync to call powershell.exe directly (avoids cmd.exe EPERM)
    const result = execFileSync(
      "powershell.exe",
      ["-STA", "-ExecutionPolicy", "Bypass", "-File", tmpFile],
      { encoding: "utf-8", timeout: 60000, windowsHide: true }
    ).trim();
    try { fs.unlinkSync(tmpFile); } catch {}
    return result;
  } catch (err) {
    try { fs.unlinkSync(tmpFile); } catch {}
    const stderr = err.stderr ? err.stderr.toString().substring(0, 300) : "";
    const stdout = err.stdout ? err.stdout.toString().substring(0, 300) : "";
    return `ERROR: ${(err.message || "").substring(0, 200)} STDERR: ${stderr} STDOUT: ${stdout}`;
  }
}

// ─── Window listing with process tree + command line ───────────────

function listWindows() {
  const hasWindowRows = (text) => {
    if (!text) return false;
    const rows = text.split("\n").map((r) => r.trim()).filter(Boolean);
    return rows.some((row) => row.split("|").length >= 4);
  };

  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;
using System.Diagnostics;
public class WinList {
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    public static List<string> GetAll() {
        var result = new List<string>();
        EnumWindows(delegate(IntPtr hwnd, IntPtr lparam) {
            if (IsWindowVisible(hwnd) && GetWindowTextLength(hwnd) > 0) {
                var sb = new StringBuilder(512);
                GetWindowText(hwnd, sb, 512);
                uint pid = 0;
                GetWindowThreadProcessId(hwnd, out pid);
                string procName = "";
                try { procName = Process.GetProcessById((int)pid).ProcessName; } catch {}
                result.Add(hwnd.ToInt64() + "|" + pid + "|" + procName + "|" + sb.ToString());
            }
            return true;
        }, IntPtr.Zero);
        return result;
    }
}
"@
[WinList]::GetAll() | ForEach-Object { Write-Host $_ }
`;
  const primary = runPsFile(script);
  if (primary && !primary.startsWith("ERROR:") && hasWindowRows(primary)) {
    return primary;
  }

  // Fallback: use MainWindowHandle/MainWindowTitle from processes.
  // This is less precise but more resilient on locked-down systems.
  const fallback = `
Get-Process -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } |
  ForEach-Object {
    Write-Host ($_.MainWindowHandle.ToString() + "|" + $_.Id + "|" + $_.ProcessName + "|" + $_.MainWindowTitle)
  }
`;
  return runPsFile(fallback);
}

function getChildProcessInfo(parentPid) {
  // Walk process tree via WMI to find node/claude child and extract command line
  const script = `
$targetPid = ${parentPid}
$visited = @{}
$queue = @($targetPid)
$bestCmd = ""
$bestPid = $targetPid

while ($queue.Count -gt 0) {
    $currentPid = $queue[0]
    $queue = @($queue | Select-Object -Skip 1)
    if ($visited.ContainsKey($currentPid)) { continue }
    $visited[$currentPid] = $true

    $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $currentPid" -ErrorAction SilentlyContinue
    foreach ($child in $children) {
        $queue += $child.ProcessId
        $name = $child.Name.ToLower()
        $cmd = $child.CommandLine
        if ($name -match 'node|claude|cmd|powershell|pwsh|bash|wsl|conhost') {
            if ($cmd -and $cmd.Length -gt $bestCmd.Length) {
                $bestCmd = $cmd
                $bestPid = $child.ProcessId
            }
        }
    }
}

# Also check the target process itself
try {
    $self = Get-CimInstance Win32_Process -Filter "ProcessId = $targetPid" -ErrorAction SilentlyContinue
    if ($self -and $self.CommandLine -and $self.CommandLine.Length -gt $bestCmd.Length) {
        $bestCmd = $self.CommandLine
        $bestPid = $self.ProcessId
    }
} catch {}

Write-Host "$bestPid|||$bestCmd"
`;
  try {
    const result = runPsFile(script);
    const sepIdx = result.indexOf("|||");
    if (sepIdx === -1) return { childPid: parentPid, commandLine: "" };
    const childPid = result.substring(0, sepIdx).trim();
    const commandLine = result.substring(sepIdx + 3).trim();

    // Try to get CWD from shell-snapshot cd paths or child process tree
    if (commandLine.toLowerCase().includes("claude") || commandLine.toLowerCase().includes("codex")) {
      try {
        const cwdScript = `
# Strategy 1: Shell snapshot cd path from child/self command line
foreach ($pid in @(${childPid}, ${parentPid})) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $pid" -ErrorAction SilentlyContinue
    if ($proc -and $proc.CommandLine) {
        $snapshotMatch = [regex]::Match($proc.CommandLine, 'snapshot-bash-\\d+-\\w+\\.sh')
        if ($snapshotMatch.Success) {
            $snapDir = Join-Path $env:USERPROFILE '.claude' 'shell-snapshots'
            $snapFile = Join-Path $snapDir $snapshotMatch.Value
            if (Test-Path $snapFile) {
                $content = Get-Content $snapFile -Raw
                $cdMatch = [regex]::Match($content, "cd '([^']+)'")
                if ($cdMatch.Success) { Write-Host $cdMatch.Groups[1].Value; exit }
                $cdMatch2 = [regex]::Match($content, 'cd "([^"]+)"')
                if ($cdMatch2.Success) { Write-Host $cdMatch2.Groups[1].Value; exit }
            }
        }
    }
}
# Strategy 2: Walk child process tree looking for shell-snapshots in any descendant
$visited = @{}
$q = @(${parentPid})
while ($q.Count -gt 0) {
    $cur = $q[0]; $q = @($q | Select-Object -Skip 1)
    if ($visited.ContainsKey($cur)) { continue }; $visited[$cur] = $true
    $kids = Get-CimInstance Win32_Process -Filter "ParentProcessId = $cur" -ErrorAction SilentlyContinue
    foreach ($k in $kids) {
        if ($k.CommandLine -and $k.CommandLine -match 'snapshot-bash') {
            $sm = [regex]::Match($k.CommandLine, 'snapshot-bash-\\d+-\\w+\\.sh')
            if ($sm.Success) {
                $sf = Join-Path (Join-Path $env:USERPROFILE '.claude') ('shell-snapshots\\' + $sm.Value)
                if (Test-Path $sf) {
                    $c = Get-Content $sf -Raw
                    $m1 = [regex]::Match($c, "cd '([^']+)'")
                    if ($m1.Success) { Write-Host $m1.Groups[1].Value; exit }
                    $m2 = [regex]::Match($c, 'cd "([^"]+)"')
                    if ($m2.Success) { Write-Host $m2.Groups[1].Value; exit }
                }
            }
        }
        $q += $k.ProcessId
    }
}
Write-Host ""
`;
        const cwd = runPsFile(cwdScript).trim();
        if (cwd) {
          return { childPid: childPid || parentPid, commandLine: commandLine || "", cwd };
        }
      } catch {}
    }

    return { childPid: childPid || parentPid, commandLine: commandLine || "" };
  } catch {
    return { childPid: parentPid, commandLine: "" };
  }
}

function extractProjectDir(commandLine) {
  if (!commandLine) return null;

  // Priority 1: Look for 'cd "C:\path\to\project"' or "cd 'path'" patterns
  // These appear in shell eval commands and indicate the actual working directory
  const cdMatch = commandLine.match(/cd\s+(?:\\"|"|')([A-Z]:\\[^"']+?)(?:\\"|"|')/i) ||
                  commandLine.match(/cd\s+(?:\\"|"|')([A-Z]:[^"']+?)(?:\\"|"|')/i);
  if (cdMatch) {
    return cdMatch[1].replace(/\\\\/g, "\\");
  }

  // Priority 2: Look for --project or --cwd style flags
  const flagMatch = commandLine.match(/(?:--project-dir|--project|--cwd)\s+["']?([A-Z]:\\[^\s"']+)/i);
  if (flagMatch) {
    return flagMatch[1];
  }

  // Priority 3: Try to find path-like arguments, filtering out executables and temp paths
  const winPathMatch = commandLine.match(/([A-Z]:\\[^\s"']+\\[^\s"']*)/gi) || [];

  const filtered = winPathMatch.filter(p => {
    const lower = p.toLowerCase();
    return !lower.includes("\\node_modules\\") &&
           !lower.includes("\\appdata\\") &&
           !lower.includes("\\temp\\") &&
           !lower.includes("\\tmp\\") &&
           !lower.includes("program files") &&
           !lower.includes("\\npm\\") &&
           !lower.includes(".exe") &&
           !lower.includes("\\node\\") &&
           !lower.includes("\\git\\") &&
           !lower.includes("\\.claude\\") &&
           !lower.includes("\\cloudflared\\") &&
           !lower.includes("\\.cloudflared\\") &&
           !lower.endsWith(".js") &&
           !lower.endsWith(".sh") &&
           !lower.endsWith(".cmd") &&
           !lower.endsWith(".yml") &&
           !lower.endsWith(".yaml") &&
           !lower.endsWith(".exe") &&
           !lower.endsWith("\\");
  });

  if (filtered.length > 0) {
    filtered.sort((a, b) => b.length - a.length);
    return filtered[0];
  }

  return null;
}

// Try reading window list from Python scanner file (preferred — avoids EPERM on child_process)
function getWindowListFromScanner() {
  try {
    if (!fs.existsSync(SCANNER_FILE)) return null;
    const stat = fs.statSync(SCANNER_FILE);
    // Ignore stale data older than 30 seconds
    if (Date.now() - stat.mtimeMs > 30000) return null;
    const data = JSON.parse(fs.readFileSync(SCANNER_FILE, "utf-8"));
    if (!data.windows || !Array.isArray(data.windows)) return null;
    return data.windows;
  } catch { return null; }
}

function getWindowList() {
  // Ensure scanner is running (auto-start if stale/missing)
  ensureScannerRunning();
  // Strategy 1: Read from Python scanner file (works even in sandboxed environments)
  const scannerWindows = getWindowListFromScanner();
  if (scannerWindows && scannerWindows.length > 0) {
    // Filter to terminal/Claude windows only, same as original logic
    const result = [];
    const nonBridgeCandidates = [];
    for (const w of scannerWindows) {
      const lower = (w.title || "").toLowerCase();
      const isBridge = lower.includes("claude_bridge") || lower.includes("claude-bridge") || lower.includes("claude bridge");
      if (isBridge) continue;
      nonBridgeCandidates.push(w);
      if (w.isTerminal) {
        result.push(w);
      }
    }
    if (result.length > 0) return result;
    return nonBridgeCandidates.slice(0, 40);
  }

  // Strategy 2: Original PowerShell-based window listing (fallback)
  const raw = listWindows();
  const allWindows = raw.split("\n").filter(w => w.trim());
  const result = [];
  const nonBridgeCandidates = [];

  for (const w of allWindows) {
    const parts = w.split("|");
    const hwnd = parts[0]?.trim();
    const windowPid = parts[1]?.trim();
    const procName = parts[2]?.trim().toLowerCase() || "";
    const title = parts.slice(3).join("|").trim();
    if (!title) continue;

    const lower = title.toLowerCase();
    const isBridge = lower.includes("claude_bridge") || lower.includes("claude-bridge") || lower.includes("claude bridge");
    if (isBridge) continue;
    nonBridgeCandidates.push({
      hwnd,
      pid: windowPid,
      windowPid,
      title,
      procName,
      label: title,
      projectDir: "",
      commandLine: "",
      isCodex: false,
    });

    const isTerminal = lower.includes("claude") ||
      lower.includes("codex") ||
      procName === "claude" ||
      procName === "claude.exe" ||
      procName === "claude-code" ||
      procName === "codex" ||
      procName === "codex.exe" ||
      procName === "cmd" ||
      procName === "cmd.exe" ||
      procName === "conhost" ||
      procName === "conhost.exe" ||
      procName === "powershell" ||
      procName === "powershell.exe" ||
      procName === "pwsh" ||
      procName === "pwsh.exe" ||
      procName === "windowsterminal" ||
      procName === "windowsterminal.exe" ||
      procName === "notepad" ||
      lower.includes("notepad") ||
      lower.includes("command prompt") ||
      lower.includes("cmd.exe") ||
      lower.includes("powershell") ||
      lower.includes("windows terminal") ||
      lower.includes("administrator:");

    if (!isTerminal) continue;

    // Get child process info for project directory identification
    const childInfo = getChildProcessInfo(windowPid);
    const childPid = childInfo.childPid;
    const commandLine = childInfo.commandLine;
    const projectDir = extractProjectDir(commandLine) || childInfo.cwd || null;

    // Build a label: prefer project dir, fall back to title
    let label = title;
    const isCodex = (commandLine || "").toLowerCase().includes("codex");
    if (isCodex) {
      label = "Codex";
    } else if (projectDir) {
      // Show just the last 2-3 path segments for readability
      const segments = projectDir.replace(/\//g, "\\").split("\\").filter(Boolean);
      label = segments.slice(-2).join("\\");
    }

    result.push({
      hwnd,
      pid: childPid || windowPid,
      windowPid,
      title,
      procName,
      label,
      projectDir: projectDir || "",
      commandLine: commandLine || "",
      isCodex,
    });
  }

  // If strict terminal matching produced nothing, show visible non-bridge windows
  // so the operator can still select and test targets.
  if (result.length === 0) {
    return nonBridgeCandidates.slice(0, 40);
  }

  return result;
}

// ─── Window thumbnail capture with BitBlt fallback ─────────────────

function captureAllThumbnails(hwndList) {
  if (!hwndList || hwndList.length === 0) return {};

  const hwndArray = hwndList.map(h => `[IntPtr]::new(${h})`).join(",");

  const script = `
Add-Type -AssemblyName System.Drawing

Add-Type -ReferencedAssemblies @("System.Drawing") @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.IO;

public class WinCapture {
    [DllImport("user32.dll")]
    public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")]
    public static extern bool IsWindow(IntPtr hWnd);
    [DllImport("dwmapi.dll")]
    public static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out RECT pvAttribute, int cbAttribute);
    [DllImport("user32.dll")]
    public static extern IntPtr GetDC(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);
    [DllImport("gdi32.dll")]
    public static extern IntPtr CreateCompatibleDC(IntPtr hdc);
    [DllImport("gdi32.dll")]
    public static extern IntPtr CreateCompatibleBitmap(IntPtr hdc, int nWidth, int nHeight);
    [DllImport("gdi32.dll")]
    public static extern IntPtr SelectObject(IntPtr hdc, IntPtr hgdiobj);
    [DllImport("gdi32.dll")]
    public static extern bool BitBlt(IntPtr hdcDest, int xDest, int yDest, int wDest, int hDest,
        IntPtr hdcSrc, int xSrc, int ySrc, uint rop);
    [DllImport("gdi32.dll")]
    public static extern bool DeleteDC(IntPtr hdc);
    [DllImport("gdi32.dll")]
    public static extern bool DeleteObject(IntPtr hObject);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left, Top, Right, Bottom;
    }

    const uint SRCCOPY = 0x00CC0020;

    static bool IsAllBlack(Bitmap bmp) {
        int w = bmp.Width;
        int h = bmp.Height;
        int threshold = 10;
        int darkCount = 0;
        int[][] points = new int[][] {
            new int[]{w/4, h/4}, new int[]{w/2, h/4}, new int[]{3*w/4, h/4},
            new int[]{w/4, h/2}, new int[]{w/2, h/2}, new int[]{3*w/4, h/2},
            new int[]{w/4, 3*h/4}, new int[]{w/2, 3*h/4}, new int[]{3*w/4, 3*h/4}
        };
        foreach (var pt in points) {
            int px = Math.Min(pt[0], w - 1);
            int py = Math.Min(pt[1], h - 1);
            Color c = bmp.GetPixel(px, py);
            if (c.R < threshold && c.G < threshold && c.B < threshold) darkCount++;
        }
        return darkCount >= 8;
    }

    static Bitmap CaptureDesktopRegion(RECT rect) {
        int width = rect.Right - rect.Left;
        int height = rect.Bottom - rect.Top;
        if (width <= 0 || height <= 0) return null;

        IntPtr screenDC = GetDC(IntPtr.Zero);
        IntPtr memDC = CreateCompatibleDC(screenDC);
        IntPtr hBitmap = CreateCompatibleBitmap(screenDC, width, height);
        IntPtr oldBmp = SelectObject(memDC, hBitmap);

        BitBlt(memDC, 0, 0, width, height, screenDC, rect.Left, rect.Top, SRCCOPY);

        SelectObject(memDC, oldBmp);
        Bitmap bmp = Image.FromHbitmap(hBitmap);
        DeleteObject(hBitmap);
        DeleteDC(memDC);
        ReleaseDC(IntPtr.Zero, screenDC);

        return bmp;
    }

    public static string Capture(IntPtr hwnd) {
        if (!IsWindow(hwnd)) return "";

        RECT rect;
        int hr = DwmGetWindowAttribute(hwnd, 9, out rect, Marshal.SizeOf(typeof(RECT)));
        if (hr != 0) {
            GetWindowRect(hwnd, out rect);
        }

        int width = rect.Right - rect.Left;
        int height = rect.Bottom - rect.Top;
        if (width <= 0 || height <= 0) return "";
        if (width > 4000) width = 4000;
        if (height > 3000) height = 3000;

        Bitmap fullBmp = null;

        // Try PrintWindow first
        using (var bmp = new Bitmap(width, height, PixelFormat.Format24bppRgb)) {
            using (var g = Graphics.FromImage(bmp)) {
                IntPtr hdc = g.GetHdc();
                PrintWindow(hwnd, hdc, 2);
                g.ReleaseHdc(hdc);
            }

            if (IsAllBlack(bmp)) {
                // Fallback: capture from desktop DC (works for GPU-rendered windows)
                fullBmp = CaptureDesktopRegion(rect);
            } else {
                fullBmp = (Bitmap)bmp.Clone();
            }
        }

        if (fullBmp == null) return "";

        try {
            // Resize to thumbnail (400px wide for better readability)
            int thumbW = 400;
            int thumbH = (int)((double)fullBmp.Height / fullBmp.Width * thumbW);
            if (thumbH > 280) {
                thumbH = 280;
                thumbW = (int)((double)fullBmp.Width / fullBmp.Height * thumbH);
            }

            using (var thumb = new Bitmap(thumbW, thumbH, PixelFormat.Format24bppRgb)) {
                using (var g2 = Graphics.FromImage(thumb)) {
                    g2.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                    g2.DrawImage(fullBmp, 0, 0, thumbW, thumbH);
                }
                using (var ms = new MemoryStream()) {
                    thumb.Save(ms, ImageFormat.Png);
                    return Convert.ToBase64String(ms.ToArray());
                }
            }
        } finally {
            fullBmp.Dispose();
        }
    }
}
"@

$hwnds = @(${hwndArray})
foreach ($hwnd in $hwnds) {
    $result = [WinCapture]::Capture($hwnd)
    if ($result -ne "") {
        Write-Host ($hwnd.ToInt64().ToString() + "|||" + $result)
    } else {
        Write-Host ($hwnd.ToInt64().ToString() + "|||CAPTURE_FAILED")
    }
}
`;
  const rawResult = runPsFile(script);
  const thumbnails = {};

  for (const line of rawResult.split("\n")) {
    const sepIdx = line.indexOf("|||");
    if (sepIdx === -1) continue;
    const hwnd = line.substring(0, sepIdx).trim();
    const data = line.substring(sepIdx + 3).trim();
    if (data && data !== "CAPTURE_FAILED" && !data.includes("ERROR") && data.length > 50) {
      thumbnails[hwnd] = data;
    }
  }

  return thumbnails;
}

function captureWindowThumbnail(hwnd) {
  const result = captureAllThumbnails([hwnd]);
  return result[hwnd] || null;
}

// ─── Send to window: two-step (SendKeys for text, WriteConsoleInput for Enter) ──

function sendToWindow(hwnd, text) {
  // Flatten to single line
  const cleanText = text.replace(/\r?\n/g, " ").trim();
  const base64Text = Buffer.from(cleanText, "utf16le").toString("base64");
  const windowPid = TARGET_PID || "0";

  // STEP 1: Type text via WScript.Shell SendKeys (confirmed working)
  const textScript = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinFocus {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool c);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
    public static bool Focus(IntPtr hwnd) {
        if (!IsWindow(hwnd)) return false;
        IntPtr cur = GetForegroundWindow();
        uint me = GetCurrentThreadId(); uint p1, p2;
        uint fg = GetWindowThreadProcessId(cur, out p1);
        uint tg = GetWindowThreadProcessId(hwnd, out p2);
        if (me != fg) AttachThreadInput(me, fg, true);
        if (me != tg) AttachThreadInput(me, tg, true);
        ShowWindow(hwnd, 9);
        bool ok = SetForegroundWindow(hwnd);
        if (me != fg) AttachThreadInput(me, fg, false);
        if (me != tg) AttachThreadInput(me, tg, false);
        return ok;
    }
}
"@

$hwnd = [IntPtr]::new(${hwnd})
if (-not [WinFocus]::IsWindow($hwnd)) { Write-Host "DEAD_WINDOW"; exit }

$text = [System.Text.Encoding]::Unicode.GetString([Convert]::FromBase64String("${base64Text}"))

[WinFocus]::Focus($hwnd)
Start-Sleep -Milliseconds 400
$cur = [WinFocus]::GetForegroundWindow()
if ($cur -ne $hwnd) { [WinFocus]::Focus($hwnd); Start-Sleep -Milliseconds 500 }
$focusOk = ([WinFocus]::GetForegroundWindow() -eq $hwnd)

if (-not $focusOk) { Write-Host "FOCUS_FAILED"; exit }

$wshell = New-Object -ComObject WScript.Shell
$escaped = $text -replace '([+^%~{}\\[\\]()])','{\$1}'
$wshell.SendKeys($escaped)
Start-Sleep -Milliseconds 300
$wshell.SendKeys("{ENTER}")
Start-Sleep -Milliseconds 100

Write-Host "TEXT_SENT|FOCUS:$focusOk|ENTER:INLINE"
`;

  const textResult = runPsFile(textScript);
  console.log(`  [Step1-Text] ${textResult.substring(0, 150)}`);

  if (textResult.includes("DEAD_WINDOW")) return "DEAD";
  if (textResult.includes("FOCUS_FAILED")) return "FOCUS_FAILED";

  let enterSentInline = textResult.includes("ENTER:INLINE");

  if (!textResult.includes("TEXT_SENT")) {
    console.log(`  [Step1] Text entry failed, trying clipboard fallback...`);
    // Clipboard fallback: re-focus window, set clipboard, paste, then Enter
    const clipScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System; using System.Runtime.InteropServices;
public class FocusHelper {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
[FocusHelper]::SetForegroundWindow([IntPtr]::new(${hwnd})) | Out-Null
Start-Sleep -Milliseconds 200
$text = [System.Text.Encoding]::Unicode.GetString([Convert]::FromBase64String("${base64Text}"))
[System.Windows.Forms.Clipboard]::SetText($text)
Start-Sleep -Milliseconds 100
$wshell = New-Object -ComObject WScript.Shell
$wshell.SendKeys("^v")
Start-Sleep -Milliseconds 300
$wshell.SendKeys("{ENTER}")
Start-Sleep -Milliseconds 100
Write-Host "CLIP_SENT|ENTER:INLINE"
`;
    const clipResult = runPsFile(clipScript);
    console.log(`  [Step1-Clip] ${clipResult.substring(0, 150)}`);
    if (clipResult.includes("ENTER:INLINE")) enterSentInline = true;
  }

  // STEP 2: Press Enter via WriteConsoleInput (direct console injection)
  // Skip if inline Enter already sent in Step 1 (text or clipboard path)
  if (enterSentInline) {
    console.log(`  [Step2] Skipped — Enter already sent inline with text`);
    const debugEntry = {
      time: new Date().toLocaleTimeString(),
      hwnd,
      textLen: cleanText.length,
      textPreview: cleanText.substring(0, 60),
      rawResult: `text:${textResult.substring(0,100)}|enter:INLINE`,
      parsed: { textStep: textResult.substring(0,80), enterStep: "INLINE" },
      status: "OK",
    };
    debugLog.push(debugEntry);
    if (debugLog.length > 50) debugLog.shift();
    return "OK";
  }

  const enterScript = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class EnterKey {
    [DllImport("kernel32.dll", SetLastError=true)] public static extern bool FreeConsole();
    [DllImport("kernel32.dll", SetLastError=true)] public static extern bool AttachConsole(uint pid);
    [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr GetStdHandle(int h);
    [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
    public static extern bool WriteConsoleInput(IntPtr hIn, INPUT_RECORD[] buf, uint len, out uint written);
    [DllImport("kernel32.dll", SetLastError=true)] public static extern bool AllocConsole();

    [StructLayout(LayoutKind.Explicit, CharSet=CharSet.Unicode)]
    public struct KEY_EVENT_RECORD {
        [FieldOffset(0)] public int bKeyDown;
        [FieldOffset(4)] public ushort wRepeatCount;
        [FieldOffset(6)] public ushort wVirtualKeyCode;
        [FieldOffset(8)] public ushort wVirtualScanCode;
        [FieldOffset(10)] public char UnicodeChar;
        [FieldOffset(12)] public uint dwControlKeyState;
    }
    [StructLayout(LayoutKind.Explicit)]
    public struct INPUT_RECORD {
        [FieldOffset(0)] public ushort EventType;
        [FieldOffset(4)] public KEY_EVENT_RECORD KeyEvent;
    }

    public static string PressEnter(uint pid) {
        FreeConsole();
        if (!AttachConsole(pid)) {
            int e = Marshal.GetLastWin32Error();
            AllocConsole();
            return "ATTACH_FAIL:" + e;
        }
        IntPtr h = GetStdHandle(-10);
        if (h == IntPtr.Zero || h == (IntPtr)(-1)) {
            FreeConsole(); AllocConsole();
            return "HANDLE_FAIL";
        }
        INPUT_RECORD[] recs = new INPUT_RECORD[2];
        recs[0].EventType = 1;
        recs[0].KeyEvent.bKeyDown = 1;
        recs[0].KeyEvent.wRepeatCount = 1;
        recs[0].KeyEvent.wVirtualKeyCode = 0x0D;
        recs[0].KeyEvent.wVirtualScanCode = 0x1C;
        recs[0].KeyEvent.UnicodeChar = (char)13;
        recs[1].EventType = 1;
        recs[1].KeyEvent.bKeyDown = 0;
        recs[1].KeyEvent.wRepeatCount = 1;
        recs[1].KeyEvent.wVirtualKeyCode = 0x0D;
        recs[1].KeyEvent.wVirtualScanCode = 0x1C;
        recs[1].KeyEvent.UnicodeChar = (char)13;
        uint written;
        bool ok = WriteConsoleInput(h, recs, 2, out written);
        int err = Marshal.GetLastWin32Error();
        FreeConsole();
        AllocConsole();
        return ok ? "ENTER_OK:" + written : "WRITE_FAIL:" + err;
    }
}
"@

$result = [EnterKey]::PressEnter(${windowPid})
Write-Host $result
`;

  const enterResult = runPsFile(enterScript);
  console.log(`  [Step2-Enter] ${enterResult.substring(0, 150)}`);

  // If WriteConsoleInput failed, try WScript.Shell Enter as last resort
  if (!enterResult.includes("ENTER_OK")) {
    console.log(`  [Step2] WriteConsoleInput failed, trying WScript Enter...`);
    const wscriptEnter = `
$wshell = New-Object -ComObject WScript.Shell
$wshell.SendKeys("{ENTER}")
Write-Host "WSCRIPT_ENTER"
`;
    const wResult = runPsFile(wscriptEnter);
    console.log(`  [Step2-WScript] ${wResult.substring(0, 100)}`);
  }

  const sent = textResult.includes("TEXT_SENT") || textResult.includes("CLIP_SENT");

  const debugEntry = {
    time: new Date().toLocaleTimeString(),
    hwnd,
    textLen: cleanText.length,
    textPreview: cleanText.substring(0, 60),
    rawResult: `text:${textResult.substring(0,100)}|enter:${enterResult.substring(0,100)}`,
    parsed: { textStep: textResult.substring(0,80), enterStep: enterResult.substring(0,80) },
    status: sent ? "OK" : "ERROR",
  };
  debugLog.push(debugEntry);
  if (debugLog.length > 50) debugLog.shift();

  return sent ? "OK" : "SEND_FAILED";
}

// ─── UI Automation text reader (works with ConPTY / modern terminals) ──

function isUiaError(text) {
  return !text || text.includes("NO_DOCUMENT") || text.includes("UIA_ERROR") || text.includes("ERROR:");
}

/**
 * Take a snapshot of the target window text and pre-populate seen Q&A pairs.
 * Used when selecting a target or clearing output to baseline the current state.
 */
function snapshotTargetState(hwnd, pid) {
  let snapshot = readWindowTextUIA(hwnd);
  if (isUiaError(snapshot)) {
    snapshot = readConsoleBuffer(pid || "0");
  }
  lastTargetText = snapshot || "";
  lastSeenQAPairs = new Set();
  const existingPairs = parseCodexQA(lastTargetText);
  for (const p of existingPairs) {
    lastSeenQAPairs.add(`${p.prompt}::${p.response.substring(0, 100)}`);
  }
  return { textLength: lastTargetText.length, pairCount: lastSeenQAPairs.size };
}

function readWindowTextUIA(hwnd) {
  const script = `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
try {
    $element = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]::new(${hwnd}))
    $docCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Document)
    $doc = $element.FindFirst([System.Windows.Automation.TreeScope]::Subtree, $docCond)
    if ($doc) {
        $tp = $doc.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
        # Get visible range first (most recent content)
        $visible = $tp.GetVisibleRanges()
        $visText = ""
        if ($visible -and $visible.Length -gt 0) {
            foreach ($vr in $visible) { $visText += $vr.GetText(20000) }
        }
        if ($visText.Length -gt 50) {
            Write-Host $visText
        } else {
            # Fallback: read full document but get the LAST 20000 chars
            $range = $tp.DocumentRange
            $text = $range.GetText(-1)
            if ($text.Length -gt 20000) { $text = $text.Substring($text.Length - 20000) }
            Write-Host $text
        }
    } else {
        Write-Host "NO_DOCUMENT"
    }
} catch {
    Write-Host "UIA_ERROR: $_"
}
`;
  try {
    return runPsFile(script);
  } catch (e) {
    return "ERROR: " + (e.message || "").substring(0, 200);
  }
}

// ─── Target window output tracking (for codex/external tools) ─────

const RESPONSES_FILE = path.join(
  process.env.USERPROFILE || "C:\\Users\\Richard",
  ".claude", "projects", "C--Users-Richard-Desktop-RallyLive-ca",
  "codex-responses.json"
);

let lastTargetText = "";
let targetOutputMessages = [];

// Load existing responses
try {
  if (fs.existsSync(RESPONSES_FILE)) {
    targetOutputMessages = JSON.parse(fs.readFileSync(RESPONSES_FILE, "utf-8"));
  }
} catch {}

function saveResponses() {
  try {
    if (targetOutputMessages.length > 200) targetOutputMessages = targetOutputMessages.slice(-200);
    fs.writeFileSync(RESPONSES_FILE, JSON.stringify(targetOutputMessages, null, 2), "utf-8");
  } catch {}
}

// Track last seen Q&A pairs to avoid duplicates
let lastSeenQAPairs = new Set();

function parseCodexQA(text) {
  // Codex format: "> prompt\x07 response> next prompt\x07 response"
  // BEL char (\x07) separates prompt from response
  const pairs = [];

  // Split on "> " to get each Q&A segment
  const parts = text.split(/> /).filter(p => p.trim());

  for (const part of parts) {
    const belIdx = part.indexOf("\x07");
    if (belIdx < 0) continue; // No BEL = not a Q&A pair (e.g. status line)

    const prompt = part.substring(0, belIdx).trim();
    let response = part.substring(belIdx + 1).trim();

    // Skip "Working..." status updates
    if (response.match(/^Working \(\d+s/)) continue;

    // Clean response
    response = response.replace(/\d+% context left.*$/s, "").trim();

    if (prompt && response && response.length > 0) {
      pairs.push({ prompt, response });
    }
  }
  return pairs;
}

function pollTargetOutput() {
  if (!TARGET_HWND) return;

  // Try UIA first (works with ConPTY), fall back to console buffer
  let text = readWindowTextUIA(TARGET_HWND);
  if (isUiaError(text)) {
    text = readConsoleBuffer(TARGET_PID || "0");
  }

  if (!text || text.length < 5) return;
  if (text === lastTargetText) return;

  // Parse Q&A pairs from visible text
  const pairs = parseCodexQA(text);

  for (const pair of pairs) {
    const key = `${pair.prompt}::${pair.response.substring(0, 100)}`;
    if (lastSeenQAPairs.has(key)) continue;
    lastSeenQAPairs.add(key);

    // Cap at 2000 chars
    const content = pair.response.length > 2000
      ? pair.response.substring(pair.response.length - 2000)
      : pair.response;

    targetOutputMessages.push({
      id: `codex-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: "assistant",
      content: content,
      timestamp: new Date().toISOString(),
      source: "codex",
      label: TARGET_LABEL || "Codex",
    });
    console.log(`  [TargetOutput] Q: "${pair.prompt.substring(0, 40)}" A: "${content.substring(0, 80)}"`);
  }

  if (pairs.length > 0) saveResponses();

  // Check for FiveM bug responses in new text
  if (lastTargetText && text.length > lastTargetText.length) {
    const newContent = text.substring(lastTargetText.length);
    const fivemParsed = parseFivemBugResponse(newContent);
    if (fivemParsed) {
      postFivemBugResponse(fivemParsed);
    }
  }

  lastTargetText = text;
}

// Poll target output every 5 seconds
setInterval(pollTargetOutput, 5000);

// ─── Console buffer reader for monitored windows ─────────────────

function readConsoleBuffer(pid) {
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class ConsoleReader {
    [DllImport("kernel32.dll", SetLastError=true)] public static extern bool FreeConsole();
    [DllImport("kernel32.dll", SetLastError=true)] public static extern bool AttachConsole(uint pid);
    [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr GetStdHandle(int h);
    [DllImport("kernel32.dll", SetLastError=true)] public static extern bool AllocConsole();
    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern bool GetConsoleScreenBufferInfo(IntPtr h, out CONSOLE_SCREEN_BUFFER_INFO info);
    [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
    public static extern bool ReadConsoleOutputCharacter(IntPtr h, [Out] char[] buf, uint len, COORD coord, out uint read);

    [StructLayout(LayoutKind.Sequential)]
    public struct COORD { public short X; public short Y; }
    [StructLayout(LayoutKind.Sequential)]
    public struct SMALL_RECT { public short Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)]
    public struct CONSOLE_SCREEN_BUFFER_INFO {
        public COORD dwSize;
        public COORD dwCursorPosition;
        public ushort wAttributes;
        public SMALL_RECT srWindow;
        public COORD dwMaximumWindowSize;
    }

    public static string Read(uint pid) {
        FreeConsole();
        if (!AttachConsole(pid)) {
            AllocConsole();
            return "ATTACH_FAIL";
        }
        IntPtr h = GetStdHandle(-11);
        if (h == IntPtr.Zero || h == (IntPtr)(-1)) {
            FreeConsole(); AllocConsole();
            return "HANDLE_FAIL";
        }
        CONSOLE_SCREEN_BUFFER_INFO info;
        if (!GetConsoleScreenBufferInfo(h, out info)) {
            FreeConsole(); AllocConsole();
            return "INFO_FAIL";
        }
        int width = info.dwSize.X;
        int startY = info.srWindow.Top;
        int endY = info.srWindow.Bottom;
        string result = "";
        for (int y = startY; y <= endY; y++) {
            char[] buf = new char[width];
            COORD coord;
            coord.X = 0; coord.Y = (short)y;
            uint charsRead;
            ReadConsoleOutputCharacter(h, buf, (uint)width, coord, out charsRead);
            result += new string(buf, 0, (int)charsRead).TrimEnd() + "\\n";
        }
        FreeConsole();
        AllocConsole();
        return result;
    }
}
"@
Write-Host ([ConsoleReader]::Read(${pid}))
`;
  try {
    return runPsFile(script);
  } catch (e) {
    return "ERROR: " + (e.message || "").substring(0, 200);
  }
}

// Poll monitored windows for console output
let monitorPollTimer = null;
function startMonitorPolling() {
  if (monitorPollTimer) return;
  monitorPollTimer = setInterval(() => {
    if (monitorTargets.length === 0) return;
    for (const m of monitorTargets) {
      try {
        const text = readConsoleBuffer(m.pid);
        if (text.startsWith("ATTACH_FAIL") || text.startsWith("HANDLE_FAIL") || text.startsWith("INFO_FAIL") || text.startsWith("ERROR")) {
          continue;
        }
        const prev = monitorBuffers[m.hwnd];
        monitorBuffers[m.hwnd] = {
          text: text,
          prevText: prev ? prev.text : "",
          label: m.label,
          pid: m.pid,
          lastUpdate: Date.now(),
        };

        // Check for FiveM bug responses in new text
        if (prev && text !== prev.text) {
          const newContent = text.substring(prev.text.length);
          const parsed = parseFivemBugResponse(newContent);
          if (parsed) {
            postFivemBugResponse(parsed);
          }
        }
      } catch {}
    }
  }, 8000);
}
startMonitorPolling();

// ─── Web UI HTML ───────────────────────────────────────────────────

function getHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claude Bridge</title>
  <link rel="icon" href="/favicon.ico" type="image/x-icon">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0a0a0f;
      color: #e0e0e0;
      min-height: 100vh;
    }

    /* App title bar - draggable in Chrome app mode */
    .app-titlebar {
      -webkit-app-region: drag;
      background: linear-gradient(135deg, #111118 0%, #151520 100%);
      border-bottom: 1px solid #222;
      padding: 10px 20px;
      display: flex;
      align-items: center;
      gap: 12px;
      user-select: none;
    }
    .app-titlebar img {
      width: 28px;
      height: 28px;
      border-radius: 6px;
    }
    .app-titlebar-text {
      font-size: 15px;
      font-weight: 700;
      background: linear-gradient(135deg, #7C3AED, #06B6D4);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .app-titlebar .conn-indicator {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: #888;
      -webkit-app-region: no-drag;
    }
    .app-titlebar .conn-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #f59e0b;
    }
    .app-titlebar .conn-dot.connected { background: #22c55e; }

    .container { max-width: 1000px; margin: 0 auto; padding: 24px; }
    h1 {
      font-size: 28px;
      font-weight: 700;
      background: linear-gradient(135deg, #7C3AED, #06B6D4);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 4px;
    }
    .subtitle { color: #888; font-size: 14px; margin-bottom: 24px; }

    .status-bar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 20px;
      border-radius: 12px;
      margin-bottom: 24px;
      border: 1px solid;
    }
    .status-bar.waiting { background: #1a1a2e; border-color: #333; }
    .status-bar.active { background: #0a1f0a; border-color: #166534; }
    .status-bar.error { background: #1f0a0a; border-color: #7f1d1d; }
    .status-dot {
      width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0;
    }
    .status-dot.waiting { background: #f59e0b; }
    .status-dot.active { background: #22c55e; animation: pulse 2s infinite; }
    .status-dot.error { background: #ef4444; }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .status-text { font-size: 14px; font-weight: 600; }
    .status-detail { font-size: 12px; color: #888; }
    .status-info { flex: 1; }

    .btn-disconnect {
      padding: 8px 16px;
      background: #7f1d1d;
      color: #fca5a5;
      border: 1px solid #991b1b;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
    }
    .btn-disconnect:hover { background: #991b1b; }

    .section-title {
      font-size: 16px;
      font-weight: 600;
      color: #ccc;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .section-title .count {
      background: #7C3AED;
      color: white;
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 10px;
    }

    .btn-refresh {
      margin-left: auto;
      padding: 6px 14px;
      background: #1a1a2e;
      color: #7C3AED;
      border: 1px solid #333;
      border-radius: 8px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
    }
    .btn-refresh:hover { background: #222; border-color: #7C3AED; }

    /* Grid layout for window cards */
    .window-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }

    .window-card {
      position: relative;
      background: #111118;
      border: 2px solid #222;
      border-radius: 14px;
      overflow: hidden;
      cursor: pointer;
      transition: all 0.2s;
    }
    .window-card:hover { border-color: #7C3AED; background: #15151f; transform: translateY(-2px); }
    .window-card.selected { border-color: #22c55e; background: #0a1a0a; }

    .card-thumbnail {
      width: 100%;
      height: 220px;
      background: #08080d;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      position: relative;
    }
    .card-thumbnail img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #000;
    }
    .card-thumbnail .placeholder {
      color: #333;
      font-size: 13px;
      text-align: center;
    }
    .card-thumbnail .placeholder .icon { font-size: 32px; margin-bottom: 8px; display: block; }

    /* Hover overlay */
    .card-overlay {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(124, 58, 237, 0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.2s;
    }
    .window-card:hover .card-overlay { opacity: 1; }
    .window-card.selected .card-overlay { display: none; }
    .window-card.monitored { border-color: #3b82f6; background: #0a0a1a; }
    .window-card.monitored .card-overlay { background: rgba(59, 130, 246, 0.25); }
    .card-overlay .overlay-btn {
      padding: 10px 28px;
      background: #7C3AED;
      color: white;
      border: none;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      letter-spacing: 0.5px;
    }

    /* Active badge */
    .card-badge {
      position: absolute;
      top: 10px;
      right: 10px;
      padding: 4px 12px;
      background: #22c55e;
      color: #052e05;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      border-radius: 20px;
      letter-spacing: 0.5px;
      display: none;
    }
    .window-card.selected .card-badge { display: block; }
    .card-badge.monitor-badge { background: #3b82f6; color: #fff; display: none; }
    .window-card.monitored .card-badge.monitor-badge { display: block; }
    .window-card.monitored .card-badge:not(.monitor-badge) { display: none; }
    .overlay-btn.monitor-btn { background: #3b82f6; margin-left: 8px; }
    .overlay-btn.unmonitor-btn { background: #ef4444; margin-left: 8px; }

    .card-info {
      padding: 12px 16px;
    }
    .card-label {
      font-size: 15px;
      font-weight: 700;
      color: #a78bfa;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 2px;
    }
    .card-project {
      font-size: 11px;
      color: #666;
      font-family: monospace;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 4px;
    }
    .card-title {
      font-size: 12px;
      font-weight: 500;
      color: #888;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .card-handle {
      font-size: 11px;
      color: #444;
      font-family: monospace;
      margin-top: 2px;
    }

    .no-windows {
      text-align: center;
      padding: 60px 20px;
      color: #555;
      background: #111118;
      border: 1px dashed #2a2a3a;
      border-radius: 14px;
    }
    .no-windows .nw-icon { font-size: 40px; margin-bottom: 12px; display: block; color: #444; }
    .no-windows .nw-title { font-size: 16px; font-weight: 600; color: #777; margin-bottom: 8px; }
    .no-windows .nw-hint { font-size: 13px; color: #555; line-height: 1.6; }

    .log-section { margin-top: 24px; }
    .log-list {
      background: #0d0d14;
      border: 1px solid #1a1a2e;
      border-radius: 12px;
      padding: 16px;
      max-height: 300px;
      overflow-y: auto;
      font-family: monospace;
      font-size: 13px;
    }
    .log-entry { padding: 6px 0; border-bottom: 1px solid #1a1a2e; }
    .log-entry:last-child { border-bottom: none; }
    .log-time { color: #666; }
    .log-ok { color: #22c55e; }
    .log-fail { color: #ef4444; }
    .log-msg { color: #a78bfa; }
    .log-empty { color: #444; text-align: center; padding: 20px; }

    .send-section { margin-bottom: 24px; }
    .send-box {
      background: #111118;
      border: 1px solid #2a2a3a;
      border-radius: 12px;
      padding: 16px;
    }
    .msg-input {
      width: 100%;
      background: #0a0a0f;
      color: #e0e0e0;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 12px;
      font-family: inherit;
      font-size: 14px;
      resize: vertical;
      outline: none;
    }
    .msg-input:focus { border-color: #7C3AED; }
    .send-row {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 10px;
    }
    .send-status { font-size: 13px; }
    .btn-send {
      padding: 8px 24px;
      background: #7C3AED;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-send:hover { background: #6D28D9; }
    .btn-send:disabled { background: #444; cursor: not-allowed; }
  </style>
</head>
<body>
  <div class="app-titlebar">
    <img src="/logo.png" alt="RL">
    <span class="app-titlebar-text">Claude Bridge</span>
    <div class="conn-indicator">
      <div id="connDot" class="conn-dot"></div>
      <span id="connLabel">Disconnected</span>
    </div>
  </div>
  <div class="container">
    <h1>Claude Bridge</h1>
    <p class="subtitle">Control Panel v6 - Direct console injection, project labels, live previews</p>

    <div id="statusBar" class="status-bar waiting">
      <div id="statusDot" class="status-dot waiting"></div>
      <div class="status-info">
        <div id="statusText" class="status-text">No target selected</div>
        <div id="statusDetail" class="status-detail">Select a Claude Code terminal below to start forwarding messages</div>
      </div>
      <button id="disconnectBtn" class="btn-disconnect" style="display:none" onclick="disconnect()">Disconnect</button>
    </div>

    <div class="section-title">
      <span>Claude Code Terminals</span>
      <span id="windowCount" class="count">0</span>
      <button class="btn-refresh" onclick="refreshWindows()">Refresh</button>
    </div>

    <div id="windowGrid" class="window-grid">
      <div class="no-windows">
        <span class="nw-icon">&#8987;</span>
        <div class="nw-title">Loading...</div>
      </div>
    </div>

    <div id="sendSection" class="send-section" style="display:none;">
      <div class="section-title">Send Message</div>
      <div class="send-box">
        <textarea id="msgInput" class="msg-input" placeholder="Type a message to send to the selected Claude terminal..." rows="3"></textarea>
        <div class="send-row">
          <span id="sendStatus" class="send-status"></span>
          <button id="sendBtn" class="btn-send" onclick="sendMessage()">Send</button>
        </div>
      </div>
    </div>

    <div class="log-section">
      <div class="section-title">Message Log</div>
      <div id="logList" class="log-list">
        <div class="log-empty">No messages yet. Messages from the admin panel will appear here.</div>
      </div>
    </div>
  </div>

  <script>
    let windows = [];
    let selectedHwnd = null;
    let monitoredHwnds = new Set();
    let thumbnailCache = {};

    function escapeHtml(s) {
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    async function refreshWindows() {
      try {
        const res = await fetch('/api/windows');
        windows = await res.json();
        renderWindows();
        // Batch fetch all thumbnails
        fetchAllThumbnails();
      } catch (e) {
        console.error('Failed to fetch windows:', e);
      }
    }

    async function fetchAllThumbnails() {
      if (windows.length === 0) return;
      try {
        const hwnds = windows.map(w => w.hwnd);
        const res = await fetch('/api/thumbnails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hwnds })
        });
        const data = await res.json();
        if (data.thumbnails) {
          for (const [hwnd, image] of Object.entries(data.thumbnails)) {
            thumbnailCache[hwnd] = image;
            const img = document.getElementById('thumb-' + hwnd);
            if (img) {
              img.src = 'data:image/png;base64,' + image;
              img.style.display = 'block';
              const ph = document.getElementById('ph-' + hwnd);
              if (ph) ph.style.display = 'none';
            }
          }
        }
      } catch (e) {
        console.error('Failed to fetch thumbnails:', e);
      }
    }

    function renderWindows() {
      const grid = document.getElementById('windowGrid');
      document.getElementById('windowCount').textContent = windows.length;

      if (windows.length === 0) {
        grid.innerHTML = '<div class="no-windows" style="grid-column: 1 / -1;">' +
          '<span class="nw-icon">&#128269;</span>' +
          '<div class="nw-title">No Claude Code terminals detected</div>' +
          '<div class="nw-hint">Start a Claude Code session in a terminal, then click Refresh.<br>' +
          'The bridge looks for windows with &quot;claude&quot; in the title<br>or running as claude / claude-code process.</div>' +
        '</div>';
        return;
      }

      grid.innerHTML = windows.map(w => {
        const isSelected = w.hwnd === selectedHwnd;
        const isMonitored = monitoredHwnds.has(w.hwnd);
        let cardClass = 'window-card';
        if (isSelected) cardClass += ' selected';
        else if (isMonitored) cardClass += ' monitored';
        const cached = thumbnailCache[w.hwnd];
        const safeLabel = escapeHtml(w.label || w.title);
        const safeProject = escapeHtml(w.projectDir || '');
        const safeTitle = escapeHtml(w.title);
        const dataAttr = 'data-hwnd="' + escapeHtml(w.hwnd) + '" data-pid="' + escapeHtml(w.pid || '') + '" data-title="' + safeTitle + '" data-label="' + safeLabel + '" data-project="' + safeProject + '"';

        let overlayBtns = '';
        if (!isSelected) {
          overlayBtns += '<button class="overlay-btn" onclick="event.stopPropagation(); selectFromCard(this.closest(\'.window-card\'))">Select</button>';
          if (isMonitored) {
            overlayBtns += '<button class="overlay-btn unmonitor-btn" onclick="event.stopPropagation(); unmonitorFromCard(this.closest(\'.window-card\'))">Unmonitor</button>';
          } else {
            overlayBtns += '<button class="overlay-btn monitor-btn" onclick="event.stopPropagation(); monitorFromCard(this.closest(\'.window-card\'))">Monitor</button>';
          }
        }

        return '<div class="' + cardClass + '" ' + dataAttr + '>' +
          '<div class="card-thumbnail">' +
            '<img id="thumb-' + w.hwnd + '" src="' + (cached ? 'data:image/png;base64,' + cached : '') + '" style="display:' + (cached ? 'block' : 'none') + ';">' +
            '<div id="ph-' + w.hwnd + '" class="placeholder" style="display:' + (cached ? 'none' : 'flex') + ';flex-direction:column;align-items:center;">' +
              '<span class="icon">&#9654;</span>Loading preview...' +
            '</div>' +
            '<div class="card-overlay">' + overlayBtns + '</div>' +
            '<div class="card-badge">Active Target</div>' +
            '<div class="card-badge monitor-badge">Monitoring</div>' +
          '</div>' +
          '<div class="card-info">' +
            '<div class="card-label">' + safeLabel + '</div>' +
            (safeProject ? '<div class="card-project">' + safeProject + '</div>' : '') +
            '<div class="card-title">' + safeTitle + '</div>' +
            '<div class="card-handle">HWND: ' + w.hwnd + ' &middot; PID: ' + (w.pid || w.windowPid || '?') + (w.procName ? ' &middot; ' + escapeHtml(w.procName) : '') + '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    function selectFromCard(el) {
      const hwnd = el.getAttribute('data-hwnd');
      const pid = el.getAttribute('data-pid');
      const title = el.getAttribute('data-title');
      const label = el.getAttribute('data-label');
      selectWindow(hwnd, pid, title, label);
    }

    function monitorFromCard(el) {
      const hwnd = el.getAttribute('data-hwnd');
      const pid = el.getAttribute('data-pid');
      const title = el.getAttribute('data-title');
      const label = el.getAttribute('data-label');
      const projectDir = el.getAttribute('data-project');
      monitorWindow(hwnd, pid, title, label, projectDir);
    }

    function unmonitorFromCard(el) {
      const hwnd = el.getAttribute('data-hwnd');
      unmonitorWindow(hwnd);
    }

    async function monitorWindow(hwnd, pid, title, label, projectDir) {
      try {
        const res = await fetch('/api/monitor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hwnd, pid, title, label, projectDir }),
        });
        const data = await res.json();
        if (data.ok) {
          monitoredHwnds.add(hwnd);
          renderWindows();
        }
      } catch (e) {
        console.error('Failed to monitor:', e);
      }
    }

    async function unmonitorWindow(hwnd) {
      try {
        const res = await fetch('/api/unmonitor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hwnd }),
        });
        const data = await res.json();
        if (data.ok) {
          monitoredHwnds.delete(hwnd);
          renderWindows();
        }
      } catch (e) {
        console.error('Failed to unmonitor:', e);
      }
    }

    async function selectWindow(hwnd, pid, title, label) {
      try {
        const res = await fetch('/api/select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hwnd, pid, title, label }),
        });
        const data = await res.json();
        if (data.ok) {
          selectedHwnd = hwnd;
          updateStatus('active', 'Connected: ' + (label || title), 'Clipboard paste + SendInput (HWND: ' + hwnd + ')');
          document.getElementById('disconnectBtn').style.display = 'block';
          document.getElementById('sendSection').style.display = 'block';
          renderWindows();
        }
      } catch (e) {
        console.error('Failed to select:', e);
      }
    }

    async function disconnect() {
      try {
        await fetch('/api/disconnect', { method: 'POST' });
        selectedHwnd = null;
        updateStatus('waiting', 'No target selected', 'Select a Claude Code terminal below to start forwarding messages');
        document.getElementById('disconnectBtn').style.display = 'none';
        document.getElementById('sendSection').style.display = 'none';
        renderWindows();
      } catch (e) {
        console.error('Failed to disconnect:', e);
      }
    }

    function updateStatus(type, text, detail) {
      const bar = document.getElementById('statusBar');
      const dot = document.getElementById('statusDot');
      bar.className = 'status-bar ' + type;
      dot.className = 'status-dot ' + type;
      document.getElementById('statusText').textContent = text;
      document.getElementById('statusDetail').textContent = detail;
      // Sync title bar indicator
      const connDot = document.getElementById('connDot');
      const connLabel = document.getElementById('connLabel');
      if (type === 'active') {
        connDot.className = 'conn-dot connected';
        connLabel.textContent = 'Connected';
      } else {
        connDot.className = 'conn-dot';
        connLabel.textContent = 'Disconnected';
      }
    }

    async function fetchLog() {
      try {
        const res = await fetch('/api/log');
        const data = await res.json();
        const logList = document.getElementById('logList');

        if (data.selectedHwnd) {
          selectedHwnd = data.selectedHwnd;
          updateStatus('active', 'Connected: ' + (data.selectedLabel || data.selectedTitle || 'Unknown'), 'Clipboard paste + SendInput');
          document.getElementById('disconnectBtn').style.display = 'block';
          document.getElementById('sendSection').style.display = 'block';
        }

        // Sync monitor targets from server
        if (data.monitorTargets) {
          const serverSet = new Set(data.monitorTargets.map(m => m.hwnd));
          if ([...monitoredHwnds].sort().join(',') !== [...serverSet].sort().join(',')) {
            monitoredHwnds = serverSet;
            renderWindows();
          }
        }

        if (data.log.length === 0) {
          logList.innerHTML = '<div class="log-empty">No messages yet. Messages from the admin panel will appear here.</div>';
          return;
        }

        logList.innerHTML = data.log.slice(-50).reverse().map(entry => {
          const statusClass = entry.status === 'ok' ? 'log-ok' : 'log-fail';
          const statusText = entry.status === 'ok' ? 'Delivered' : entry.status === 'dead' ? 'Attach failed' : 'Failed';
          return '<div class="log-entry">' +
            '<span class="log-time">[' + escapeHtml(entry.time) + ']</span> ' +
            '<span class="log-msg">' + escapeHtml(entry.from) + ':</span> ' +
            '"' + escapeHtml(entry.text.substring(0, 80)) + (entry.text.length > 80 ? '...' : '') + '" ' +
            '<span class="' + statusClass + '">' + statusText + '</span>' +
          '</div>';
        }).join('');
      } catch (e) {}
    }

    async function sendMessage() {
      const input = document.getElementById('msgInput');
      const btn = document.getElementById('sendBtn');
      const statusEl = document.getElementById('sendStatus');
      const text = input.value.trim();
      if (!text) return;

      btn.disabled = true;
      statusEl.textContent = 'Sending...';
      statusEl.style.color = '#f59e0b';

      try {
        const res = await fetch('/api/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });
        const data = await res.json();
        if (data.ok) {
          statusEl.textContent = 'Sent!';
          statusEl.style.color = '#22c55e';
          input.value = '';
        } else {
          statusEl.textContent = 'Failed: ' + (data.error || data.status || 'unknown');
          statusEl.style.color = '#ef4444';
        }
      } catch (e) {
        statusEl.textContent = 'Error: ' + e.message;
        statusEl.style.color = '#ef4444';
      }
      btn.disabled = false;
      fetchLog();
      setTimeout(() => { statusEl.textContent = ''; }, 4000);
    }

    // Allow Ctrl+Enter to send
    document.addEventListener('keydown', function(e) {
      if (e.ctrlKey && e.key === 'Enter' && document.activeElement.id === 'msgInput') {
        sendMessage();
      }
    });

    // Initial load
    refreshWindows();
    fetchLog();

    // Poll for updates
    setInterval(fetchLog, 3000);
    setInterval(refreshWindows, 15000);
    // Refresh thumbnails every 5 seconds
    setInterval(fetchAllThumbnails, 5000);
  </script>
</body>
</html>`;
}

// ─── HTTP Server ───────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Serve favicon and logo
  if (url.pathname === "/favicon.ico" || url.pathname === "/logo.png") {
    const filePath = url.pathname === "/logo.png"
      ? path.join(__dirname, "..", "..", "public", "logo.png")
      : path.join(__dirname, "..", "..", "src", "app", "favicon.ico");
    const contentType = url.pathname === "/logo.png" ? "image/png" : "image/x-icon";
    try {
      const data = fs.readFileSync(filePath);
      res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "public, max-age=86400" });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end();
    }
    return;
  }

  // Serve UI (no auth needed for local debugging)
  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(getHTML());
    return;
  }

  // Auth check for all /api/* routes
  // Allow local UI requests (Referer from bridge itself) without token
  if (url.pathname.startsWith("/api/")) {
    const token = req.headers["x-bridge-token"];
    const referer = req.headers["referer"] || "";
    const isLocalUI = referer.startsWith(`http://localhost:${PORT}`) || referer.startsWith(`http://127.0.0.1:${PORT}`);
    if (!isLocalUI && token !== BRIDGE_SECRET) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
  }

  // API: List windows (Claude Code only)
  if (url.pathname === "/api/windows" && req.method === "GET") {
    const windows = getWindowList();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(windows));
    return;
  }

  // API: Batch thumbnails
  if (url.pathname === "/api/thumbnails" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => body += chunk);
    req.on("end", () => {
      try {
        const { hwnds } = JSON.parse(body);
        const thumbnails = captureAllThumbnails(hwnds || []);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ thumbnails }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid request" }));
      }
    });
    return;
  }

  // API: Single window thumbnail (backwards compat)
  if (url.pathname === "/api/thumbnail" && req.method === "GET") {
    const hwnd = url.searchParams.get("hwnd");
    if (!hwnd) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing hwnd" }));
      return;
    }
    const image = captureWindowThumbnail(hwnd);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ hwnd, image }));
    return;
  }

  // API: Select target window
  if (url.pathname === "/api/select" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => body += chunk);
    req.on("end", () => {
      try {
        const { hwnd, pid, title, label, projectDir } = JSON.parse(body);
        TARGET_HWND = hwnd;
        TARGET_PID = pid || null;
        TARGET_TITLE = title;
        TARGET_LABEL = label || title;
        TARGET_PROJECT_DIR = projectDir || null;
        setBridgeStatus("active", `Connected to ${label || title || hwnd}`);
        const snap = snapshotTargetState(hwnd, pid || hwnd);
        console.log(`  TARGET SET: ${TARGET_LABEL} (HWND: ${hwnd}, PID: ${pid}), snapshot ${snap.textLength} chars, ${snap.pairCount} QA pairs`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid request" }));
      }
    });
    return;
  }

  // API: Disconnect
  if (url.pathname === "/api/disconnect" && req.method === "POST") {
    TARGET_HWND = null;
    TARGET_PID = null;
    TARGET_TITLE = null;
    TARGET_LABEL = null;
    TARGET_PROJECT_DIR = null;
    setBridgeStatus("waiting", "Disconnected by admin");
    console.log("  TARGET DISCONNECTED");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // API: Add monitor target (view-only window)
  if (url.pathname === "/api/monitor" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => body += chunk);
    req.on("end", () => {
      try {
        const { hwnd, pid, title, label, projectDir } = JSON.parse(body);
        // Don't add duplicates
        if (!monitorTargets.find(m => m.hwnd === hwnd)) {
          monitorTargets.push({ hwnd, pid: pid || hwnd, title, label: label || title, projectDir: projectDir || null });
          console.log(`  MONITOR ADDED: ${label || title} (HWND: ${hwnd})`);
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, monitors: monitorTargets }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // API: Remove monitor target
  if (url.pathname === "/api/unmonitor" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => body += chunk);
    req.on("end", () => {
      try {
        const { hwnd } = JSON.parse(body);
        monitorTargets = monitorTargets.filter(m => m.hwnd !== hwnd);
        delete monitorBuffers[hwnd];
        console.log(`  MONITOR REMOVED: HWND ${hwnd}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, monitors: monitorTargets }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // API: Clear codex/target responses
  if (url.pathname === "/api/target-output" && req.method === "DELETE") {
    targetOutputMessages = [];
    if (TARGET_HWND) {
      const snap = snapshotTargetState(TARGET_HWND, TARGET_PID || "0");
      console.log(`[TargetOutput] Cleared all responses, snapshot ${snap.textLength} chars, ${snap.pairCount} existing QA pairs`);
    } else {
      lastTargetText = "";
      lastSeenQAPairs = new Set();
      console.log(`[TargetOutput] Cleared all responses, no target connected`);
    }
    saveResponses();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, cleared: true }));
    return;
  }

  // API: Get codex/target responses (UIA-captured text)
  if (url.pathname === "/api/target-output" && req.method === "GET") {
    // Read current text from target window
    let currentText = "";
    if (TARGET_HWND) {
      currentText = readWindowTextUIA(TARGET_HWND);
      if (isUiaError(currentText)) {
        currentText = "";
      }
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      messages: targetOutputMessages.slice(-50),
      currentText: currentText.substring(0, 10000),
      targetLabel: TARGET_LABEL,
      targetHwnd: TARGET_HWND,
    }));
    return;
  }

  // API: Get monitor output (console buffer text)
  if (url.pathname === "/api/monitor-output" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ outputs: monitorBuffers }));
    return;
  }

  // API: Get log + status
  if (url.pathname === "/api/log" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      log: messageLog.slice(-100),
      selectedHwnd: TARGET_HWND,
      selectedTitle: TARGET_TITLE,
      selectedLabel: TARGET_LABEL,
      selectedProjectDir: TARGET_PROJECT_DIR,
      monitorTargets,
      status,
      statusReason,
      statusUpdatedAt,
    }));
    return;
  }

  // API: Send message directly to target window
  if (url.pathname === "/api/send" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => body += chunk);
    req.on("end", () => {
      try {
        const { text } = JSON.parse(body);
        if (!text || !text.trim()) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Empty message" }));
          return;
        }
        if (!TARGET_HWND) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No target window selected" }));
          return;
        }

        console.log(`[Direct Send] "${text.substring(0, 80)}"`);
        console.log(`  Sending to: ${TARGET_LABEL} (HWND: ${TARGET_HWND})`);

        const result = sendToWindow(TARGET_HWND, text);
        const time = new Date().toLocaleTimeString();

        let logStatus = "ok";
        if (result === "DEAD") {
          logStatus = "dead";
          setBridgeStatus("error", "Target window no longer exists");
          console.log("  FAILED - Window no longer exists");
        } else if (result === "FOCUS_FAILED") {
          logStatus = "failed";
          setBridgeStatus("error", "Failed to focus target window");
          console.log("  FAILED - Could not focus window");
        } else if (result !== "OK") {
          logStatus = "failed";
          setBridgeStatus("error", "Bridge send failed");
          console.log(`  FAILED - ${result}`);
        } else {
          setBridgeStatus("active", `Connected to ${TARGET_LABEL || TARGET_TITLE || TARGET_HWND}`);
          console.log("  OK - Delivered");
        }

        messageLog.push({ time, from: "Bridge UI", text, status: logStatus });
        if (messageLog.length > 200) messageLog.splice(0, messageLog.length - 200);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: logStatus === "ok", status: logStatus, result: String(result) }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid request: " + e.message }));
      }
    });
    return;
  }

  // API: Debug log - shows detailed send operation results
  if (url.pathname === "/api/debug" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      debugLog: debugLog.slice(-20),
      target: {
        hwnd: TARGET_HWND,
        pid: TARGET_PID,
        title: TARGET_TITLE,
        label: TARGET_LABEL,
        projectDir: TARGET_PROJECT_DIR,
      },
      queueFile: QUEUE_FILE,
      bridgeSecret: BRIDGE_SECRET ? BRIDGE_SECRET.substring(0, 8) + "..." : "(empty)",
      uptime: Math.floor(process.uptime()) + "s",
      status,
    }, null, 2));
    return;
  }

  // API: Test send - sends a test message and returns detailed debug info
  if (url.pathname === "/api/test-send" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => body += chunk);
    req.on("end", () => {
      try {
        if (!TARGET_HWND) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No target window selected. Select a window first." }));
          return;
        }
        const testText = "Bridge test " + Date.now();
        console.log(`[Test Send] "${testText}" -> HWND: ${TARGET_HWND}`);
        const result = sendToWindow(TARGET_HWND, testText);
        const lastDebug = debugLog[debugLog.length - 1] || {};
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          testText,
          sendResult: result,
          debug: lastDebug,
          target: { hwnd: TARGET_HWND, label: TARGET_LABEL },
        }, null, 2));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Test send failed: " + e.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

// ─── Message poll loop ─────────────────────────────────────────────

// Initialize - skip existing messages and seed the dedup set
const initial = readQueue();
if (initial.length > 0) {
  lastProcessedTimestamp = initial[initial.length - 1].timestamp;
  for (const msg of initial) {
    if (msg.id) processedIds.add(msg.id);
  }
  console.log(`  Skipping ${initial.length} existing RallyLive messages`);
}

// Initialize FiveM queue
const fivemInitial = readFivemQueue();
if (fivemInitial.length > 0) {
  fivemLastProcessedTimestamp = fivemInitial[fivemInitial.length - 1].timestamp;
  for (const msg of fivemInitial) {
    if (msg.id) fivemProcessedIds.add(msg.id);
  }
  console.log(`  Skipping ${fivemInitial.length} existing FiveM messages`);
}

setInterval(() => {
  if (!TARGET_HWND) return;

  const queue = readQueue();

  for (const msg of queue) {
    if (msg.processed) continue;
    if (msg.id && processedIds.has(msg.id)) continue;
    if (msg.timestamp <= lastProcessedTimestamp) continue;

    const time = new Date(msg.timestamp).toLocaleTimeString();
    const preview = msg.text.substring(0, 100) + (msg.text.length > 100 ? "..." : "");
    console.log(`[${time}] ${msg.from}: "${preview}"`);
    console.log(`  Sending to: ${TARGET_LABEL} (HWND: ${TARGET_HWND})`);

    const result = sendToWindow(TARGET_HWND, msg.text);
    markProcessed(msg.timestamp);
    if (msg.id) processedIds.add(msg.id);

    let logStatus = "ok";
    if (result === "DEAD") {
      logStatus = "dead";
      setBridgeStatus("error", "Target window no longer exists");
      console.log("  FAILED - Window no longer exists");
    } else if (result === "FOCUS_FAILED") {
      logStatus = "failed";
      setBridgeStatus("error", "Failed to focus target window");
      console.log("  FAILED - Could not focus window");
    } else if (!result) {
      logStatus = "failed";
      setBridgeStatus("error", "Bridge send failed");
      console.log("  FAILED - Could not send");
    } else {
      setBridgeStatus("active", `Connected to ${TARGET_LABEL || TARGET_TITLE || TARGET_HWND}`);
      console.log("  OK - Delivered via SendKeys");
    }

    messageLog.push({
      time,
      from: msg.from || "Unknown",
      text: msg.text,
      status: logStatus,
    });
    if (messageLog.length > 200) messageLog.splice(0, messageLog.length - 200);

    lastProcessedTimestamp = msg.timestamp;
  }

  // Cap dedup set size to prevent unbounded growth
  if (processedIds.size > 500) {
    const arr = [...processedIds];
    arr.splice(0, arr.length - 200);
    processedIds.clear();
    for (const id of arr) processedIds.add(id);
  }
}, POLL_INTERVAL);

// ─── FiveM queue poll loop ─────────────────────────────────────────
setInterval(() => {
  if (!TARGET_HWND) return;

  const queue = readFivemQueue();

  for (const msg of queue) {
    if (msg.processed) continue;
    if (msg.id && fivemProcessedIds.has(msg.id)) continue;
    if (msg.timestamp <= fivemLastProcessedTimestamp) continue;

    const time = new Date(msg.timestamp).toLocaleTimeString();
    const preview = msg.text.substring(0, 100) + (msg.text.length > 100 ? "..." : "");
    console.log(`[FiveM][${time}] ${msg.from}: "${preview}"`);
    console.log(`  Sending to: ${TARGET_LABEL} (HWND: ${TARGET_HWND})`);

    const result = sendToWindow(TARGET_HWND, msg.text);
    markFivemProcessed(msg.timestamp);
    if (msg.id) fivemProcessedIds.add(msg.id);

    let logStatus = "ok";
    if (result === "DEAD") {
      logStatus = "dead";
      setBridgeStatus("error", "Target window no longer exists");
    } else if (result === "FOCUS_FAILED") {
      logStatus = "failed";
      setBridgeStatus("error", "Failed to focus target window");
    } else if (!result) {
      logStatus = "failed";
      setBridgeStatus("error", "Bridge send failed");
    } else {
      setBridgeStatus("active", `Connected to ${TARGET_LABEL || TARGET_TITLE || TARGET_HWND}`);
    }

    messageLog.push({
      time,
      from: `[FiveM] ${msg.from || "Unknown"}`,
      text: msg.text,
      status: logStatus,
    });
    if (messageLog.length > 200) messageLog.splice(0, messageLog.length - 200);

    fivemLastProcessedTimestamp = msg.timestamp;
  }

  // Cap dedup set
  if (fivemProcessedIds.size > 500) {
    const arr = [...fivemProcessedIds];
    arr.splice(0, arr.length - 200);
    fivemProcessedIds.clear();
    for (const id of arr) fivemProcessedIds.add(id);
  }
}, POLL_INTERVAL);

// ─── Ensure single instance ────────────────────────────────────────
// Try connecting to the port — if something responds, another bridge is running.
// This avoids false positives from TIME_WAIT sockets.

const testConn = net.createConnection({ port: PORT, host: "127.0.0.1" });
testConn.setTimeout(1000);
testConn.once("connect", () => {
  testConn.destroy();
  console.log("");
  console.log("  =============================================");
  console.log("  BRIDGE ALREADY RUNNING on port " + PORT);
  console.log("  =============================================");
  console.log("");
  console.log("  Open http://localhost:" + PORT + " in your browser.");
  console.log("  Only one bridge can run at a time.");
  console.log("");
  try {
    execSync(`start http://localhost:${PORT}`, { stdio: "ignore" });
  } catch {}
  process.exit(0);
});
testConn.once("error", () => {
  testConn.destroy();
  startServer();
});
testConn.once("timeout", () => {
  testConn.destroy();
  startServer();
});

function startServer() {
server.listen(PORT, () => {
  console.log("");
  console.log("  =============================================");
  console.log("  CLAUDE BRIDGE v6 - Direct Console Injection");
  console.log("  =============================================");
  console.log("");
  console.log(`  Open in browser: http://localhost:${PORT}`);
  console.log("");
  console.log("  RallyLive queue:", QUEUE_FILE);
  console.log("  FiveM queue:", FIVEM_QUEUE_FILE);
  console.log("  Poll interval:", POLL_INTERVAL + "ms");
  console.log("");
  console.log("  Features:");
  console.log("  - Project directory labels on each window");
  console.log("  - WriteConsoleInput injection (no focus stealing)");
  console.log("  - BitBlt fallback for GPU-rendered terminals");
  console.log("  - Batched thumbnail capture");
  console.log("  - Multi-line message support");
  console.log("  - Python window scanner (EPERM-resistant)");
  console.log("");

  // Auto-start scanner if not already running
  ensureScannerRunning();
  if (fs.existsSync(SCANNER_FILE)) {
    console.log("  [Scanner] Window scanner data found at", SCANNER_FILE);
  } else {
    console.log("  [Scanner] Scanner starting up, waiting for first scan...");
  }

  console.log("  Waiting for target selection...");
  console.log("  ─────────────────────────────────────────────");
  console.log("");
});

// Cleanup scanner on exit
process.on("exit", () => { if (scannerChild) try { scannerChild.kill(); } catch {} });
process.on("SIGINT", () => { if (scannerChild) try { scannerChild.kill(); } catch {} process.exit(0); });
process.on("SIGTERM", () => { if (scannerChild) try { scannerChild.kill(); } catch {} process.exit(0); });
}
