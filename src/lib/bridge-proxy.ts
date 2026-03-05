const BRIDGE_URL = process.env.BRIDGE_URL || "http://localhost:9876";
const BRIDGE_SECRET = process.env.BRIDGE_SECRET || "";
if (!process.env.BRIDGE_SECRET) {
  console.warn("BRIDGE_SECRET environment variable not set — bridge calls will fail");
}

interface BridgeFetchOptions {
  method?: string;
  body?: unknown;
}

export async function bridgeFetch(path: string, options: BridgeFetchOptions = {}) {
  const { method = "GET", body } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch(`${BRIDGE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Bridge-Token": BRIDGE_SECRET,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: `Non-JSON response: ${text.substring(0, 200)}` };
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, status: 504, data: { error: "Bridge timeout" } };
    }
    return { ok: false, status: 502, data: { error: "Bridge unavailable" } };
  } finally {
    clearTimeout(timeout);
  }
}
