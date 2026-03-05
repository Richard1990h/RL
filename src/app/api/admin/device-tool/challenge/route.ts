import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireOwnerWithDevice } from "@/lib/auth";

// ─── Key Derivation (shared with Python tool) ─────────────────────
const SALT = "rally-live-device-auth-v1";
const ITERATIONS = 100_000;
const KEY_LEN = 32;

function deriveKey(): Buffer {
  const secret = process.env.BRIDGE_SECRET;
  if (!secret) throw new Error("BRIDGE_SECRET not configured");
  return crypto.pbkdf2Sync(secret, SALT, ITERATIONS, KEY_LEN, "sha256");
}

// ─── In-memory challenge store ─────────────────────────────────────
interface ChallengeEntry {
  token: string;
  expires: number;
}

const challengeStore = new Map<string, ChallengeEntry>();

// Cleanup expired challenges
function cleanupChallenges() {
  const now = Date.now();
  for (const [key, entry] of challengeStore) {
    if (now > entry.expires) challengeStore.delete(key);
  }
}

export function consumeChallenge(token: string): boolean {
  cleanupChallenges();
  for (const [key, entry] of challengeStore) {
    if (entry.token === token && Date.now() <= entry.expires) {
      challengeStore.delete(key);
      return true;
    }
  }
  return false;
}

// ─── AES-256-GCM encrypt ──────────────────────────────────────────
function encrypt(key: Buffer, plaintext: string): string {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  // wire format: base64(nonce + ciphertext + tag)
  return Buffer.concat([nonce, encrypted, tag]).toString("base64");
}

// ─── POST /api/admin/device-tool/challenge ────────────────────────
export async function POST(req: NextRequest) {
  try {
    await requireOwnerWithDevice();

    const body = await req.json();
    const { timestamp, hmac: clientHmac } = body;

    if (!timestamp || !clientHmac) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const key = deriveKey();

    // Validate HMAC: client signs the timestamp string with derived key
    const expectedHmac = crypto
      .createHmac("sha256", key)
      .update(String(timestamp))
      .digest("hex");

    if (
      !crypto.timingSafeEqual(
        Buffer.from(clientHmac, "hex"),
        Buffer.from(expectedHmac, "hex")
      )
    ) {
      return NextResponse.json(
        { error: "Authentication failed" },
        { status: 403 }
      );
    }

    // Validate timestamp freshness (within 30s)
    const tsMs =
      typeof timestamp === "number" ? timestamp : parseInt(timestamp, 10);
    if (isNaN(tsMs) || Math.abs(Date.now() - tsMs) > 30_000) {
      return NextResponse.json(
        { error: "Request expired" },
        { status: 403 }
      );
    }

    // Generate one-time challenge token
    cleanupChallenges();
    const challengeToken = crypto.randomUUID();
    const challengeId = crypto.randomBytes(8).toString("hex");
    challengeStore.set(challengeId, {
      token: challengeToken,
      expires: Date.now() + 60_000, // 60 second TTL
    });

    // Encrypt the challenge token and return
    const encryptedChallenge = encrypt(
      key,
      JSON.stringify({ challenge: challengeToken })
    );

    return NextResponse.json({ data: encryptedChallenge });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (message === "Forbidden" || message === "Device not allowed") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[device-tool/challenge] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
