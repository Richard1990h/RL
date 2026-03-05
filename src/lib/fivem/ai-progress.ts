/**
 * In-memory store for AI progress. Persists as long as the Next.js server is running.
 * Dashboard polls this to show live Claude output.
 * Uses globalThis to survive Next.js dev-mode hot reloads (same pattern as Prisma).
 */

export type AiProgressEntry = {
  id: string;           // bug or suggestion ID
  kind: "bug" | "suggestion";
  action: string;       // investigate, fix, verify, analyze, implement
  status: "running" | "done" | "error";
  output: string;       // accumulated stdout so far
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
};

const globalForAiProgress = globalThis as unknown as {
  __aiProgressStore?: Map<string, AiProgressEntry>;
};
if (!globalForAiProgress.__aiProgressStore) {
  globalForAiProgress.__aiProgressStore = new Map();
}
const store = globalForAiProgress.__aiProgressStore;

export function setAiProgress(key: string, entry: AiProgressEntry) {
  store.set(key, entry);
}

export function getAiProgress(key: string): AiProgressEntry | null {
  return store.get(key) ?? null;
}

export function appendAiOutput(key: string, chunk: string) {
  const entry = store.get(key);
  if (entry) {
    entry.output += chunk;
    entry.updatedAt = new Date().toISOString();
  }
}

export function finishAiProgress(key: string, status: "done" | "error") {
  const entry = store.get(key);
  if (entry) {
    entry.status = status;
    entry.finishedAt = new Date().toISOString();
    entry.updatedAt = new Date().toISOString();
  }
}

/** Get all active (running) entries */
export function getActiveAiJobs(): AiProgressEntry[] {
  return [...store.values()].filter((e) => e.status === "running");
}

/** Check if an AI job is stale (running but no update for 5+ minutes, or has no output) */
export function isAiProgressStale(key: string): boolean {
  const entry = store.get(key);
  if (!entry) return true; // no entry = stale
  if (entry.status !== "running") return false; // done/error = not stale, just finished
  const elapsed = Date.now() - new Date(entry.updatedAt).getTime();
  return elapsed > 5 * 60 * 1000; // 5 minutes with no update
}

/** Remove a stale entry */
export function removeAiProgress(key: string) {
  store.delete(key);
}

/** Clean up old entries (older than 1 hour) */
export function cleanupOldEntries() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [key, entry] of store.entries()) {
    if (new Date(entry.updatedAt).getTime() < cutoff) {
      store.delete(key);
    }
  }
}
