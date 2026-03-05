"use client";

import { Pause, Play, Square } from "lucide-react";
import { cn } from "@/lib/utils";

interface RecordingIndicatorProps {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  className?: string;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function RecordingIndicator({
  isRecording,
  isPaused,
  duration,
  onPause,
  onResume,
  onStop,
  className,
}: RecordingIndicatorProps) {
  if (!isRecording && !isPaused) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 bg-bg-surface/90 backdrop-blur-sm rounded-full border border-border shadow-lg",
        className
      )}
    >
      {/* Pulsing red dot */}
      <span className="relative flex h-3 w-3">
        {!isPaused && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger opacity-75" />
        )}
        <span
          className={cn(
            "relative inline-flex rounded-full h-3 w-3",
            isPaused ? "bg-warning" : "bg-danger"
          )}
        />
      </span>

      {/* Duration */}
      <span className="text-sm font-mono font-bold text-text">
        {formatDuration(duration)}
      </span>

      {/* Pause/Resume */}
      <button
        onClick={isPaused ? onResume : onPause}
        className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-bg-surface2 transition-colors"
        title={isPaused ? "Resume recording" : "Pause recording"}
      >
        {isPaused ? (
          <Play size={12} className="text-success" />
        ) : (
          <Pause size={12} className="text-warning" />
        )}
      </button>

      {/* Stop */}
      <button
        onClick={onStop}
        className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-danger/20 transition-colors"
        title="Stop recording"
      >
        <Square size={12} className="text-danger" />
      </button>
    </div>
  );
}
