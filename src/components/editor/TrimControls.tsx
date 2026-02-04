"use client";

import { ArrowLeftToLine, ArrowRightToLine } from "lucide-react";
import Button from "@/components/ui/Button";

interface TrimControlsProps {
  inPoint: number;
  outPoint: number;
  playhead: number;
  duration: number;
  onSetIn: (time: number) => void;
  onSetOut: (time: number) => void;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${m}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

export default function TrimControls({
  inPoint,
  outPoint,
  playhead,
  duration,
  onSetIn,
  onSetOut,
}: TrimControlsProps) {
  return (
    <div className="flex items-center gap-3 p-3 bg-bg-surface2 rounded-lg border border-border">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          icon={<ArrowLeftToLine size={14} />}
          onClick={() => onSetIn(playhead)}
          title="Set in point at playhead (I)"
        >
          In
        </Button>
        <span className="text-xs font-mono text-text-secondary bg-bg-surface3 px-2 py-1 rounded">
          {formatTimestamp(inPoint)}
        </span>
      </div>

      <div className="flex-1 text-center">
        <span className="text-xs text-text-muted">
          Duration: {formatTimestamp(outPoint - inPoint)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-text-secondary bg-bg-surface3 px-2 py-1 rounded">
          {formatTimestamp(outPoint)}
        </span>
        <Button
          variant="ghost"
          size="sm"
          icon={<ArrowRightToLine size={14} />}
          onClick={() => onSetOut(playhead)}
          title="Set out point at playhead (O)"
        >
          Out
        </Button>
      </div>
    </div>
  );
}
