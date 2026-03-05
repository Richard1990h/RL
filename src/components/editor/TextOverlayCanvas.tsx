"use client";

import { useRef, useEffect, useCallback } from "react";
import type { TextOverlay } from "@/lib/editor/timeline-state";

interface TextOverlayCanvasProps {
  textOverlays: TextOverlay[];
  playhead: number;
  selectedTextId: string | null;
  onSelectText: (textId: string | null) => void;
  onUpdatePosition: (textId: string, x: number, y: number) => void;
}

export default function TextOverlayCanvas({
  textOverlays,
  playhead,
  selectedTextId,
  onSelectText,
  onUpdatePosition,
}: TextOverlayCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ textId: string; offsetX: number; offsetY: number } | null>(null);

  const activeOverlays = textOverlays.filter(
    (t) => playhead >= t.startTime && playhead <= t.endTime
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const overlay of activeOverlays) {
      const x = (overlay.x / 100) * canvas.width;
      const y = (overlay.y / 100) * canvas.height;

      const fontStyle = `${overlay.italic ? "italic " : ""}${overlay.bold ? "bold " : ""}${overlay.fontSize}px ${overlay.fontFamily}`;
      ctx.font = fontStyle;
      ctx.textBaseline = "top";

      const metrics = ctx.measureText(overlay.text);
      const textHeight = overlay.fontSize * 1.2;

      // Background
      if (overlay.backgroundColor && overlay.backgroundColor !== "transparent") {
        ctx.fillStyle = overlay.backgroundColor;
        ctx.fillRect(x - 4, y - 2, metrics.width + 8, textHeight + 4);
      }

      // Selection border
      if (overlay.id === selectedTextId) {
        ctx.strokeStyle = "#8B5CF6";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(x - 6, y - 4, metrics.width + 12, textHeight + 8);
        ctx.setLineDash([]);
      }

      // Text
      ctx.fillStyle = overlay.color;
      ctx.fillText(overlay.text, x, y);
    }

  }, [activeOverlays, selectedTextId]);

  useEffect(() => {
    draw();
  }, [draw]);

  const getOverlayAtPosition = (clientX: number, clientY: number): TextOverlay | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Check in reverse order (top-most first)
    for (let i = activeOverlays.length - 1; i >= 0; i--) {
      const overlay = activeOverlays[i];
      const x = (overlay.x / 100) * canvas.width;
      const y = (overlay.y / 100) * canvas.height;

      ctx.font = `${overlay.italic ? "italic " : ""}${overlay.bold ? "bold " : ""}${overlay.fontSize}px ${overlay.fontFamily}`;
      const metrics = ctx.measureText(overlay.text);
      const textHeight = overlay.fontSize * 1.2;

      if (mx >= x - 6 && mx <= x + metrics.width + 6 && my >= y - 4 && my <= y + textHeight + 4) {
        return overlay;
      }
    }
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const overlay = getOverlayAtPosition(e.clientX, e.clientY);
    if (overlay) {
      onSelectText(overlay.id);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const ox = (overlay.x / 100) * canvas.width;
      const oy = (overlay.y / 100) * canvas.height;
      dragRef.current = { textId: overlay.id, offsetX: mx - ox, offsetY: my - oy };
    } else {
      onSelectText(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const newX = Math.max(0, Math.min(100, ((mx - dragRef.current.offsetX) / canvas.width) * 100));
    const newY = Math.max(0, Math.min(100, ((my - dragRef.current.offsetY) / canvas.height) * 100));
    onUpdatePosition(dragRef.current.textId, newX, newY);
  };

  const handleMouseUp = () => {
    dragRef.current = null;
  };

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-auto">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
    </div>
  );
}
