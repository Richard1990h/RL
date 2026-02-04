"use client";

import { useEffect, useRef } from "react";
import { Mic, Video as VideoIcon } from "lucide-react";
import type { User } from "@/lib/types";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";

interface Participant {
  userId: string;
  role: string;
}

interface ParticipantBoxProps {
  participant: Participant;
  user: User;
  score: number;
  isEliminated?: boolean;
  stream?: MediaStream | null;
}

export default function ParticipantBox({
  participant,
  user,
  score,
  isEliminated = false,
  stream,
}: ParticipantBoxProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (stream) {
      video.srcObject = stream;
    } else {
      video.srcObject = null;
    }
    return () => { video.srcObject = null; };
  }, [stream]);

  return (
    <div
      className={`
        relative bg-bg-surface border border-border rounded-radius-lg overflow-hidden
        ${isEliminated ? "opacity-70" : ""}
      `}
    >
      {/* Video area - real stream or avatar fallback */}
      <div className="relative aspect-video bg-bg-surface2 flex items-center justify-center">
        {stream ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        ) : (
          <Avatar src={user.avatarUrl} name={user.displayName} size="xl" />
        )}

        {/* Mic/Camera icons (display only) */}
        <div className="absolute top-2 right-2 flex items-center gap-1.5">
          <span className="p-1.5 rounded-lg bg-black/50 text-white">
            <Mic size={14} />
          </span>
          <span className="p-1.5 rounded-lg bg-black/50 text-white">
            <VideoIcon size={14} />
          </span>
        </div>

        {/* Eliminated overlay */}
        {isEliminated && (
          <div className="absolute inset-0 bg-danger/40 flex items-center justify-center z-10">
            <span className="text-white font-bold text-lg tracking-wider uppercase px-4 py-2 bg-danger/70 rounded-radius-md">
              ELIMINATED
            </span>
          </div>
        )}
      </div>

      {/* Info bar */}
      <div className="px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-text truncate">
            {user.displayName}
          </span>
          <Badge variant={participant.role === "host" ? "premium" : "default"}>
            {participant.role === "host" ? "Host" : "Guest"}
          </Badge>
        </div>
      </div>

      {/* Score bar */}
      <div className="px-3 pb-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-text-muted">Score</span>
          <span className="font-semibold text-accent">
            {`$${(score / 100).toFixed(2)}`}
          </span>
        </div>
        <div className="w-full h-1.5 bg-bg-surface2 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, (score / 10000) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
