"use client";

import { useEffect, useRef } from "react";
import { Camera, CameraOff, Mic, MicOff, Crown, Trophy, Gift, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCredits } from "@/lib/utils";
import type { User } from "@/lib/types";

interface VideoTileProps {
  user: User;
  stream: MediaStream | null;
  isHost?: boolean;
  isSmall?: boolean;
  micActive?: boolean;
  cameraActive?: boolean;
  donationTotal?: number;
  score?: number;
  showWinner?: boolean;
  background?: string;
  connectionQuality?: "good" | "fair" | "poor" | "bad" | null;
  audioOnly?: boolean;
  onDonate?: () => void;
}

export default function VideoTile({
  user,
  stream,
  isHost,
  isSmall,
  micActive,
  cameraActive,
  donationTotal = 0,
  score,
  showWinner,
  background,
  connectionQuality,
  audioOnly,
  onDonate,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (stream && cameraActive && !audioOnly) {
      video.srcObject = stream;
    } else {
      video.srcObject = null;
    }

    return () => {
      video.srcObject = null;
    };
  }, [stream, cameraActive, audioOnly]);

  const hasVideo = stream && cameraActive && !audioOnly;

  return (
    <div className={cn("flex flex-col gap-1.5 group/tile", isSmall && "w-28")}>
      <div
        className={cn(
          "relative rounded-2xl border border-border/60 overflow-hidden flex items-center justify-center",
          "bg-gradient-to-br from-bg-surface2 to-bg-surface3",
          "transition-all duration-200 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5",
          isSmall ? "h-20" : "aspect-video"
        )}
        style={{ background: hasVideo ? undefined : background || undefined }}
      >
        {hasVideo ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        ) : (
          <img
            src={user.avatarUrl ?? undefined}
            alt={user.displayName}
            className={cn(
              "rounded-full border-2 transition-transform duration-200 group-hover/tile:scale-105",
              isHost ? "border-warning/60" : "border-primary/30",
              isSmall ? "w-10 h-10" : "w-16 h-16"
            )}
          />
        )}

        {/* Audio-only indicator */}
        {audioOnly && stream && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
            <img
              src={user.avatarUrl ?? undefined}
              alt={user.displayName}
              className={cn(
                "rounded-full border-2 mx-auto",
                isHost ? "border-warning/60" : "border-primary/30",
                isSmall ? "w-10 h-10" : "w-16 h-16"
              )}
            />
            <p className="text-[10px] text-text-muted mt-1">Audio only</p>
          </div>
        )}

        {/* Host badge */}
        {isHost && (
          <span className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 bg-warning/90 text-black text-[10px] font-bold rounded-full shadow-sm">
            <Crown size={10} /> Host
          </span>
        )}

        {/* Connection quality indicator */}
        {connectionQuality && !isSmall && (
          <span className="absolute top-2 right-2">
            <span
              className={cn(
                "w-2.5 h-2.5 rounded-full inline-block",
                connectionQuality === "good" && "bg-success",
                connectionQuality === "fair" && "bg-warning",
                connectionQuality === "poor" && "bg-orange-500",
                connectionQuality === "bad" && "bg-danger"
              )}
              title={`Connection: ${connectionQuality}`}
            />
          </span>
        )}

        {/* Status icons (mic + camera) */}
        <div className="absolute bottom-2 right-2 flex items-center gap-1">
          {cameraActive !== undefined && (
            <span
              className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center backdrop-blur-sm",
                cameraActive ? "bg-success/70" : "bg-danger/70"
              )}
            >
              {cameraActive ? (
                <Camera size={10} className="text-white" />
              ) : (
                <CameraOff size={10} className="text-white" />
              )}
            </span>
          )}
          {micActive !== undefined && (
            <span
              className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center backdrop-blur-sm",
                micActive ? "bg-success/70" : "bg-danger/70"
              )}
            >
              {micActive ? (
                <Mic size={10} className="text-white" />
              ) : (
                <MicOff size={10} className="text-white" />
              )}
            </span>
          )}
        </div>

        {showWinner && (
          <div className="absolute inset-0 bg-success/20 flex items-center justify-center">
            <span className="px-3 py-1 bg-success text-white text-sm font-bold rounded-full flex items-center gap-1">
              <Trophy size={14} /> WINNER
            </span>
          </div>
        )}

        {score !== undefined && (
          <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/70 text-text text-xs font-bold rounded-full backdrop-blur-sm">
            {score} pts
          </div>
        )}
      </div>

      {/* Name + donation row */}
      <div className="flex items-center justify-between px-1">
        <span
          className={cn(
            "font-medium truncate",
            isSmall ? "text-[10px] text-text-secondary" : "text-xs text-text"
          )}
        >
          {user.displayName}
        </span>
        <span className="text-[10px] text-success font-medium">
          {formatCredits(donationTotal)}
        </span>
      </div>

      {/* Send Credits button */}
      {onDonate && !isSmall && (
        <button
          onClick={onDonate}
          className="w-full py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium rounded-xl transition-colors flex items-center justify-center gap-1 border border-primary/20 hover:border-primary/40"
        >
          <Gift size={12} /> Send Credits
        </button>
      )}
    </div>
  );
}
