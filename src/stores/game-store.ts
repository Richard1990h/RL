// Client game state from SSE, action queue

import { create } from "zustand";
import type { GameState } from "@/lib/games/game-engine";

export interface GameStoreState {
  gameState: GameState | null;
  connected: boolean;
  lastUpdate: number;
  pendingActions: Array<{ type: string; payload: Record<string, unknown> }>;

  setGameState: (state: GameState) => void;
  setConnected: (connected: boolean) => void;
  queueAction: (type: string, payload: Record<string, unknown>) => void;
  reset: () => void;
}

export const useGameStore = create<GameStoreState>((set) => ({
  gameState: null,
  connected: false,
  lastUpdate: 0,
  pendingActions: [],

  setGameState: (gameState) =>
    set({
      gameState,
      lastUpdate: Date.now(),
    }),

  setConnected: (connected) => set({ connected }),

  queueAction: (type, payload) =>
    set((state) => ({
      pendingActions: [...state.pendingActions, { type, payload }],
    })),

  reset: () =>
    set({
      gameState: null,
      connected: false,
      lastUpdate: 0,
      pendingActions: [],
    }),
}));
