// Client game state from SSE, action queue

import { create } from "zustand";
import type { GameState, PlayerState } from "@/lib/games/game-engine";

export interface GameStoreState {
  // Current game state received from server
  gameState: GameState | null;
  connected: boolean;
  lastUpdate: number;

  // Local action queue
  pendingActions: Array<{ type: string; payload: Record<string, unknown> }>;

  // UI state
  showElimination: boolean;
  eliminationTarget: string | null;

  // Actions
  setGameState: (state: GameState) => void;
  setConnected: (connected: boolean) => void;
  queueAction: (type: string, payload: Record<string, unknown>) => void;
  clearPendingActions: () => void;
  setShowElimination: (show: boolean, target?: string) => void;
  reset: () => void;
}

export const useGameStore = create<GameStoreState>((set) => ({
  gameState: null,
  connected: false,
  lastUpdate: 0,
  pendingActions: [],
  showElimination: false,
  eliminationTarget: null,

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

  clearPendingActions: () => set({ pendingActions: [] }),

  setShowElimination: (show, target) =>
    set({ showElimination: show, eliminationTarget: target || null }),

  reset: () =>
    set({
      gameState: null,
      connected: false,
      lastUpdate: 0,
      pendingActions: [],
      showElimination: false,
      eliminationTarget: null,
    }),
}));
