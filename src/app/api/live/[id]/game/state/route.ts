import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { addGameStateListener, removeGameStateListener, getGameEngine } from "@/lib/games/game-state-manager";

// GET - SSE stream of game state updates
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
      addGameStateListener(streamId, userId, controller);

      // Send current game state immediately if a game is active
      const engine = getGameEngine(streamId);
      if (engine) {
        const state = engine.currentState;
        const payload = `event: game-state\ndata: ${JSON.stringify(state)}\nid: ${Date.now()}\n\n`;
        controller.enqueue(new TextEncoder().encode(payload));
      }

      // Heartbeat
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(`: heartbeat\n\n`));
        } catch {
          clearInterval(heartbeat);
          removeGameStateListener(streamId, userId);
        }
      }, 15000);

      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        removeGameStateListener(streamId, userId);
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
