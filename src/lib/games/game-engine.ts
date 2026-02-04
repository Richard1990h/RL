// Generic game loop - tick at configurable interval, broadcast state

export interface GameState {
  gameId: string;
  streamId: string;
  mode: string;
  phase: "waiting" | "active" | "paused" | "finished";
  round: number;
  maxRounds: number;
  timeRemaining: number;
  players: Record<string, PlayerState>;
  data: Record<string, unknown>;
  winner: string | null;
  lastUpdate: number;
}

export interface PlayerState {
  userId: string;
  displayName: string;
  score: number;
  isEliminated: boolean;
  isConnected: boolean;
  team?: "A" | "B";
  data: Record<string, unknown>;
}

export interface GameAction {
  type: string;
  userId: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

export type GameLogicHandler = (
  state: GameState,
  action: GameAction
) => GameState;

export type TickHandler = (state: GameState, deltaMs: number) => GameState;

export interface GameEngineCallbacks {
  onStateUpdate: (state: GameState) => void;
  onGameEnd: (state: GameState) => void;
}

export class GameEngine {
  private state: GameState;
  private tickHandler: TickHandler;
  private actionHandler: GameLogicHandler;
  private callbacks: GameEngineCallbacks;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private tickRate: number;
  private lastTick: number = 0;

  constructor(
    initialState: GameState,
    tickHandler: TickHandler,
    actionHandler: GameLogicHandler,
    callbacks: GameEngineCallbacks,
    tickRateMs = 100
  ) {
    this.state = initialState;
    this.tickHandler = tickHandler;
    this.actionHandler = actionHandler;
    this.callbacks = callbacks;
    this.tickRate = tickRateMs;
  }

  get currentState(): GameState {
    return this.state;
  }

  start() {
    if (this.tickInterval) return;
    this.state.phase = "active";
    this.lastTick = Date.now();

    this.tickInterval = setInterval(() => {
      const now = Date.now();
      const delta = now - this.lastTick;
      this.lastTick = now;

      this.state = this.tickHandler(this.state, delta);
      this.state.lastUpdate = now;
      this.callbacks.onStateUpdate(this.state);

      if (this.state.phase === "finished") {
        this.stop();
        this.callbacks.onGameEnd(this.state);
      }
    }, this.tickRate);

    this.callbacks.onStateUpdate(this.state);
  }

  stop() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  pause() {
    this.state.phase = "paused";
    this.stop();
    this.callbacks.onStateUpdate(this.state);
  }

  resume() {
    this.state.phase = "active";
    this.lastTick = Date.now();
    this.start();
  }

  processAction(action: GameAction): GameState {
    if (this.state.phase !== "active") return this.state;
    this.state = this.actionHandler(this.state, action);
    this.state.lastUpdate = Date.now();
    this.callbacks.onStateUpdate(this.state);
    return this.state;
  }

  addPlayer(userId: string, displayName: string, team?: "A" | "B") {
    this.state.players[userId] = {
      userId,
      displayName,
      score: 0,
      isEliminated: false,
      isConnected: true,
      team,
      data: {},
    };
    this.callbacks.onStateUpdate(this.state);
  }

  removePlayer(userId: string) {
    const player = this.state.players[userId];
    if (player) {
      player.isConnected = false;
    }
    this.callbacks.onStateUpdate(this.state);
  }

  destroy() {
    this.stop();
  }
}

export function createInitialGameState(
  gameId: string,
  streamId: string,
  mode: string,
  maxRounds: number,
  roundTimeSec: number
): GameState {
  return {
    gameId,
    streamId,
    mode,
    phase: "waiting",
    round: 1,
    maxRounds,
    timeRemaining: roundTimeSec,
    players: {},
    data: {},
    winner: null,
    lastUpdate: Date.now(),
  };
}
