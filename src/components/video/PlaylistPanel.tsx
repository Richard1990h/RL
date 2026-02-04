"use client";

import { Film, Play } from "lucide-react";
import type { Series, Video } from "@/lib/types";

interface PlaylistPanelProps {
  series: Series;
  currentVideoId: string;
  onSelect: (videoId: string) => void;
  videos: Video[];
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function PlaylistPanel({
  series,
  currentVideoId,
  onSelect,
  videos,
}: PlaylistPanelProps) {
  return (
    <div className="bg-bg-surface border border-border rounded-radius-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-text">{series.title}</h3>
        <p className="text-xs text-text-muted mt-0.5">
          {series.totalEpisodes} episodes
        </p>
      </div>

      {/* Episode list - vertical stack, sorted by order */}
      <div className="max-h-[500px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
        {[...series.episodes].sort((a, b) => a.order - b.order).map((ep, idx) => {
          const video = videos.find((v) => v.id === ep.videoId);
          const isCurrent = ep.videoId === currentVideoId;

          return (
            <button
              key={ep.videoId}
              onClick={() => onSelect(ep.videoId)}
              className={`
                w-full flex items-center gap-3 px-4 py-3 text-left transition-colors
                ${isCurrent ? "bg-primary/10 border-l-2 border-primary" : "hover:bg-bg-surface2 border-l-2 border-transparent"}
              `}
            >
              {/* Episode number / now playing indicator */}
              <span className="shrink-0 w-6 text-center">
                {isCurrent ? (
                  <Play size={14} className="text-primary mx-auto fill-current" />
                ) : (
                  <span className="text-xs text-text-muted">{ep.order || idx + 1}</span>
                )}
              </span>

              {/* Thumbnail */}
              {video && (
                <div className="shrink-0 w-[100px] h-[56px] rounded-md overflow-hidden bg-bg-surface2 relative">
                  {video.thumbnailUrl ? (
                    <img
                      src={`${video.thumbnailUrl}?v=2`}
                      alt={ep.titleOverride || video.title || `Episode ${idx + 1}`}
                      className="absolute inset-0 w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Film size={16} className="text-text-muted" />
                    </div>
                  )}
                  {/* Duration badge */}
                  <span className="absolute bottom-0.5 right-0.5 px-1 py-0.5 bg-black/75 text-white text-[10px] font-medium rounded">
                    {formatDuration(video.durationSec)}
                  </span>
                  {/* Now playing overlay */}
                  {isCurrent && (
                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                      <Play size={20} className="text-white fill-current drop-shadow-md" />
                    </div>
                  )}
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm leading-snug ${isCurrent ? "text-primary font-medium" : "text-text"}`}
                >
                  {ep.titleOverride || video?.title || `Episode ${idx + 1}`}
                </p>
                {isCurrent ? (
                  <span className="text-[10px] text-primary-light font-medium uppercase tracking-wider mt-0.5 inline-block">
                    Now Playing
                  </span>
                ) : (
                  video && (
                    <span className="text-[11px] text-text-muted mt-0.5 inline-block">
                      Episode {ep.order || idx + 1}
                    </span>
                  )
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
