import { create } from "zustand";
import { api } from "@/lib/api";
import type { Friend, FriendRequest } from "@/lib/types";

interface FriendsState {
  friends: Friend[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  isLoading: boolean;
  incomingCount: number;
  heartbeatInterval: ReturnType<typeof setInterval> | null;

  fetchFriends: (search?: string) => Promise<void>;
  fetchIncomingRequests: () => Promise<void>;
  fetchOutgoingRequests: () => Promise<void>;
  sendRequest: (userId: string) => Promise<void>;
  cancelRequest: (userId: string) => Promise<void>;
  acceptRequest: (userId: string) => Promise<void>;
  declineRequest: (userId: string) => Promise<void>;
  removeFriend: (userId: string) => Promise<void>;
  setFriendTimeout: (userId: string, duration: number) => Promise<void>;
  removeFriendTimeout: (userId: string) => Promise<void>;
  startHeartbeat: () => void;
  stopHeartbeat: () => void;
}

export const useFriendsStore = create<FriendsState>()((set, get) => ({
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  isLoading: false,
  incomingCount: 0,
  heartbeatInterval: null,

  fetchFriends: async (search?: string) => {
    set({ isLoading: true });
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      const res = await api.friends.list(params) as { friends: Friend[] };
      set({ friends: res.friends, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  fetchIncomingRequests: async () => {
    try {
      const res = await api.friends.requests("incoming") as { requests: FriendRequest[] };
      set({ incomingRequests: res.requests, incomingCount: res.requests.length });
    } catch {}
  },

  fetchOutgoingRequests: async () => {
    try {
      const res = await api.friends.requests("outgoing") as { requests: FriendRequest[] };
      set({ outgoingRequests: res.requests });
    } catch {}
  },

  sendRequest: async (userId: string) => {
    await api.friends.sendRequest(userId);
    get().fetchOutgoingRequests();
  },

  cancelRequest: async (userId: string) => {
    await api.friends.cancelRequest(userId);
    set((s) => ({
      outgoingRequests: s.outgoingRequests.filter((r) => r.user.id !== userId),
    }));
  },

  acceptRequest: async (userId: string) => {
    await api.friends.respondToRequest(userId, "accept");
    set((s) => ({
      incomingRequests: s.incomingRequests.filter((r) => r.user.id !== userId),
      incomingCount: s.incomingCount - 1,
    }));
    get().fetchFriends();
  },

  declineRequest: async (userId: string) => {
    await api.friends.respondToRequest(userId, "decline");
    set((s) => ({
      incomingRequests: s.incomingRequests.filter((r) => r.user.id !== userId),
      incomingCount: s.incomingCount - 1,
    }));
  },

  removeFriend: async (userId: string) => {
    await api.friends.remove(userId);
    set((s) => ({
      friends: s.friends.filter((f) => f.id !== userId),
    }));
  },

  setFriendTimeout: async (userId: string, duration: number) => {
    await api.friends.setTimeout(userId, duration);
  },

  removeFriendTimeout: async (userId: string) => {
    await api.friends.removeTimeout(userId);
  },

  startHeartbeat: () => {
    const existing = get().heartbeatInterval;
    if (existing) return;
    api.friends.heartbeat().catch(() => {});
    const interval = setInterval(() => {
      api.friends.heartbeat().catch(() => {});
    }, 90 * 1000);
    set({ heartbeatInterval: interval });
  },

  stopHeartbeat: () => {
    const interval = get().heartbeatInterval;
    if (interval) {
      clearInterval(interval);
      set({ heartbeatInterval: null });
    }
  },
}));
