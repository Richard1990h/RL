import { NextResponse } from "next/server";
import { requireOwnerWithDevice } from "@/lib/auth";
import { bridgeFetch } from "@/lib/bridge-proxy";

export async function POST() {
  try {
    await requireOwnerWithDevice();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await bridgeFetch("/api/disconnect", { method: "POST" });
  if (!result.ok) {
    return NextResponse.json(
      result.data || { error: "Bridge unavailable" },
      { status: result.status }
    );
  }
  return NextResponse.json(result.data);
}
