import { createHash } from "crypto";

export function signQueuePayloadServer(input: {
  idempotencyKey: string;
  nonce: string;
  endpoint: string;
  method: string;
  body?: unknown;
}): string {
  const base = `${input.idempotencyKey}|${input.nonce}|${input.method.toUpperCase()}|${input.endpoint}|${JSON.stringify(input.body ?? null)}`;
  return createHash("sha256").update(base).digest("hex");
}
