// Recording state management

import { create } from "zustand";
import type { RecordingState } from "@/lib/recording/media-recorder-manager";

export interface RecordingStoreState {
  state: RecordingState;
  duration: number;
  chunksUploaded: number;
  totalChunks: number;
  uploadId: string | null;
  recordingId: string | null;
  error: string | null;

  setState: (state: RecordingState) => void;
  setDuration: (seconds: number) => void;
  setChunksProgress: (uploaded: number, total: number) => void;
  setUploadId: (id: string) => void;
  setRecordingId: (id: string) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useRecordingStore = create<RecordingStoreState>((set) => ({
  state: "idle",
  duration: 0,
  chunksUploaded: 0,
  totalChunks: 0,
  uploadId: null,
  recordingId: null,
  error: null,

  setState: (state) => set({ state }),
  setDuration: (duration) => set({ duration }),
  setChunksProgress: (uploaded, total) => set({ chunksUploaded: uploaded, totalChunks: total }),
  setUploadId: (id) => set({ uploadId: id }),
  setRecordingId: (id) => set({ recordingId: id }),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      state: "idle",
      duration: 0,
      chunksUploaded: 0,
      totalChunks: 0,
      uploadId: null,
      recordingId: null,
      error: null,
    }),
}));
