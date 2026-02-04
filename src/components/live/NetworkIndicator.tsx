"use client";

import { Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface NetworkIndicatorProps {
  quality: "good" | "fair" | "poor" | "bad" | "disconnected";
  showLabel?: boolean;
  className?: string;
}

const QUALITY_CONFIG = {
  good: { color: "bg-success", textColor: "text-success", label: "Good", bars: 3 },
  fair: { color: "bg-warning", textColor: "text-warning", label: "Fair", bars: 2 },
  poor: { color: "bg-orange-500", textColor: "text-orange-500", label: "Poor", bars: 1 },
  bad: { color: "bg-danger", textColor: "text-danger", label: "Bad", bars: 0 },
  disconnected: { color: "bg-danger", textColor: "text-danger", label: "Disconnected", bars: 0 },
};

export default function NetworkIndicator({
  quality,
  showLabel = false,
  className,
}: NetworkIndicatorProps) {
  const config = QUALITY_CONFIG[quality];

  if (quality === "disconnected") {
    return (
      <div className={cn("flex items-center gap-1", className)}>
        <WifiOff size={14} className="text-danger" />
        {showLabel && <span className="text-xs text-danger font-medium">Disconnected</span>}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <div className="flex items-end gap-0.5 h-3">
        {[0, 1, 2].map((bar) => (
          <div
            key={bar}
            className={cn(
              "w-1 rounded-full transition-colors",
              bar === 0 ? "h-1.5" : bar === 1 ? "h-2" : "h-3",
              bar <= config.bars - 1 ? config.color : "bg-bg-surface3"
            )}
          />
        ))}
      </div>
      {showLabel && (
        <span className={cn("text-xs font-medium", config.textColor)}>
          {config.label}
        </span>
      )}
    </div>
  );
}
