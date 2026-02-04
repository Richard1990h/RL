"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import type { EditState } from "@/lib/editor/timeline-state";

interface TimelineProps {
  editState: EditState;
  onSeek: (time: number) => void;
  onCutMarkStart?: (time: number) => void;
  onCutMarkEnd?: (start: number, end: number) => void;
  cutToolActive: boolean;
  cutMarkStart: number | null;
  selectedCutId: string | null;
  onSelectCut: (cutId: string | null) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatTimePrecise(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${m}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

// Seeded PRNG to prevent flicker on redraws
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

// Track layout constants
const RULER_H = 22;
const MARKER_TRACK_H = 10;
const TEXT_TRACK_H = 16;
const STICKER_TRACK_H = 12;
const TRANSITION_TRACK_H = 10;
const MAIN_TRACK_H = 44;
const SPEED_TRACK_H = 14;
const FILTER_TRACK_H = 12;
const AUDIO_TRACK_H = 20;
const GAP = 1;

// Colors
const COLORS = {
  bg: "#13131D",
  ruler: "#1A1A2A",
  rulerText: "#5A5A70",
  rulerTick: "#3A3A4A",
  trackBg: "#1A1A28",
  trackBgAlt: "#1E1E2E",
  waveform: "#4A4A8A",
  waveformActive: "#6A6AAA",
  playhead: "#FFFFFF",
  trimHandle: "#8B5CF6",
  trimDark: "rgba(0,0,0,0.55)",
  cutFill: "rgba(239, 68, 68, 0.25)",
  cutFillSelected: "rgba(239, 68, 68, 0.45)",
  cutStroke: "#EF4444",
  text: "rgba(139, 92, 246, 0.4)",
  textStroke: "rgba(139, 92, 246, 0.7)",
  textLabel: "#E0D0FF",
  sticker: "rgba(234, 179, 8, 0.35)",
  stickerStroke: "rgba(234, 179, 8, 0.6)",
  transition: "rgba(59, 130, 246, 0.4)",
  transitionStroke: "rgba(59, 130, 246, 0.7)",
  speedFast: "hsla(30, 80%, 60%, 0.15)",
  speedSlow: "hsla(200, 80%, 60%, 0.15)",
  speedLabelFast: "hsla(30, 80%, 70%, 0.8)",
  speedLabelSlow: "hsla(200, 80%, 70%, 0.8)",
  filterStroke: "rgba(34, 197, 94, 0.4)",
  splitLine: "#F59E0B",
  markerLine: "#8B5CF6",
  chapterLine: "#3B82F6",
  audioWave: "#22C55E",
  freezeFrame: "rgba(147, 51, 234, 0.3)",
};

export default function Timeline({
  editState,
  onSeek,
  onCutMarkStart,
  onCutMarkEnd,
  cutToolActive,
  cutMarkStart,
  selectedCutId,
  onSelectCut,
}: TimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  const { duration, trim, cuts, markers, textOverlays, filters, speedSegments, transitions, stickers, freezeFrames, playhead, zoom } = editState;
  const timelineWidth = Math.max(duration * zoom, 400);

  // Calculate track positions
  const MARKER_TRACK_Y = RULER_H;
  const TEXT_TRACK_Y = MARKER_TRACK_Y + MARKER_TRACK_H + GAP;
  const STICKER_TRACK_Y = TEXT_TRACK_Y + TEXT_TRACK_H + GAP;
  const TRANSITION_TRACK_Y = STICKER_TRACK_Y + STICKER_TRACK_H + GAP;
  const MAIN_TRACK_Y = TRANSITION_TRACK_Y + TRANSITION_TRACK_H + GAP;
  const SPEED_TRACK_Y = MAIN_TRACK_Y + MAIN_TRACK_H + GAP;
  const FILTER_TRACK_Y = SPEED_TRACK_Y + SPEED_TRACK_H + GAP;
  const AUDIO_TRACK_Y = FILTER_TRACK_Y + FILTER_TRACK_H + GAP;
  const TOTAL_HEIGHT = AUDIO_TRACK_Y + AUDIO_TRACK_H + 4;

  const drawTimeline = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;

    // Clear
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, TOTAL_HEIGHT);

    // ── Ruler ──
    ctx.fillStyle = COLORS.ruler;
    ctx.fillRect(0, 0, width, RULER_H);

    const step = zoom >= 30 ? 1 : zoom >= 15 ? 2 : zoom >= 8 ? 5 : zoom >= 4 ? 10 : 30;
    const subStep = step <= 2 ? 0.5 : step <= 5 ? 1 : step <= 10 ? 5 : 10;

    ctx.font = "9px monospace";
    for (let t = 0; t <= duration; t += subStep) {
      const x = t * zoom;
      const isMajor = t % step === 0;
      ctx.fillStyle = COLORS.rulerTick;
      ctx.fillRect(x, isMajor ? 0 : 6, 1, isMajor ? RULER_H : RULER_H - 10);
      if (isMajor && x > 10) {
        ctx.fillStyle = COLORS.rulerText;
        ctx.fillText(formatTime(t), x + 3, 14);
      }
    }

    // ── Track labels (left side) ──
    const drawTrackLabel = (y: number, h: number, label: string) => {
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.font = "7px sans-serif";
      ctx.fillText(label, 3, y + h / 2 + 2);
    };

    // ── Marker Track ──
    ctx.fillStyle = COLORS.trackBg;
    ctx.fillRect(0, MARKER_TRACK_Y, width, MARKER_TRACK_H);

    for (const marker of markers) {
      const x = marker.time * zoom;
      const color = marker.type === "chapter" ? COLORS.chapterLine : marker.type === "split" ? COLORS.splitLine : COLORS.markerLine;
      ctx.fillStyle = color;
      // Small triangle
      ctx.beginPath();
      ctx.moveTo(x - 4, MARKER_TRACK_Y);
      ctx.lineTo(x + 4, MARKER_TRACK_Y);
      ctx.lineTo(x, MARKER_TRACK_Y + MARKER_TRACK_H);
      ctx.closePath();
      ctx.fill();
    }

    // ── Text Overlay Track ──
    ctx.fillStyle = COLORS.trackBgAlt;
    ctx.fillRect(0, TEXT_TRACK_Y, width, TEXT_TRACK_H);
    drawTrackLabel(TEXT_TRACK_Y, TEXT_TRACK_H, "TXT");

    for (const text of textOverlays) {
      const x = text.startTime * zoom;
      const w = Math.max(2, (text.endTime - text.startTime) * zoom);
      ctx.fillStyle = COLORS.text;
      const r = 3;
      ctx.beginPath();
      ctx.roundRect(x, TEXT_TRACK_Y + 1, w, TEXT_TRACK_H - 2, r);
      ctx.fill();
      ctx.strokeStyle = COLORS.textStroke;
      ctx.lineWidth = 1;
      ctx.stroke();

      if (w > 25) {
        ctx.fillStyle = COLORS.textLabel;
        ctx.font = "7px sans-serif";
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 2, TEXT_TRACK_Y, w - 4, TEXT_TRACK_H);
        ctx.clip();
        ctx.fillText(text.text.slice(0, 20), x + 4, TEXT_TRACK_Y + 10);
        ctx.restore();
        ctx.font = "9px monospace";
      }
    }

