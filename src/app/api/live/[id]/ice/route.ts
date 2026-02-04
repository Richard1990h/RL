import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

// POST - Relay ICE candidates between peers
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: streamId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { from, to, candidate } = body;

  if (!from || !to || !candidate) {
    return NextResponse.json({ error: "Missing from, to, or candidate" }, { status: 400 });
  }

  // Forward the ICE candidate via the signaling channel
  const response = await fetch(
    new URL(`/api/live/${streamId}/signaling`, request.url),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: request.headers.get("cookie") || "",
      },
      body: JSON.stringify({
        type: "ice-candidate",
        from,
        to,
        payload: candidate,
      }),
    }
  );

  if (!response.ok) {
    return NextResponse.json({ error: "Failed to relay ICE candidate" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
