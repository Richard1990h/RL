"use client";

import { useEffect, useRef, useMemo, useState } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Undo2,
  Redo2,
  Download,
  ZoomIn,
  ZoomOut,
  Maximize,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Timeline from "./Timeline";
import ToolsPanel from "./ToolsPanel";
import PropertiesPanel from "./PropertiesPanel";
import TextOverlayCanvas from "./TextOverlayCanvas";
import ExportModal from "./ExportModal";
import { useEditorStore } from "@/stores/editor-store";
import { startExport } from "@/lib/editor/export-manager";
import { createDefaultTextOverlay, getEffectiveDuration, isInCut, getNextValidPosition, getActiveFilters, getSpeedAtTime } from "@/lib/editor/timeline-state";

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * 30); // frame number at 30fps
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}:${f.toString().padStart(2, "0")}`;
}

function formatTimeShort(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function VideoEditor() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const animFrameRef = useRef<number>(0);

  const {
    recordingUrl,
    recordingTitle,
    recordingId,
    editState,
    undoStack,
    redoStack,
    exportProgress,
    exportedUrl,
    selectedCutId,
    selectedTextId,
    activeTool,
    cutToolActive,
    cutMarkStart,
    setPlayhead,
    setPlaying,
    setZoom,
    setActiveTool,
    trimIn,
    trimOut,
    addCutSegment,
    removeCutSegment,
    selectCut,
    setCutToolActive,
    setCutMarkStart,
    addText,
    updateText,
    selectText,
    splitAtCurrentPlayhead,
    deleteSelected,
    undo,
    redo,
    setExportProgress,
    setExportedUrl,
  } = useEditorStore();

  // Sync video playback with edit state
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !editState) return;

    if (editState.isPlaying) {
      // Apply speed
      const speed = getSpeedAtTime(editState, editState.playhead);
      video.playbackRate = speed;
      video.play().catch(() => {});

      const updatePlayhead = () => {
        const time = video.currentTime;

        // Skip cuts
        if (isInCut(editState, time)) {
          const nextPos = getNextValidPosition(editState, time);
          video.currentTime = nextPos;
          setPlayhead(nextPos);
        } else {
          setPlayhead(time);
        }

        // Update speed dynamically
        const currentSpeed = getSpeedAtTime(editState, time);
        if (video.playbackRate !== currentSpeed) {
          video.playbackRate = currentSpeed;
        }

        // Stop at out point
        if (time >= editState.trim.outPoint) {
          video.pause();
          setPlaying(false);
          setPlayhead(editState.trim.outPoint);
          return;
        }

        animFrameRef.current = requestAnimationFrame(updatePlayhead);
      };

      animFrameRef.current = requestAnimationFrame(updatePlayhead);
    } else {
      video.pause();
      cancelAnimationFrame(animFrameRef.current);
    }

    return () => cancelAnimationFrame(animFrameRef.current);
  }, [editState?.isPlaying, editState?.trim.outPoint]);

  // Apply audio settings
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !editState) return;
    video.volume = editState.audio.muted ? 0 : Math.min(1, editState.audio.volume / 100);
    video.muted = editState.audio.muted;
  }, [editState?.audio.volume, editState?.audio.muted]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!editState) return;
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA" || (e.target as HTMLElement).tagName === "SELECT") return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          handleTogglePlay();
          break;
        case "i":
        case "I":
          trimIn(editState.playhead);
          break;
        case "o":
        case "O":
          trimOut(editState.playhead);
          break;
        case "s":
        case "S":
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            splitAtCurrentPlayhead();
          }
          break;
        case "t":
        case "T":
          e.preventDefault();
          setActiveTool("text");
          addText(createDefaultTextOverlay(
            editState.playhead,
            Math.min(editState.playhead + 5, editState.duration)
          ));
          break;
        case "c":
        case "C":
          if (!e.ctrlKey && !e.metaKey) {
            setActiveTool("cut");
          }
          break;
        case "v":
        case "V":
          if (!e.ctrlKey && !e.metaKey) {
            setActiveTool("select");
          }
          break;
        case "z":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.shiftKey) {
              redo();
            } else {
              undo();
            }
          }
          break;
        case "s":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            useEditorStore.getState().saveProject();
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          seekRelative(e.shiftKey ? -5 : e.ctrlKey ? -0.033 : -1);
          break;
        case "ArrowRight":
          e.preventDefault();
          seekRelative(e.shiftKey ? 5 : e.ctrlKey ? 0.033 : 1);
          break;
        case "Delete":
        case "Backspace":
          deleteSelected();
          break;
        case "Home":
          e.preventDefault();
          handleSeek(editState.trim.inPoint);
          break;
        case "End":
          e.preventDefault();
          handleSeek(editState.trim.outPoint);
          break;
        case "m":
        case "M":
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            setActiveTool("markers");
          }
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editState, selectedCutId, selectedTextId]);

  const seekRelative = (seconds: number) => {
    if (!editState || !videoRef.current) return;
    const newTime = Math.max(0, Math.min(editState.duration, editState.playhead + seconds));
    videoRef.current.currentTime = newTime;
    setPlayhead(newTime);
  };

  const handleSeek = (time: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = time;
    setPlayhead(time);
  };

  const handleTogglePlay = () => {
    if (!editState) return;
    if (!editState.isPlaying && editState.playhead >= editState.trim.outPoint) {
      handleSeek(editState.trim.inPoint);
    }
    setPlaying(!editState.isPlaying);
  };

  const handleExport = async (resolution: string, format: string, quality: string) => {
    if (!recordingId || !editState) return;
    await startExport(
      recordingId,
      editState,
      { resolution: resolution as "720p" | "1080p", format: format as "mp4" },
      (progress) => {
        setExportProgress(progress);
        if (progress.outputUrl) {
          setExportedUrl(progress.outputUrl);
        }
      }
    );
  };

  const handleCutMarkStart = (time: number) => {
    setCutMarkStart(time);
  };

  const handleCutMarkEnd = (start: number, end: number) => {
    addCutSegment(start, end);
    setCutToolActive(false);
    setCutMarkStart(null);
  };

  // Compute CSS filters for video preview
  const videoFilterStyle = useMemo(() => {
    if (!editState) return "";
    const activeFilters = getActiveFilters(editState, editState.playhead);
    if (activeFilters.length === 0) return "";

    let brightness = 100;
    let contrast = 100;
    let saturate = 100;
    let grayscale = 0;
    let sepia = 0;
    let blur = 0;
    let hueRotate = 0;
    let invert = 0;

    for (const f of activeFilters) {
      switch (f.type) {
        case "brightness": brightness = f.value; break;
        case "contrast": contrast = f.value; break;
        case "saturation": saturate = f.value; break;
        case "grayscale": grayscale = f.value; break;
        case "sepia": sepia = f.value; break;
        case "blur": blur = f.value; break;
        case "sharpen": contrast = Math.min(200, contrast + (f.value - 100) * 0.5); break;
        case "hue-rotate": hueRotate = (f.value - 100) * 1.8; break;
        case "invert": invert = f.value; break;
        case "temperature": {
          // Warm = sepia tint, Cool = hue shift
          const t = f.value - 100;
          if (t > 0) sepia = Math.min(100, sepia + t * 0.5);
          else hueRotate += t * 0.5;
          break;
        }
        case "vibrance": saturate = Math.min(200, saturate + (f.value - 100) * 0.5); break;
        case "clarity": contrast = Math.min(200, contrast + (f.value - 100) * 0.3); break;
        case "highlights": brightness = Math.min(200, brightness + (f.value - 100) * 0.2); break;
        case "shadows": brightness = Math.max(0, brightness - (100 - f.value) * 0.2); break;
        case "vignette": break; // handled via CSS box-shadow
        case "noise": break; // handled via SVG filter
        case "film-grain": break; // handled via SVG filter
        case "tint": hueRotate += (f.value - 100) * 3.6; break;
      }
    }

    const parts = [];
    if (brightness !== 100) parts.push(`brightness(${brightness}%)`);
    if (contrast !== 100) parts.push(`contrast(${contrast}%)`);
    if (saturate !== 100) parts.push(`saturate(${saturate}%)`);
    if (grayscale > 0) parts.push(`grayscale(${grayscale}%)`);
    if (sepia > 0) parts.push(`sepia(${sepia}%)`);
    if (blur > 0) parts.push(`blur(${blur / 50}px)`);
    if (hueRotate !== 0) parts.push(`hue-rotate(${hueRotate}deg)`);
    if (invert > 0) parts.push(`invert(${invert}%)`);

    return parts.join(" ");
  }, [editState?.playhead, editState?.filters]);

  // Compute crop transform CSS
  const cropStyle = useMemo(() => {
    if (!editState) return {};
    const c = editState.crop;
    const style: React.CSSProperties = {};

    if (c.rotation !== 0) {
      style.transform = `rotate(${c.rotation}deg)`;
    }
    if (c.flipH || c.flipV) {
      const scaleX = c.flipH ? -1 : 1;
      const scaleY = c.flipV ? -1 : 1;
      style.transform = `${style.transform || ""} scale(${scaleX}, ${scaleY})`.trim();
    }

    return style;
  }, [editState?.crop]);

  // Vignette overlay for vignette filter
  const vignetteIntensity = useMemo(() => {
    if (!editState) return 0;
    const vFilter = getActiveFilters(editState, editState.playhead).find((f) => f.type === "vignette");
    return vFilter ? vFilter.value : 0;
  }, [editState?.playhead, editState?.filters]);

  if (!editState || !recordingUrl) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const effectiveDuration = getEffectiveDuration(editState);

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-sm font-bold text-text truncate">{recordingTitle || "Untitled"}</h2>
          <span className="text-[10px] text-text-muted font-mono shrink-0">
            {formatTime(editState.playhead)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={<Undo2 size={14} />}
            onClick={undo}
            disabled={undoStack.length === 0}
            title="Undo (Ctrl+Z)"
          >{""}</Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Redo2 size={14} />}
            onClick={redo}
            disabled={redoStack.length === 0}
            title="Redo (Ctrl+Shift+Z)"
          >{""}</Button>
          <div className="w-px h-5 bg-border mx-1" />
          <Button
            variant="gradient"
            size="sm"
            icon={<Download size={14} />}
            onClick={() => setExportOpen(true)}
          >
            Export
          </Button>
        </div>
      </div>

      {/* Main area: tools | preview | properties */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Tools sidebar */}
        <div className="shrink-0 w-[52px] border-r border-border bg-bg-surface overflow-y-auto">
          <ToolsPanel activeTool={activeTool} onToolChange={setActiveTool} />
        </div>

        {/* Center: Video preview */}
        <div className="flex-1 flex flex-col min-w-0 p-3">
          <div className="flex-1 flex items-center justify-center min-h-0">
            <div className="relative aspect-video max-h-full max-w-full bg-black rounded-xl overflow-hidden">
              <video
                ref={videoRef}
                src={recordingUrl}
                className="w-full h-full object-contain"
                style={{
                  filter: videoFilterStyle || undefined,
                  ...cropStyle,
                }}
                playsInline
              />
              {/* Vignette overlay */}
              {vignetteIntensity > 0 && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${vignetteIntensity / 100}) 100%)`,
                  }}
                />
              )}
              <TextOverlayCanvas
                textOverlays={editState.textOverlays}
                playhead={editState.playhead}
                selectedTextId={selectedTextId}
                onSelectText={selectText}
                onUpdatePosition={(id, x, y) => updateText(id, { x, y })}
              />
            </div>
          </div>

          {/* Transport controls */}
          <div className="shrink-0 flex items-center justify-center gap-3 mt-2">
            <button
              onClick={() => handleSeek(editState.trim.inPoint)}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-bg-surface2 text-text-secondary hover:text-text transition-colors"
              title="Go to start (Home)"
            >
              <SkipBack size={16} />
            </button>

            <button
              onClick={handleTogglePlay}
              className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white hover:bg-primary/80 transition-colors"
              title="Play/Pause (Space)"
            >
              {editState.isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
            </button>

            <button
              onClick={() => handleSeek(editState.trim.outPoint)}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-bg-surface2 text-text-secondary hover:text-text transition-colors"
              title="Go to end (End)"
            >
              <SkipForward size={16} />
            </button>

            <span className="text-xs font-mono text-text-secondary ml-4">
              {formatTimeShort(editState.playhead)} / {formatTimeShort(effectiveDuration)}
            </span>

            {/* Speed indicator */}
            {getSpeedAtTime(editState, editState.playhead) !== 1 && (
              <span className="text-[10px] font-bold text-warning ml-1">
                {getSpeedAtTime(editState, editState.playhead)}x
              </span>
            )}

            {/* Zoom */}
            <div className="flex items-center gap-1 ml-4">
              <button
                onClick={() => setZoom(editState.zoom - 2)}
                className="p-1 hover:bg-bg-surface2 rounded transition-colors"
              >
                <ZoomOut size={14} className="text-text-secondary" />
              </button>
              <span className="text-[10px] text-text-muted w-10 text-center">{editState.zoom}px/s</span>
              <button
                onClick={() => setZoom(editState.zoom + 2)}
                className="p-1 hover:bg-bg-surface2 rounded transition-colors"
              >
                <ZoomIn size={14} className="text-text-secondary" />
              </button>
              <button
                onClick={() => {
                  // Zoom to fit
                  const containerWidth = 800; // approximate
                  const newZoom = Math.max(2, Math.floor(containerWidth / editState.duration));
                  setZoom(newZoom);
                }}
                className="p-1 hover:bg-bg-surface2 rounded transition-colors ml-1"
                title="Zoom to fit"
              >
                <Maximize size={12} className="text-text-secondary" />
              </button>
            </div>
          </div>
        </div>

        {/* Right: Properties panel */}
        <div className="shrink-0 w-72 border-l border-border bg-bg-surface overflow-y-auto">
          <PropertiesPanel />
        </div>
      </div>

      {/* Bottom: Timeline */}
      <div className="shrink-0 border-t border-border">
        <Timeline
          editState={editState}
          onSeek={handleSeek}
          onCutMarkStart={handleCutMarkStart}
          onCutMarkEnd={handleCutMarkEnd}
          cutToolActive={cutToolActive}
          cutMarkStart={cutMarkStart}
          selectedCutId={selectedCutId}
          onSelectCut={selectCut}
        />
      </div>

      {/* Export modal */}
      <ExportModal
        isOpen={exportOpen}
        onClose={() => {
          setExportOpen(false);
          setExportProgress(null);
        }}
        onExport={handleExport}
        progress={exportProgress}
        exportedUrl={exportedUrl}
        videoTitle={recordingTitle || "Untitled"}
      />
    </div>
  );
}
