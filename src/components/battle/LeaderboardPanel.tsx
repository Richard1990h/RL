"use client";

import { Trophy, Crown, Star } from "lucide-react";
import type { User } from "@/lib/types";
import Avatar from "@/components/ui/Avatar";

interface LeaderboardPanelProps {
  scores: Record<string, number>;
  users: User[];
}

const rankConfig: Record<number, { icon: React.ReactNode; color: string }> = {
  0: { icon: <Crown size={16} />, color: "text-warning" },
  1: { icon: <Trophy size={16} />, color: "text-text-secondary" },
  2: { icon: <Star size={16} />, color: "text-warning/60" },
};

export default function LeaderboardPanel({
  scores,
  users,
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

  return (
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
              className={`flex items-center gap-3 px-4 py-3 ${rank === 0 ? "bg-warning/5" : ""}`}
            >
              {/* Rank */}
              <span
                className={`shrink-0 w-6 text-center font-bold text-sm ${cfg?.color || "text-text-muted"}`}
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
                {`$${(score / 100).toFixed(2)}`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
