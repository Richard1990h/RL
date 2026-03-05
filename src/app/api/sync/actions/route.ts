import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { signQueuePayloadServer } from "@/lib/offline/server-signature";

type SyncAction = {
  id: string;
  endpoint: string;
  method: string;
  headers?: Record<string, string>;
  body?: unknown;
  idempotencyKey: string;
  nonce: string;
  signature?: string;
};

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

const globalState = globalThis as unknown as {
  rallySyncIdempotency?: Map<string, number>;
  rallySyncNonce?: Map<string, number>;
};

if (!globalState.rallySyncIdempotency) {
  globalState.rallySyncIdempotency = new Map<string, number>();
}
if (!globalState.rallySyncNonce) {
  globalState.rallySyncNonce = new Map<string, number>();
}

const METHOD_ALLOWLIST = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const ENDPOINT_ALLOWLIST = [
  /^\/api\/videos\/.+\/like$/,
  /^\/api\/videos\/.+\/comments$/,
  /^\/api\/videos\/.+\/comments\/.+\/like$/,
  /^\/api\/videos\/.+$/,
  /^\/api\/users\/.+\/follow$/,
  /^\/api\/users\/.+\/block$/,
  /^\/api\/messages$/,
  /^\/api\/live\/.+\/chat$/,
  /^\/api\/live\/.+$/,
  /^\/api\/series\/.+$/,
  /^\/api\/series$/,
  /^\/api\/users\/.+$/,
  /^\/api\/upload\/session$/,
  /^\/api\/upload\/chunk-json$/,
  /^\/api\/upload\/complete$/,
];

function isAllowedEndpoint(endpoint: string): boolean {
  if (!endpoint.startsWith("/api/")) return false;
  if (endpoint.startsWith("/api/sync/")) return false;
  return ENDPOINT_ALLOWLIST.some((rule) => rule.test(endpoint));
}

function cleanupExpiredMaps(now: number) {
  for (const [key, ts] of globalState.rallySyncIdempotency!.entries()) {
    if (now - ts > IDEMPOTENCY_TTL_MS) globalState.rallySyncIdempotency!.delete(key);
  }
  for (const [key, ts] of globalState.rallySyncNonce!.entries()) {
    if (now - ts > IDEMPOTENCY_TTL_MS) globalState.rallySyncNonce!.delete(key);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth();

    const body = await request.json().catch(() => null) as { actions?: SyncAction[] } | null;
    if (!body?.actions || !Array.isArray(body.actions)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const now = Date.now();
    cleanupExpiredMaps(now);

    const results: Array<{ id: string; status: "accepted" | "rejected"; reason?: string }> = [];
    const cookie = request.headers.get("cookie") ?? "";

    for (const action of body.actions.slice(0, 50)) {
      if (!action?.id || !action.endpoint || !action.method) {
        results.push({ id: action?.id ?? "unknown", status: "rejected", reason: "invalid_action" });
        continue;
      }

      const method = action.method.toUpperCase();
      if (!METHOD_ALLOWLIST.has(method)) {
        results.push({ id: action.id, status: "rejected", reason: "method_not_allowed" });
        continue;
      }

      if (!isAllowedEndpoint(action.endpoint)) {
        results.push({ id: action.id, status: "rejected", reason: "endpoint_not_allowed" });
        continue;
      }

      if (!action.idempotencyKey || !action.nonce) {
        results.push({ id: action.id, status: "rejected", reason: "missing_nonce_or_idempotency" });
        continue;
      }

      const expectedSignature = signQueuePayloadServer({
        idempotencyKey: action.idempotencyKey,
        nonce: action.nonce,
        endpoint: action.endpoint,
        method,
        body: action.body,
      });

      if (!action.signature || action.signature !== expectedSignature) {
        results.push({ id: action.id, status: "rejected", reason: "invalid_signature" });
        continue;
      }

      const idemKey = `${action.idempotencyKey}:${action.endpoint}:${method}`;
      if (globalState.rallySyncIdempotency!.has(idemKey)) {
        results.push({ id: action.id, status: "accepted" });
        continue;
      }

      if (globalState.rallySyncNonce!.has(action.nonce)) {
        results.push({ id: action.id, status: "rejected", reason: "nonce_replay_detected" });
        continue;
      }

      const origin = new URL(request.url).origin;
      const endpointUrl = new URL(action.endpoint, origin).toString();

      const relayRes = await fetch(endpointUrl, {
        method,
        headers: {
          "Content-Type": "application/json",
          cookie,
          ...(action.headers ?? {}),
        },
        body: method === "GET" ? undefined : JSON.stringify(action.body ?? {}),
        cache: "no-store",
      });

      if (!relayRes.ok) {
        results.push({ id: action.id, status: "rejected", reason: `relay_http_${relayRes.status}` });
        continue;
      }

      globalState.rallySyncIdempotency!.set(idemKey, now);
      globalState.rallySyncNonce!.set(action.nonce, now);
      results.push({ id: action.id, status: "accepted" });
    }

    return NextResponse.json({
      results,
      serverTruth: { processedAt: new Date().toISOString() },
      syncCursor: String(now),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
