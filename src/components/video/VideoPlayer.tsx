"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Play,
  Pause,
  Maximize,
  Minimize,
  Volume2,
  VolumeX,
  Settings,
  Loader2,
} from "lucide-react";
import { useImaAds } from "@/hooks/useImaAds";
import { useAuthStore } from "@/stores/auth-store";

interface Resolution {
  label: string;
  url: string;
  height: number;
}

interface VideoPlayerProps {
  thumbnailUrl: string;
  videoUrl?: string | null;
  videoId?: string;
  durationSec: number;
  onEnded: () => void;
  autoplay?: boolean;
  resolutions?: Resolution[];
}

type Quality = "Auto" | string;


function formatTime(sec: number): string {
  if (!sec || isNaN(sec)) return "0:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function VideoPlayer({
  thumbnailUrl,
  videoUrl,
  videoId,
  durationSec,
  onEnded,
  autoplay = false,
  resolutions = [],
}: VideoPlayerProps) {
  const isPremium = useAuthStore((s) => s.currentUser?.isPremium ?? false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const adContainerRef = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSec || 0);
  const [progress, setProgress] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const viewTrackedRef = useRef(false);

  // Startup buffer safety: track whether the browser has enough data to play through
  const [canPlayThrough, setCanPlayThrough] = useState(false);
  const pendingPlayRef = useRef(false);

  // Quality lock: prevent upswitch during first 10 seconds of playback
  const playStartTimeRef = useRef<number | null>(null);
  const [qualityLocked, setQualityLocked] = useState(true);

  // Ad phase: idle = no ad, playing = ad in progress, done = ad finished (no more pre-roll for this video)
  const [adPhase, setAdPhase] = useState<"idle" | "playing" | "done">("idle");
  const adPhaseRef = useRef(adPhase);
  useEffect(() => {
    adPhaseRef.current = adPhase;
  }, [adPhase]);

  // Fullscreen
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Volume
  const [volume, setVolume] = useState(80);
  const [muted, setMuted] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const volumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Quality — build options from resolutions prop
  const qualityOptions: Quality[] = ["Auto", ...resolutions.sort((a, b) => b.height - a.height).map((r) => r.label)];
  const [quality, setQuality] = useState<Quality>("Auto");
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const qualityMenuRef = useRef<HTMLDivElement>(null);
  const [effectiveUrl, setEffectiveUrl] = useState(videoUrl);

  // Unlock quality switching after 10 seconds of playback
  useEffect(() => {
    if (!qualityLocked || !playStartTimeRef.current) return;
    const timer = setTimeout(() => setQualityLocked(false), 10000);
    return () => clearTimeout(timer);
  }, [qualityLocked, playing]);

  // Auto quality selection — start on lowest available, upswitch after lock expires
  useEffect(() => {
    if (quality !== "Auto" || resolutions.length === 0) return;

    const sorted = [...resolutions].sort((a, b) => a.height - b.height);
    const lowest = sorted[0];
    const highest = sorted[sorted.length - 1];

    if (qualityLocked) {
      // During startup lock period: always use lowest resolution
      if (lowest) setEffectiveUrl(lowest.url);
    } else {
      // Lock expired — pick based on connection quality
      const conn = (navigator as any).connection;
      const downlink = conn?.downlink;
      const effectiveType = conn?.effectiveType;

      if (effectiveType === "slow-2g" || effectiveType === "2g" || (downlink !== undefined && downlink < 1)) {
        if (lowest) setEffectiveUrl(lowest.url);
      } else if (effectiveType === "3g" || (downlink !== undefined && downlink < 3)) {
        if (lowest) setEffectiveUrl(lowest.url);
      } else {
        if (highest) setEffectiveUrl(highest.url);
        else setEffectiveUrl(videoUrl);
      }
    }
  }, [quality, resolutions, videoUrl, qualityLocked]);

  // When quality is manually selected, switch URL
  useEffect(() => {
    if (quality === "Auto") return;
    const match = resolutions.find((r) => r.label === quality);
    if (match) {
      setEffectiveUrl(match.url);
    }
  }, [quality, resolutions]);

  // When effectiveUrl changes (quality switch), swap the source and resume
  const prevEffectiveUrl = useRef(effectiveUrl);
  useEffect(() => {
    if (prevEffectiveUrl.current === effectiveUrl) return;
    prevEffectiveUrl.current = effectiveUrl;
    const vid = videoRef.current;
    if (!vid || !effectiveUrl) return;
    const wasPlaying = !vid.paused;
    const savedTime = vid.currentTime;
    vid.src = effectiveUrl;
    vid.load();
    vid.currentTime = savedTime;
    if (wasPlaying) vid.play().catch(() => {});
  }, [effectiveUrl]);

  // Controls visibility
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Start content playback after ad completes or errors.
  // Waits for canplaythrough before calling play() to avoid startup stutter.
  const startContent = useCallback(() => {
    setAdPhase("done");
    const vid = videoRef.current;
    if (!vid) return;

    if (vid.readyState >= 4) {
      // HAVE_ENOUGH_DATA — safe to play immediately
      vid.play().catch(() => {});
      setPlaying(true);
      playStartTimeRef.current = Date.now();
    } else {
      // Not enough data yet — defer play until canplaythrough fires
      pendingPlayRef.current = true;
      setIsBuffering(true);
    }
  }, []);

  const { requestAds, isAdPlaying, destroyAds } = useImaAds({
    videoRef,
    adContainerRef,
    onAdsComplete: startContent,
    onAdError: startContent,
    videoId,
  });

  // Sync adPhase with isAdPlaying from hook
  useEffect(() => {
    if (isAdPlaying && adPhase !== "playing") {
      setAdPhase("playing");
    }
  }, [isAdPlaying, adPhase]);

  // Track view on first play
  const trackView = useCallback(() => {
    if (viewTrackedRef.current || !videoId) return;
    viewTrackedRef.current = true;
    fetch(`/api/videos/${videoId}/view`, { method: "POST" }).catch(() => {});
  }, [videoId]);

  // Load video when src changes — reset ad phase for fresh pre-roll
  useEffect(() => {
    if (videoRef.current && videoUrl) {
      setEffectiveUrl(videoUrl);
      videoRef.current.load();
      setHasStarted(false);
      setPlaying(false);
      setProgress(0);
      setCurrentTime(0);
      setAdPhase("idle");
      setCanPlayThrough(false);
      setQualityLocked(true);
      pendingPlayRef.current = false;
      playStartTimeRef.current = null;
      destroyAds();
    }
  }, [videoUrl, destroyAds]);

  // Sync volume to video element
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = muted ? 0 : volume / 100;
      videoRef.current.muted = muted;
    }
  }, [volume, muted]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Close quality menu on outside click
  useEffect(() => {
    if (!showQualityMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (qualityMenuRef.current && !qualityMenuRef.current.contains(e.target as Node)) {
        setShowQualityMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showQualityMenu]);

  // Keyboard shortcuts — blocked during ad playback
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (adPhaseRef.current === "playing") return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "f":
        case "F":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "m":
        case "M":
          e.preventDefault();
          setMuted((prev) => !prev);
          break;
        case "ArrowRight":
          e.preventDefault();
          if (videoRef.current) videoRef.current.currentTime += 10;
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (videoRef.current) videoRef.current.currentTime -= 10;
          break;
        case "Escape":
          if (isFullscreen) {
            try { screen.orientation.unlock(); } catch {}
            document.exitFullscreen?.();
          }
          if (showQualityMenu) setShowQualityMenu(false);
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullscreen, showQualityMenu]);

  const togglePlay = () => {
    if (!videoRef.current) return;

    // First play — trigger pre-roll ad (skip for Premium users)
    if (!hasStarted) {
      setHasStarted(true);
      trackView();
      if (isPremium) {
        // Premium users skip ads — use startContent which gates on buffer state
        startContent();
        return;
      }
      requestAds();
      return;
    }

    // During ad playback, don't toggle content video
    if (adPhaseRef.current === "playing") return;

    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
      setPlaying(true);
    } else {
      videoRef.current.pause();
      setPlaying(false);
    }
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        // On mobile, lock to landscape; on desktop, lock to natural to prevent rotation
        try {
          const orient = screen.orientation as any;
          if (orient?.lock) {
            const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
            await orient.lock(isMobile ? "landscape" : "any");
          }
        } catch {
          // orientation lock not supported in all browsers — that's fine
        }
      } else {
        try {
          screen.orientation.unlock();
        } catch {}
        await document.exitFullscreen();
      }
    } catch {}
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const ct = videoRef.current.currentTime;
    const dur = videoRef.current.duration || duration;
    setCurrentTime(ct);
    if (dur > 0) {
      setProgress((ct / dur) * 100);
      setDuration(dur);
    }
    // Update buffered
    if (videoRef.current.buffered.length > 0) {
      const bufferedEnd = videoRef.current.buffered.end(videoRef.current.buffered.length - 1);
      setBuffered((bufferedEnd / dur) * 100);
    }
  };

  const handleVideoEnded = () => {
    setPlaying(false);
    setProgress(100);
    // Exit fullscreen when video ends
    if (document.fullscreenElement) {
      try { screen.orientation.unlock(); } catch {}
      document.exitFullscreen().catch(() => {});
    }
    onEnded();
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const dur = videoRef.current.duration || duration;
    videoRef.current.currentTime = pct * dur;
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setVolume(val);
    if (val === 0) setMuted(true);
    else if (muted) setMuted(false);
  };

  const handleVolumeAreaEnter = () => {
    if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current);
    setShowVolumeSlider(true);
  };

  const handleVolumeAreaLeave = () => {
    volumeTimeoutRef.current = setTimeout(() => setShowVolumeSlider(false), 300);
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (playing) {
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
    }
  };

  // Start playing if autoplay — trigger pre-roll first (skip for Premium)
  useEffect(() => {
    if (autoplay && videoRef.current && videoUrl) {
      setHasStarted(true);
      trackView();
      if (isPremium) {
        startContent();
      } else {
        requestAds();
      }
    }
  }, [autoplay, videoUrl, trackView, requestAds, isPremium, startContent]);

  // Cleanup ads on unmount
  useEffect(() => {
    return () => {
      destroyAds();
    };
  }, [destroyAds]);

  const displayDuration = duration || durationSec;
  const controlsVisible = showControls || !playing;

  return (
    <div
      ref={containerRef}
      className={`relative w-full bg-black overflow-hidden select-none group ${
        isFullscreen ? "rounded-none !h-screen !w-screen" : "aspect-video rounded-radius-lg"
      }`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => playing && setShowControls(false)}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-contain"
        poster={`${thumbnailUrl}?v=2`}
        preload="metadata"
        playsInline
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleVideoEnded}
        onLoadedMetadata={() => {
          if (videoRef.current && videoRef.current.duration) {
            setDuration(videoRef.current.duration);
          }
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onWaiting={() => setIsBuffering(true)}
        onCanPlay={() => setIsBuffering(false)}
        onCanPlayThrough={() => {
          setCanPlayThrough(true);
          setIsBuffering(false);
          // If play was deferred waiting for enough data, start now
          if (pendingPlayRef.current) {
            pendingPlayRef.current = false;
            videoRef.current?.play().catch(() => {});
            setPlaying(true);
            playStartTimeRef.current = Date.now();
          }
        }}
        onSeeking={() => setIsBuffering(true)}
        onSeeked={() => setIsBuffering(false)}
        onError={(e) => {
          console.error("Video playback error:", (e.target as HTMLVideoElement).error);
        }}
      >
        {(effectiveUrl || videoUrl) && <source src={effectiveUrl || videoUrl || ""} type="video/mp4" />}
      </video>

      {/* IMA ad container overlay — always in DOM with real dimensions so IMA SDK
          can measure it, but only visible/interactive when an ad is playing */}
      <div
        ref={adContainerRef}
        className="absolute inset-0 z-30"
        style={{
          opacity: adPhase === "playing" ? 1 : 0,
          pointerEvents: adPhase === "playing" ? "auto" : "none",
        }}
      />

      {/* Play button overlay (before first play) */}
      {!hasStarted && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center z-10 cursor-pointer bg-black/30"
          aria-label="Play"
        >
          <div className="w-20 h-20 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-black/70 transition-colors">
            <Play size={36} className="text-white ml-1.5" />
          </div>
        </button>
      )}

      {/* Buffering spinner */}
      {isBuffering && hasStarted && adPhase !== "playing" && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
            <Loader2 size={28} className="text-white animate-spin" />
          </div>
        </div>
      )}

      {/* Click to play/pause (after started, not during ad) */}
      {hasStarted && adPhase !== "playing" && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 z-10 cursor-pointer"
          aria-label={playing ? "Pause" : "Play"}
        />
      )}

      {/* Center play/pause indicator */}
      {hasStarted && !playing && !isBuffering && adPhase !== "playing" && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
            <Play size={28} className="text-white ml-1" />
          </div>
        </div>
      )}

      {/* Bottom controls — hidden during ad playback */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-20 px-4 pb-3 pt-8 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-200 ${
          controlsVisible && adPhase !== "playing" ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Progress bar */}
        <div
          className="w-full h-1.5 bg-white/20 rounded-full cursor-pointer mb-2 group/bar relative"
          onClick={handleProgressClick}
        >
          {/* Buffered */}
          <div
            className="absolute h-full bg-white/15 rounded-full"
            style={{ width: `${buffered}%` }}
          />
          {/* Progress */}
          <div
            className="h-full bg-gradient-to-r from-primary to-accent rounded-full relative z-10 transition-[width] duration-100"
            style={{ width: `${progress}%` }}
          >
            <span className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full opacity-0 group-hover/bar:opacity-100 transition-opacity shadow" />
          </div>
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-2 text-white/80">
          <button
            onClick={togglePlay}
            className="hover:text-white transition-colors cursor-pointer"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </button>

          <span className="text-xs font-mono whitespace-nowrap">
            {formatTime(currentTime)} / {formatTime(displayDuration)}
          </span>

          <div className="flex-1" />

          <span className="text-[10px] font-semibold bg-white/15 px-1.5 py-0.5 rounded">
            {quality === "Auto" ? "AUTO" : quality}
          </span>

          {/* Volume */}
          <div
            className="relative flex items-center"
            onMouseEnter={handleVolumeAreaEnter}
            onMouseLeave={handleVolumeAreaLeave}
          >
            <button
              onClick={() => setMuted((prev) => !prev)}
              className="hover:text-white transition-colors cursor-pointer"
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <div
              className={`overflow-hidden transition-all duration-200 ${
                showVolumeSlider ? "w-20 ml-1 opacity-100" : "w-0 ml-0 opacity-0"
              }`}
            >
              <input
                type="range"
                min={0}
                max={100}
                value={muted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-full h-1 accent-white cursor-pointer"
                aria-label="Volume"
              />
            </div>
          </div>

          {/* Quality */}
          <div className="relative" ref={qualityMenuRef}>
            <button
              onClick={() => setShowQualityMenu((prev) => !prev)}
              className={`hover:text-white transition-colors cursor-pointer ${showQualityMenu ? "text-white" : ""}`}
              aria-label="Quality settings"
            >
              <Settings size={18} />
            </button>
            {showQualityMenu && (
              <div className="absolute bottom-full right-0 mb-2 bg-black/90 backdrop-blur-md rounded-lg border border-white/10 py-1.5 min-w-[140px] shadow-xl">
                <div className="px-3 py-1 text-[10px] font-semibold text-white/50 uppercase tracking-wider">
                  Quality
                </div>
                {qualityOptions.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => { setQuality(opt); setShowQualityMenu(false); }}
                    className={`w-full text-left px-3 py-1.5 text-sm cursor-pointer transition-colors ${
                      quality === opt ? "text-white bg-white/10" : "text-white/70 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <span className="flex items-center justify-between">
                      {opt}
                      {quality === opt && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="hover:text-white transition-colors cursor-pointer"
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}
