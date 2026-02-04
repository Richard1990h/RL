import { create } from "zustand";
import { api } from "@/lib/api";

interface Transaction {
  id: string;
  type: string;
  amountCents: number;
  credits: number;
  description: string;
  status: string;
  createdAt: string;
}

interface WalletState {
  credits: number;
  transactions: Transaction[];
  isLoading: boolean;

  // Fetch from server
  fetchWallet: () => Promise<void>;

  // Actions
  buyCredits: (amountCents: number, method: "stripe" | "paypal") => Promise<boolean>;
  withdraw: (credits: number) => Promise<boolean>;

  // Optimistic local updates
  deductCredit: () => boolean;
  addCredits: (amount: number) => void;
}

export const useWalletStore = create<WalletState>()((set, get) => ({
  credits: 0,
  transactions: [],
  isLoading: false,

  fetchWallet: async () => {
    set({ isLoading: true });
    try {
      const res = await api.wallet.get() as {
        wallet: { credits: number };
        transactions: Transaction[];
      };
      set({
        credits: res.wallet.credits,
        transactions: res.transactions,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  buyCredits: async (amountCents, method) => {
    try {
      await api.wallet.buyCredits({ amountCents, method });
      await get().fetchWallet();
      return true;
    } catch {
      return false;
    }
  },

  withdraw: async (credits) => {
    try {
      await api.wallet.withdraw({ credits });
      await get().fetchWallet();
      return true;
    } catch {
      return false;
    }
  },

  // Optimistic local deduct for messaging (1 credit)
  deductCredit: () => {
    const { credits } = get();
    if (credits <= 0) return false;
    set((state) => ({ credits: state.credits - 1 }));
    return true;
  },

  addCredits: (amount) => {
    set((state) => ({ credits: state.credits + amount }));
  },
}));
