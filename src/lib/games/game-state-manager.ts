// In-memory Map of active game engines per stream

import { GameEngine, createInitialGameState, type GameState, type GameAction, type GameEngineCallbacks } from "./game-engine";
import { createTimerWarsHandlers } from "./timer-wars-server";
import { createTowerWarsHandlers } from "./tower-wars-server";
import { createTriviaHandlers } from "./trivia-battle";
import { createAuctionHandlers } from "./auction-wars";
import { createSpinWheelHandlers } from "./spin-wheel";
import { createLastStandingHandlers } from "./last-one-standing";

// SSE connections for game state broadcasting
const gameStateListeners = new Map<string, Map<string, ReadableStreamDefaultController>>();

// Active game engines
const activeGames = new Map<string, GameEngine>();

export function getGameEngine(streamId: string): GameEngine | undefined {
  return activeGames.get(streamId);
}

export function createGame(
  streamId: string,
  mode: string,
  maxRounds: number,
  roundTimeSec: number
): GameEngine {
  // Clean up existing game
  const existing = activeGames.get(streamId);
  if (existing) {
    existing.destroy();
  }

  const gameId = `game_${streamId}_${Date.now()}`;
  const initialState = createInitialGameState(gameId, streamId, mode, maxRounds, roundTimeSec);

  const callbacks: GameEngineCallbacks = {
    onStateUpdate: (state) => broadcastGameState(streamId, state),
    onGameEnd: (state) => broadcastGameState(streamId, state),
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

export function destroyGame(streamId: string) {
  const engine = activeGames.get(streamId);
  if (engine) {
    engine.destroy();
    activeGames.delete(streamId);
  }
}

// Game state SSE broadcasting
export function addGameStateListener(streamId: string, userId: string, controller: ReadableStreamDefaultController) {
  if (!gameStateListeners.has(streamId)) {
    gameStateListeners.set(streamId, new Map());
  }
  gameStateListeners.get(streamId)!.set(userId, controller);
}

export function removeGameStateListener(streamId: string, userId: string) {
  const listeners = gameStateListeners.get(streamId);
  if (listeners) {
    listeners.delete(userId);
    if (listeners.size === 0) {
      gameStateListeners.delete(streamId);
    }
  }
}

function broadcastGameState(streamId: string, state: GameState) {
  const listeners = gameStateListeners.get(streamId);
  if (!listeners) return;

  const payload = `event: game-state\ndata: ${JSON.stringify(state)}\nid: ${Date.now()}\n\n`;
  const encoded = new TextEncoder().encode(payload);

  listeners.forEach((controller, userId) => {
    try {
      controller.enqueue(encoded);
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

  listeners.forEach((controller, userId) => {
    try {
      controller.enqueue(encoded);
    } catch {
      listeners.delete(userId);
    }
  });
}
