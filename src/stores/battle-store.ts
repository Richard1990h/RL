import { create } from "zustand";
import type { LiveRoom } from "@/lib/types";

interface ChatMessage {
  id: string;
  userId: string;
  text: string;
  timestamp: number;
}

interface BattleState {
  currentRoom: LiveRoom | null;
  scores: Record<string, number>;
  eliminatedUsers: string[];
  teamAHealth: number;
  teamBHealth: number;
  round: number;
  chatMessages: ChatMessage[];
  joinRoom: (room: LiveRoom) => void;
  leaveRoom: () => void;
  addScore: (userId: string, points: number) => void;
  eliminateUser: (userId: string) => void;
  damageTeam: (team: "A" | "B", amount: number) => void;
  addChatMessage: (userId: string, text: string) => void;
  nextRound: () => void;
}

let chatCounter = 0;

export const useBattleStore = create<BattleState>()((set) => ({
  currentRoom: null,
  scores: {},
  eliminatedUsers: [],
  teamAHealth: 100,
  teamBHealth: 100,
  round: 1,
  chatMessages: [],

  joinRoom: (room) =>
    set({
      currentRoom: room,
      scores: {},
      eliminatedUsers: [],
      teamAHealth: 100,
      teamBHealth: 100,
      round: 1,
      chatMessages: [],
    }),

  leaveRoom: () =>
    set({
      currentRoom: null,
      scores: {},
      eliminatedUsers: [],
      teamAHealth: 100,
      teamBHealth: 100,
      round: 1,
      chatMessages: [],
    }),

  addScore: (userId, points) =>
    set((state) => ({
      scores: {
        ...state.scores,
        [userId]: (state.scores[userId] ?? 0) + points,
      },
    })),

  eliminateUser: (userId) =>
    set((state) =>
      state.eliminatedUsers.includes(userId)
        ? state
        : { eliminatedUsers: [...state.eliminatedUsers, userId] }
    ),

  damageTeam: (team, amount) =>
    set((state) => {
      if (team === "A") {
        return { teamAHealth: Math.max(0, state.teamAHealth - amount) };
      }
      return { teamBHealth: Math.max(0, state.teamBHealth - amount) };
    }),

  addChatMessage: (userId, text) => {
    const id = `msg-${++chatCounter}-${Date.now()}`;
    set((state) => ({
      chatMessages: [
        ...state.chatMessages,
        { id, userId, text, timestamp: Date.now() },
      ],
    }));
  },

  nextRound: () => set((state) => ({ round: state.round + 1 })),
}));
