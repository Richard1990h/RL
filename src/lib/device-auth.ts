import { cookies, headers } from "next/headers";
import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";

const DEVICE_COOKIE = "rally_device_id";

const REQUESTS_FILE = path.join(process.cwd(), ".device-requests.json");

export interface DeviceRequest {
  id: string;
  userAgent: string;
  ip: string;
  timestamp: string;
  status: "pending" | "approved" | "denied";
}

export function generateDeviceToken(): string {
  return randomBytes(48).toString("base64url");
}

export async function getDeviceId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(DEVICE_COOKIE)?.value || null;
}

export async function setDeviceCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 365 * 24 * 60 * 60, // 1 year
    path: "/",
  });
}

export async function isDeviceAllowed(): Promise<boolean> {
  // Read env fresh every call (not cached at module level)
  const allowedIds = process.env.ALLOWED_DEVICE_IDS || "";

  const allowed = allowedIds.split(",").map((t) => t.trim()).filter(Boolean);

  // If no devices are configured, deny all access (secure by default)
  if (allowed.length === 0) return false;

  const deviceId = await getDeviceId();
  if (!deviceId) return false;

  return allowed.includes(deviceId);
}

// ─── Pending request management ────────────────────────────────────

function readRequests(): DeviceRequest[] {
  try {
    if (!fs.existsSync(REQUESTS_FILE)) return [];
    return JSON.parse(fs.readFileSync(REQUESTS_FILE, "utf-8")) || [];
  } catch {
    return [];
  }
}

function writeRequests(requests: DeviceRequest[]) {
  fs.writeFileSync(REQUESTS_FILE, JSON.stringify(requests, null, 2), "utf-8");
}

export async function createDeviceRequest(): Promise<DeviceRequest> {
  const hdrs = await headers();
  const ua = hdrs.get("user-agent") || "Unknown";
  const ip = hdrs.get("x-forwarded-for") || hdrs.get("x-real-ip") || "Unknown";

  const request: DeviceRequest = {
    id: randomBytes(16).toString("hex"),
    userAgent: ua,
    ip,
    timestamp: new Date().toISOString(),
    status: "pending",
  };

  const requests = readRequests();
  // Remove old pending requests from same UA (re-registration)
  const filtered = requests.filter(
    (r) => !(r.userAgent === ua && r.status === "pending")
  );
  filtered.push(request);
  writeRequests(filtered);

  return request;
}

export function getPendingRequests(): DeviceRequest[] {
  return readRequests().filter((r) => r.status === "pending");
}

export function getRequestById(id: string): DeviceRequest | null {
  return readRequests().find((r) => r.id === id) || null;
}

export function approveRequest(id: string): boolean {
  const requests = readRequests();
  const idx = requests.findIndex((r) => r.id === id);
  if (idx === -1 || requests[idx].status !== "pending") return false;
  requests[idx].status = "approved";
  writeRequests(requests);
  return true;
}

export function denyRequest(id: string): boolean {
  const requests = readRequests();
  const idx = requests.findIndex((r) => r.id === id);
  if (idx === -1 || requests[idx].status !== "pending") return false;
  requests[idx].status = "denied";
  writeRequests(requests);
  return true;
}

export function cleanupOldRequests() {
  const requests = readRequests();
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const filtered = requests.filter((r) => {
    const ts = new Date(r.timestamp).getTime();
    // Keep non-pending requests less than 1 hour old
    if (r.status !== "pending") return ts > oneHourAgo;
    // Keep pending requests less than 1 day old (then abandon them)
    return ts > oneDayAgo;
  });
  if (filtered.length !== requests.length) writeRequests(filtered);
}
