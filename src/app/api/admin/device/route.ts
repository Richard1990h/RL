import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  generateDeviceToken,
  getDeviceId,
  setDeviceCookie,
  isDeviceAllowed,
  createDeviceRequest,
  getRequestById,
  getPendingRequests,
  cleanupOldRequests,
} from "@/lib/device-auth";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !user.isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  cleanupOldRequests();

  const requestId = req.nextUrl.searchParams.get("requestId");

  // Poll a specific request status (from the requesting device)
  if (requestId) {
    const request = getRequestById(requestId);
    if (!request) {
      return NextResponse.json({ status: "not_found" });
    }
    if (request.status === "approved") {
      // Generate token and set cookie on this device
      const token = generateDeviceToken();
      await setDeviceCookie(token);
      return NextResponse.json({
        status: "approved",
        token,
        message: "Device approved! Add this token to ALLOWED_DEVICE_IDS in .env.",
      });
    }
    if (request.status === "denied") {
      return NextResponse.json({ status: "denied" });
    }
    return NextResponse.json({ status: "pending" });
  }

  // Default: return device info + pending requests (for admin view)
  const deviceId = await getDeviceId();
  const allowed = await isDeviceAllowed();
  const pendingRequests = getPendingRequests();

  return NextResponse.json({
    hasToken: !!deviceId,
    fullToken: deviceId || null,
    tokenPreview: deviceId ? deviceId.substring(0, 8) + "..." : null,
    isAllowed: allowed,
    pendingRequests,
  });
}

// POST — create a pending device registration request
export async function POST() {
  const user = await getCurrentUser();
  if (!user || !user.isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const request = await createDeviceRequest();

  return NextResponse.json({
    requestId: request.id,
    status: "pending",
    message: "Request submitted. Waiting for admin approval on an authorized device.",
  });
}
