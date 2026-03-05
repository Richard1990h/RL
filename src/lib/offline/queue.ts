import { offlineDb } from "@/lib/offline/db";
import { getNetworkState } from "@/lib/offline/connectivity";
import { signQueuePayload } from "@/lib/offline/signature";
import type { OfflineQueueAction, QueueResult } from "@/lib/offline/types";

const MAX_ATTEMPTS = 7;

function makeId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function backoffMs(attempts: number): number {
  const base = Math.min(60_000, 1_000 * 2 ** attempts);
  const jitter = Math.round(Math.random() * 500);
  return base + jitter;
}

export function createIdempotencyKey(): string {
  return `idem_${makeId()}`;
}

export function createNonce(): string {
  return `nonce_${makeId()}`;
}

export async function enqueueHttpAction(input: {
  endpoint: string;
  method: string;
  body?: unknown;
  headers?: Record<string, string>;
  dependsOn?: string[];
  idempotencyKey?: string;
  operation?: OfflineQueueAction["operation"];
}): Promise<OfflineQueueAction> {
  const now = Date.now();
  const action: OfflineQueueAction = {
    id: `qa_${makeId()}`,
    kind: "http",
    operation: input.operation ?? "mutation",
    endpoint: input.endpoint,
    method: input.method,
    body: input.body,
    headers: input.headers,
    dependsOn: input.dependsOn,
    idempotencyKey: input.idempotencyKey ?? createIdempotencyKey(),
    nonce: createNonce(),
    attempts: 0,
    notBefore: now,
    createdAt: now,
    updatedAt: now,
    status: "queued",
  };
  action.signature = await signQueuePayload({
    idempotencyKey: action.idempotencyKey,
    nonce: action.nonce,
    endpoint: action.endpoint,
    method: action.method,
    body: action.body,
  });

  await offlineDb.putQueueAction(action);
  const all = await offlineDb.listQueueActions();
  const state = await offlineDb.getSyncState();
  await offlineDb.putSyncState({
    id: "singleton",
    online: state?.online ?? getNetworkState() === "online",
    inFlight: state?.inFlight ?? false,
    lastSyncAt: state?.lastSyncAt ?? 0,
    syncCursor: state?.syncCursor,
    minSupportedWebVersion: state?.minSupportedWebVersion,
    currentWebVersion: state?.currentWebVersion,
    queueDepth: all.length,
  });

  return action;
}

async function markActionRetry(action: OfflineQueueAction, reason: string): Promise<void> {
  const attempts = action.attempts + 1;
  const nextStatus: OfflineQueueAction["status"] = attempts >= MAX_ATTEMPTS ? "failed" : "queued";
  await offlineDb.putQueueAction({
    ...action,
    attempts,
    status: nextStatus,
    lastError: reason,
    notBefore: Date.now() + backoffMs(attempts),
    updatedAt: Date.now(),
  });
}

function canRun(action: OfflineQueueAction, all: OfflineQueueAction[]): boolean {
  if (action.notBefore > Date.now()) return false;
  if (!action.dependsOn || action.dependsOn.length === 0) return true;
  const pendingIds = new Set(all.map((a) => a.id));
  return action.dependsOn.every((dep) => !pendingIds.has(dep));
}

let processing = false;

async function updateUploadJobProgressFromAcceptedAction(action: OfflineQueueAction): Promise<void> {
  const jobs = await offlineDb.listUploadJobs();
  const job = jobs.find((item) =>
    item.createActionId === action.id
    || item.commitActionId === action.id
    || item.chunkActionIds.includes(action.id)
  );
  if (!job) return;

  if (job.createActionId === action.id) {
    await offlineDb.putUploadJob({ ...job, status: "syncing", updatedAt: Date.now() });
    return;
  }

  if (job.chunkActionIds.includes(action.id)) {
    const chunkIndex = typeof action.body === "object" && action.body && "chunkIndex" in action.body
      ? Number((action.body as { chunkIndex?: unknown }).chunkIndex)
      : -1;
    const completed = chunkIndex >= 0
      ? Array.from(new Set([...job.completedChunks, chunkIndex])).sort((a, b) => a - b)
      : job.completedChunks;
    await offlineDb.putUploadJob({
      ...job,
      status: "syncing",
      completedChunks: completed,
      updatedAt: Date.now(),
    });
    return;
  }

  if (job.commitActionId === action.id) {
    await offlineDb.putUploadJob({
      ...job,
      status: "completed",
      completedChunks: Array.from({ length: job.totalChunks }, (_, i) => i),
      updatedAt: Date.now(),
    });
    await offlineDb.deleteUploadBlob(job.uploadId);
  }
}

export async function processOfflineQueue(): Promise<QueueResult> {
  if (processing || typeof window === "undefined") {
    return { accepted: [], rejected: [] };
  }
  if (getNetworkState() !== "online") {
    return { accepted: [], rejected: [] };
  }

  processing = true;
  const accepted: string[] = [];
  const rejected: Array<{ id: string; reason: string }> = [];

  try {
    const actions = await offlineDb.listQueueActions();
    const runnable = actions
      .filter((a) => a.kind === "http" && a.status !== "failed")
      .filter((a) => canRun(a, actions))
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, 50);

    if (runnable.length === 0) {
      return { accepted, rejected };
    }

    const payload = {
      actions: runnable.map((a) => ({
        id: a.id,
        endpoint: a.endpoint,
        method: a.method,
        headers: a.headers,
        body: a.body,
        idempotencyKey: a.idempotencyKey,
        nonce: a.nonce,
        signature: a.signature,
      })),
    };

    const res = await fetch("/api/sync/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      for (const action of runnable) {
        await markActionRetry(action, `sync_batch_http_${res.status}`);
      }
      return { accepted, rejected };
    }

    const data = await res.json() as {
      results: Array<{ id: string; status: "accepted" | "rejected"; reason?: string }>;
      syncCursor?: string;
    };

    for (const result of data.results ?? []) {
      const action = runnable.find((a) => a.id === result.id);
      if (!action) continue;

      if (result.status === "accepted") {
        await offlineDb.deleteQueueAction(action.id);
        await updateUploadJobProgressFromAcceptedAction(action);
        accepted.push(action.id);
      } else {
        await markActionRetry(action, result.reason ?? "rejected_by_server");
        rejected.push({ id: action.id, reason: result.reason ?? "rejected_by_server" });
      }
    }

    const remaining = await offlineDb.listQueueActions();
    const state = await offlineDb.getSyncState();
    await offlineDb.putSyncState({
      id: "singleton",
      online: true,
      inFlight: false,
      lastSyncAt: Date.now(),
      queueDepth: remaining.length,
      syncCursor: data.syncCursor ?? state?.syncCursor,
      minSupportedWebVersion: state?.minSupportedWebVersion,
      currentWebVersion: state?.currentWebVersion,
    });

    return { accepted, rejected };
  } finally {
    processing = false;
  }
}
