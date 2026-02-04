import { create } from "zustand";

interface PlayerState {
  currentVideoId: string | null;
  isPlaying: boolean;
  progress: number;
  autoplayEnabled: boolean;
  seriesMode: boolean;
  play: () => void;
  pause: () => void;
  seek: (progress: number) => void;
  setVideo: (videoId: string) => void;
  toggleAutoplay: () => void;
  setSeriesMode: (enabled: boolean) => void;
  triggerAutoplayNext: (nextVideoId: string) => void;
}

export const usePlayerStore = create<PlayerState>()((set) => ({
  currentVideoId: null,
  isPlaying: false,
  progress: 0,
  autoplayEnabled: true,
  seriesMode: false,

  play: () => set({ isPlaying: true }),

  pause: () => set({ isPlaying: false }),

  seek: (progress) =>
    set({ progress: Math.max(0, Math.min(100, progress)) }),

  setVideo: (videoId) =>
    set({ currentVideoId: videoId, isPlaying: false, progress: 0 }),

  toggleAutoplay: () =>
    set((state) => ({ autoplayEnabled: !state.autoplayEnabled })),

  setSeriesMode: (enabled) => set({ seriesMode: enabled }),

  triggerAutoplayNext: (nextVideoId) =>
    set({ currentVideoId: nextVideoId, isPlaying: true, progress: 0 }),
}));
