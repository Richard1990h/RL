import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getGameEngine, createGame, destroyGame } from "@/lib/games/game-state-manager";

// POST - Submit game actions (validated on server)
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
  const { action, mode, maxRounds, roundTimeSec, displayName } = body;

  // Handle game management actions
  if (action === "create_game") {
    if (!mode) {
      return NextResponse.json({ error: "Missing mode" }, { status: 400 });
    }
    const engine = createGame(
      streamId,
      mode,
      maxRounds || 5,
      roundTimeSec || 60
    );
    // Add the host as a player
    engine.addPlayer(user.id, displayName || user.displayName);
    return NextResponse.json({ gameId: engine.currentState.gameId });
  }

  if (action === "start_game") {
    const engine = getGameEngine(streamId);
    if (!engine) {
      return NextResponse.json({ error: "No active game" }, { status: 404 });
    }
    engine.start();
    return NextResponse.json({ status: "started" });
  }

  if (action === "end_game") {
    destroyGame(streamId);
    return NextResponse.json({ status: "ended" });
  }

  if (action === "join_game") {
    const engine = getGameEngine(streamId);
    if (!engine) {
      return NextResponse.json({ error: "No active game" }, { status: 404 });
    }
    const team = body.team as "A" | "B" | undefined;
    engine.addPlayer(user.id, displayName || user.displayName, team);
    return NextResponse.json({ status: "joined" });
  }

  if (action === "leave_game") {
    const engine = getGameEngine(streamId);
    if (!engine) {
      return NextResponse.json({ error: "No active game" }, { status: 404 });
    }
    engine.removePlayer(user.id);
    return NextResponse.json({ status: "left" });
  }

  // Handle game actions
  const engine = getGameEngine(streamId);
  if (!engine) {
    return NextResponse.json({ error: "No active game" }, { status: 404 });
  }

  const gameAction = {
    type: action,
    userId: user.id,
    payload: body.payload || {},
    timestamp: Date.now(),
  };

  const newState = engine.processAction(gameAction);
  return NextResponse.json({ state: newState });
}
