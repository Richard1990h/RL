"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import { Users, Crown, Gift, Mic, MicOff } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import BattleBar from "./BattleBar";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/types";

interface PlayerState {
  userId: string;
  displayName: string;
  score: number;
  isEliminated: boolean;
  team?: "A" | "B";
  stream?: MediaStream | null;
  isMuted?: boolean;
  isSpeaking?: boolean;
}

interface TeamBattleLayoutProps {
  teamA: PlayerState[];
  teamB: PlayerState[];
  teamAScore: number;
  teamBScore: number;
  timer: number;
  userMap?: Map<string, User>;
  onGiftPlayer?: (playerId: string) => void;
  showGiftButtons?: boolean;
}

function formatScore(score: number): string {
  if (score >= 10000) return `${(score / 1000).toFixed(1)}K`;
  if (score >= 1000) return `${(score / 1000).toFixed(1)}K`;
  return score.toLocaleString();
}

function TeamPlayerCard({
  player,
  user,
  side,
  onGift,
  showGiftButton = true,
}: {
  player: PlayerState;
  user?: User;
  side: "left" | "right";
  onGift?: () => void;
  showGiftButton?: boolean;
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

  const borderColor = side === "left" ? "#3b82f6" : "#ef4444";
  const showVideo = player.stream && !videoError;

  return (
    <div
      className={cn(
        "relative rounded-xl overflow-hidden border-2 transition-all",
        player.isEliminated && "opacity-40 grayscale",
        player.isSpeaking && "border-success shadow-lg shadow-success/30"
      )}
      style={{
        borderColor: player.isSpeaking ? undefined : borderColor,
        boxShadow: !player.isSpeaking ? `0 0 10px ${borderColor}30` : undefined,
      }}
    >
      {/* Video/Avatar area */}
      <div className="aspect-video relative bg-bg-surface2">
        {showVideo ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            onError={() => setVideoError(true)}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ transform: side === "left" ? "scaleX(-1)" : "none" }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="border-2 rounded-full" style={{ borderColor }}>
              <Avatar
                src={user?.avatarUrl}
                name={player.displayName}
                size="lg"
              />
            </div>
          </div>
        )}

        {/* Eliminated overlay */}
        {player.isEliminated && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="text-sm font-bold text-danger uppercase">
              Eliminated
            </span>
          </div>
        )}

        {/* Mic indicator */}
        {player.isMuted !== undefined && (
          <div className="absolute top-2 right-2">
            <span
              className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center",
                player.isMuted ? "bg-danger/80" : "bg-success/80"
              )}
            >
              {player.isMuted ? (
                <MicOff size={12} className="text-white" />
              ) : (
                <Mic size={12} className="text-white" />
              )}
            </span>
          </div>
        )}

        {/* Score badge */}
        {!player.isEliminated && (
          <div className={cn("absolute bottom-2", side === "left" ? "left-2" : "right-2")}>
            <div
              className="px-2 py-1 rounded-lg backdrop-blur-sm text-xs font-bold"
              style={{ backgroundColor: `${borderColor}40`, color: borderColor }}
            >
              {formatScore(player.score)}
            </div>
          </div>
        )}
      </div>

      {/* Player info bar */}
      <div className="px-2 py-1.5 bg-bg-surface flex items-center justify-between">
        <span className="text-xs font-medium text-text truncate flex-1">
          {player.displayName}
        </span>
        {showGiftButton && onGift && !player.isEliminated && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onGift();
            }}
            className="p-1 rounded-md hover:bg-bg-surface2 transition-colors"
            style={{ color: borderColor }}
          >
            <Gift size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function TeamBattleLayout({
  teamA,
  teamB,
  teamAScore,
  teamBScore,
  timer,
  userMap,
  onGiftPlayer,
  showGiftButtons = true,
}: TeamBattleLayoutProps) {
  // Determine grid layout based on team size
  const maxTeamSize = Math.max(teamA.length, teamB.length);
  const gridCols = useMemo(() => {
    if (maxTeamSize <= 2) return "grid-cols-1";
    if (maxTeamSize <= 4) return "grid-cols-2";
    return "grid-cols-2 lg:grid-cols-3";
  }, [maxTeamSize]);

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Main battle bar */}
      <div className="px-4">
        <BattleBar
          leftScore={teamAScore}
          rightScore={teamBScore}
          leftLabel="Team Blue"
          rightLabel="Team Red"
          leftColor="#3b82f6"
          rightColor="#ef4444"
          timer={timer}
          showTimer
          size="lg"
        />
      </div>

      {/* Teams container */}
      <div className="flex-1 flex gap-3 overflow-hidden px-4">
        {/* Team A (Blue) */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Team header */}
          <div className="flex items-center gap-2 mb-3 px-2">
            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
              <Users size={16} className="text-blue-400" />
            </div>
            <div>
              <span className="text-sm font-bold text-blue-400">Team Blue</span>
              <span className="block text-xs text-text-muted">
                {teamA.filter((p) => !p.isEliminated).length}/{teamA.length} active
              </span>
            </div>
            <div className="ml-auto text-lg font-bold text-blue-400">
              {formatScore(teamAScore)}
            </div>
          </div>

          {/* Team A players grid */}
          <div className={cn("grid gap-2 overflow-y-auto flex-1", gridCols)}>
            {teamA.map((player) => (
              <TeamPlayerCard
                key={player.userId}
                player={player}
                user={userMap?.get(player.userId)}
                side="left"
                onGift={onGiftPlayer ? () => onGiftPlayer(player.userId) : undefined}
                showGiftButton={showGiftButtons}
              />
            ))}
          </div>
        </div>

        {/* Center divider with vertical battle bar */}
        <div className="flex flex-col items-center justify-center py-4">
          <BattleBar
            leftScore={teamAScore}
            rightScore={teamBScore}
            leftLabel="A"
            rightLabel="B"
            leftColor="#3b82f6"
            rightColor="#ef4444"
            orientation="vertical"
            size="md"
          />
        </div>

        {/* Team B (Red) */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Team header */}
          <div className="flex items-center gap-2 mb-3 px-2 flex-row-reverse">
            <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
              <Users size={16} className="text-red-400" />
            </div>
            <div className="text-right">
              <span className="text-sm font-bold text-red-400">Team Red</span>
              <span className="block text-xs text-text-muted">
                {teamB.filter((p) => !p.isEliminated).length}/{teamB.length} active
              </span>
            </div>
            <div className="mr-auto text-lg font-bold text-red-400">
              {formatScore(teamBScore)}
            </div>
          </div>

          {/* Team B players grid */}
          <div className={cn("grid gap-2 overflow-y-auto flex-1", gridCols)}>
            {teamB.map((player) => (
              <TeamPlayerCard
                key={player.userId}
                player={player}
                user={userMap?.get(player.userId)}
                side="right"
                onGift={onGiftPlayer ? () => onGiftPlayer(player.userId) : undefined}
                showGiftButton={showGiftButtons}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Team totals footer */}
      <div className="px-4 py-2 border-t border-border bg-bg-surface/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-bold",
                teamAScore > teamBScore
                  ? "bg-blue-500/20 text-blue-400 animate-team-blue"
                  : "bg-blue-500/10 text-blue-400/60"
              )}
            >
              {formatScore(teamAScore)} pts
            </span>
            {teamAScore > teamBScore && (
              <Crown size={16} className="text-warning" />
            )}
          </div>

          <span className="text-text-muted font-semibold">VS</span>

          <div className="flex items-center gap-2">
            {teamBScore > teamAScore && (
              <Crown size={16} className="text-warning" />
            )}
            <span
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-bold",
                teamBScore > teamAScore
                  ? "bg-red-500/20 text-red-400 animate-team-red"
                  : "bg-red-500/10 text-red-400/60"
              )}
            >
              {formatScore(teamBScore)} pts
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Compact version for mobile
export function TeamBattleCompact({
  teamA,
  teamB,
  teamAScore,
  teamBScore,
  timer,
}: Omit<TeamBattleLayoutProps, "userMap" | "onGiftPlayer" | "showGiftButtons">) {
  return (
    <div className="space-y-3">
      {/* Battle bar */}
      <BattleBar
        leftScore={teamAScore}
        rightScore={teamBScore}
        leftLabel="Team Blue"
        rightLabel="Team Red"
        leftColor="#3b82f6"
        rightColor="#ef4444"
        timer={timer}
        showTimer
        size="md"
      />

      {/* Team summaries */}
      <div className="flex gap-3">
        {/* Team A */}
        <div className="flex-1 p-3 rounded-xl border-2 border-blue-500/50 bg-blue-500/5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-blue-400">Team Blue</span>
            <span className="text-lg font-bold text-blue-400">
              {formatScore(teamAScore)}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {teamA.map((player) => (
              <span
                key={player.userId}
                className={cn(
                  "px-2 py-0.5 text-xs rounded-full",
                  player.isEliminated
                    ? "bg-gray-500/20 text-gray-400 line-through"
                    : "bg-blue-500/20 text-blue-300"
                )}
              >
                {player.displayName}
              </span>
            ))}
          </div>
        </div>

        {/* Team B */}
        <div className="flex-1 p-3 rounded-xl border-2 border-red-500/50 bg-red-500/5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-red-400">Team Red</span>
            <span className="text-lg font-bold text-red-400">
              {formatScore(teamBScore)}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {teamB.map((player) => (
              <span
                key={player.userId}
                className={cn(
                  "px-2 py-0.5 text-xs rounded-full",
                  player.isEliminated
                    ? "bg-gray-500/20 text-gray-400 line-through"
                    : "bg-red-500/20 text-red-300"
                )}
              >
                {player.displayName}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