    // ── Sticker Track ──
    ctx.fillStyle = COLORS.trackBg;
    ctx.fillRect(0, STICKER_TRACK_Y, width, STICKER_TRACK_H);

    for (const sticker of stickers) {
      const x = sticker.startTime * zoom;
      const w = Math.max(2, (sticker.endTime - sticker.startTime) * zoom);
      ctx.fillStyle = COLORS.sticker;
      ctx.beginPath();
      ctx.roundRect(x, STICKER_TRACK_Y + 1, w, STICKER_TRACK_H - 2, 2);
      ctx.fill();
      ctx.strokeStyle = COLORS.stickerStroke;
      ctx.lineWidth = 1;
      ctx.stroke();
      if (w > 14) {
        ctx.font = "8px sans-serif";
        ctx.fillText(sticker.emoji, x + 2, STICKER_TRACK_Y + 9);
      }
    }

    // ── Transition Track ──
    ctx.fillStyle = COLORS.trackBgAlt;
    ctx.fillRect(0, TRANSITION_TRACK_Y, width, TRANSITION_TRACK_H);

    for (const trans of transitions) {
      const x = trans.startTime * zoom;
      const w = Math.max(2, trans.duration * zoom);
      ctx.fillStyle = COLORS.transition;
      ctx.beginPath();
      ctx.roundRect(x, TRANSITION_TRACK_Y + 1, w, TRANSITION_TRACK_H - 2, 2);
      ctx.fill();
      ctx.strokeStyle = COLORS.transitionStroke;
      ctx.lineWidth = 1;
      ctx.stroke();
      // X pattern for transition
      if (w > 8) {
        ctx.strokeStyle = "rgba(59, 130, 246, 0.5)";
        ctx.lineWidth = 0.5;
        for (let lx = x; lx < x + w; lx += 4) {
          ctx.beginPath();
          ctx.moveTo(lx, TRANSITION_TRACK_Y + 1);
          ctx.lineTo(lx + 4, TRANSITION_TRACK_Y + TRANSITION_TRACK_H - 1);
          ctx.stroke();
        }
      }
    }

