// Stage management for go-live preview/live flow

import { create } from "zustand";

export type BroadcastStage = "setup" | "preview" | "live";

export interface BroadcastState {
  stage: BroadcastStage;
  streamId: string | null;
  isRecording: boolean;
  recordingDuration: number;
  goLiveConfirmOpen: boolean;

  // Actions
  setStage: (stage: BroadcastStage) => void;
  setStreamId: (id: string | null) => void;
  setRecording: (recording: boolean) => void;
  setRecordingDuration: (duration: number) => void;
  setGoLiveConfirmOpen: (open: boolean) => void;
  reset: () => void;
}

export const useBroadcastStore = create<BroadcastState>((set) => ({
  stage: "setup",
  streamId: null,
  isRecording: false,
  recordingDuration: 0,
  goLiveConfirmOpen: false,

  setStage: (stage) => set({ stage }),
  setStreamId: (id) => set({ streamId: id }),
  setRecording: (recording) => set({ isRecording: recording }),
  setRecordingDuration: (duration) => set({ recordingDuration: duration }),
  setGoLiveConfirmOpen: (open) => set({ goLiveConfirmOpen: open }),
  reset: () =>
    set({
      stage: "setup",
      streamId: null,
      isRecording: false,
      recordingDuration: 0,
      goLiveConfirmOpen: false,
    }),
}));
