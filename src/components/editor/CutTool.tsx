"use client";

import { Scissors, Trash2, X } from "lucide-react";
import Button from "@/components/ui/Button";
import type { CutSegment } from "@/lib/editor/timeline-state";

interface CutToolProps {
  cuts: CutSegment[];
  selectedCutId: string | null;
  cutToolActive: boolean;
  onToggleCutTool: () => void;
  onRemoveCut: (cutId: string) => void;
  onCancelCut: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function CutTool({
  cuts,
  selectedCutId,
  cutToolActive,
  onToggleCutTool,
  onRemoveCut,
  onCancelCut,
}: CutToolProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          variant={cutToolActive ? "danger" : "secondary"}
          size="sm"
          icon={cutToolActive ? <X size={14} /> : <Scissors size={14} />}
          onClick={cutToolActive ? onCancelCut : onToggleCutTool}
        >
          {cutToolActive ? "Cancel Cut" : "Cut Tool"}
        </Button>
        {cutToolActive && (
          <span className="text-xs text-warning">
            Click timeline to mark start, click again to mark end
          </span>
        )}
      </div>

      {cuts.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            Cut Segments ({cuts.length})
          </h4>
          {cuts.map((cut) => (
            <div
              key={cut.id}
              className={`flex items-center justify-between p-2 rounded-lg border transition-colors ${
                cut.id === selectedCutId
                  ? "bg-danger/10 border-danger/30"
                  : "bg-bg-surface2 border-border"
              }`}
            >
              <div className="flex items-center gap-2">
                <Scissors size={12} className="text-danger" />
                <span className="text-xs font-mono text-text">
                  {formatTime(cut.start)} - {formatTime(cut.end)}
                </span>
                <span className="text-[10px] text-text-muted">
                  ({formatTime(cut.end - cut.start)})
                </span>
              </div>
              <button
                onClick={() => onRemoveCut(cut.id)}
                className="p-1 hover:bg-danger/20 rounded text-text-muted hover:text-danger transition-colors"
                title="Remove cut"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
