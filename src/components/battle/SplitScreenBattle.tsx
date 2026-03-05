"use client";

import { useRef, useEffect, useState } from "react";
import { Gift, Crown, Mic, MicOff } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import BattleBar from "./BattleBar";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/types";

interface PlayerInfo {
  user: User;
  score: number;
  stream?: MediaStream | null;
  isMuted?: boolean;
  isSpeaking?: boolean;
}

interface SplitScreenBattleProps {
  leftPlayer: PlayerInfo;
  rightPlayer: PlayerInfo;
  timer: number;
  onGiftLeft?: () => void;
  onGiftRight?: () => void;
  showGiftButtons?: boolean;
  activePowerUps?: Array<{
    type: string;
    targetId: string;
    expiresAt: number;
  }>;
}

function formatScore(score: number): string {
  if (score >= 10000) return `${(score / 1000).toFixed(1)}K`;
  if (score >= 1000) return `${(score / 1000).toFixed(1)}K`;
  return score.toLocaleString();
}

function VideoPanel({
  player,
  side,
  onGift,
  showGiftButton = true,
  hasMist = false,
}: {
  player: PlayerInfo;
  side: "left" | "right";
  onGift?: () => void;
  showGiftButton?: boolean;
  hasMist?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoError, setVideoError] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (player.stream) {
      video.srcObject = player.stream;
      setVideoError(false);
    } else {
      video.srcObject = null;
    }
  }, [player.stream]);

  const handleVideoError = () => {
    setVideoError(true);
  };

  const borderColor = side === "left" ? "#3b82f6" : "#ef4444";
  const gradientDir = side === "left" ? "to-r" : "to-l";
  const showVideo = player.stream && !videoError;

  return (
    <div className="relative flex-1 flex flex-col">
      {/* Video/Avatar container */}
      <div
        className={cn(
          "relative flex-1 rounded-xl overflow-hidden border-2 transition-all duration-300",
          player.isSpeaking && "border-success shadow-lg shadow-success/30",
          side === "left" ? "animate-team-blue" : "animate-team-red"
        )}
        style={{
          borderColor: player.isSpeaking ? undefined : borderColor,
          boxShadow: player.isSpeaking
            ? undefined
            : `0 0 20px ${borderColor}40`,
        }}
      >
        {/* Video stream */}
        {showVideo ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            onError={handleVideoError}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ transform: side === "left" ? "scaleX(-1)" : "none" }}
          />
        ) : (
          /* Avatar fallback with gradient background */
          <div
            className={cn(
              "absolute inset-0 flex items-center justify-center",
              side === "left" ? "bg-gradient-to-r" : "bg-gradient-to-l",
              side === "left"
                ? "from-blue-900/50 to-bg-surface"
                : "from-red-900/50 to-bg-surface"
            )}
          >
            <div className="border-4 rounded-full" style={{ borderColor }}>
              <Avatar
                src={player.user.avatarUrl}
                name={player.user.displayName}
                size="xl"
              />
            </div>
          </div>
        )}

        {/* Player name overlay */}
        <div
          className={cn(
            "absolute bottom-0 left-0 right-0 p-3",
            "bg-gradient-to-t from-black/80 to-transparent"
          )}
        >
          <div
            className={cn(
              "flex items-center gap-2",
              side === "right" && "flex-row-reverse"
            )}
          >
            <span className="text-white font-bold text-sm truncate">
              {player.user.displayName}
            </span>
            {player.user.verifiedBadge && (
              <Crown size={14} className="text-warning shrink-0" />
            )}
            {player.isMuted !== undefined && (
              <span
                className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center",
                  player.isMuted ? "bg-danger/70" : "bg-success/70"
                )}
              >
                {player.isMuted ? (
                  <MicOff size={10} className="text-white" />
                ) : (
                  <Mic size={10} className="text-white" />
                )}
              </span>
            )}
          </div>
        </div>

        {/* Score overlay */}
        <div
          className={cn(
            "absolute top-3",
            side === "left" ? "left-3" : "right-3"
          )}
        >
          {hasMist ? (
            /* Magic Mist effect - score hidden */
            <div className="relative overflow-hidden rounded-lg px-3 py-1.5 bg-purple-900/60 backdrop-blur-sm">
              <div
                className="absolute inset-0 bg-gradient-to-r from-purple-500/40 via-blue-500/40 to-purple-500/40 animate-mist-flow"
                style={{ backgroundSize: "200% 100%" }}
              />
              <span className="relative text-lg font-bold text-purple-200 animate-mist-float">
                ???
              </span>
            </div>
          ) : (
            <div
              className="rounded-lg px-3 py-1.5 backdrop-blur-sm"
              style={{ backgroundColor: `${borderColor}20` }}
            >
              <span
                className="text-lg font-bold"
                style={{ color: borderColor }}
              >
                {formatScore(player.score)}
              </span>
            </div>
          )}
        </div>

        {/* Gift button overlay */}
        {showGiftButton && onGift && (
          <div
            className={cn(
              "absolute bottom-16",
              side === "left" ? "right-3" : "left-3"
            )}
          >
            <Button
              variant="primary"
              size="sm"
              icon={<Gift size={14} />}
              onClick={(e) => {
                e.stopPropagation();
                onGift();
              }}
              className="shadow-lg"
              style={{ backgroundColor: borderColor }}
            >
              Gift
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SplitScreenBattle({
  leftPlayer,
  rightPlayer,
  timer,
  onGiftLeft,
  onGiftRight,
  showGiftButtons = true,
  activePowerUps = [],
}: SplitScreenBattleProps) {
  // Check for Magic Mist on each player
  const now = Date.now();
  const leftHasMist = activePowerUps.some(
    (p) =>
      p.type === "MAGIC_MIST" &&
      p.targetId === leftPlayer.user.id &&
      p.expiresAt > now
  );
  const rightHasMist = activePowerUps.some(
    (p) =>
      p.type === "MAGIC_MIST" &&
      p.targetId === rightPlayer.user.id &&
      p.expiresAt > now
  );

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Main battle area */}
      <div className="flex-1 flex gap-2 min-h-0">
        {/* Left player panel */}
        <VideoPanel
          player={leftPlayer}
          side="left"
          onGift={onGiftLeft}
          showGiftButton={showGiftButtons}
          hasMist={leftHasMist}
        />

        {/* Center battle bar (vertical) */}
        <div className="flex flex-col items-center justify-center py-4">
          <BattleBar
            leftScore={leftPlayer.score}
            rightScore={rightPlayer.score}
            leftLabel={leftPlayer.user.displayName}
            rightLabel={rightPlayer.user.displayName}
            timer={timer}
            showTimer
            orientation="vertical"
            size="md"
          />
        </div>

        {/* Right player panel */}
        <VideoPanel
          player={rightPlayer}
          side="right"
          onGift={onGiftRight}
          showGiftButton={showGiftButtons}
          hasMist={rightHasMist}
        />
      </div>

      {/* Bottom battle bar (horizontal) */}
      <div className="px-4 pb-2">
        <BattleBar
          leftScore={leftPlayer.score}
          rightScore={rightPlayer.score}
          leftLabel={leftPlayer.user.displayName}
          rightLabel={rightPlayer.user.displayName}
          timer={timer}
          showTimer
          orientation="horizontal"
          size="lg"
        />
      </div>
    </div>
  );
}

