"use client";

import Link from "next/link";
import { Eye, Swords, Zap } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";

interface LiveCardProps {
  room: {
    id: string;
    title: string;
    tags?: string[];
    viewerCount?: number;
    isBattleRoom?: boolean;
    mode?: string;
  };
  host: {
    displayName: string;
    avatarUrl?: string | null;
  };
}

const modeLabels: Record<string, { label: string; icon: React.ReactNode }> = {
  standard: { label: "Standard", icon: null },
  timer_wars: { label: "Timer Wars", icon: <Zap size={12} /> },
  tower_wars: { label: "Tower Wars", icon: <Swords size={12} /> },
  trivia: { label: "Trivia", icon: <Zap size={12} /> },
  auction: { label: "Auction", icon: <Zap size={12} /> },
  spin_wheel: { label: "Spin Wheel", icon: <Zap size={12} /> },
  last_standing: { label: "Last Standing", icon: <Swords size={12} /> },
};

function formatViewers(n: number): string {
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export default function LiveCard({ room, host }: LiveCardProps) {
  const mode = room.mode ? modeLabels[room.mode] : undefined;

  return (
    <Link
      href={`/live/${room.id}`}
      className="group block rounded-radius-lg overflow-hidden transition-transform duration-200 hover:scale-[1.02]"
    >
      {/* Thumbnail area */}
      <div className="relative aspect-video bg-bg-surface2 rounded-radius-md overflow-hidden">
        {/* Fallback gradient when no thumbnail */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20" />

        {/* LIVE badge */}
        <div className="absolute top-2 left-2">
          <Badge variant="live">LIVE</Badge>
        </div>

        {/* Viewer count */}
        <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 bg-black/60 rounded text-xs text-white">
          <Eye size={12} />
          {formatViewers(room.viewerCount ?? 0)}
        </div>

        {/* Mode badge for battle rooms */}
        {mode && room.mode !== "standard" && (
          <div className="absolute bottom-2 left-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-primary/80 text-white rounded uppercase">
              {mode.icon}
              {mode.label}
            </span>
          </div>
        )}

        {/* Host overlay at bottom */}
        <div className="absolute bottom-2 right-2 flex items-center gap-2 px-2 py-1 bg-black/60 rounded-full">
          <Avatar src={host.avatarUrl} name={host.displayName} size="sm" />
          <span className="text-xs text-white font-medium pr-1">
            {host.displayName}
          </span>
        </div>
      </div>

      {/* Title */}
      <div className="mt-2">
        <h3 className="text-sm font-medium text-text line-clamp-1">
          {room.title}
        </h3>
        <div className="flex flex-wrap gap-1 mt-1">
          {(room.tags ?? []).slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="text-[10px] text-text-muted bg-bg-surface2 rounded px-1.5 py-0.5"
            >
              #{tag}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
