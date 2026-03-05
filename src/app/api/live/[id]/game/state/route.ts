import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { addGameStateListener, removeGameStateListener, getGameEngine } from "@/lib/games/game-state-manager";

// GET - SSE stream of game state updates
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: streamId } = await params;
  const overlayMode = request.nextUrl.searchParams.get("overlay") === "1";

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = user.id;

  const stream = new ReadableStream({
    start(controller) {
      addGameStateListener(streamId, userId, controller, overlayMode ? "overlay" : "full");

      // Send current game state immediately if a game is active
      const engine = getGameEngine(streamId);
      if (engine) {
        const state = engine.currentState;
        const eventName = overlayMode ? "game-frame" : "game-state";
        const payloadData = overlayMode
          ? {
              diff: {
                gameId: state.gameId,
                streamId: state.streamId,
                mode: state.mode,
                phase: state.phase,
                round: state.round,
                timeRemaining: state.timeRemaining,
                winner: state.winner,
                players: Object.fromEntries(
                  Object.entries(state.players).map(([id, p]) => [
                    id,
                    { score: p.score, isEliminated: p.isEliminated },
                  ])
                ),
                data: {
                  units: state.data.units ?? [],
                  baseHp: state.data.baseHp ?? {},
                  objectiveTowerOwnerId: state.data.objectiveTowerOwnerId ?? null,
                  lastEliminated: state.data.lastEliminated ?? null,
                },
                lastUpdate: state.lastUpdate,
              },
              ts: Date.now(),
            }
          : state;
        const payload = `event: ${eventName}\ndata: ${JSON.stringify(payloadData)}\nid: ${Date.now()}\n\n`;
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