// Compact variant for mobile or smaller spaces
export function SplitScreenBattleCompact({
  leftPlayer,
  rightPlayer,
  timer,
  onGiftLeft,
  onGiftRight,
  activePowerUps = [],
}: SplitScreenBattleProps) {
  const now = Date.now();
  const leftHasMist = activePowerUps.some(
    (p) =>
      p.type === "MAGIC_MIST" &&
      p.targetId === leftPlayer.user.id &&
      p.expiresAt > now
  );
  const rightHasMist = activePowerUps.some(
    (p) =>
      p.type === "MAGIC_MIST" &&
      p.targetId === rightPlayer.user.id &&
      p.expiresAt > now
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Horizontal battle bar */}
      <BattleBar
        leftScore={leftPlayer.score}
        rightScore={rightPlayer.score}
        leftLabel={leftPlayer.user.displayName}
        rightLabel={rightPlayer.user.displayName}
        timer={timer}
        showTimer
        orientation="horizontal"
        size="md"
      />

      {/* Two player cards side by side */}
      <div className="flex gap-2">
        {/* Left player card */}
        <div
          className={cn(
            "flex-1 p-3 rounded-xl border-2 transition-all",
            "bg-gradient-to-br from-blue-900/20 to-transparent"
          )}
          style={{ borderColor: "#3b82f6" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Avatar
              src={leftPlayer.user.avatarUrl}
              name={leftPlayer.user.displayName}
              size="sm"
            />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-text truncate block">
                {leftPlayer.user.displayName}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            {leftHasMist ? (
              <span className="text-lg font-bold text-purple-400">???</span>
            ) : (
              <span className="text-lg font-bold text-blue-400">
                {formatScore(leftPlayer.score)}
              </span>
            )}
            {onGiftLeft && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Gift size={12} />}
                onClick={onGiftLeft}
                className="text-blue-400"
              >
                Gift
              </Button>
            )}
          </div>
        </div>

        {/* Right player card */}
        <div
          className={cn(
            "flex-1 p-3 rounded-xl border-2 transition-all",
            "bg-gradient-to-bl from-red-900/20 to-transparent"
          )}
          style={{ borderColor: "#ef4444" }}
        >
          <div className="flex items-center gap-2 mb-2 flex-row-reverse">
            <Avatar
              src={rightPlayer.user.avatarUrl}
              name={rightPlayer.user.displayName}
              size="sm"
            />
            <div className="flex-1 min-w-0 text-right">
              <span className="text-sm font-semibold text-text truncate block">
                {rightPlayer.user.displayName}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between flex-row-reverse">
            {rightHasMist ? (
              <span className="text-lg font-bold text-purple-400">???</span>
            ) : (
              <span className="text-lg font-bold text-red-400">
                {formatScore(rightPlayer.score)}
              </span>
            )}
            {onGiftRight && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Gift size={12} />}
                onClick={onGiftRight}
                className="text-red-400"
              >
                Gift
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
