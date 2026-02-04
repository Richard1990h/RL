import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

// In-memory store for latest video frames + audio per stream
// Key: streamId, Value: { data: base64 JPEG, audio?: base64 webm audio chunk, updatedAt: timestamp }
const frameStore = new Map<string, { data: string; audio?: string; updatedAt: number }>();

// Cleanup frames older than 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [id, frame] of frameStore) {
    if (now - frame.updatedAt > 60_000) {
      frameStore.delete(id);
    }
  }
}, 30_000);

// GET: Retrieve latest frame + audio for a stream
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const frame = frameStore.get(id);

    if (!frame) {
      return NextResponse.json({ frame: null, audio: null, updatedAt: 0 });
    }

    return NextResponse.json({
      frame: frame.data,
      audio: frame.audio || null,
      updatedAt: frame.updatedAt,
    });
  } catch (error) {
    console.error("GET /api/live/[id]/frame error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST: Upload a new frame + optional audio (host only)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { frame, audio } = body;

    if (!frame || typeof frame !== "string") {
      return NextResponse.json({ error: "frame (base64 string) is required" }, { status: 400 });
    }

    // Limit frame size to ~500KB
    if (frame.length > 700_000) {
      return NextResponse.json({ error: "Frame too large" }, { status: 413 });
    }

    // Limit audio chunk to ~200KB
    if (audio && typeof audio === "string" && audio.length > 300_000) {
      return NextResponse.json({ error: "Audio chunk too large" }, { status: 413 });
    }

    frameStore.set(id, {
      data: frame,
      audio: (audio && typeof audio === "string") ? audio : undefined,
      updatedAt: Date.now(),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/live/[id]/frame error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
