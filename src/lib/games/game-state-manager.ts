// In-memory Map of active game engines per stream

import { GameEngine, createInitialGameState, type GameState, type GameEngineCallbacks } from "./game-engine";
import { createTimerWarsHandlers } from "./timer-wars-server";
import { createTowerWarsHandlers } from "./tower-wars-server";
import { createTriviaHandlers } from "./trivia-battle";
import { createAuctionHandlers } from "./auction-wars";
import { createSpinWheelHandlers } from "./spin-wheel";
import { createLastStandingHandlers } from "./last-one-standing";

type ListenerMode = "full" | "overlay";
interface GameStateListener {
  controller: ReadableStreamDefaultController;
  mode: ListenerMode;
}

// SSE connections for game state broadcasting
const gameStateListeners = new Map<string, Map<string, GameStateListener>>();
const overlayPendingState = new Map<string, GameState>();
const overlayLastSentState = new Map<string, GameState>();

// Active game engines
const activeGames = new Map<string, GameEngine>();

export function getGameEngine(streamId: string): GameEngine | undefined {
  return activeGames.get(streamId);
}

interface GameConfig {
  hostCutPercent?: number;
  hostId?: string;
}

export function createGame(
  streamId: string,
  mode: string,
  maxRounds: number,
  roundTimeSec: number,
  config?: GameConfig
): GameEngine {
  // Clean up existing game
  const existing = activeGames.get(streamId);
  if (existing) {
    existing.destroy();
  }

  const gameId = `game_${streamId}_${Date.now()}`;
  const initialState = createInitialGameState(gameId, streamId, mode, maxRounds, roundTimeSec);

  // Store config in game data
  initialState.data.roundTimeSec = roundTimeSec;
  initialState.data.hostCutPercent = config?.hostCutPercent || 0;
  initialState.data.hostId = config?.hostId || "";
  initialState.data.playerEarnings = {};
  initialState.data.rejoinQueue = [];

  // Tower Wars: initialize base HP data
  if (mode === "tower_wars") {
    initialState.data.units = [];
    initialState.data.baseHp = {};
    initialState.data.maxBaseHp = 1000;
    initialState.data.nextUnitId = 1;
    initialState.data.v1SingleLane = true;
    initialState.data.v1SingleTower = true;
    initialState.data.objectiveTowerOwnerId = config?.hostId || "";
  }

  const callbacks: GameEngineCallbacks = {
    onStateUpdate: (state) => broadcastGameState(streamId, state),
    onGameEnd: (state) => {
      broadcastGameState(streamId, state);

      // Auto-restart for timer_wars mode
      if (mode === "timer_wars") {
        handleTimerWarsGameEnd(streamId, state, maxRounds, roundTimeSec, config);
      }
      // Auto-restart for tower_wars mode
      if (mode === "tower_wars") {
        handleTowerWarsGameEnd(streamId, state, maxRounds, roundTimeSec, config);
      }
    },
    onElimination: (mode === "timer_wars" || mode === "tower_wars")
      ? (state, eliminatedUserIds) => handleElimination(state, eliminatedUserIds, mode)
      : undefined,
  };

  let handlers;
  switch (mode) {
    case "timer_wars":
      handlers = createTimerWarsHandlers();
      break;
    case "tower_wars":
      handlers = createTowerWarsHandlers();
      break;
    case "trivia":
      handlers = createTriviaHandlers();
      break;
    case "auction":
      handlers = createAuctionHandlers();
      break;
    case "spin_wheel":
      handlers = createSpinWheelHandlers();
      break;
    case "last_standing":
      handlers = createLastStandingHandlers();
      break;
    default:
      handlers = createTimerWarsHandlers();
  }

  const engine = new GameEngine(
    initialState,
    handlers.tick,
    handlers.action,
    callbacks,
    100
  );

  activeGames.set(streamId, engine);
  return engine;
}

// Pay out a player's accumulated earnings
async function payoutPlayer(userId: string, amount: number, streamId: string, mode = "timer_wars") {
  if (amount <= 0) return;
  try {
    const { prisma } = await import("@/lib/db");
    const { insertLedgerEntry } = await import("@/lib/credit-ledger");
    const { v4: uuidv4 } = await import("uuid");

    const modeLabel = mode === "tower_wars" ? "Tower Wars" : "Timer Wars";
    await prisma.$transaction(async (tx) => {
      await insertLedgerEntry(tx, {
        userId,
        deltaCredits: amount,
        type: "GAME_PAYOUT",
        referenceId: `payout_${uuidv4()}`,
        description: `${modeLabel} elimination payout in stream ${streamId}`,
      });
      await tx.wallet.update({
        where: { userId },
        data: { totalEarned: { increment: amount } },
      });
    });
  } catch (err) {
    console.error(`Failed to payout ${amount} to ${userId}:`, err);
  }
}

