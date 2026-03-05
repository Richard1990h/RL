"use client";

import { useState, useEffect, useRef } from "react";
import { Timer } from "lucide-react";
import { cn } from "@/lib/utils";

interface BattleBarProps {
  leftScore: number;
  rightScore: number;
  leftColor?: string;
  rightColor?: string;
  leftLabel: string;
  rightLabel: string;
  timer?: number;
  showTimer?: boolean;
  orientation?: "horizontal" | "vertical";
  size?: "sm" | "md" | "lg";
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatScore(score: number): string {
  if (score >= 10000) return `${(score / 1000).toFixed(1)}K`;
  if (score >= 1000) return `${(score / 1000).toFixed(1)}K`;
  return score.toLocaleString();
}

export default function BattleBar({
  leftScore,
  rightScore,
  leftColor = "#3b82f6",
  rightColor = "#ef4444",
  leftLabel,
  rightLabel,
  timer,
  showTimer = false,
  orientation = "horizontal",
  size = "md",
}: BattleBarProps) {
  const [prevLeftScore, setPrevLeftScore] = useState(leftScore);
  const [prevRightScore, setPrevRightScore] = useState(rightScore);
  const [leftPulse, setLeftPulse] = useState(false);
  const [rightPulse, setRightPulse] = useState(false);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);

  // Calculate percentages
  const total = leftScore + rightScore;
  const leftPct = total > 0 ? (leftScore / total) * 100 : 50;
  const rightPct = 100 - leftPct;

  // Detect significant score changes for pulse animation
  useEffect(() => {
    const leftDiff = leftScore - prevLeftScore;
    const rightDiff = rightScore - prevRightScore;

    if (leftDiff > 0 && leftDiff >= 50) {
      setLeftPulse(true);
      setTimeout(() => setLeftPulse(false), 400);
    }
    if (rightDiff > 0 && rightDiff >= 50) {
      setRightPulse(true);
      setTimeout(() => setRightPulse(false), 400);
    }

    setPrevLeftScore(leftScore);
    setPrevRightScore(rightScore);
  }, [leftScore, rightScore, prevLeftScore, prevRightScore]);

  // Determine which side is leading
  const leftLeading = leftScore > rightScore;
  const rightLeading = rightScore > leftScore;
  const isTied = leftScore === rightScore;

  // Size configurations
  const sizeConfig = {
    sm: { barHeight: "h-3", fontSize: "text-xs", padding: "px-2 py-1" },
    md: { barHeight: "h-4", fontSize: "text-sm", padding: "px-3 py-1.5" },
    lg: { barHeight: "h-6", fontSize: "text-base", padding: "px-4 py-2" },
  };

  const config = sizeConfig[size];

  if (orientation === "vertical") {
    return (
      <div className="flex flex-col items-center gap-2 w-3">
        {/* Top score (right player) */}
        <div className="text-center">
          <span
            className={cn("font-bold", config.fontSize)}
            style={{ color: rightColor }}
          >
            {formatScore(rightScore)}
          </span>
        </div>

        {/* Vertical bar */}
        <div
          className={cn(
            "w-2 bg-bg-surface2 rounded-full overflow-hidden relative",
            size === "sm" ? "h-32" : size === "md" ? "h-48" : "h-64"
          )}
        >
          {/* Right (top) portion */}
          <div
            ref={rightRef}
            className={cn(
              "absolute top-0 left-0 right-0 transition-all duration-300 ease-out rounded-t-full",
              rightPulse && "animate-battle-bar-pulse",
              rightLeading && "animate-battle-bar-glow"
            )}
            style={{
              height: `${rightPct}%`,
              backgroundColor: rightColor,
              color: rightColor,
            }}
          />
          {/* Left (bottom) portion */}
          <div
            ref={leftRef}
            className={cn(
              "absolute bottom-0 left-0 right-0 transition-all duration-300 ease-out rounded-b-full",
              leftPulse && "animate-battle-bar-pulse",
              leftLeading && "animate-battle-bar-glow"
            )}
            style={{
              height: `${leftPct}%`,
              backgroundColor: leftColor,
              color: leftColor,
            }}
          />
        </div>

        {/* Bottom score (left player) */}
        <div className="text-center">
          <span
            className={cn("font-bold", config.fontSize)}
            style={{ color: leftColor }}
          >
            {formatScore(leftScore)}
          </span>
        </div>

        {/* Timer (if shown) */}
        {showTimer && timer !== undefined && (
          <div className="mt-2 flex items-center gap-1 text-text-secondary">
            <Timer size={12} />
            <span className="text-xs font-mono font-semibold">
              {formatTimer(timer)}
            </span>
          </div>
        )}
      </div>
    );
  }

