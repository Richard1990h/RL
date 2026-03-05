/**
 * Codex Wrapper - Runs OpenAI Codex inside a PTY with output capture
 *
 * Spawns codex in a proper pseudo-terminal so it works normally (interactive,
 * runs console commands, etc.) while capturing all output to a JSON file that
 * the bridge and admin panel can read.
 *
 * USAGE: node codex-wrapper.js [codex args...]
 *   or:  start-codex.bat
 *
 * Output is saved to:
 *   ~/.claude/projects/<project>/codex-responses.json
 *   ~/.claude/projects/<project>/codex-raw-output.log
 */

const path = require("path");
const fs = require("fs");

// Resolve node-pty from rally-live/node_modules where it's installed
const RALLY_LIVE_DIR = path.join(__dirname, "..", "..");
const pty = require(path.join(RALLY_LIVE_DIR, "node_modules", "node-pty"));

// ─── Config ─────────────────────────────────────────────────────────

const PROJECT_DIR = path.join(
  process.env.USERPROFILE || "C:\\Users\\Richard",
  ".claude", "projects", "C--Users-Richard-Desktop-RallyLive-ca"
);

const RESPONSES_FILE = path.join(PROJECT_DIR, "codex-responses.json");
const RAW_LOG_FILE = path.join(PROJECT_DIR, "codex-raw-output.log");

const FLUSH_INTERVAL = 3000;  // Check for new responses every 3s
const MAX_RESPONSES = 200;

// ─── State ──────────────────────────────────────────────────────────

let responses = [];
let rawLogStream = null;
let outputSinceLastInput = ""; // Accumulates output after user presses Enter
let userJustTyped = false;     // Track if user recently sent input
let lastInputTime = 0;         // When user last pressed Enter
let pendingOutput = "";        // Raw output accumulator for current "turn"

// Load existing responses
try {
  if (fs.existsSync(RESPONSES_FILE)) {
    responses = JSON.parse(fs.readFileSync(RESPONSES_FILE, "utf-8"));
  }
} catch {}

// Open raw log (append)
try {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
  rawLogStream = fs.createWriteStream(RAW_LOG_FILE, { flags: "a" });
  rawLogStream.write(`\n\n=== Codex Wrapper Started: ${new Date().toISOString()} ===\n\n`);
} catch (e) {
  console.error("Warning: Could not open raw log file:", e.message);
}

// ─── ANSI / Terminal cleanup ────────────────────────────────────────

