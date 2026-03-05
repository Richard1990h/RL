// In-memory server log store — captures FiveM console output per server slug

const MAX_LINES = 500;

interface LogEntry {
  text: string;
  ts: number;
}

const globalForLogs = globalThis as unknown as { __fivemLogStore?: Map<string, LogEntry[]> };
if (!globalForLogs.__fivemLogStore) {
  globalForLogs.__fivemLogStore = new Map();
}
const logStore = globalForLogs.__fivemLogStore;

export function appendLogs(slug: string, lines: string[]) {
  if (!lines.length) return;
  let entries = logStore.get(slug);
  if (!entries) {
    entries = [];
    logStore.set(slug, entries);
  }
  const now = Date.now();
  for (const line of lines) {
    entries.push({ text: line, ts: now });
  }
  // Trim to max
  if (entries.length > MAX_LINES) {
    logStore.set(slug, entries.slice(entries.length - MAX_LINES));
  }
}

export function getRecentLogs(slug: string, count = 100): string[] {
  const entries = logStore.get(slug);
  if (!entries || !entries.length) return [];
  return entries.slice(-count).map((e) => e.text);
}

export function getLogsForPrompt(slug: string): string {
  const lines = getRecentLogs(slug, 200);
  if (!lines.length) return "";
  return `\n\nRECENT SERVER CONSOLE OUTPUT (last ${lines.length} lines):\n\`\`\`\n${lines.join("\n")}\n\`\`\``;
}

/** Common FiveM error patterns in log output */
const ERROR_PATTERNS = [
  /SCRIPT ERROR/i,
  /\bERROR\b.*\bRunning/i,
  /\bfailed to load/i,
  /\bstack traceback/i,
  /\battempt to .+ a nil value/i,
  /\bsyntax error/i,
  /\bunexpected symbol/i,
  /\bmodule not found/i,
  /\bcouldn'?t find resource/i,
  /\bfailed to start resource/i,
  /\bfailed to ensure/i,
];

/**
 * Check recent logs for errors related to specific resources.
 * Returns an array of error lines found, or empty if clean.
 * Only checks logs from the last `withinMs` milliseconds.
 */
export function checkLogsForErrors(slug: string, resources: string[], withinMs = 120000): string[] {
  const entries = logStore.get(slug);
  if (!entries || !entries.length) return [];

  const cutoff = Date.now() - withinMs;
  const errorLines: string[] = [];

  for (const entry of entries) {
    if (entry.ts < cutoff) continue;
    const line = entry.text;
    // Check if line matches any error pattern
    const isError = ERROR_PATTERNS.some(p => p.test(line));
    if (!isError) continue;
    // Check if the error is related to any of our resources
    const isRelevant = resources.length === 0 || resources.some(r => line.includes(r));
    if (isRelevant) {
      errorLines.push(line);
    }
  }

  return errorLines;
}
