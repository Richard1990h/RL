function toHex(buffer: ArrayBuffer): string {
  const view = new Uint8Array(buffer);
  return Array.from(view).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashString(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return toHex(digest);
}

export async function signQueuePayload(input: {
  idempotencyKey: string;
  nonce: string;
  endpoint: string;
  method: string;
  body?: unknown;
}): Promise<string> {
  const base = `${input.idempotencyKey}|${input.nonce}|${input.method.toUpperCase()}|${input.endpoint}|${JSON.stringify(input.body ?? null)}`;
  return hashString(base);
}