function stripAnsi(str) {
  return str
    // CSI sequences (colors, cursor movement, erase, etc.)
    .replace(/\x1B\[[0-9;]*[A-Za-z]/g, "")
    // CSI with ? prefix (DEC private modes like ?25h cursor show)
    .replace(/\x1B\[\?[0-9;]*[A-Za-z]/g, "")
    // OSC sequences (title set, etc.)
    .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, "")
    // Character set selection
    .replace(/\x1B[()][0-9A-Z]/g, "")
    // Other single-char escapes
    .replace(/\x1B[#=><7-8]/g, "")
    // Remaining escape chars
    .replace(/\x1B/g, "")
    // Control characters (keep \n \r \t)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    // Collapse repeated whitespace on each line
    .split("\n").map(l => l.replace(/\s+$/, "")).join("\n")
    // Collapse 3+ blank lines to 2
    .replace(/\n{4,}/g, "\n\n\n");
}

function cleanResponse(text) {
  const lines = text.split("\n");
  const cleaned = lines.filter(line => {
    const t = line.trim();
    // Skip empty
    if (!t) return false;
    // Skip pure box-drawing / decoration
    if (/^[─═╔╗╚╝║┌┐└┘│├┤┬┴┼━┃╭╮╯╰─\s]+$/.test(t)) return false;
    // Skip npm spinner artifacts
    if (/^[⠙⠹⠸⠼⠴⠦⠧⠇⠏⠋]+$/.test(t)) return false;
    // Skip cursor position garbage
    if (/^\[\d+;\d+H$/.test(t)) return false;
    // Skip single-char noise
    if (t.length <= 1) return false;
    return true;
  });
  return cleaned.join("\n").trim();
}

// ─── Response saving ────────────────────────────────────────────────

function saveResponses() {
  try {
    if (responses.length > MAX_RESPONSES) {
      responses = responses.slice(-MAX_RESPONSES);
    }
    fs.writeFileSync(RESPONSES_FILE, JSON.stringify(responses, null, 2), "utf-8");
  } catch {}
}

function addResponse(content) {
  if (!content || content.length < 3) return;

  // Dedup: skip if matches any of the last 10 responses
  const recent = responses.slice(-10);
  if (recent.some(r => r.content === content)) return;

  responses.push({
    id: `codex-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    role: "assistant",
    content,
    timestamp: new Date().toISOString(),
    source: "codex-wrapper",
    label: "Codex",
  });

  saveResponses();
}

// ─── Process output into responses ──────────────────────────────────

function flushPendingOutput() {
  if (!pendingOutput) return;

  // Only process if we've had some output and it's been at least 2s
  // since user input (give codex time to finish responding)
  const timeSinceInput = Date.now() - lastInputTime;
  if (lastInputTime > 0 && timeSinceInput < 2000) return;

  const stripped = stripAnsi(pendingOutput);
  const cleaned = cleanResponse(stripped);

  if (cleaned.length > 5) {
    addResponse(cleaned);
  }

  pendingOutput = "";
}

// ─── Spawn Codex in PTY ─────────────────────────────────────────────

const cols = process.stdout.columns || 120;
const rows = process.stdout.rows || 30;

const codexArgs = process.argv.slice(2);

// Auto-add --no-alt-screen so output stays in scrollback (easier to capture)
if (!codexArgs.includes("--no-alt-screen")) {
  codexArgs.push("--no-alt-screen");
}

// On Windows, node-pty needs cmd.exe to run .cmd scripts like npx
const codexCmd = process.env.COMSPEC || "cmd.exe";
const codexCmdArgs = ["/c", "npx", "@openai/codex", ...codexArgs];

console.log(`Starting Codex via: npx @openai/codex ${codexArgs.join(" ")}`);
console.log(`Output captured to: ${RESPONSES_FILE}`);
console.log(`Raw log: ${RAW_LOG_FILE}`);
console.log("");

const ptyProcess = pty.spawn(codexCmd, codexCmdArgs, {
  name: "xterm-256color",
  cols,
  rows,
  cwd: process.cwd(),
  env: { ...process.env, TERM: "xterm-256color" },
  useConpty: true,
});

// ─── I/O Piping ─────────────────────────────────────────────────────

// Forward PTY output to real terminal + capture buffer
ptyProcess.onData((data) => {
  // Write to real terminal
  process.stdout.write(data);

  // Accumulate for response detection
  pendingOutput += data;

  // Write raw to log file
  if (rawLogStream) {
    rawLogStream.write(data);
  }

  // Cap buffer size
  if (pendingOutput.length > 200000) {
    // Flush what we have and reset
    flushPendingOutput();
    pendingOutput = "";
  }
});

// Forward stdin to PTY, tracking user input
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}
process.stdin.resume();
process.stdin.on("data", (data) => {
  ptyProcess.write(data.toString());

  const str = data.toString();
  // Detect Enter key (CR or LF) — user submitted input
  if (str.includes("\r") || str.includes("\n")) {
    // Flush previous output as a response before the new input
    flushPendingOutput();
    lastInputTime = Date.now();
    userJustTyped = true;
  }
});

// Handle terminal resize
process.stdout.on("resize", () => {
  const newCols = process.stdout.columns || 120;
  const newRows = process.stdout.rows || 30;
  ptyProcess.resize(newCols, newRows);
});

// ─── Periodic flush ─────────────────────────────────────────────────

const flushTimer = setInterval(() => {
  flushPendingOutput();
}, FLUSH_INTERVAL);

// ─── Cleanup ────────────────────────────────────────────────────────

ptyProcess.onExit(({ exitCode }) => {
  clearInterval(flushTimer);
  flushPendingOutput(); // Final flush

  if (rawLogStream) {
    rawLogStream.write(`\n=== Codex Wrapper Exited: ${new Date().toISOString()} (code: ${exitCode}) ===\n`);
    rawLogStream.end();
  }

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }

  process.exit(exitCode || 0);
});

process.on("SIGINT", () => {
  ptyProcess.kill();
});

process.on("exit", () => {
  clearInterval(flushTimer);
});
