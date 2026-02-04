import { NextRequest, NextResponse } from "next/server";
import { requireOwnerWithDevice } from "@/lib/auth";
import { bridgeFetch } from "@/lib/bridge-proxy";

export async function POST(req: NextRequest) {
  try {
    await requireOwnerWithDevice();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const result = await bridgeFetch("/api/send", {
    method: "POST",
    body,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: "Bridge unavailable" },
      { status: 502 }
    );
  }
  return NextResponse.json(result.data);
}
