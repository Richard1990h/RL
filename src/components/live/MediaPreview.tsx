"use client";

import { useEffect, useRef } from "react";
import { CameraOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface MediaPreviewProps {
  stream: MediaStream | null;
  mirrored?: boolean;
  muted?: boolean;
  cameraOn?: boolean;
  className?: string;
  fallbackAvatar?: string;
  fallbackName?: string;
}

export default function MediaPreview({
  stream,
  mirrored = true,
  muted = true,
  cameraOn = true,
  className,
  fallbackAvatar,
  fallbackName,
}: MediaPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (stream && cameraOn) {
      video.srcObject = stream;
    } else {
      video.srcObject = null;
    }

    return () => {
      video.srcObject = null;
    };
  }, [stream, cameraOn]);

  if (!stream || !cameraOn) {
    return (
      <div
        className={cn(
          "bg-gradient-to-br from-bg-surface2 to-bg-surface3 flex flex-col items-center justify-center",
          className
        )}
      >
        {fallbackAvatar ? (
          <img
            src={fallbackAvatar}
            alt={fallbackName || "Preview"}
            className="w-24 h-24 rounded-full border-4 border-primary/30"
          />
        ) : (
          <>
            <CameraOff size={40} className="text-text-muted mb-2" />
            <p className="text-text-muted text-sm">Camera is off</p>
          </>
        )}
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={muted}
      className={cn(
        "w-full h-full object-cover bg-black",
        mirrored && "scale-x-[-1]",
        className
      )}
    />
  );
}
