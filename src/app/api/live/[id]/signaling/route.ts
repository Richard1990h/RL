import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

// In-memory store of active SSE connections per stream
const streamConnections = new Map<string, Map<string, ReadableStreamDefaultController>>();

// Clean up stale connections periodically
function getStreamRoom(streamId: string): Map<string, ReadableStreamDefaultController> {
  if (!streamConnections.has(streamId)) {
    streamConnections.set(streamId, new Map());
  }
  return streamConnections.get(streamId)!;
}

function broadcast(streamId: string, event: string, data: unknown, excludeUserId?: string) {
  const room = streamConnections.get(streamId);
  if (!room) return;

  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\nid: ${Date.now()}\n\n`;

  room.forEach((controller, userId) => {
    if (userId === excludeUserId) return;
    try {
      controller.enqueue(new TextEncoder().encode(payload));
    } catch {
      // Connection closed, remove it
      room.delete(userId);
    }
  });
}

// GET - SSE endpoint for receiving signals
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: streamId } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = user.id;

  const stream = new ReadableStream({
    start(controller) {
      const room = getStreamRoom(streamId);

      // Close existing connection from same user
      const existing = room.get(userId);
      if (existing) {
        try { existing.close(); } catch {}
      }

      room.set(userId, controller);

      // Send connected event
      const connectPayload = `event: message\ndata: ${JSON.stringify({ type: "connected", userId })}\nid: ${Date.now()}\n\n`;
      controller.enqueue(new TextEncoder().encode(connectPayload));

      // Notify others that this user joined
      broadcast(streamId, "message", {
        type: "join",
        from: userId,
        payload: { userId },
      }, userId);

      // Send heartbeat every 15s
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(`: heartbeat\n\n`));
        } catch {
          clearInterval(heartbeat);
          room.delete(userId);
        }
      }, 15000);

      // Cleanup on close
      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        room.delete(userId);

        // Notify others that this user left
        broadcast(streamId, "message", {
          type: "leave",
          from: userId,
          payload: { userId },
        });

        // Clean up empty rooms
        if (room.size === 0) {
          streamConnections.delete(streamId);
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// POST - Send a signal to other peers
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
  const { type, to, payload } = body;
  const from = user.id; // Always use authenticated user, never trust client

  if (!type) {
    return NextResponse.json({ error: "Missing type" }, { status: 400 });
  }

  const room = streamConnections.get(streamId);
  if (!room) {
    return NextResponse.json({ error: "Stream not found" }, { status: 404 });
  }

  if (to) {
    // Send to specific peer
    const controller = room.get(to);
    if (controller) {
      const msg = `event: message\ndata: ${JSON.stringify({ type, from, to, payload })}\nid: ${Date.now()}\n\n`;
      try {
        controller.enqueue(new TextEncoder().encode(msg));
      } catch {
        room.delete(to);
      }
    }
  } else {
    // Broadcast to all except sender
    broadcast(streamId, "message", { type, from, to, payload }, from);
  }

  return NextResponse.json({ ok: true });
}
