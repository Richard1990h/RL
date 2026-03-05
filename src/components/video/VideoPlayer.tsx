"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  const [firstFrameReady, setFirstFrameReady] = useState(false);
  const viewTrackedRef = useRef(false);
  const startupRetryRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startupStartedAtRef = useRef<number | null>(null);
  const firstFrameDrawnRef = useRef(false);

  const pendingPlayRef = useRef(false);

  // Quality lock: keep startup on the lowest rendition until first frame is established
  const playStartTimeRef = useRef<number | null>(null);
  const [qualityLocked, setQualityLocked] = useState(true);

  // Ad phase: idle = no ad, playing = ad in progress, done = ad finished (no more pre-roll for this video)
  const [adPhase, setAdPhase] = useState<"idle" | "playing" | "done">("idle");
  const adPhaseRef = useRef(adPhase);
  useEffect(() => {
    adPhaseRef.current = adPhase;
  }, [adPhase]);

  // Fullscreen (viewport-bound, app-style)
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewportWidth, setViewportWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 0
  );
  const [viewportHeight, setViewportHeight] = useState<number>(
    typeof window !== "undefined" ? window.innerHeight : 0
  );

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
  const sortedResolutionsAsc = useMemo(() => [...resolutions].sort((a, b) => a.height - b.height), [resolutions]);
  const lowestResolution = sortedResolutionsAsc[0];
  const highestResolution = sortedResolutionsAsc[sortedResolutionsAsc.length - 1];
  const [effectiveUrl, setEffectiveUrl] = useState<string | null | undefined>(lowestResolution?.url ?? videoUrl);

  // Unlock quality only after first frame has rendered.
  useEffect(() => {
    if (!qualityLocked || !firstFrameReady) return;
    const timer = setTimeout(() => setQualityLocked(false), 180);
    return () => clearTimeout(timer);
  }, [qualityLocked, firstFrameReady]);

  // Auto quality selection — always start on lowest and upswitch silently after lock expires.
  useEffect(() => {
    if (quality !== "Auto" || resolutions.length === 0) return;

    if (qualityLocked) {
      if (lowestResolution) setEffectiveUrl(lowestResolution.url);
    } else {
      const conn = (navigator as any).connection;
      const downlink = conn?.downlink;
      const effectiveType = conn?.effectiveType;

      if (effectiveType === "slow-2g" || effectiveType === "2g" || (downlink !== undefined && downlink < 1)) {
        if (lowestResolution) setEffectiveUrl(lowestResolution.url);
      } else if (effectiveType === "3g" || (downlink !== undefined && downlink < 3)) {
        if (lowestResolution) setEffectiveUrl(lowestResolution.url);
      } else {
        if (highestResolution) setEffectiveUrl(highestResolution.url);
        else setEffectiveUrl(videoUrl);
      }
    }
  }, [quality, resolutions, videoUrl, qualityLocked, lowestResolution, highestResolution]);

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
    if (savedTime > 0) {
      try { vid.currentTime = savedTime; } catch {}
    }
    if (wasPlaying) vid.play().catch(() => {});
  }, [effectiveUrl]);

  // Controls visibility
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayGestureRef = useRef<{
    pointerId: number | null;
    startX: number;
    startY: number;
    moved: boolean;
    startAt: number;
    intent: "pending" | "vertical" | "horizontal" | "tap" | "scrub";
  }>({
    pointerId: null,
    startX: 0,
    startY: 0,
    moved: false,
    startAt: 0,
    intent: "pending",
  });

  // Start content playback after ad completes/errors.
  // Prefer instant startup: play as soon as minimum data is available.
  const startContent = useCallback(() => {
    if (startupRetryRef.current) {
      clearInterval(startupRetryRef.current);
      startupRetryRef.current = null;
    }
    startupStartedAtRef.current = performance.now();
    setFirstFrameReady(false);
    firstFrameDrawnRef.current = false;
    setAdPhase("done");
    const vid = videoRef.current;
    if (!vid) return;

    // On mobile, IMA SDK uses the same video element for ads, which can
    // change the src. Restore the content source if it was overwritten.
    const contentSrc = effectiveUrl || videoUrl || "";
    if (contentSrc && vid.currentSrc && !vid.currentSrc.includes(contentSrc.split("?")[0])) {
      vid.src = contentSrc;
      vid.load();
      vid.currentTime = 0;
      pendingPlayRef.current = true;
      setIsBuffering(true);
      startupRetryRef.current = setInterval(() => {
        const v = videoRef.current;
        if (!v || !pendingPlayRef.current) {
          if (startupRetryRef.current) {
            clearInterval(startupRetryRef.current);
            startupRetryRef.current = null;
          }
          return;
        }
        const startedAt = startupStartedAtRef.current ?? 0;
        if (performance.now() - startedAt > 1200) {
          if (startupRetryRef.current) {
            clearInterval(startupRetryRef.current);
            startupRetryRef.current = null;
          }
          return;
        }
        v.play().catch(() => {});
      }, 50);
      return;
    }

    // Aggressive startup: attempt play immediately, then recover if data is not ready.
    pendingPlayRef.current = true;
    setIsBuffering(true);
    vid.play()
      .then(() => {
        pendingPlayRef.current = false;
        setIsBuffering(false);
        setPlaying(true);
        playStartTimeRef.current = Date.now();
      })
      .catch(() => {
        // onCanPlay/onLoadedData will fulfill pending play.
      });
    startupRetryRef.current = setInterval(() => {
      const v = videoRef.current;
      if (!v || !pendingPlayRef.current) {
        if (startupRetryRef.current) {
          clearInterval(startupRetryRef.current);
          startupRetryRef.current = null;
        }
        return;
      }
      const startedAt = startupStartedAtRef.current ?? 0;
      if (performance.now() - startedAt > 1200) {
        if (startupRetryRef.current) {
          clearInterval(startupRetryRef.current);
          startupRetryRef.current = null;
        }
        return;
      }
      v.play().catch(() => {});
    }, 50);
  }, [effectiveUrl, videoUrl]);

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
      setQuality("Auto");
      setEffectiveUrl(lowestResolution?.url ?? videoUrl);
      videoRef.current.load();
      setHasStarted(false);
      setPlaying(false);
      setProgress(0);
      setCurrentTime(0);
      setAdPhase("idle");
      setQualityLocked(true);
      setFirstFrameReady(false);
      pendingPlayRef.current = false;
      playStartTimeRef.current = null;
      firstFrameDrawnRef.current = false;
      startupStartedAtRef.current = null;
      if (startupRetryRef.current) {
        clearInterval(startupRetryRef.current);
        startupRetryRef.current = null;
      }
      destroyAds();
    }
  }, [videoUrl, destroyAds, lowestResolution]);

  // Sync volume to video element
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = muted ? 0 : volume / 100;
      videoRef.current.muted = muted;
    }
  }, [volume, muted]);

  // Keep fullscreen height tied to viewport to prevent orientation jitter.
  useEffect(() => {
    const updateViewport = () => {
      const vv = window.visualViewport;
      setViewportWidth(vv?.width ?? window.innerWidth);
      setViewportHeight(vv?.height ?? window.innerHeight);
    };
    window.addEventListener("resize", updateViewport);
    window.addEventListener("orientationchange", updateViewport);
    window.visualViewport?.addEventListener("resize", updateViewport);
    updateViewport();
    return () => {
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
      window.visualViewport?.removeEventListener("resize", updateViewport);
    };
  }, []);

  // Lock page scroll while viewport fullscreen is active.
  useEffect(() => {
    if (!isFullscreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isFullscreen]);

  // Fullscreen should replace the app layout, not just enlarge a widget.
  useEffect(() => {
    document.documentElement.classList.toggle("video-immersive", isFullscreen);
    return () => {
      document.documentElement.classList.remove("video-immersive");
    };
  }, [isFullscreen]);

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
            setIsFullscreen(false);
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
      if (!isFullscreen) {
        setIsFullscreen(true);
        try {
          const orient = screen.orientation as any;
          if (orient?.lock) {
            const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
            await orient.lock(isMobile ? "landscape" : "any");
          }
        } catch {}
      } else {
        try { screen.orientation.unlock(); } catch {}
        setIsFullscreen(false);
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
    // Ignore ended events during ad playback — the IMA SDK controls the video element
    if (adPhaseRef.current === "playing") return;
    setPlaying(false);
    setProgress(100);
    // Exit viewport fullscreen when video ends
    if (isFullscreen) {
      try { screen.orientation.unlock(); } catch {}
      setIsFullscreen(false);
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

  const handleOverlayPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    overlayGestureRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      startAt: performance.now(),
      intent: "pending",
    };
  };

  const handleOverlayPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const gesture = overlayGestureRef.current;
    if (gesture.pointerId !== e.pointerId) return;
    if (gesture.moved) return;
    const dx = Math.abs(e.clientX - gesture.startX);
    const dy = Math.abs(e.clientY - gesture.startY);
    if (gesture.intent === "pending" && (dx > 4 || dy > 4)) {
      // Strict arbitration: vertical swipe > horizontal > tap.
      if (dy >= dx * 0.85) {
        gesture.intent = "vertical";
      } else {
        gesture.intent = "horizontal";
      }
    }
    if (dx > 12 || dy > 12) {
      gesture.moved = true;
    }
    if (gesture.intent === "vertical" && dy > 6) {
      gesture.moved = true;
    }
  };

  const handleOverlayPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const gesture = overlayGestureRef.current;
    if (gesture.pointerId !== e.pointerId) return;
    const dx = Math.abs(e.clientX - gesture.startX);
    const dy = Math.abs(e.clientY - gesture.startY);
    const swipeLike = dy > 12 && dy >= dx;
    const elapsed = performance.now() - gesture.startAt;
    const isTap = !gesture.moved && !swipeLike && gesture.intent !== "vertical" && gesture.intent !== "horizontal" && elapsed < 250;
    overlayGestureRef.current.pointerId = null;
    if (isTap) togglePlay();
  };

  const handleOverlayPointerCancel = () => {
    overlayGestureRef.current.pointerId = null;
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
      if (startupRetryRef.current) {
        clearInterval(startupRetryRef.current);
        startupRetryRef.current = null;
      }
      destroyAds();
    };
  }, [destroyAds]);

  const displayDuration = duration || durationSec;
  const controlsVisible = showControls || !playing;

  return (
    <div
      ref={containerRef}
      className={`relative w-full bg-black overflow-hidden select-none group ${
        isFullscreen ? "fixed inset-0 z-[120] rounded-none !w-screen" : "aspect-video rounded-radius-lg"
      }`}
      style={isFullscreen ? { width: `${viewportWidth}px`, height: `${viewportHeight}px` } : undefined}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => playing && setShowControls(false)}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        className={`absolute inset-0 w-full h-full ${isFullscreen ? "object-cover" : "object-contain"}`}
        poster={`${thumbnailUrl}?v=2`}
        preload="auto"
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
        onWaiting={() => {
          const startedAt = startupStartedAtRef.current ?? 0;
          const inStartupBurst = startedAt > 0 && performance.now() - startedAt < 500;
          if (!inStartupBurst || firstFrameDrawnRef.current) {
            setIsBuffering(true);
          }
        }}
        onCanPlay={() => {
          setIsBuffering(false);
          if (pendingPlayRef.current) {
            pendingPlayRef.current = false;
            videoRef.current?.play().catch(() => {});
            setPlaying(true);
            playStartTimeRef.current = Date.now();
            if (startupRetryRef.current) {
              clearInterval(startupRetryRef.current);
              startupRetryRef.current = null;
            }
          }
        }}
        onLoadedData={() => {
          setFirstFrameReady(true);
          firstFrameDrawnRef.current = true;
          setIsBuffering(false);
          if (pendingPlayRef.current) {
            pendingPlayRef.current = false;
            videoRef.current?.play().catch(() => {});
            setPlaying(true);
            playStartTimeRef.current = Date.now();
            if (startupRetryRef.current) {
              clearInterval(startupRetryRef.current);
              startupRetryRef.current = null;
            }
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
          onPointerDown={handleOverlayPointerDown}
          onPointerMove={handleOverlayPointerMove}
          onPointerUp={handleOverlayPointerUp}
          onPointerCancel={handleOverlayPointerCancel}
          className="absolute inset-0 flex items-center justify-center z-10 cursor-pointer bg-black/30"
          style={{ touchAction: isFullscreen ? "none" : "pan-y" }}
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
          onPointerDown={handleOverlayPointerDown}
          onPointerMove={handleOverlayPointerMove}
          onPointerUp={handleOverlayPointerUp}
          onPointerCancel={handleOverlayPointerCancel}
          className="absolute inset-0 z-10 cursor-pointer"
          style={{ touchAction: isFullscreen ? "none" : "pan-y" }}
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