    // ── Main Video Track ──
    ctx.fillStyle = "#222238";
    ctx.fillRect(0, MAIN_TRACK_Y, width, MAIN_TRACK_H);

    // Draw speed segment tints on main track
    for (const seg of speedSegments) {
      const x = seg.startTime * zoom;
      const w = (seg.endTime - seg.startTime) * zoom;
      const isFast = seg.speed > 1;
      ctx.fillStyle = isFast ? COLORS.speedFast : COLORS.speedSlow;
      ctx.fillRect(x, MAIN_TRACK_Y, w, MAIN_TRACK_H);
    }

    // Freeze frame indicators on main track
    for (const ff of freezeFrames) {
      const x = ff.startTime * zoom;
      const w = Math.max(2, ff.duration * zoom);
      ctx.fillStyle = COLORS.freezeFrame;
      ctx.fillRect(x, MAIN_TRACK_Y, w, MAIN_TRACK_H);
      // Snowflake icon pattern
      ctx.strokeStyle = "rgba(147, 51, 234, 0.5)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.strokeRect(x, MAIN_TRACK_Y, w, MAIN_TRACK_H);
      ctx.setLineDash([]);
    }

    // Trimmed-out regions (darker)
    if (trim.inPoint > 0) {
      ctx.fillStyle = COLORS.trimDark;
      ctx.fillRect(0, MAIN_TRACK_Y, trim.inPoint * zoom, MAIN_TRACK_H);
    }
    if (trim.outPoint < duration) {
      ctx.fillStyle = COLORS.trimDark;
      ctx.fillRect(trim.outPoint * zoom, MAIN_TRACK_Y, (duration - trim.outPoint) * zoom, MAIN_TRACK_H);
    }

    // Cut segments
    for (const cut of cuts) {
      const x = cut.start * zoom;
      const w = (cut.end - cut.start) * zoom;
      ctx.fillStyle = cut.id === selectedCutId ? COLORS.cutFillSelected : COLORS.cutFill;
      ctx.fillRect(x, MAIN_TRACK_Y, w, MAIN_TRACK_H);
      ctx.strokeStyle = cut.id === selectedCutId ? COLORS.cutStroke : `${COLORS.cutStroke}80`;
      ctx.lineWidth = cut.id === selectedCutId ? 2 : 1;
      ctx.strokeRect(x, MAIN_TRACK_Y, w, MAIN_TRACK_H);
      // Hatching pattern for cuts
      ctx.strokeStyle = `${COLORS.cutStroke}30`;
      ctx.lineWidth = 0.5;
      for (let lx = x; lx < x + w; lx += 6) {
        ctx.beginPath();
        ctx.moveTo(lx, MAIN_TRACK_Y);
        ctx.lineTo(lx + MAIN_TRACK_H, MAIN_TRACK_Y + MAIN_TRACK_H);
        ctx.stroke();
      }
    }