  // Horizontal layout (default)
  return (
    <div className="w-full">
      {/* Labels and scores row */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span
            className={cn("font-bold truncate max-w-[100px]", config.fontSize)}
            style={{ color: leftColor }}
          >
            {leftLabel}
          </span>
          <span
            className={cn(
              "font-bold tabular-nums",
              config.fontSize,
              leftPulse && "animate-score-pop"
            )}
            style={{ color: leftColor }}
          >
            {formatScore(leftScore)}
          </span>
        </div>

        {/* Center timer */}
        {showTimer && timer !== undefined && (
          <div
            className={cn(
              "flex items-center gap-1.5 bg-bg-surface2 rounded-full",
              config.padding
            )}
          >
            <Timer
              size={size === "sm" ? 12 : size === "md" ? 14 : 16}
              className={cn(
                timer > 30
                  ? "text-success"
                  : timer > 10
                    ? "text-warning"
                    : "text-danger"
              )}
            />
            <span
              className={cn(
                "font-mono font-bold",
                config.fontSize,
                timer > 30
                  ? "text-success"
                  : timer > 10
                    ? "text-warning"
                    : "text-danger"
              )}
            >
              {formatTimer(timer)}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <span
            className={cn(
              "font-bold tabular-nums",
              config.fontSize,
              rightPulse && "animate-score-pop"
            )}
            style={{ color: rightColor }}
          >
            {formatScore(rightScore)}
          </span>
          <span
            className={cn("font-bold truncate max-w-[100px]", config.fontSize)}
            style={{ color: rightColor }}
          >
            {rightLabel}
          </span>
        </div>
      </div>

      {/* Battle bar */}
      <div
        className={cn(
          "w-full bg-bg-surface2 rounded-full overflow-hidden relative flex",
          config.barHeight
        )}
      >
        {/* Left side */}
        <div
          ref={leftRef}
          className={cn(
            "h-full transition-all duration-300 ease-out relative",
            leftPulse && "animate-battle-bar-pulse",
            leftLeading && !isTied && "animate-battle-bar-glow"
          )}
          style={{
            width: `${leftPct}%`,
            backgroundColor: leftColor,
            color: leftColor,
            borderTopLeftRadius: "9999px",
            borderBottomLeftRadius: "9999px",
            borderTopRightRadius: leftPct >= 99 ? "9999px" : "0",
            borderBottomRightRadius: leftPct >= 99 ? "9999px" : "0",
          }}
        >
          {/* Inner glow effect when leading */}
          {leftLeading && !isTied && (
            <div
              className="absolute inset-0 rounded-l-full"
              style={{
                background: `linear-gradient(90deg, transparent, ${leftColor}40)`,
              }}
            />
          )}
        </div>

        {/* Right side */}
        <div
          ref={rightRef}
          className={cn(
            "h-full transition-all duration-300 ease-out relative",
            rightPulse && "animate-battle-bar-pulse",
            rightLeading && !isTied && "animate-battle-bar-glow"
          )}
          style={{
            width: `${rightPct}%`,
            backgroundColor: rightColor,
            color: rightColor,
            borderTopRightRadius: "9999px",
            borderBottomRightRadius: "9999px",
            borderTopLeftRadius: rightPct >= 99 ? "9999px" : "0",
            borderBottomLeftRadius: rightPct >= 99 ? "9999px" : "0",
          }}
        >
          {/* Inner glow effect when leading */}
          {rightLeading && !isTied && (
            <div
              className="absolute inset-0 rounded-r-full"
              style={{
                background: `linear-gradient(270deg, transparent, ${rightColor}40)`,
              }}
            />
          )}
        </div>

        {/* Center divider line */}
        {total > 0 && !isTied && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-bg transition-all duration-300"
            style={{ left: `${leftPct}%`, transform: "translateX(-50%)" }}
          />
        )}
      </div>

      {/* Percentage indicators (optional, shown on lg size) */}
      {size === "lg" && total > 0 && (
        <div className="flex justify-between mt-1 text-xs text-text-muted">
          <span>{Math.round(leftPct)}%</span>
          <span>{Math.round(rightPct)}%</span>
        </div>
      )}
    </div>
  );
}