// Handle elimination payouts (shared by timer_wars and tower_wars)
async function handleElimination(state: GameState, eliminatedUserIds: string[], mode: string) {
  const earnings = (state.data.playerEarnings as Record<string, number>) || {};
  for (const userId of eliminatedUserIds) {
    const amount = earnings[userId] || 0;
    if (amount > 0) {
      await payoutPlayer(userId, amount, state.streamId, mode);
      earnings[userId] = 0; // Prevent double payout
    }
  }
  state.data.playerEarnings = earnings;
}

// Handle timer wars game end - pay winner + auto-restart
async function handleTimerWarsGameEnd(
  streamId: string,
  state: GameState,
  maxRounds: number,
  roundTimeSec: number,
  config?: GameConfig
) {
  // Pay out the winner
  if (state.winner) {
    const earnings = (state.data.playerEarnings as Record<string, number>) || {};
    const winnerAmount = earnings[state.winner] || 0;
    if (winnerAmount > 0) {
      await payoutPlayer(state.winner, winnerAmount, streamId);
      earnings[state.winner] = 0;
    }
  }

  // Auto-restart after delay
  setTimeout(() => {
    const engine = activeGames.get(streamId);
    if (!engine) return; // Game was destroyed

    const currentState = engine.currentState;

    // Reset all player states
    for (const [userId, player] of Object.entries(currentState.players)) {
      player.score = 0;
      player.isEliminated = false;
      player.data = {};
    }

    // Add anyone from rejoin queue
    const rejoinQueue = (currentState.data.rejoinQueue as string[]) || [];
    for (const userId of rejoinQueue) {
      if (!currentState.players[userId]) {
        currentState.players[userId] = {
          userId,
          displayName: userId, // Will be updated on next join
          score: 0,
          isEliminated: false,
          isConnected: true,
          data: {},
        };
      } else {
        currentState.players[userId].isEliminated = false;
        currentState.players[userId].isConnected = true;
        currentState.players[userId].score = 0;
        currentState.players[userId].data = {};
      }
    }

    // Reset game state
    currentState.data.rejoinQueue = [];
    currentState.data.playerEarnings = {};
    currentState.data.lastEliminated = null;
    currentState.data.eliminationReason = null;
    currentState.phase = "waiting";
    currentState.round = 1;
    currentState.winner = null;
    currentState.timeRemaining = roundTimeSec;
    currentState.lastUpdate = Date.now();

    broadcastGameState(streamId, currentState);

    // Auto-start after another delay
    setTimeout(() => {
      const eng = activeGames.get(streamId);
      if (eng && eng.currentState.phase === "waiting") {
        eng.start();
      }
    }, 10000);
  }, 5000);
}

// Handle tower wars game end - pay winner + auto-restart
async function handleTowerWarsGameEnd(
  streamId: string,
  state: GameState,
  maxRounds: number,
  roundTimeSec: number,
  config?: GameConfig
) {
  // Pay out the winner
  if (state.winner) {
    const earnings = (state.data.playerEarnings as Record<string, number>) || {};
    const winnerAmount = earnings[state.winner] || 0;
    if (winnerAmount > 0) {
      await payoutPlayer(state.winner, winnerAmount, streamId, "tower_wars");
      earnings[state.winner] = 0;
    }
  }

  // Auto-restart after delay
  setTimeout(() => {
    const engine = activeGames.get(streamId);
    if (!engine) return;

    const currentState = engine.currentState;
    const maxBaseHp = (currentState.data.maxBaseHp as number) || 1000;

    // Reset all player states and base HP
    const baseHp: Record<string, number> = {};
    for (const [userId, player] of Object.entries(currentState.players)) {
      player.score = 0;
      player.isEliminated = false;
      player.data = {};
      baseHp[userId] = maxBaseHp;
    }

    // Add anyone from rejoin queue
    const rejoinQueue = (currentState.data.rejoinQueue as string[]) || [];
    for (const userId of rejoinQueue) {
      if (!currentState.players[userId]) {
        currentState.players[userId] = {
          userId,
          displayName: userId,
          score: 0,
          isEliminated: false,
          isConnected: true,
          data: {},
        };
      } else {
        currentState.players[userId].isEliminated = false;
        currentState.players[userId].isConnected = true;
        currentState.players[userId].score = 0;
        currentState.players[userId].data = {};
      }
      baseHp[userId] = maxBaseHp;
    }

    // Reset game state
    currentState.data.rejoinQueue = [];
    currentState.data.playerEarnings = {};
    currentState.data.lastEliminated = null;
    currentState.data.units = [];
    currentState.data.baseHp = baseHp;
    currentState.data.nextUnitId = 1;
    currentState.phase = "waiting";
    currentState.round = 1;
    currentState.winner = null;
    currentState.timeRemaining = roundTimeSec;
    currentState.lastUpdate = Date.now();

    broadcastGameState(streamId, currentState);

    // Auto-start after another delay
    setTimeout(() => {
      const eng = activeGames.get(streamId);
      if (eng && eng.currentState.phase === "waiting") {
        eng.start();
      }
    }, 10000);
  }, 5000);
}

