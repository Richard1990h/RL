import { create } from "zustand";
import { api } from "@/lib/api";

interface NotificationState {
  unreadCount: number;
  prevUnreadCount: number;
  hasPrivateMessage: boolean;
  pollInterval: ReturnType<typeof setInterval> | null;

  fetchUnreadCount: () => Promise<void>;
  markAllRead: () => Promise<void>;
  clearPrivateHighlight: () => void;
  startPolling: () => void;
  stopPolling: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  unreadCount: 0,
  prevUnreadCount: 0,
  hasPrivateMessage: false,
  pollInterval: null,

  fetchUnreadCount: async () => {
    try {
      const res = (await api.notifications.list({ limit: "50", unread: "true" })) as {
        notifications: Array<{ type: string; relatedId?: string; message?: string }>;
        unreadCount: number;
      };
      const hasPrivate = res.notifications.some(
        (n) => n.type === "PRIVATE_MESSAGE"
      );
      const prev = get().unreadCount;
      set({ prevUnreadCount: prev, unreadCount: res.unreadCount, hasPrivateMessage: hasPrivate });
    } catch {
      // silently fail
    }
  },

  markAllRead: async () => {
    try {
      await api.notifications.markRead({ all: true });
      set({ unreadCount: 0, hasPrivateMessage: false });
    } catch {
      // silently fail
    }
  },

  clearPrivateHighlight: () => {
    set({ hasPrivateMessage: false });
  },

  startPolling: () => {
    const { pollInterval } = get();
    if (pollInterval) return;

    // Fetch immediately
    get().fetchUnreadCount();

    const interval = setInterval(() => {
      get().fetchUnreadCount();
    }, 15000); // every 15 seconds

    set({ pollInterval: interval });
  },

  stopPolling: () => {
    const { pollInterval } = get();
    if (pollInterval) {
      clearInterval(pollInterval);
      set({ pollInterval: null, unreadCount: 0, hasPrivateMessage: false });
    }
  },
}));
