// MediaRecorder wrapper with codec detection, chunking, and error recovery

export type RecordingState = "idle" | "recording" | "paused" | "processing";

export interface RecordingChunk {
  index: number;
  blob: Blob;
  timestamp: number;
}

export interface MediaRecorderCallbacks {
  onChunk: (chunk: RecordingChunk) => void;
  onStateChange: (state: RecordingState) => void;
  onError: (error: string) => void;
  onDurationUpdate: (seconds: number) => void;
}

const TIMESLICE_MS = 10000; // 10 second chunks

function detectMimeType(): string {
  const types = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4;codecs=h264,aac",
    "video/mp4",
  ];

  for (const type of types) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "video/webm";
}

export class MediaRecorderManager {
  private recorder: MediaRecorder | null = null;
  private callbacks: MediaRecorderCallbacks;
  private chunkIndex = 0;
  private startTime = 0;
  private durationTimer: ReturnType<typeof setInterval> | null = null;
  private _state: RecordingState = "idle";
  private _mimeType: string;

  constructor(callbacks: MediaRecorderCallbacks) {
    this.callbacks = callbacks;
    this._mimeType = detectMimeType();
  }

  get state(): RecordingState {
    return this._state;
  }

  get mimeType(): string {
    return this._mimeType;
  }

  start(stream: MediaStream) {
    if (this._state !== "idle") return;

    try {
      this.recorder = new MediaRecorder(stream, {
        mimeType: this._mimeType,
        videoBitsPerSecond: 2500000, // 2.5 Mbps
      });
    } catch {
      // Fallback without specifying bitrate
      try {
        this.recorder = new MediaRecorder(stream, { mimeType: this._mimeType });
      } catch {
        // Last resort: no options
        this.recorder = new MediaRecorder(stream);
        this._mimeType = this.recorder.mimeType;
      }
    }

    this.chunkIndex = 0;
    this.startTime = Date.now();

    this.recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) {
        this.callbacks.onChunk({
          index: this.chunkIndex++,
          blob: ev.data,
          timestamp: Date.now(),
        });
      }
    };

    this.recorder.onerror = () => {
      this.callbacks.onError("Recording error occurred. Attempting to recover...");
      this.handleError();
    };

    this.recorder.onstop = () => {
      this.cleanup();
      this.setState("idle");
    };

    this.recorder.start(TIMESLICE_MS);
    this.setState("recording");

    // Duration counter
    this.durationTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      this.callbacks.onDurationUpdate(elapsed);
    }, 1000);
  }

  pause() {
    if (this._state !== "recording" || !this.recorder) return;
    this.recorder.pause();
    this.setState("paused");
  }

  resume() {
    if (this._state !== "paused" || !this.recorder) return;
    this.recorder.resume();
    this.setState("recording");
  }

  stop() {
    if (!this.recorder || this._state === "idle") return;
    this.setState("processing");
    try {
      this.recorder.stop();
    } catch {
      this.cleanup();
      this.setState("idle");
    }
  }

  private setState(state: RecordingState) {
    this._state = state;
    this.callbacks.onStateChange(state);
  }

  private cleanup() {
    if (this.durationTimer) {
      clearInterval(this.durationTimer);
      this.durationTimer = null;
    }
  }

  private handleError() {
    // Attempt to stop and restart
    try {
      this.recorder?.stop();
    } catch {
      // Already stopped
    }
    this.cleanup();
    this.setState("idle");
  }
}