export function destroyGame(streamId: string) {
  const engine = activeGames.get(streamId);
  if (engine) {
    engine.destroy();
    activeGames.delete(streamId);
  }
  overlayPendingState.delete(streamId);
  overlayLastSentState.delete(streamId);
}

// Game state SSE broadcasting
export function addGameStateListener(
  streamId: string,
  userId: string,
  controller: ReadableStreamDefaultController,
  mode: ListenerMode = "full"
) {
  if (!gameStateListeners.has(streamId)) {
    gameStateListeners.set(streamId, new Map());
  }
  gameStateListeners.get(streamId)!.set(userId, { controller, mode });
}

export function removeGameStateListener(streamId: string, userId: string) {
  const listeners = gameStateListeners.get(streamId);
  if (listeners) {
    listeners.delete(userId);
    if (listeners.size === 0) {
      gameStateListeners.delete(streamId);
      overlayPendingState.delete(streamId);
      overlayLastSentState.delete(streamId);
    }
  }
}

function broadcastGameState(streamId: string, state: GameState) {
  const listeners = gameStateListeners.get(streamId);
  if (!listeners) return;

  overlayPendingState.set(streamId, state);

  const payload = `event: game-state\ndata: ${JSON.stringify(state)}\nid: ${Date.now()}\n\n`;
  const encoded = new TextEncoder().encode(payload);

  listeners.forEach((listener, userId) => {
    if (listener.mode !== "full") return;
    try {
      listener.controller.enqueue(encoded);
    } catch {
      listeners.delete(userId);
    }
  });
}

export function broadcastGameEvent(streamId: string, event: string, data: unknown) {
  const listeners = gameStateListeners.get(streamId);
  if (!listeners) return;

  const payload = `event: game-event\ndata: ${JSON.stringify({ event, data })}\nid: ${Date.now()}\n\n`;
  const encoded = new TextEncoder().encode(payload);

  listeners.forEach((listener, userId) => {
    if (listener.mode !== "full") return;
    try {
      listener.controller.enqueue(encoded);
    } catch {
      listeners.delete(userId);
    }
  });
}

function projectOverlayState(state: GameState) {
  const players: Record<string, { score: number; isEliminated: boolean }> = {};
  for (const [id, player] of Object.entries(state.players)) {
    players[id] = {
      score: player.score,
      isEliminated: player.isEliminated,
    };
  }

  return {
    gameId: state.gameId,
    streamId: state.streamId,
    mode: state.mode,
    phase: state.phase,
    round: state.round,
    timeRemaining: state.timeRemaining,
    winner: state.winner,
    players,
    data: {
      units: state.data.units ?? [],
      baseHp: state.data.baseHp ?? {},
      objectiveTowerOwnerId: state.data.objectiveTowerOwnerId ?? null,
      lastEliminated: state.data.lastEliminated ?? null,
      v1SingleLane: state.data.v1SingleLane ?? false,
      v1SingleTower: state.data.v1SingleTower ?? false,
    },
    lastUpdate: state.lastUpdate,
  };
}

function buildOverlayDiff(prev: GameState | undefined, next: GameState) {
  const prevProjected = prev ? projectOverlayState(prev) : null;
  const nextProjected = projectOverlayState(next);

  if (!prevProjected) {
    return nextProjected;
  }

  const diff: Record<string, unknown> = {};
  for (const key of Object.keys(nextProjected) as Array<keyof typeof nextProjected>) {
    if (JSON.stringify(prevProjected[key]) !== JSON.stringify(nextProjected[key])) {
      diff[key] = nextProjected[key];
    }
  }
  return diff;
}

// Overlay fanout: decouple render transport from simulation tick at ~12 FPS.
setInterval(() => {
  for (const [streamId, state] of overlayPendingState) {
    const listeners = gameStateListeners.get(streamId);
    if (!listeners) continue;

    const prev = overlayLastSentState.get(streamId);
    const diff = buildOverlayDiff(prev, state);
    overlayLastSentState.set(streamId, state);
    overlayPendingState.delete(streamId);

    const payload = `event: game-frame\ndata: ${JSON.stringify({ diff, ts: Date.now() })}\nid: ${Date.now()}\n\n`;
    const encoded = new TextEncoder().encode(payload);

    listeners.forEach((listener, userId) => {
      if (listener.mode !== "overlay") return;
      try {
        listener.controller.enqueue(encoded);
      } catch {
        listeners.delete(userId);
      }
    });
  }
}, 83);
