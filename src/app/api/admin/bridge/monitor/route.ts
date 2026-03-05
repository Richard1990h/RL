import { NextRequest, NextResponse } from "next/server";
import { requireOwnerWithDevice } from "@/lib/auth";
import { bridgeFetch } from "@/lib/bridge-proxy";

export async function POST(req: NextRequest) {
  try {
    await requireOwnerWithDevice();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await bridgeFetch("/api/monitor", {
    method: "POST",
    body,
  });
  if (!result.ok) {
    return NextResponse.json(
      result.data || { error: "Bridge unavailable" },
      { status: result.status }
    );
  }
  return NextResponse.json(result.data);
}
