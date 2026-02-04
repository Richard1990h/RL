import { NextResponse } from "next/server";
import { requireOwnerWithDevice } from "@/lib/auth";
import { bridgeFetch } from "@/lib/bridge-proxy";

export async function GET() {
  try {
    await requireOwnerWithDevice();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await bridgeFetch("/api/windows");
  if (!result.ok) {
    return NextResponse.json(
      { error: "Bridge unavailable" },
      { status: 502 }
    );
  }
  return NextResponse.json(result.data);
}