    // Pending cut mark
    if (cutToolActive && cutMarkStart !== null) {
      const x = cutMarkStart * zoom;
      ctx.strokeStyle = COLORS.splitLine;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, MAIN_TRACK_Y);
      ctx.lineTo(x, MAIN_TRACK_Y + MAIN_TRACK_H);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Waveform bars (seeded random)
    const barWidth = 2;
    const barSpacing = 1;
    for (let x = Math.max(0, trim.inPoint * zoom); x < Math.min(width, trim.outPoint * zoom); x += barWidth + barSpacing) {
      const time = x / zoom;
      const isInCutRegion = cuts.some((c) => time >= c.start && time < c.end);
      if (isInCutRegion) continue;

      const seed = Math.round(x * 100);
      const barHeight = 4 + seededRandom(seed) * (MAIN_TRACK_H * 0.55);
      const y = MAIN_TRACK_Y + MAIN_TRACK_H / 2 - barHeight / 2;

      // Color based on speed
      const inSpeedSeg = speedSegments.find((s) => time >= s.startTime && time <= s.endTime);
      if (inSpeedSeg) {
        ctx.fillStyle = inSpeedSeg.speed > 1 ? "hsla(30, 60%, 55%, 0.5)" : "hsla(200, 60%, 55%, 0.5)";
      } else {
        ctx.fillStyle = COLORS.waveform;
      }
      ctx.fillRect(x, y, barWidth, barHeight);
    }

    // Trim handles
    const inX = trim.inPoint * zoom;
    const outX = trim.outPoint * zoom;
    // In handle
    ctx.fillStyle = COLORS.trimHandle;
    ctx.beginPath();
    ctx.roundRect(inX - 3, MAIN_TRACK_Y, 6, MAIN_TRACK_H, [3, 0, 0, 3]);
    ctx.fill();
    // Out handle
    ctx.beginPath();
    ctx.roundRect(outX - 3, MAIN_TRACK_Y, 6, MAIN_TRACK_H, [0, 3, 3, 0]);
    ctx.fill();

    // ── Speed Track ──
    ctx.fillStyle = COLORS.trackBg;
    ctx.fillRect(0, SPEED_TRACK_Y, width, SPEED_TRACK_H);

    for (const seg of speedSegments) {
      const x = seg.startTime * zoom;
      const w = Math.max(2, (seg.endTime - seg.startTime) * zoom);
      const isFast = seg.speed > 1;
      ctx.fillStyle = isFast ? "hsla(30, 80%, 50%, 0.3)" : "hsla(200, 80%, 50%, 0.3)";
      ctx.beginPath();
      ctx.roundRect(x, SPEED_TRACK_Y + 1, w, SPEED_TRACK_H - 2, 2);
      ctx.fill();
      ctx.fillStyle = isFast ? COLORS.speedLabelFast : COLORS.speedLabelSlow;
      ctx.font = "8px sans-serif";
      if (w > 20) ctx.fillText(`${seg.speed}x`, x + 3, SPEED_TRACK_Y + 10);
    }

    // ── Filter Track ──
    ctx.fillStyle = COLORS.trackBgAlt;
    ctx.fillRect(0, FILTER_TRACK_Y, width, FILTER_TRACK_H);

