import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { consumeChallenge } from "./challenge/route";
import { requireOwnerWithDevice } from "@/lib/auth";

// ─── Key Derivation (shared with Python tool + challenge route) ───
const SALT = "rally-live-device-auth-v1";
const ITERATIONS = 100_000;
const KEY_LEN = 32;

function deriveKey(): Buffer {
  const secret = process.env.BRIDGE_SECRET;
  if (!secret) throw new Error("BRIDGE_SECRET not configured");
  return crypto.pbkdf2Sync(secret, SALT, ITERATIONS, KEY_LEN, "sha256");
}

// ─── AES-256-GCM decrypt/encrypt ─────────────────────────────────
function decrypt(key: Buffer, data: string): string {
  const raw = Buffer.from(data, "base64");
  const nonce = raw.subarray(0, 12);
  const tag = raw.subarray(raw.length - 16);
  const ciphertext = raw.subarray(12, raw.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

function encrypt(key: Buffer, plaintext: string): string {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([nonce, encrypted, tag]).toString("base64");
}

// ─── .env helpers ─────────────────────────────────────────────────
const ENV_PATH = path.join(process.cwd(), ".env");

function readAllowedDevices(): string[] {
  const raw = process.env.ALLOWED_DEVICE_IDS || "";
  return raw.split(",").map((t) => t.trim()).filter(Boolean);
}

function updateEnvDeviceIds(tokens: string[]) {
  const envContent = fs.readFileSync(ENV_PATH, "utf-8");
  const newValue = tokens.join(",");
  const updated = envContent.replace(
    /^ALLOWED_DEVICE_IDS=.*$/m,
    `ALLOWED_DEVICE_IDS="${newValue}"`
  );
  fs.writeFileSync(ENV_PATH, updated, "utf-8");
  // Also update the in-memory value so subsequent reads are consistent
  process.env.ALLOWED_DEVICE_IDS = newValue;
}

// ─── .device-requests.json helpers ────────────────────────────────
const REQUESTS_FILE = path.join(process.cwd(), ".device-requests.json");

interface DeviceRequest {
  id: string;
  userAgent: string;
  ip: string;
  timestamp: string;
  status: "pending" | "approved" | "denied";
}

function readRequests(): DeviceRequest[] {
  try {
    if (!fs.existsSync(REQUESTS_FILE)) return [];
    return JSON.parse(fs.readFileSync(REQUESTS_FILE, "utf-8")) || [];
  } catch {
    return [];
  }
}

function writeRequests(requests: DeviceRequest[]) {
  fs.writeFileSync(
    REQUESTS_FILE,
    JSON.stringify(requests, null, 2),
    "utf-8"
  );
}

// ─── Command handlers ─────────────────────────────────────────────
type CommandResult = { success: boolean; message: string; data?: unknown };

function handleList(): CommandResult {
  const devices = readAllowedDevices();
  return {
    success: true,
    message: `${devices.length} authorized device(s)`,
    data: { devices },
  };
}

function handleAdd(args: { token?: string }): CommandResult {
  if (!args.token) {
    return { success: false, message: "Missing token argument" };
  }
  const devices = readAllowedDevices();
  if (devices.includes(args.token)) {
    return { success: false, message: "Token already authorized" };
  }
  devices.push(args.token);
  updateEnvDeviceIds(devices);
  return {
    success: true,
    message: "Device token added",
    data: { total: devices.length },
  };
}

function handleRemove(args: { token?: string }): CommandResult {
  if (!args.token) {
    return { success: false, message: "Missing token argument" };
  }
  const devices = readAllowedDevices();
  const idx = devices.indexOf(args.token);
  if (idx === -1) {
    return { success: false, message: "Token not found" };
  }
  devices.splice(idx, 1);
  updateEnvDeviceIds(devices);
  return {
    success: true,
    message: "Device token removed",
    data: { total: devices.length },
  };
}

function handlePending(): CommandResult {
  const requests = readRequests().filter((r) => r.status === "pending");
  return {
    success: true,
    message: `${requests.length} pending request(s)`,
    data: { requests },
  };
}

function handleApprove(args: { id?: string }): CommandResult {
  if (!args.id) {
    return { success: false, message: "Missing request id" };
  }
  const requests = readRequests();
  const idx = requests.findIndex((r) => r.id === args.id);
  if (idx === -1) {
    return { success: false, message: "Request not found" };
  }
  if (requests[idx].status !== "pending") {
    return {
      success: false,
      message: `Request already ${requests[idx].status}`,
    };
  }
  requests[idx].status = "approved";
  writeRequests(requests);

  // Generate a new device token and add to allowed list
  const newToken = crypto.randomBytes(48).toString("base64url");
  const devices = readAllowedDevices();
  devices.push(newToken);
  updateEnvDeviceIds(devices);

  return {
    success: true,
    message: "Request approved, new device token generated",
    data: { token: newToken, requestId: args.id },
  };
}

function handleDeny(args: { id?: string }): CommandResult {
  if (!args.id) {
    return { success: false, message: "Missing request id" };
  }
  const requests = readRequests();
  const idx = requests.findIndex((r) => r.id === args.id);
  if (idx === -1) {
    return { success: false, message: "Request not found" };
  }
  if (requests[idx].status !== "pending") {
    return {
      success: false,
      message: `Request already ${requests[idx].status}`,
    };
  }
  requests[idx].status = "denied";
  writeRequests(requests);
  return { success: true, message: "Request denied" };
}

// ─── POST /api/admin/device-tool ──────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    await requireOwnerWithDevice();

    const body = await req.json();
    const { data: encryptedData } = body;

    if (!encryptedData) {
      return NextResponse.json(
        { error: "Missing encrypted data" },
        { status: 400 }
      );
    }

    const key = deriveKey();

    // Decrypt the payload
    let payload: {
      challenge: string;
      timestamp: number;
      command: string;
      args?: Record<string, string>;
    };
    try {
      payload = JSON.parse(decrypt(key, encryptedData));
    } catch {
      return NextResponse.json(
        { error: "Decryption failed" },
        { status: 403 }
      );
    }

    // Validate timestamp (within 30s)
    if (
      !payload.timestamp ||
      Math.abs(Date.now() - payload.timestamp) > 30_000
    ) {
      return NextResponse.json(
        { error: "Request expired" },
        { status: 403 }
      );
    }

    // Validate and consume one-time challenge token
    if (!payload.challenge || !consumeChallenge(payload.challenge)) {
      return NextResponse.json(
        { error: "Invalid or expired challenge" },
        { status: 403 }
      );
    }

    // Execute command
    const args = payload.args || {};
    let result: CommandResult;

    switch (payload.command) {
      case "list":
        result = handleList();
        break;
      case "add":
        result = handleAdd(args);
        break;
      case "remove":
        result = handleRemove(args);
        break;
      case "pending":
        result = handlePending();
        break;
      case "approve":
        result = handleApprove(args);
        break;
      case "deny":
        result = handleDeny(args);
        break;
      default:
        result = { success: false, message: `Unknown command: ${payload.command}` };
    }

    // Encrypt the response
    const encryptedResponse = encrypt(key, JSON.stringify(result));
    return NextResponse.json({ data: encryptedResponse });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (message === "Forbidden" || message === "Device not allowed") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[device-tool] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
