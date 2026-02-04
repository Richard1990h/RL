import { create } from "zustand";

interface Toast {
  id: string;
  message: string;
  type: "info" | "success" | "error";
}

interface UIState {
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  mobileDrawerOpen: boolean;
  activeModal: string | null;
  activeDrawer: string | null;
  toasts: Toast[];
  toggleSidebar: () => void;
  collapseSidebar: () => void;
  toggleMobileDrawer: () => void;
  setMobileDrawerOpen: (open: boolean) => void;
  openModal: (id: string) => void;
  closeModal: () => void;
  openDrawer: (id: string) => void;
  closeDrawer: () => void;
  addToast: (message: string, type?: "info" | "success" | "error") => void;
  removeToast: (id: string) => void;
}

let toastCounter = 0;

export const useUIStore = create<UIState>()((set) => ({
  sidebarOpen: true,
  sidebarCollapsed: false,
  mobileDrawerOpen: false,
  activeModal: null,
  activeDrawer: null,
  toasts: [],

  toggleSidebar: () =>
    set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  collapseSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  toggleMobileDrawer: () =>
    set((state) => ({ mobileDrawerOpen: !state.mobileDrawerOpen })),

  setMobileDrawerOpen: (open) => set({ mobileDrawerOpen: open }),

  openModal: (id) => set({ activeModal: id }),

  closeModal: () => set({ activeModal: null }),

  openDrawer: (id) => set({ activeDrawer: id }),

  closeDrawer: () => set({ activeDrawer: null }),

  addToast: (message, type = "info") => {
    const id = `toast-${++toastCounter}-${Date.now()}`;
    set((state) => ({
      toasts: [...state.toasts, { id, message, type }],
    }));
  },

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));
