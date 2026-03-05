"use client";

import { useState, useEffect, useMemo } from "react";
import { Trophy, Crown, Gift, Star, Medal, PartyPopper } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/types";

interface GifterEntry {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  total: number;
}

interface VictoryLapProps {
  winner: {
    user: User;
    score: number;
  };
  loser?: {
    user: User;
    score: number;
  };
  topGifters: GifterEntry[];
  timeRemaining: number; // Seconds until next battle
  onGiftWinner?: () => void;
  showGiftButton?: boolean;
}

// Confetti particle component
function ConfettiParticle({ index, total }: { index: number; total: number }) {
  const colors = ["#f59e0b", "#ec4899", "#8b5cf6", "#3b82f6", "#10b981", "#ef4444"];
  const color = colors[index % colors.length];
  const delay = Math.random() * 2;
  const duration = 3 + Math.random() * 2;
  const left = (index / total) * 100 + Math.random() * 10 - 5;
  const size = 6 + Math.random() * 8;

  return (
    <div
      className="absolute top-0 animate-confetti pointer-events-none"
      style={{
        left: `${left}%`,
        width: size,
        height: size,
        backgroundColor: color,
        borderRadius: index % 3 === 0 ? "50%" : "2px",
        animationDelay: `${delay}s`,
        animationDuration: `${duration}s`,
        transform: `rotate(${Math.random() * 360}deg)`,
      }}
    />
  );
}

function formatScore(score: number): string {
  if (score >= 10000) return `${(score / 1000).toFixed(1)}K`;
  if (score >= 1000) return `${(score / 1000).toFixed(1)}K`;
  return score.toLocaleString();
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Play victory sound
function playVictorySound() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const now = ctx.currentTime;

    // Fanfare melody
    const notes = [523, 659, 784, 1047, 784, 1047, 1319, 1047];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = i < 4 ? "triangle" : "sine";
      const t = now + i * 0.12;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.15, t + 0.03);
      gain.gain.setValueAtTime(0.15, t + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.start(t);
      osc.stop(t + 0.4);
    });

    // Shimmer effect
    const shimmer = ctx.createOscillator();
    const sg = ctx.createGain();
    shimmer.connect(sg);
    sg.connect(ctx.destination);
    shimmer.frequency.value = 2500;
    shimmer.type = "sine";
    sg.gain.setValueAtTime(0, now + 0.8);
    sg.gain.linearRampToValueAtTime(0.08, now + 0.85);
    sg.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
    shimmer.start(now + 0.8);
    shimmer.stop(now + 1.5);

    setTimeout(() => ctx.close(), 3000);
  } catch {
    // Audio not supported
  }
}

