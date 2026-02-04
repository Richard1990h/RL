import { NextRequest, NextResponse } from "next/server";
import { requireOwnerWithDevice } from "@/lib/auth";
import { approveRequest, denyRequest } from "@/lib/device-auth";

export async function POST(req: NextRequest) {
  try {
    await requireOwnerWithDevice();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { requestId, action } = await req.json();
  if (!requestId || !action) {
    return NextResponse.json({ error: "Missing requestId or action" }, { status: 400 });
  }

  if (action === "approve") {
    const ok = approveRequest(requestId);
    return NextResponse.json({ ok, action: "approved" });
  }

  if (action === "deny") {
    const ok = denyRequest(requestId);
    return NextResponse.json({ ok, action: "denied" });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
