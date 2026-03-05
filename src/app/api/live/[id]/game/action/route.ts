import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
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
  const liveStream = await prisma.liveStream.findUnique({
    where: { id: streamId },
    select: { id: true, hostId: true, status: true },
  });
  if (!liveStream) {
    return NextResponse.json({ error: "Stream not found" }, { status: 404 });
  }
  const isHost = liveStream.hostId === user.id;
  const participant = await prisma.liveParticipant.findUnique({
    where: { liveStreamId_userId: { liveStreamId: streamId, userId: user.id } },
    select: { role: true, status: true },
  });
  const isApprovedGuest = participant?.role === "GUEST" && participant?.status === "ACTIVE";

  const hostOnlyActions = new Set(["create_game", "start_game", "end_game"]);
  if (hostOnlyActions.has(String(action)) && !isHost) {
    return NextResponse.json({ error: "Only the creator host can mutate live session/game control state" }, { status: 403 });
  }

  // Handle game management actions
  if (action === "create_game") {
    if (!mode) {
      return NextResponse.json({ error: "Missing mode" }, { status: 400 });
    }

    // Validate inputs
    const validatedMaxRounds = Math.max(1, Math.min(20, parseInt(maxRounds) || 5));
    const validatedRoundTime = Math.max(10, Math.min(300, parseInt(roundTimeSec) || 60));

    // Fetch stream config from DB
    const stream = await prisma.liveStream.findUnique({
      where: { id: streamId },
      select: { hostId: true, hostCutPercent: true, roundTimeSec: true },
    });

    if (!stream) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    }

    const engine = createGame(
      streamId,
      mode,
      validatedMaxRounds,
      validatedRoundTime,
      {
        hostCutPercent: stream.hostCutPercent,
        hostId: stream.hostId,
      }
    );
    // Add the host as a player
    engine.addPlayer(user.id, displayName || user.displayName);
    // Tower Wars: initialize base HP for the host
    if (mode === "tower_wars") {
      const s = engine.currentState;
      const hp = (s.data.baseHp as Record<string, number>) || {};
      const isSingleTower = Boolean(s.data.v1SingleTower);
      const objectiveId = String(s.data.objectiveTowerOwnerId || user.id);
      if (isSingleTower) {
        hp[objectiveId] = (s.data.maxBaseHp as number) || 1000;
      } else {
        hp[user.id] = (s.data.maxBaseHp as number) || 1000;
      }
      s.data.baseHp = hp;
    }
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
    if (!isHost && !isApprovedGuest) {
      return NextResponse.json({ error: "Viewers cannot mutate game state" }, { status: 403 });
    }
    const engine = getGameEngine(streamId);
    if (!engine) {
      return NextResponse.json({ error: "No active game" }, { status: 404 });
    }
    const team = body.team as "A" | "B" | undefined;
    engine.addPlayer(user.id, displayName || user.displayName, team);
    // Tower Wars: initialize base HP for the new player
    if (engine.currentState.mode === "tower_wars") {
      const s = engine.currentState;
      const hp = (s.data.baseHp as Record<string, number>) || {};
      if (!Boolean(s.data.v1SingleTower)) {
        hp[user.id] = (s.data.maxBaseHp as number) || 1000;
      }
      s.data.baseHp = hp;
    }
    return NextResponse.json({ status: "joined" });
  }

  if (action === "leave_game") {
    if (!isHost && !isApprovedGuest) {
      return NextResponse.json({ error: "Viewers cannot mutate game state" }, { status: 403 });
    }
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

  // rejoin_queue bypasses active-phase check - modify state directly
  if (action === "rejoin_queue") {
    if (!isHost && !isApprovedGuest) {
      return NextResponse.json({ error: "Viewers cannot mutate game state" }, { status: 403 });
    }
    const state = engine.currentState;
    const queue = (state.data.rejoinQueue as string[]) || [];
    if (!queue.includes(user.id)) queue.push(user.id);
    state.data.rejoinQueue = queue;
    return NextResponse.json({ status: "queued" });
  }

  const gameAction = {
    type: action,
    userId: user.id,
    payload: body.payload || {},
    timestamp: Date.now(),
  };

  if (!isHost && !isApprovedGuest) {
    return NextResponse.json({ error: "Viewers cannot mutate game state" }, { status: 403 });
  }

  const newState = engine.processAction(gameAction);
  return NextResponse.json({ state: newState });
}
