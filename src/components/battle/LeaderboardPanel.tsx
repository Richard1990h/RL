"use client";

import { Trophy, Crown, Star, Gift, Medal } from "lucide-react";
import type { User } from "@/lib/types";
import Avatar from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";

interface GifterEntry {
  userId: string;
  total: number;
  displayName?: string;
  avatarUrl?: string;
}

interface LeaderboardPanelProps {
  scores: Record<string, number>;
  users: User[];
  topGifters?: GifterEntry[];
  showTopGifters?: boolean;
}

const rankConfig: Record<number, { icon: React.ReactNode; color: string }> = {
  0: { icon: <Crown size={16} />, color: "text-warning" },
  1: { icon: <Trophy size={16} />, color: "text-text-secondary" },
  2: { icon: <Star size={16} />, color: "text-warning/60" },
};

const gifterRankConfig: Record<number, { icon: React.ReactNode; color: string; bgColor: string; label: string }> = {
  0: { icon: <Crown size={14} />, color: "text-warning", bgColor: "bg-warning/20", label: "Top Supporter" },
  1: { icon: <Medal size={14} />, color: "text-gray-400", bgColor: "bg-gray-500/20", label: "Silver" },
  2: { icon: <Medal size={14} />, color: "text-orange-600", bgColor: "bg-orange-600/20", label: "Bronze" },
};

function formatCredits(credits: number): string {
  if (credits >= 10000) return `${(credits / 1000).toFixed(1)}K`;
  if (credits >= 1000) return `${(credits / 1000).toFixed(1)}K`;
  return credits.toLocaleString();
}

export default function LeaderboardPanel({
  scores,
  users,
  topGifters = [],
  showTopGifters = true,
}: LeaderboardPanelProps) {
  const userMap = new Map(users.map((u) => [u.id, u]));

  const sorted = Object.entries(scores)
    .sort(([, a], [, b]) => b - a)
    .map(([userId, score], index) => ({
      userId,
      score,
      rank: index,
      user: userMap.get(userId),
    }));

  // Enrich top gifters with user data
  const enrichedGifters = topGifters.map((g) => {
    const user = userMap.get(g.userId);
    return {
      ...g,
      displayName: g.displayName || user?.displayName || "Unknown",
      avatarUrl: g.avatarUrl || user?.avatarUrl,
    };
  });

  return (
    <div className="space-y-4">
      {/* Players Leaderboard */}
      <div className="bg-bg-surface border border-border rounded-radius-lg overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Trophy size={16} className="text-warning" />
          <h3 className="text-sm font-semibold text-text">Leaderboard</h3>
        </div>

        {/* List */}
        <div className="divide-y divide-border">
          {sorted.map(({ userId, score, rank, user }) => {
            const cfg = rankConfig[rank];
            return (
              <div
                key={userId}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 transition-colors",
                  rank === 0 && "bg-warning/5"
                )}
              >
                {/* Rank */}
                <span
                  className={cn(
                    "shrink-0 w-6 text-center font-bold text-sm",
                    cfg?.color || "text-text-muted"
                  )}
                >
                  {cfg ? cfg.icon : <span>{rank + 1}</span>}
                </span>

                {/* User */}
                <Avatar
                  src={user?.avatarUrl}
                  name={user?.displayName || "User"}
                  size="sm"
                />
                <span className="flex-1 text-sm font-medium text-text truncate">
                  {user?.displayName || userId}
                </span>

                {/* Score */}
                <span className="shrink-0 text-sm font-semibold text-accent">
                  {formatCredits(score)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top Gifters Section */}
      {showTopGifters && enrichedGifters.length > 0 && (
        <div className="bg-bg-surface border border-border rounded-radius-lg overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Gift size={16} className="text-pink-500" />
            <h3 className="text-sm font-semibold text-text">Top Supporters</h3>
          </div>

          {/* Top 3 gifters with special styling */}
          <div className="p-3 space-y-2">
            {enrichedGifters.slice(0, 3).map((gifter, index) => {
              const cfg = gifterRankConfig[index];
              return (
                <div
                  key={gifter.userId}
                  className={cn(
                    "flex items-center gap-3 p-2.5 rounded-xl border transition-all",
                    index === 0
                      ? "bg-gradient-to-r from-warning/10 to-transparent border-warning/30 shadow-sm shadow-warning/10"
                      : index === 1
                        ? "bg-gray-500/5 border-gray-500/20"
                        : "bg-orange-600/5 border-orange-600/20"
                  )}
                >
                  {/* Rank badge */}
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                      cfg?.bgColor
                    )}
                  >
                    <span className={cfg?.color}>{cfg?.icon}</span>
                  </div>

                  {/* User */}
                  <Avatar
                    src={gifter.avatarUrl}
                    name={gifter.displayName}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-text truncate block">
                      {gifter.displayName}
                    </span>
                    {index === 0 && (
                      <span className="text-[10px] text-warning font-semibold">
                        {cfg?.label}
                      </span>
                    )}
                  </div>

                  {/* Total gifted */}
                  <div className="text-right">
                    <span
                      className={cn("text-sm font-bold", cfg?.color)}
                    >
                      {formatCredits(gifter.total)}
                    </span>
                    <span className="block text-[10px] text-text-muted">
                      gifted
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Remaining gifters (4-10) in compact list */}
            {enrichedGifters.length > 3 && (
              <div className="pt-2 mt-2 border-t border-border space-y-1">
                {enrichedGifters.slice(3, 10).map((gifter, index) => (
                  <div
                    key={gifter.userId}
                    className="flex items-center gap-2 px-2 py-1.5"
                  >
                    <span className="text-xs text-text-muted w-4 text-center">
                      {index + 4}
                    </span>
                    <Avatar
                      src={gifter.avatarUrl}
                      name={gifter.displayName}
                      size="sm"
                    />
                    <span className="flex-1 text-xs text-text truncate">
                      {gifter.displayName}
                    </span>
                    <span className="text-xs font-medium text-text-secondary">
                      {formatCredits(gifter.total)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Free power-up rewards info */}
          <div className="px-4 py-2 bg-bg-surface2/50 border-t border-border">
            <p className="text-[10px] text-text-muted text-center">
              Top 3 supporters earn free power-ups!
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