    for (const filter of filters) {
      const x = filter.startTime * zoom;
      const w = Math.max(2, (filter.endTime - filter.startTime) * zoom);
      ctx.fillStyle = "rgba(34, 197, 94, 0.2)";
      ctx.beginPath();
      ctx.roundRect(x, FILTER_TRACK_Y + 1, w, FILTER_TRACK_H - 2, 2);
      ctx.fill();
      ctx.strokeStyle = COLORS.filterStroke;
      ctx.lineWidth = 1;
      ctx.stroke();
      if (w > 30) {
        ctx.fillStyle = "rgba(34, 197, 94, 0.8)";
        ctx.font = "7px sans-serif";
        ctx.fillText(filter.type, x + 3, FILTER_TRACK_Y + 9);
      }
    }

    // ── Audio Track ──
    ctx.fillStyle = COLORS.trackBg;
    ctx.fillRect(0, AUDIO_TRACK_Y, width, AUDIO_TRACK_H);

    // Simulated audio waveform
    const audioBarWidth = 1;
    for (let x = 0; x < width; x += audioBarWidth + 1) {
      const time = x / zoom;
      if (time < trim.inPoint || time > trim.outPoint) continue;
      const isInCutRegion = cuts.some((c) => time >= c.start && time < c.end);
      if (isInCutRegion) continue;

      const seed = Math.round(x * 73 + 12345);
      const h = 2 + seededRandom(seed) * (AUDIO_TRACK_H * 0.7);
      const y = AUDIO_TRACK_Y + AUDIO_TRACK_H / 2 - h / 2;

      // Muted = gray, normal = green
      const vol = editState.audio.muted ? 0.15 : Math.min(1, editState.audio.volume / 100);
      ctx.fillStyle = editState.audio.muted
        ? "rgba(100,100,100,0.3)"
        : `rgba(34, 197, 94, ${0.2 + vol * 0.4})`;
      ctx.fillRect(x, y, audioBarWidth, h);
    }

    // Audio fade indicators
    if (editState.audio.fadeIn > 0) {
      const fadeW = editState.audio.fadeIn * zoom;
      const grad = ctx.createLinearGradient(trim.inPoint * zoom, 0, trim.inPoint * zoom + fadeW, 0);
      grad.addColorStop(0, "rgba(34, 197, 94, 0.4)");
      grad.addColorStop(1, "rgba(34, 197, 94, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(trim.inPoint * zoom, AUDIO_TRACK_Y, fadeW, AUDIO_TRACK_H);
      // Fade line
      ctx.strokeStyle = COLORS.audioWave;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(trim.inPoint * zoom, AUDIO_TRACK_Y + AUDIO_TRACK_H);
      ctx.lineTo(trim.inPoint * zoom + fadeW, AUDIO_TRACK_Y);
      ctx.stroke();
    }
    if (editState.audio.fadeOut > 0) {
      const fadeW = editState.audio.fadeOut * zoom;
      const fadeStart = trim.outPoint * zoom - fadeW;
      const grad = ctx.createLinearGradient(fadeStart, 0, trim.outPoint * zoom, 0);
      grad.addColorStop(0, "rgba(34, 197, 94, 0)");
      grad.addColorStop(1, "rgba(34, 197, 94, 0.4)");
      ctx.fillStyle = grad;
      ctx.fillRect(fadeStart, AUDIO_TRACK_Y, fadeW, AUDIO_TRACK_H);
      ctx.strokeStyle = COLORS.audioWave;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(fadeStart, AUDIO_TRACK_Y);
      ctx.lineTo(trim.outPoint * zoom, AUDIO_TRACK_Y + AUDIO_TRACK_H);
      ctx.stroke();
    }

    // ── Split/Marker lines across all tracks ──
    for (const marker of markers) {
      const x = marker.time * zoom;
      const color = marker.type === "chapter" ? COLORS.chapterLine : marker.type === "split" ? COLORS.splitLine : COLORS.markerLine;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(x, RULER_H);
      ctx.lineTo(x, TOTAL_HEIGHT);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // ── Hover time indicator ──
    if (hoverTime !== null && !isDragging) {
      const hx = hoverTime * zoom;
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(hx, RULER_H);
      ctx.lineTo(hx, TOTAL_HEIGHT);
      ctx.stroke();
      ctx.setLineDash([]);

      // Time tooltip
      ctx.fillStyle = "rgba(0,0,0,0.8)";
      const label = formatTimePrecise(hoverTime);
      const tw = ctx.measureText(label).width + 8;
      ctx.beginPath();
      ctx.roundRect(hx - tw / 2, 2, tw, 16, 4);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "9px monospace";
      ctx.fillText(label, hx - tw / 2 + 4, 14);
    }

    // ── Playhead (drawn last, on top) ──
    const playX = playhead * zoom;
    // Playhead line across all tracks
    ctx.fillStyle = COLORS.playhead;
    ctx.fillRect(playX - 1, RULER_H, 2, TOTAL_HEIGHT - RULER_H);

    // Playhead triangle at top
    ctx.beginPath();
    ctx.moveTo(playX - 7, RULER_H - 1);
    ctx.lineTo(playX + 7, RULER_H - 1);
    ctx.lineTo(playX, RULER_H + 7);
    ctx.closePath();
    ctx.fill();

    // Playhead glow
    ctx.shadowColor = "rgba(255,255,255,0.3)";
    ctx.shadowBlur = 4;
    ctx.fillRect(playX - 1, RULER_H, 2, TOTAL_HEIGHT - RULER_H);
    ctx.shadowBlur = 0;
  }, [duration, trim, cuts, markers, textOverlays, filters, speedSegments, transitions, stickers, freezeFrames, playhead, zoom, cutToolActive, cutMarkStart, selectedCutId, hoverTime, isDragging, editState.audio, TOTAL_HEIGHT]);

