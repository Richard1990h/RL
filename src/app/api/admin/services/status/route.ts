import { NextResponse } from "next/server";
import { requireOwnerWithDevice } from "@/lib/auth";
import { bridgeFetch } from "@/lib/bridge-proxy";

interface ServiceState {
  ok: boolean;
  detail: string;
}

async function checkUrl(url: string): Promise<ServiceState> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    return {
      ok: res.ok || (res.status >= 200 && res.status < 500),
      detail: `HTTP ${res.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : "unreachable",
    };
  }
}

export async function GET() {
  try {
    await requireOwnerWithDevice();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const website = await checkUrl("http://127.0.0.1:4500/");
  const bridgePing = await bridgeFetch("/");
  const bridge: ServiceState = bridgePing.ok
    ? { ok: true, detail: `HTTP ${bridgePing.status}` }
    : { ok: false, detail: bridgePing.data?.error || `HTTP ${bridgePing.status}` };

  const watchdog = await checkUrl("http://127.0.0.1:9877/api/status");
  let cloudflare: ServiceState = { ok: false, detail: "watchdog unavailable" };
  let watchdogSummary: unknown = null;

  if (watchdog.ok) {
    try {
      const wdRes = await fetch("http://127.0.0.1:9877/api/status", { cache: "no-store" });
      watchdogSummary = await wdRes.json();
      const services = (watchdogSummary as { services?: Record<string, { status?: string }> }).services || {};
      const cfStatus = services.cloudflare?.status || "unknown";
      cloudflare = {
        ok: cfStatus === "running",
        detail: `watchdog=${cfStatus}`,
      };
    } catch {
      cloudflare = { ok: false, detail: "status parse failed" };
    }
  }

  return NextResponse.json({
    ok: website.ok && bridge.ok && watchdog.ok && cloudflare.ok,
    services: {
      website,
      bridge,
      watchdog,
      cloudflare,
    },
    watchdogSummary,
    checkedAt: new Date().toISOString(),
  });
}
