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

  fetchWallet: () => Promise<void>;

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