  useEffect(() => {
    drawTimeline();
  }, [drawTimeline]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = timelineWidth;
    canvas.height = TOTAL_HEIGHT;
    drawTimeline();
  }, [timelineWidth, TOTAL_HEIGHT, drawTimeline]);

  const getTimeFromX = (clientX: number): number => {
    const container = containerRef.current;
    if (!container) return 0;
    const rect = container.getBoundingClientRect();
    const scrollX = container.scrollLeft;
    const x = clientX - rect.left + scrollX;
    return Math.max(0, Math.min(duration, x / zoom));
  };

  const handleClick = (e: React.MouseEvent) => {
    const time = getTimeFromX(e.clientX);

    if (cutToolActive) {
      if (cutMarkStart === null) {
        onCutMarkStart?.(time);
      } else {
        const start = Math.min(cutMarkStart, time);
        const end = Math.max(cutMarkStart, time);
        if (end - start > 0.1) {
          onCutMarkEnd?.(start, end);
        }
      }
      return;
    }

    // Check if clicking on a cut
    const clickedCut = cuts.find((c) => time >= c.start && time <= c.end);
    if (clickedCut) {
      onSelectCut(clickedCut.id);
      return;
    }

    onSelectCut(null);
    onSeek(time);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (cutToolActive) return;
    setIsDragging(true);
    const time = getTimeFromX(e.clientX);
    onSeek(time);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const time = getTimeFromX(e.clientX);
    setHoverTime(time);
    if (isDragging) {
      onSeek(time);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setHoverTime(null);
  };

  // Auto-scroll to keep playhead in view
  useEffect(() => {
    const container = containerRef.current;
    if (!container || isDragging) return;
    const playX = playhead * zoom;
    const scrollLeft = container.scrollLeft;
    const viewWidth = container.clientWidth;
    const margin = viewWidth * 0.15;

    if (playX < scrollLeft + margin) {
      container.scrollLeft = Math.max(0, playX - margin);
    } else if (playX > scrollLeft + viewWidth - margin) {
      container.scrollLeft = playX - viewWidth + margin;
    }
  }, [playhead, zoom, isDragging]);

  return (
    <div
      ref={containerRef}
      className="relative overflow-x-auto"
      style={{
        cursor: cutToolActive ? "crosshair" : isDragging ? "grabbing" : "pointer",
        height: TOTAL_HEIGHT,
      }}
    >
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        className="block"
      />
    </div>
  );
}
