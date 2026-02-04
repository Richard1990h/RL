import { create } from "zustand";
import { api } from "@/lib/api";

interface UserData {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  bio: string | null;
  followerCount: number;
  followingCount: number;
  isCreator: boolean;
  verifiedBadge: boolean;
  isPremium: boolean;
  isOwner: boolean;
  isBanned: boolean;
  role: "OWNER" | "BUG_TESTER" | "END_USER";
  wallet?: {
    credits: number;
  } | null;
}

interface AuthState {
  currentUser: UserData | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  register: (data: { email: string; username: string; displayName: string; password: string; dateOfBirth: string; interests?: string[] }) => Promise<void>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
  setUser: (user: UserData | null) => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  currentUser: null,
  isLoggedIn: false,
  isLoading: true,

  login: async (email, password, rememberMe) => {
    const res = await api.auth.login({ email, password, rememberMe }) as { user: UserData };
    set({ currentUser: res.user, isLoggedIn: true });
  },

  register: async (data) => {
    const res = await api.auth.register(data) as { user: UserData };
    set({ currentUser: res.user, isLoggedIn: true });
  },

  logout: async () => {
    await api.auth.logout();
    set({ currentUser: null, isLoggedIn: false });
  },

  checkSession: async () => {
    try {
      const res = await api.auth.me() as { user: UserData } | null;
      if (res?.user) {
        set({ currentUser: res.user, isLoggedIn: true, isLoading: false });
      } else {
        set({ currentUser: null, isLoggedIn: false, isLoading: false });
      }
    } catch {
      set({ currentUser: null, isLoggedIn: false, isLoading: false });
    }
  },

  setUser: (user) => set({ currentUser: user, isLoggedIn: user !== null }),
}));
