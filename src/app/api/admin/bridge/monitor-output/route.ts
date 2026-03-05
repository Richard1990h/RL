import { NextResponse } from "next/server";
import { requireOwnerWithDevice } from "@/lib/auth";
import { bridgeFetch } from "@/lib/bridge-proxy";

export async function GET() {
  try {
    await requireOwnerWithDevice();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await bridgeFetch("/api/monitor-output");
  if (!result.ok) {
    return NextResponse.json(result.data || { error: "Bridge unavailable" }, { status: result.status });
  }
  return NextResponse.json(result.data);
}
