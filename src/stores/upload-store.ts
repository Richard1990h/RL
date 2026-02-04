import { create } from "zustand";
import { api } from "@/lib/api";

interface UploadState {
  // Upload status
  isUploading: boolean;
  fileName: string | null;
  fileSize: number;
  progress: number; // 0-100
  error: string | null;

  // Result (set when complete)
  uploadedUrl: string | null;
  uploadedFileName: string | null;

  // ETA tracking
  etaSeconds: number | null;
  speedBps: number; // bytes per second

  // Internal
  _abort: (() => void) | null;
  _startTime: number;
  _lastProgressTime: number;
  _lastProgressBytes: number;

  // Actions
  startUpload: (file: File) => void;
  cancelUpload: () => void;
  clearUpload: () => void;
}

export const useUploadStore = create<UploadState>()((set, get) => ({
  isUploading: false,
  fileName: null,
  fileSize: 0,
  progress: 0,
  error: null,
  uploadedUrl: null,
  uploadedFileName: null,
  etaSeconds: null,
  speedBps: 0,
  _abort: null,
  _startTime: 0,
  _lastProgressTime: 0,
  _lastProgressBytes: 0,

  startUpload: (file: File) => {
    // Cancel any existing upload
    const current = get();
    if (current._abort) {
      try { current._abort(); } catch {}
    }

    const startTime = Date.now();

    set({
      isUploading: true,
      fileName: file.name,
      fileSize: file.size,
      progress: 0,
      error: null,
      uploadedUrl: null,
      uploadedFileName: null,
      etaSeconds: null,
      speedBps: 0,
      _startTime: startTime,
      _lastProgressTime: startTime,
      _lastProgressBytes: 0,
    });

    const { promise, abort } = api.uploadWithProgress(file, (percent) => {
      const now = Date.now();
      const bytesUploaded = (percent / 100) * file.size;
      const state = get();

      // Calculate speed using a rolling window
      const timeDeltaMs = now - state._lastProgressTime;
      const bytesDelta = bytesUploaded - state._lastProgressBytes;

      let speedBps = state.speedBps;
      if (timeDeltaMs > 300 && bytesDelta > 0) {
        const instantSpeed = (bytesDelta / timeDeltaMs) * 1000;
        speedBps = speedBps > 0 ? speedBps * 0.6 + instantSpeed * 0.4 : instantSpeed;

        set({
          _lastProgressTime: now,
          _lastProgressBytes: bytesUploaded,
        });
      }

      // Fallback: use overall average speed if rolling window hasn't kicked in yet
      if (speedBps === 0 && bytesUploaded > 0) {
        const totalElapsed = (now - startTime) / 1000;
        if (totalElapsed > 1) {
          speedBps = bytesUploaded / totalElapsed;
        }
      }

      // Calculate ETA
      const bytesRemaining = file.size - bytesUploaded;
      const etaSeconds = speedBps > 0 ? Math.round(bytesRemaining / speedBps) : null;

      set({
        progress: percent,
        speedBps,
        etaSeconds: percent >= 100 ? 0 : etaSeconds,
      });
    });

    set({ _abort: abort });

    promise
      .then((result) => {
        set({
          isUploading: false,
          progress: 100,
          uploadedUrl: result.url,
          uploadedFileName: file.name,
          etaSeconds: 0,
          _abort: null,
        });
      })
      .catch((err) => {
        if (err?.message === "Upload cancelled") {
          set({
            isUploading: false,
            progress: 0,
            error: null,
            _abort: null,
            etaSeconds: null,
          });
        } else {
          set({
            isUploading: false,
            error: err?.message || "Upload failed. Please try again.",
            _abort: null,
            etaSeconds: null,
          });
        }
      });
  },

  cancelUpload: () => {
    const { _abort } = get();
    if (_abort) {
      try { _abort(); } catch {}
    }
    set({
      isUploading: false,
      progress: 0,
      error: null,
      _abort: null,
      etaSeconds: null,
      speedBps: 0,
    });
  },

  clearUpload: () => {
    const { _abort } = get();
    if (_abort) {
      try { _abort(); } catch {}
    }
    set({
      isUploading: false,
      fileName: null,
      fileSize: 0,
      progress: 0,
      error: null,
      uploadedUrl: null,
      uploadedFileName: null,
      etaSeconds: null,
      speedBps: 0,
      _abort: null,
      _startTime: 0,
      _lastProgressTime: 0,
      _lastProgressBytes: 0,
    });
  },
}));
