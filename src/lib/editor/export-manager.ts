// Send edit instructions to server for ffmpeg export

import type { EditState } from "./timeline-state";

export interface ExportOptions {
  resolution: "480p" | "720p" | "1080p" | "4k";
  format: "mp4" | "webm";
  quality?: "draft" | "standard" | "high";
}

export interface ExportProgress {
  status: "preparing" | "exporting" | "done" | "error";
  progress: number; // 0-100
  outputUrl?: string;
  error?: string;
}

export type ExportProgressCallback = (progress: ExportProgress) => void;

export async function startExport(
  recordingId: string,
  editState: EditState,
  options: ExportOptions,
  onProgress: ExportProgressCallback
): Promise<string | null> {
  onProgress({ status: "preparing", progress: 0 });

  try {
    const response = await fetch("/api/editor/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        recordingId,
        trimStart: editState.trim.inPoint > 0 ? editState.trim.inPoint : undefined,
        trimEnd: editState.trim.outPoint < editState.duration ? editState.trim.outPoint : undefined,
        cuts: editState.cuts.map((c) => ({ start: c.start, end: c.end })),
        textOverlays: editState.textOverlays.map((t) => ({
          text: t.text,
          startTime: t.startTime,
          endTime: t.endTime,
          x: t.x,
          y: t.y,
          fontSize: t.fontSize,
          fontFamily: t.fontFamily,
          color: t.color,
          backgroundColor: t.backgroundColor,
          bold: t.bold,
          italic: t.italic,
          underline: t.underline,
          opacity: t.opacity,
          rotation: t.rotation,
          shadow: t.shadow,
          shadowColor: t.shadowColor,
          shadowBlur: t.shadowBlur,
          outline: t.outline,
          outlineColor: t.outlineColor,
          outlineWidth: t.outlineWidth,
          textAlign: t.textAlign,
        })),
        filters: editState.filters.map((f) => ({
          type: f.type,
          value: f.value,
          startTime: f.startTime,
          endTime: f.endTime,
        })),
        speedSegments: editState.speedSegments.map((s) => ({
          startTime: s.startTime,
          endTime: s.endTime,
          speed: s.speed,
          reverse: s.reverse,
          easing: s.easing,
        })),
        audio: {
          volume: editState.audio.volume,
          muted: editState.audio.muted,
          fadeIn: editState.audio.fadeIn,
          fadeOut: editState.audio.fadeOut,
          bass: editState.audio.bass,
          treble: editState.audio.treble,
          noiseReduction: editState.audio.noiseReduction,
          normalize: editState.audio.normalize,
          compressor: editState.audio.compressor,
        },
        transitions: editState.transitions.map((t) => ({
          type: t.type,
          startTime: t.startTime,
          duration: t.duration,
          easing: t.easing,
        })),
        crop: {
          x: editState.crop.x,
          y: editState.crop.y,
          width: editState.crop.width,
          height: editState.crop.height,
          rotation: editState.crop.rotation,
          flipH: editState.crop.flipH,
          flipV: editState.crop.flipV,
        },
        freezeFrames: editState.freezeFrames.map((f) => ({
          time: f.time,
          duration: f.duration,
          startTime: f.startTime,
        })),
        stickers: editState.stickers.map((s) => ({
          emoji: s.emoji,
          startTime: s.startTime,
          endTime: s.endTime,
          x: s.x,
          y: s.y,
          size: s.size,
          rotation: s.rotation,
          opacity: s.opacity,
        })),
        resolution: options.resolution,
        format: options.format || "mp4",
        quality: options.quality || "standard",
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: "Export failed" }));
      onProgress({ status: "error", progress: 0, error: err.error });
      return null;
    }

    onProgress({ status: "exporting", progress: 30 });

    const data = await response.json();
    const { exportId } = data;

    // Poll for export status
    return await pollExportStatus(exportId, onProgress);
  } catch (err) {
    onProgress({ status: "error", progress: 0, error: String(err) });
    return null;
  }
}

async function pollExportStatus(
  exportId: string,
  onProgress: ExportProgressCallback
): Promise<string | null> {
  let attempts = 0;
  const maxAttempts = 300; // 5 minutes at 1s intervals

  while (attempts < maxAttempts) {
    attempts++;
    await new Promise((r) => setTimeout(r, 1000));

    try {
      const response = await fetch(`/api/editor/export?exportId=${exportId}`, {
        credentials: "include",
      });

      if (!response.ok) continue;

      const data = await response.json();

      if (data.status === "done") {
        onProgress({ status: "done", progress: 100, outputUrl: data.outputUrl });
        return data.outputUrl;
      }

      if (data.status === "error") {
        onProgress({ status: "error", progress: 0, error: data.error });
        return null;
      }

      // Update progress
      const progress = Math.min(30 + (attempts / maxAttempts) * 60, 90);
      onProgress({ status: "exporting", progress });
    } catch {
      // Continue polling on error
    }
  }

  onProgress({ status: "error", progress: 0, error: "Export timed out" });
  return null;
}