export default function VictoryLap({
  winner,
  loser,
  topGifters,
  timeRemaining,
  onGiftWinner,
  showGiftButton = true,
}: VictoryLapProps) {
  const [hasPlayedSound, setHasPlayedSound] = useState(false);

  // Play victory sound on mount
  useEffect(() => {
    if (!hasPlayedSound) {
      playVictorySound();
      setHasPlayedSound(true);
    }
  }, [hasPlayedSound]);

  // Generate confetti particles
  const confettiCount = 50;

  // Rank badges for top gifters
  const rankIcons = [
    { icon: Crown, color: "#f59e0b", bg: "bg-warning/20" },
    { icon: Medal, color: "#9ca3af", bg: "bg-gray-500/20" },
    { icon: Medal, color: "#cd7f32", bg: "bg-orange-700/20" },
  ];

  return (
    <div className="relative flex flex-col items-center py-6 px-4 overflow-hidden">
      {/* Confetti particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: confettiCount }).map((_, i) => (
          <ConfettiParticle key={i} index={i} total={confettiCount} />
        ))}
      </div>

      {/* Winner spotlight */}
      <div className="relative z-10 flex flex-col items-center animate-winner-scale">
        {/* Glowing background */}
        <div className="absolute inset-0 -m-8 rounded-full bg-warning/20 blur-3xl animate-winner-glow" />

        {/* Trophy icon */}
        <div className="relative mb-3">
          <Trophy size={48} className="text-warning drop-shadow-lg" />
          <PartyPopper
            size={24}
            className="absolute -right-4 -top-2 text-pink-400 animate-bounce"
          />
        </div>

        {/* Winner badge */}
        <div className="px-4 py-1.5 rounded-full bg-gradient-to-r from-warning to-amber-400 text-black text-sm font-black uppercase tracking-wider shadow-lg mb-4">
          Winner
        </div>

        {/* Winner avatar */}
        <div className="relative mb-3">
          <div className="absolute inset-0 -m-2 rounded-full animate-winner-glow" />
          <div className="border-4 border-warning shadow-2xl rounded-full">
            <Avatar
              src={winner.user.avatarUrl}
              name={winner.user.displayName}
              size="xl"
            />
          </div>
          {winner.user.verifiedBadge && (
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary flex items-center justify-center border-2 border-bg">
              <Star size={14} className="text-white" />
            </div>
          )}
        </div>

        {/* Winner name */}
        <h2 className="text-2xl font-black text-text mb-1">
          {winner.user.displayName}
        </h2>

        {/* Winner score */}
        <div className="flex items-center gap-2 text-warning">
          <Trophy size={18} />
          <span className="text-xl font-bold">{formatScore(winner.score)}</span>
          <span className="text-sm text-text-muted">pts</span>
        </div>
      </div>

      {/* Gift the winner button */}
      {showGiftButton && onGiftWinner && (
        <div className="relative z-10 mt-6">
          <Button
            variant="gradient"
            size="lg"
            icon={<Gift size={18} />}
            onClick={onGiftWinner}
            className="shadow-xl shadow-primary/30 animate-pulse"
          >
            Gift the Winner!
          </Button>
        </div>
      )}

      {/* Final scores comparison */}
      {loser && (
        <div className="relative z-10 flex items-center gap-6 mt-8 px-6 py-4 rounded-2xl bg-bg-surface/80 backdrop-blur-sm border border-border">
          {/* Winner side */}
          <div className="flex items-center gap-3">
            <div className="border-2 border-warning rounded-full">
              <Avatar
                src={winner.user.avatarUrl}
                name={winner.user.displayName}
                size="sm"
              />
            </div>
            <div>
              <span className="text-sm font-semibold text-text">
                {winner.user.displayName}
              </span>
              <span className="block text-lg font-bold text-warning">
                {formatScore(winner.score)}
              </span>
            </div>
          </div>

          {/* VS */}
          <span className="text-text-muted font-bold">vs</span>

          {/* Loser side */}
          <div className="flex items-center gap-3 opacity-60">
            <div className="text-right">
              <span className="text-sm font-semibold text-text">
                {loser.user.displayName}
              </span>
              <span className="block text-lg font-bold text-text-secondary">
                {formatScore(loser.score)}
              </span>
            </div>
            <div className="border-2 border-border rounded-full grayscale">
              <Avatar
                src={loser.user.avatarUrl}
                name={loser.user.displayName}
                size="sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* Top Gifters Leaderboard */}
      {topGifters.length > 0 && (
        <div className="relative z-10 w-full max-w-sm mt-8">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider text-center mb-3">
            Top Supporters
          </h3>
          <div className="space-y-2">
            {topGifters.slice(0, 3).map((gifter, index) => {
              const rank = rankIcons[index];
              const RankIcon = rank?.icon || Star;

              return (
                <div
                  key={gifter.userId}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 rounded-xl border",
                    index === 0
                      ? "bg-warning/10 border-warning/30"
                      : "bg-bg-surface border-border"
                  )}
                >
                  {/* Rank badge */}
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center",
                      rank?.bg || "bg-bg-surface2"
                    )}
                  >
                    <RankIcon
                      size={16}
                      style={{ color: rank?.color || "#6b7280" }}
                    />
                  </div>

                  {/* User info */}
                  <Avatar
                    src={gifter.avatarUrl}
                    name={gifter.displayName}
                    size="sm"
                  />
                  <span className="flex-1 text-sm font-medium text-text truncate">
                    {gifter.displayName}
                  </span>

                  {/* Total gifted */}
                  <span
                    className="text-sm font-bold"
                    style={{ color: rank?.color || "#6b7280" }}
                  >
                    {formatScore(gifter.total)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Next battle countdown */}
      <div className="relative z-10 mt-8 text-center">
        <span className="text-xs text-text-muted uppercase tracking-wider">
          Next battle in
        </span>
        <div className="text-3xl font-mono font-bold text-text mt-1">
          {formatTimer(timeRemaining)}
        </div>
      </div>
    </div>
  );
}
