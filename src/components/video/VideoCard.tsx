"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, Film, Layers, ThumbsUp } from "lucide-react";
import Avatar from "@/components/ui/Avatar";

interface VideoCardProps {
  video: {
    id: string;
    title: string;
    thumbnailUrl: string;
    durationSec: number;
    views: number;
    impressions?: number;
    likes: number;
    uploadDate: string;
    seriesOrder?: number | null;
  };
  creator: {
    displayName: string;
    username?: string;
    avatarUrl?: string | null;
  };
  series?: {
    title: string;
    totalEpisodes: number;
  } | null;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function VideoCard({ video, creator, series }: VideoCardProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <Link
      href={creator.username ? `/@${creator.username}/${video.id}` : `/watch/${video.id}`}
      className="group block rounded-xl overflow-hidden border border-border/60 bg-bg-surface p-2.5 transition-all duration-250 hover:scale-[1.02] hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-bg-surface2 overflow-hidden rounded-lg">
        {video.thumbnailUrl && !imgError ? (
          <img
            src={`${video.thumbnailUrl}?v=2`}
            alt={video.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-bg-surface2 to-bg-surface">
            <Film size={32} className="text-text-muted" />
          </div>
        )}
        {/* Duration badge */}
        <span className="absolute bottom-2 right-2 px-1.5 py-0.5 text-xs font-medium bg-black/80 text-white rounded">
          {formatDuration(video.durationSec)}
        </span>
        {/* Series badge */}
        {series && (
          <span className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-primary/90 text-white rounded-full backdrop-blur-sm">
            <Layers size={10} />
            {video.seriesOrder ? `Ep ${video.seriesOrder} of ${series.totalEpisodes}` : `${series.totalEpisodes} episodes`}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex gap-3 mt-3 pb-1">
        <Avatar src={creator.avatarUrl} name={creator.displayName} size="sm" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-text line-clamp-2 leading-snug">
            {video.title}
          </h3>
          <p className="text-xs text-text-secondary mt-1">
            {creator.displayName}
          </p>
          <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
            <span
              className="flex items-center gap-1 cursor-help"
              title="Impression Views — the number of times an ad was served on this video. Creators earn revenue from ad impressions."
            >
              <Eye size={12} />
              {formatViews(video.impressions ?? video.views)}
            </span>
            <span>{"·"}</span>
            <span className="flex items-center gap-1">
              <ThumbsUp size={11} />
              {formatViews(video.likes)}
            </span>
            <span>{"·"}</span>
            <span>{timeAgo(video.uploadDate)}</span>
          </div>
          {/* Series info line */}
          {series && (
            <div className="flex items-center gap-1 mt-1 text-[11px] text-primary font-medium">
              <Layers size={11} />
              <span>{series.title}</span>
              <span className="text-text-muted font-normal">· {series.totalEpisodes} episodes</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
