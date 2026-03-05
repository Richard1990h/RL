"use client";

import {
  MousePointer2,
  ArrowLeftToLine,
  Scissors,
  SplitSquareHorizontal,
  Type,
  SlidersHorizontal,
  Gauge,
  Volume2,
  Blend,
  Crop,
  Sparkles,
  Smile,
  Flag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { EditorTool } from "@/stores/editor-store";

interface ToolsPanelProps {
  activeTool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
}

const tools: { id: EditorTool; icon: React.ReactNode; label: string; shortcut?: string; group?: string }[] = [
  { id: "select", icon: <MousePointer2 size={16} />, label: "Select", shortcut: "V", group: "basic" },
  { id: "trim", icon: <ArrowLeftToLine size={16} />, label: "Trim", shortcut: "I/O", group: "basic" },
  { id: "cut", icon: <Scissors size={16} />, label: "Cut", shortcut: "C", group: "basic" },
  { id: "split", icon: <SplitSquareHorizontal size={16} />, label: "Split", shortcut: "S", group: "basic" },
  { id: "crop", icon: <Crop size={16} />, label: "Crop", group: "transform" },
  { id: "text", icon: <Type size={16} />, label: "Text", shortcut: "T", group: "overlay" },
  { id: "stickers", icon: <Smile size={16} />, label: "Stickers", group: "overlay" },
  { id: "filters", icon: <SlidersHorizontal size={16} />, label: "Filters", group: "effects" },
  { id: "effects", icon: <Sparkles size={16} />, label: "Presets", group: "effects" },
  { id: "transitions", icon: <Blend size={16} />, label: "Trans.", group: "effects" },
  { id: "speed", icon: <Gauge size={16} />, label: "Speed", group: "timing" },
  { id: "audio", icon: <Volume2 size={16} />, label: "Audio", group: "timing" },
  { id: "markers", icon: <Flag size={16} />, label: "Markers", group: "timing" },
];

const groupLabels: Record<string, string> = {
  basic: "Edit",
  transform: "Transform",
  overlay: "Overlay",
  effects: "Effects",
  timing: "Timing",
};

export default function ToolsPanel({ activeTool, onToolChange }: ToolsPanelProps) {
  let lastGroup = "";

  return (
    <div className="flex flex-col gap-0.5 py-2 px-1">
      {tools.map((tool) => {
        const showDivider = tool.group !== lastGroup && lastGroup !== "";
        lastGroup = tool.group || "";
        return (
          <div key={tool.id}>
            {showDivider && (
              <div className="my-1 border-t border-border/50" />
            )}
            <button
              onClick={() => onToolChange(tool.id)}
              title={`${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ""}`}
              className={cn(
                "flex flex-col items-center gap-0.5 w-full px-1 py-1.5 rounded-lg transition-colors",
                activeTool === tool.id
                  ? "bg-primary/20 text-primary"
                  : "text-text-secondary hover:bg-bg-surface2 hover:text-text"
              )}
            >
              {tool.icon}
              <span className="text-[8px] font-medium leading-tight">{tool.label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
