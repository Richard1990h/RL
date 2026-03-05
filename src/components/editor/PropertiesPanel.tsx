"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import { useEditorStore } from "@/stores/editor-store";
import {
  createDefaultTextOverlay,
  EFFECT_PRESETS,
  type TextOverlay,
  type FilterEffect,
  type FilterType,
  type SpeedSegment,
  type AudioAdjustment,
  type CutSegment,
  type Transition,
  type TransitionType,
  type CropTransform,
  type AspectRatio,
  type StickerOverlay,
  type TimelineMarker,
  type TextAnimation,
  type SpeedEasing,
} from "@/lib/editor/timeline-state";

/* ── Helpers ── */

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${m}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

const INPUT_CLS =
  "w-full bg-bg-surface2 text-text border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-primary";
const LABEL_CLS = "text-[10px] text-text-muted";
const SECTION_TITLE_CLS =
  "text-xs font-semibold text-text-secondary uppercase tracking-wider";
const GRID_BTN_CLS =
  "px-2 py-1.5 text-[10px] bg-bg-surface2 text-text-secondary rounded-lg border border-border hover:border-primary hover:text-text transition-colors capitalize";
const TOGGLE_ON =
  "bg-primary/20 text-primary border-primary/30";
const TOGGLE_OFF =
  "bg-bg-surface2 text-text-secondary border-border";
const ITEM_CLS =
  "flex items-center justify-between p-2 rounded-lg border text-xs";
const DELETE_BTN_CLS =
  "p-1 hover:bg-danger/20 rounded text-text-muted hover:text-danger transition-colors";

/* ── Main Component ── */

export default function PropertiesPanel() {
  const {
    activeTool,
    editState,
    selectedTextId,
    selectedFilterId,
    selectedSpeedId,
    selectedCutId,
    selectedTransitionId,
    selectedStickerId,
    selectedMarkerId,
    cutToolActive,
    // Trim
    trimIn,
    trimOut,
    // Text
    addText,
    updateText,
    removeText,
    // Filters
    addFilterEffect,
    removeFilterEffect,
    updateFilterEffect,
    // Speed
    setSpeed,
    removeSpeed,
    updateSpeed,
    // Audio
    setAudio,
    // Cuts
    removeCutSegment,
    setCutToolActive,
    setCutMarkStart,
    // Transitions
    addTransitionEffect,
    removeTransitionEffect,
    updateTransitionEffect,
    // Crop
    setCrop,
    // Effects
    applyEffectPreset,
    // Freeze
    addFreeze,
    removeFreeze,
    // Stickers
    addStickerOverlay,
    removeStickerOverlay,
    updateStickerOverlay,
    // Markers
    addMarkerAt,
    removeMarkerById,
    updateMarkerById,
  } = useEditorStore();

  if (!editState) return null;

  const selectedText = selectedTextId
    ? editState.textOverlays.find((t) => t.id === selectedTextId) ?? null
    : null;
  const selectedFilter = selectedFilterId
    ? editState.filters.find((f) => f.id === selectedFilterId) ?? null
    : null;
  const selectedSpeedSeg = selectedSpeedId
    ? editState.speedSegments.find((s) => s.id === selectedSpeedId) ?? null
    : null;
  const selectedTransition = selectedTransitionId
    ? editState.transitions.find((t) => t.id === selectedTransitionId) ?? null
    : null;
  const selectedSticker = selectedStickerId
    ? editState.stickers.find((s) => s.id === selectedStickerId) ?? null
    : null;
  const selectedMarker = selectedMarkerId
    ? editState.markers.find((m) => m.id === selectedMarkerId) ?? null
    : null;

  return (
    <div className="w-64 overflow-y-auto space-y-3 p-3">
      {(activeTool === "select" || activeTool === "split") && <ShortcutsSection />}
      {activeTool === "trim" && (
        <TrimSection
          inPoint={editState.trim.inPoint}
          outPoint={editState.trim.outPoint}
          playhead={editState.playhead}
          onSetIn={trimIn}
          onSetOut={trimOut}
        />
      )}
      {activeTool === "cut" && (
        <CutSection
          cuts={editState.cuts}
          selectedCutId={selectedCutId}
          cutToolActive={cutToolActive}
          onRemoveCut={removeCutSegment}
          onToggleCutTool={() => setCutToolActive(!cutToolActive)}
          onCancelCut={() => {
            setCutToolActive(false);
            setCutMarkStart(null);
          }}
        />
      )}
      {activeTool === "text" && (
        <TextSection
          selectedText={selectedText}
          playhead={editState.playhead}
          duration={editState.duration}
          onUpdate={updateText}
          onRemove={removeText}
          onAdd={addText}
        />
      )}
      {activeTool === "filters" && (
        <FilterSection
          selectedFilter={selectedFilter}
          playhead={editState.playhead}
          duration={editState.duration}
          filters={editState.filters}
          onAdd={addFilterEffect}
          onRemove={removeFilterEffect}
          onUpdate={updateFilterEffect}
        />
      )}
      {activeTool === "speed" && (
        <SpeedSection
          selectedSpeed={selectedSpeedSeg}
          playhead={editState.playhead}
          duration={editState.duration}
          segments={editState.speedSegments}
          freezeFrames={editState.freezeFrames}
          onAdd={setSpeed}
          onRemove={removeSpeed}
          onUpdate={updateSpeed}
          onAddFreeze={addFreeze}
          onRemoveFreeze={removeFreeze}
        />
      )}
      {activeTool === "audio" && (
        <AudioSection audio={editState.audio} onUpdate={setAudio} />
      )}
      {activeTool === "transitions" && (
        <TransitionsSection
          selectedTransition={selectedTransition}
          playhead={editState.playhead}
          duration={editState.duration}
          transitions={editState.transitions}
          onAdd={addTransitionEffect}
          onRemove={removeTransitionEffect}
          onUpdate={updateTransitionEffect}
        />
      )}
      {activeTool === "crop" && (
        <CropSection crop={editState.crop} onUpdate={setCrop} />
      )}
      {activeTool === "effects" && (
        <EffectsSection onApplyPreset={applyEffectPreset} />
      )}
      {activeTool === "stickers" && (
        <StickersSection
          selectedSticker={selectedSticker}
          playhead={editState.playhead}
          duration={editState.duration}
          stickers={editState.stickers}
          onAdd={addStickerOverlay}
          onRemove={removeStickerOverlay}
          onUpdate={updateStickerOverlay}
        />
      )}
      {activeTool === "markers" && (
        <MarkersSection
          selectedMarker={selectedMarker}
          playhead={editState.playhead}
          markers={editState.markers}
          onAdd={addMarkerAt}
          onRemove={removeMarkerById}
          onUpdate={updateMarkerById}
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   1. SELECT / SPLIT  -  Keyboard Shortcuts
   ══════════════════════════════════════════════════════════════════ */

function ShortcutsSection() {
  const shortcuts: [string, string][] = [
    ["Space", "Play / Pause"],
    ["I", "Set in point"],
    ["O", "Set out point"],
    ["S", "Split at playhead"],
    ["T", "Add text"],
    ["C", "Toggle cut tool"],
    ["Del", "Delete selected"],
    ["Ctrl+Z", "Undo"],
    ["Ctrl+Shift+Z", "Redo"],
    ["\u2190 \u2192", "Seek 1s"],
    ["Shift+\u2190 \u2192", "Seek 5s"],
    ["Ctrl+\u2190 \u2192", "Seek to marker"],
    ["+  \u2212", "Zoom timeline"],
    ["M", "Add marker"],
    ["F", "Freeze frame"],
  ];

  return (
    <div className="space-y-2">
      <h4 className={SECTION_TITLE_CLS}>Keyboard Shortcuts</h4>
      {shortcuts.map(([key, action]) => (
        <div key={key} className="flex items-center justify-between text-[10px]">
          <kbd className="px-1.5 py-0.5 bg-bg-surface3 rounded text-text-secondary font-mono">
            {key}
          </kbd>
          <span className="text-text-muted">{action}</span>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   2. TRIM
   ══════════════════════════════════════════════════════════════════ */

function TrimSection({
  inPoint,
  outPoint,
  playhead,
  onSetIn,
  onSetOut,
}: {
  inPoint: number;
  outPoint: number;
  playhead: number;
  onSetIn: (t: number) => void;
  onSetOut: (t: number) => void;
}) {
  return (
    <div className="space-y-3">
      <h4 className={SECTION_TITLE_CLS}>Trim</h4>
      <div className="flex items-center justify-between">
        <div>
          <p className={LABEL_CLS}>In Point</p>
          <p className="text-xs font-mono text-text">{formatTimestamp(inPoint)}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onSetIn(playhead)}>
          Set In (I)
        </Button>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className={LABEL_CLS}>Out Point</p>
          <p className="text-xs font-mono text-text">{formatTimestamp(outPoint)}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onSetOut(playhead)}>
          Set Out (O)
        </Button>
      </div>
      <div className="text-center text-xs text-text-muted">
        Duration: {formatTimestamp(outPoint - inPoint)}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   3. CUT
   ══════════════════════════════════════════════════════════════════ */

function CutSection({
  cuts,
  selectedCutId,
  cutToolActive,
  onRemoveCut,
  onToggleCutTool,
  onCancelCut,
}: {
  cuts: CutSegment[];
  selectedCutId: string | null;
  cutToolActive: boolean;
  onRemoveCut: (id: string) => void;
  onToggleCutTool: () => void;
  onCancelCut: () => void;
}) {
  return (
    <div className="space-y-3">
      <h4 className={SECTION_TITLE_CLS}>Cut Tool</h4>
      <Button
        variant={cutToolActive ? "danger" : "secondary"}
        size="sm"
        fullWidth
        onClick={cutToolActive ? onCancelCut : onToggleCutTool}
      >
        {cutToolActive ? "Cancel" : "Mark Cut Region"}
      </Button>
      {cutToolActive && (
        <p className="text-[10px] text-warning">
          Click timeline to mark start, click again to mark end
        </p>
      )}
      {cuts.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-text-muted uppercase">
            Cut Segments ({cuts.length})
          </p>
          {cuts.map((cut) => (
            <div
              key={cut.id}
              className={`${ITEM_CLS} ${
                cut.id === selectedCutId
                  ? "bg-danger/10 border-danger/30"
                  : "bg-bg-surface2 border-border"
              }`}
            >
              <span className="font-mono text-text">
                {formatTime(cut.start)} - {formatTime(cut.end)}
              </span>
              <button
                onClick={() => onRemoveCut(cut.id)}
                className={DELETE_BTN_CLS}
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

/* ══════════════════════════════════════════════════════════════════
   4. TEXT
   ══════════════════════════════════════════════════════════════════ */

const FONT_FAMILIES = [
  "sans-serif",
  "serif",
  "monospace",
  "cursive",
  "fantasy",
  "Inter",
  "Roboto",
  "Montserrat",
  "Playfair Display",
  "Oswald",
  "Poppins",
];

const TEXT_ANIMATIONS: TextAnimation[] = [
  "none",
  "fade-in",
  "fade-out",
  "slide-up",
  "slide-down",
  "slide-left",
  "slide-right",
  "typewriter",
  "bounce",
  "zoom-in",
  "zoom-out",
  "glitch",
  "wave",
];

function TextSection({
  selectedText,
  playhead,
  duration,
  onUpdate,
  onRemove,
  onAdd,
}: {
  selectedText: TextOverlay | null;
  playhead: number;
  duration: number;
  onUpdate: (id: string, updates: Partial<TextOverlay>) => void;
  onRemove: (id: string) => void;
  onAdd: (overlay: Omit<TextOverlay, "id">) => void;
}) {
  if (!selectedText) {
    return (
      <div className="space-y-3">
        <h4 className={SECTION_TITLE_CLS}>Text Overlay</h4>
        <Button
          variant="secondary"
          size="sm"
          fullWidth
          onClick={() =>
            onAdd(createDefaultTextOverlay(playhead, Math.min(playhead + 5, duration)))
          }
        >
          Add Text at Playhead (T)
        </Button>
        <p className="text-[10px] text-text-muted">
          Press T to add text, then edit properties here.
        </p>
      </div>
    );
  }

  const t = selectedText;
  const u = (updates: Partial<TextOverlay>) => onUpdate(t.id, updates);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className={SECTION_TITLE_CLS}>Text</h4>
        <button onClick={() => onRemove(t.id)} className={DELETE_BTN_CLS}>
          <Trash2 size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="space-y-1">
        <label className={LABEL_CLS}>Content</label>
        <input
          type="text"
          value={t.text}
          onChange={(e) => u({ text: e.target.value })}
          className={INPUT_CLS}
        />
      </div>

      {/* Font size + family */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={LABEL_CLS}>Font Size</label>
          <input
            type="number"
            min={8}
            max={200}
            value={t.fontSize}
            onChange={(e) => u({ fontSize: parseInt(e.target.value) || 32 })}
            className={INPUT_CLS}
          />
        </div>
        <div>
          <label className={LABEL_CLS}>Font Family</label>
          <select
            value={t.fontFamily}
            onChange={(e) => u({ fontFamily: e.target.value })}
            className={INPUT_CLS}
          >
            {FONT_FAMILIES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Colors */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={LABEL_CLS}>Color</label>
          <input
            type="color"
            value={t.color}
            onChange={(e) => u({ color: e.target.value })}
            className="w-full h-7 bg-bg-surface2 border border-border rounded cursor-pointer"
          />
        </div>
        <div>
          <label className={LABEL_CLS}>Background</label>
          <input
            type="color"
            value={t.backgroundColor.startsWith("rgba") ? "#000000" : t.backgroundColor}
            onChange={(e) => u({ backgroundColor: e.target.value })}
            className="w-full h-7 bg-bg-surface2 border border-border rounded cursor-pointer"
          />
        </div>
      </div>

      {/* Style toggles: B / I / U / S */}
      <div className="flex gap-1">
        {(
          [
            ["B", "bold", t.bold, "font-bold"],
            ["I", "italic", t.italic, "italic"],
            ["U", "underline", t.underline, "underline"],
            ["S", "strikethrough", t.strikethrough, "line-through"],
          ] as const
        ).map(([label, key, active, cls]) => (
          <button
            key={key}
            onClick={() => u({ [key]: !active })}
            className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${cls} ${
              active ? TOGGLE_ON : TOGGLE_OFF
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Text align */}
      <div className="space-y-1">
        <label className={LABEL_CLS}>Text Align</label>
        <div className="flex gap-1">
          {(["left", "center", "right"] as const).map((align) => (
            <button
              key={align}
              onClick={() => u({ textAlign: align })}
              className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors capitalize ${
                t.textAlign === align ? TOGGLE_ON : TOGGLE_OFF
              }`}
            >
              {align}
            </button>
          ))}
        </div>
      </div>

      {/* Opacity */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className={LABEL_CLS}>Opacity</label>
          <span className="text-xs text-text-secondary">{t.opacity}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={t.opacity}
          onChange={(e) => u({ opacity: parseInt(e.target.value) })}
          className="w-full accent-primary"
        />
      </div>

      {/* Rotation */}
      <div className="space-y-1">
        <label className={LABEL_CLS}>Rotation</label>
        <input
          type="number"
          min={-360}
          max={360}
          value={t.rotation}
          onChange={(e) => u({ rotation: parseFloat(e.target.value) || 0 })}
          className={INPUT_CLS}
        />
      </div>

      {/* Letter spacing + Line height */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={LABEL_CLS}>Letter Spacing</label>
          <input
            type="number"
            min={-10}
            max={50}
            step={0.5}
            value={t.letterSpacing}
            onChange={(e) => u({ letterSpacing: parseFloat(e.target.value) || 0 })}
            className={INPUT_CLS}
          />
        </div>
        <div>
          <label className={LABEL_CLS}>Line Height</label>
          <input
            type="number"
            min={0.5}
            max={3}
            step={0.1}
            value={t.lineHeight}
            onChange={(e) => u({ lineHeight: parseFloat(e.target.value) || 1.2 })}
            className={INPUT_CLS}
          />
        </div>
      </div>

      {/* Shadow */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className={LABEL_CLS}>Shadow</label>
          <button
            onClick={() => u({ shadow: !t.shadow })}
            className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
              t.shadow ? TOGGLE_ON : TOGGLE_OFF
            }`}
          >
            {t.shadow ? "On" : "Off"}
          </button>
        </div>
        {t.shadow && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={LABEL_CLS}>Shadow Color</label>
              <input
                type="color"
                value={t.shadowColor}
                onChange={(e) => u({ shadowColor: e.target.value })}
                className="w-full h-6 bg-bg-surface2 border border-border rounded cursor-pointer"
              />
            </div>
            <div>
              <label className={LABEL_CLS}>Shadow Blur</label>
              <input
                type="number"
                min={0}
                max={50}
                value={t.shadowBlur}
                onChange={(e) => u({ shadowBlur: parseInt(e.target.value) || 0 })}
                className={INPUT_CLS}
              />
            </div>
          </div>
        )}
      </div>

      {/* Outline */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className={LABEL_CLS}>Outline</label>
          <button
            onClick={() => u({ outline: !t.outline })}
            className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
              t.outline ? TOGGLE_ON : TOGGLE_OFF
            }`}
          >
            {t.outline ? "On" : "Off"}
          </button>
        </div>
        {t.outline && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={LABEL_CLS}>Outline Color</label>
              <input
                type="color"
                value={t.outlineColor}
                onChange={(e) => u({ outlineColor: e.target.value })}
                className="w-full h-6 bg-bg-surface2 border border-border rounded cursor-pointer"
              />
            </div>
            <div>
              <label className={LABEL_CLS}>Outline Width</label>
              <input
                type="number"
                min={0}
                max={20}
                value={t.outlineWidth}
                onChange={(e) => u({ outlineWidth: parseInt(e.target.value) || 0 })}
                className={INPUT_CLS}
              />
            </div>
          </div>
        )}
      </div>

      {/* Animation */}
      <div className="space-y-1">
        <label className={LABEL_CLS}>Animation</label>
        <select
          value={t.animation}
          onChange={(e) => u({ animation: e.target.value as TextAnimation })}
          className={INPUT_CLS}
        >
          {TEXT_ANIMATIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      {/* Position X / Y */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="flex items-center justify-between">
            <label className={LABEL_CLS}>X Position</label>
            <span className="text-[10px] text-text-secondary">{t.x}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={t.x}
            onChange={(e) => u({ x: parseFloat(e.target.value) })}
            className="w-full accent-primary"
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className={LABEL_CLS}>Y Position</label>
            <span className="text-[10px] text-text-secondary">{t.y}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={t.y}
            onChange={(e) => u({ y: parseFloat(e.target.value) })}
            className="w-full accent-primary"
          />
        </div>
      </div>

      {/* Start / End time */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={LABEL_CLS}>Start Time</label>
          <input
            type="number"
            step={0.1}
            min={0}
            value={t.startTime}
            onChange={(e) => u({ startTime: parseFloat(e.target.value) || 0 })}
            className={INPUT_CLS}
          />
        </div>
        <div>
          <label className={LABEL_CLS}>End Time</label>
          <input
            type="number"
            step={0.1}
            min={0}
            value={t.endTime}
            onChange={(e) => u({ endTime: parseFloat(e.target.value) || 0 })}
            className={INPUT_CLS}
          />
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   5. FILTERS
   ══════════════════════════════════════════════════════════════════ */

const ALL_FILTER_TYPES: FilterType[] = [
  "brightness",
  "contrast",
  "saturation",
  "grayscale",
  "sepia",
  "blur",
  "sharpen",
  "vignette",
  "noise",
  "film-grain",
  "hue-rotate",
  "invert",
  "temperature",
  "tint",
  "highlights",
  "shadows",
  "vibrance",
  "clarity",
];

function FilterSection({
  selectedFilter,
  playhead,
  duration,
  filters,
  onAdd,
  onRemove,
  onUpdate,
}: {
  selectedFilter: FilterEffect | null;
  playhead: number;
  duration: number;
  filters: FilterEffect[];
  onAdd: (filter: Omit<FilterEffect, "id">) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<FilterEffect>) => void;
}) {
  return (
    <div className="space-y-3">
      <h4 className={SECTION_TITLE_CLS}>Filters</h4>

      {/* Add filter grid */}
      <div className="grid grid-cols-3 gap-1">
        {ALL_FILTER_TYPES.map((type) => (
          <button
            key={type}
            onClick={() =>
              onAdd({
                type,
                value: type === "blur" ? 0 : 100,
                startTime: playhead,
                endTime: Math.min(playhead + 10, duration),
              })
            }
            className={GRID_BTN_CLS}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Active filters list */}
      {filters.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-text-muted uppercase">
            Active ({filters.length})
          </p>
          {filters.map((f) => (
            <div
              key={f.id}
              className={`${ITEM_CLS} ${
                f.id === selectedFilter?.id
                  ? "bg-primary/10 border-primary/30"
                  : "bg-bg-surface2 border-border"
              }`}
            >
              <div className="flex-1 min-w-0">
                <span className="text-text capitalize">{f.type}</span>
                <span className="text-text-muted ml-1">({f.value}%)</span>
                {/* Inline editable slider */}
                <input
                  type="range"
                  min={0}
                  max={200}
                  value={f.value}
                  onChange={(e) =>
                    onUpdate(f.id, { value: parseInt(e.target.value) })
                  }
                  className="w-full accent-primary mt-1"
                />
              </div>
              <button
                onClick={() => onRemove(f.id)}
                className={`${DELETE_BTN_CLS} ml-1 shrink-0`}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Selected filter detail controls */}
      {selectedFilter && (
        <div className="space-y-2 pt-2 border-t border-border">
          <p className="text-[10px] text-text-muted uppercase">
            Selected: {selectedFilter.type}
          </p>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className={LABEL_CLS}>Value</label>
              <span className="text-xs text-text-secondary">
                {selectedFilter.value}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={200}
              value={selectedFilter.value}
              onChange={(e) =>
                onUpdate(selectedFilter.id, {
                  value: parseInt(e.target.value),
                })
              }
              className="w-full accent-primary"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={LABEL_CLS}>Start</label>
              <input
                type="number"
                step={0.1}
                min={0}
                value={selectedFilter.startTime}
                onChange={(e) =>
                  onUpdate(selectedFilter.id, {
                    startTime: parseFloat(e.target.value) || 0,
                  })
                }
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>End</label>
              <input
                type="number"
                step={0.1}
                min={0}
                value={selectedFilter.endTime}
                onChange={(e) =>
                  onUpdate(selectedFilter.id, {
                    endTime: parseFloat(e.target.value) || 0,
                  })
                }
                className={INPUT_CLS}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   6. SPEED
   ══════════════════════════════════════════════════════════════════ */

const SPEED_PRESETS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 8, 16];
const SPEED_EASINGS: SpeedEasing[] = ["linear", "ease-in", "ease-out", "ease-in-out"];

function SpeedSection({
  selectedSpeed,
  playhead,
  duration,
  segments,
  freezeFrames,
  onAdd,
  onRemove,
  onUpdate,
  onAddFreeze,
  onRemoveFreeze,
}: {
  selectedSpeed: SpeedSegment | null;
  playhead: number;
  duration: number;
  segments: SpeedSegment[];
  freezeFrames: { id: string; time: number; duration: number; startTime: number }[];
  onAdd: (segment: Omit<SpeedSegment, "id">) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<SpeedSegment>) => void;
  onAddFreeze: (time: number, duration: number) => void;
  onRemoveFreeze: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <h4 className={SECTION_TITLE_CLS}>Speed</h4>

      {/* Speed preset buttons */}
      <div className="grid grid-cols-5 gap-1">
        {SPEED_PRESETS.map((speed) => (
          <button
            key={speed}
            onClick={() =>
              onAdd({
                startTime: playhead,
                endTime: Math.min(playhead + 10, duration),
                speed,
                easing: "linear",
                reverse: false,
                maintainPitch: true,
              })
            }
            className={GRID_BTN_CLS}
          >
            {speed}x
          </button>
        ))}
      </div>

      {/* Freeze Frame button */}
      <Button
        variant="secondary"
        size="sm"
        fullWidth
        onClick={() => onAddFreeze(playhead, 3)}
      >
        Freeze Frame (3s)
      </Button>

      {/* Freeze frame list */}
      {freezeFrames.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-text-muted uppercase">
            Freeze Frames ({freezeFrames.length})
          </p>
          {freezeFrames.map((ff) => (
            <div
              key={ff.id}
              className={`${ITEM_CLS} bg-bg-surface2 border-border`}
            >
              <div>
                <span className="text-text">{ff.duration}s</span>
                <span className="text-text-muted ml-1">
                  @ {formatTime(ff.time)}
                </span>
              </div>
              <button
                onClick={() => onRemoveFreeze(ff.id)}
                className={DELETE_BTN_CLS}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Speed segments list */}
      {segments.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-text-muted uppercase">
            Segments ({segments.length})
          </p>
          {segments.map((s) => (
            <div
              key={s.id}
              className={`${ITEM_CLS} ${
                s.id === selectedSpeed?.id
                  ? "bg-accent/10 border-accent/30"
                  : "bg-bg-surface2 border-border"
              }`}
            >
              <div>
                <span className="text-text">{s.speed}x</span>
                {s.reverse && (
                  <span className="text-warning ml-1 text-[10px]">REV</span>
                )}
                <br />
                <span className="text-text-muted text-[10px]">
                  {formatTime(s.startTime)} - {formatTime(s.endTime)}
                </span>
              </div>
              <button
                onClick={() => onRemove(s.id)}
                className={DELETE_BTN_CLS}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Selected speed segment controls */}
      {selectedSpeed && (
        <div className="space-y-2 pt-2 border-t border-border">
          <p className="text-[10px] text-text-muted uppercase">
            Selected Segment
          </p>

          {/* Speed slider */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className={LABEL_CLS}>Speed</label>
              <span className="text-xs text-text-secondary">
                {selectedSpeed.speed}x
              </span>
            </div>
            <input
              type="range"
              min={0.1}
              max={16}
              step={0.05}
              value={selectedSpeed.speed}
              onChange={(e) =>
                onUpdate(selectedSpeed.id, {
                  speed: parseFloat(e.target.value),
                })
              }
              className="w-full accent-primary"
            />
          </div>

          {/* Easing */}
          <div className="space-y-1">
            <label className={LABEL_CLS}>Easing</label>
            <select
              value={selectedSpeed.easing}
              onChange={(e) =>
                onUpdate(selectedSpeed.id, {
                  easing: e.target.value as SpeedEasing,
                })
              }
              className={INPUT_CLS}
            >
              {SPEED_EASINGS.map((ea) => (
                <option key={ea} value={ea}>
                  {ea}
                </option>
              ))}
            </select>
          </div>

          {/* Reverse toggle */}
          <div className="flex items-center justify-between">
            <label className={LABEL_CLS}>Reverse</label>
            <button
              onClick={() =>
                onUpdate(selectedSpeed.id, {
                  reverse: !selectedSpeed.reverse,
                })
              }
              className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                selectedSpeed.reverse ? TOGGLE_ON : TOGGLE_OFF
              }`}
            >
              {selectedSpeed.reverse ? "On" : "Off"}
            </button>
          </div>

          {/* Maintain pitch toggle */}
          <div className="flex items-center justify-between">
            <label className={LABEL_CLS}>Maintain Pitch</label>
            <button
              onClick={() =>
                onUpdate(selectedSpeed.id, {
                  maintainPitch: !selectedSpeed.maintainPitch,
                })
              }
              className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                selectedSpeed.maintainPitch ? TOGGLE_ON : TOGGLE_OFF
              }`}
            >
              {selectedSpeed.maintainPitch ? "On" : "Off"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   7. AUDIO
   ══════════════════════════════════════════════════════════════════ */

function AudioSection({
  audio,
  onUpdate,
}: {
  audio: AudioAdjustment;
  onUpdate: (audio: Partial<AudioAdjustment>) => void;
}) {
  return (
    <div className="space-y-3">
      <h4 className={SECTION_TITLE_CLS}>Audio</h4>

      {/* Volume */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className={LABEL_CLS}>Volume</label>
          <span className="text-xs text-text-secondary">{audio.volume}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={200}
          value={audio.volume}
          onChange={(e) => onUpdate({ volume: parseInt(e.target.value) })}
          className="w-full accent-primary"
        />
      </div>

      {/* Mute */}
      <button
        onClick={() => onUpdate({ muted: !audio.muted })}
        className={`w-full py-2 text-xs rounded-lg border transition-colors ${
          audio.muted
            ? "bg-danger/10 text-danger border-danger/30"
            : "bg-bg-surface2 text-text-secondary border-border hover:border-primary"
        }`}
      >
        {audio.muted ? "Unmute" : "Mute"}
      </button>

      {/* Fade In / Out */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={LABEL_CLS}>Fade In (s)</label>
          <input
            type="number"
            step={0.5}
            min={0}
            max={30}
            value={audio.fadeIn}
            onChange={(e) => onUpdate({ fadeIn: parseFloat(e.target.value) || 0 })}
            className={INPUT_CLS}
          />
        </div>
        <div>
          <label className={LABEL_CLS}>Fade Out (s)</label>
          <input
            type="number"
            step={0.5}
            min={0}
            max={30}
            value={audio.fadeOut}
            onChange={(e) =>
              onUpdate({ fadeOut: parseFloat(e.target.value) || 0 })
            }
            className={INPUT_CLS}
          />
        </div>
      </div>

      {/* Bass */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className={LABEL_CLS}>Bass</label>
          <span className="text-xs text-text-secondary">{audio.bass}</span>
        </div>
        <input
          type="range"
          min={-100}
          max={100}
          value={audio.bass}
          onChange={(e) => onUpdate({ bass: parseInt(e.target.value) })}
          className="w-full accent-primary"
        />
      </div>

      {/* Treble */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className={LABEL_CLS}>Treble</label>
          <span className="text-xs text-text-secondary">{audio.treble}</span>
        </div>
        <input
          type="range"
          min={-100}
          max={100}
          value={audio.treble}
          onChange={(e) => onUpdate({ treble: parseInt(e.target.value) })}
          className="w-full accent-primary"
        />
      </div>

      {/* Noise Reduction */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className={LABEL_CLS}>Noise Reduction</label>
          <span className="text-xs text-text-secondary">
            {audio.noiseReduction}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={audio.noiseReduction}
          onChange={(e) =>
            onUpdate({ noiseReduction: parseInt(e.target.value) })
          }
          className="w-full accent-primary"
        />
      </div>

      {/* Normalize */}
      <div className="flex items-center justify-between">
        <label className={LABEL_CLS}>Normalize</label>
        <button
          onClick={() => onUpdate({ normalize: !audio.normalize })}
          className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
            audio.normalize ? TOGGLE_ON : TOGGLE_OFF
          }`}
        >
          {audio.normalize ? "On" : "Off"}
        </button>
      </div>

      {/* Compressor */}
      <div className="flex items-center justify-between">
        <label className={LABEL_CLS}>Compressor</label>
        <button
          onClick={() => onUpdate({ compressor: !audio.compressor })}
          className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
            audio.compressor ? TOGGLE_ON : TOGGLE_OFF
          }`}
        >
          {audio.compressor ? "On" : "Off"}
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   8. TRANSITIONS
   ══════════════════════════════════════════════════════════════════ */

const ALL_TRANSITION_TYPES: TransitionType[] = [
  "fade",
  "dissolve",
  "crossfade",
  "wipe-left",
  "wipe-right",
  "wipe-up",
  "wipe-down",
  "slide-left",
  "slide-right",
  "slide-up",
  "slide-down",
  "zoom-in",
  "zoom-out",
  "blur",
  "pixelate",
  "spin",
  "flip",
  "iris-open",
  "iris-close",
  "glitch",
  "flash",
];

function TransitionsSection({
  selectedTransition,
  playhead,
  duration,
  transitions,
  onAdd,
  onRemove,
  onUpdate,
}: {
  selectedTransition: Transition | null;
  playhead: number;
  duration: number;
  transitions: Transition[];
  onAdd: (transition: Omit<Transition, "id">) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Transition>) => void;
}) {
  return (
    <div className="space-y-3">
      <h4 className={SECTION_TITLE_CLS}>Transitions</h4>

      {/* Transition type grid */}
      <div className="grid grid-cols-3 gap-1">
        {ALL_TRANSITION_TYPES.map((type) => (
          <button
            key={type}
            onClick={() =>
              onAdd({
                type,
                startTime: playhead,
                duration: 1,
                easing: "ease-in-out",
              })
            }
            className={GRID_BTN_CLS}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Existing transitions list */}
      {transitions.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-text-muted uppercase">
            Active ({transitions.length})
          </p>
          {transitions.map((tr) => (
            <div
              key={tr.id}
              className={`${ITEM_CLS} ${
                tr.id === selectedTransition?.id
                  ? "bg-primary/10 border-primary/30"
                  : "bg-bg-surface2 border-border"
              }`}
            >
              <div>
                <span className="text-text capitalize">{tr.type}</span>
                <br />
                <span className="text-text-muted text-[10px]">
                  {formatTime(tr.startTime)} / {tr.duration}s
                </span>
              </div>
              <button
                onClick={() => onRemove(tr.id)}
                className={DELETE_BTN_CLS}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Selected transition controls */}
      {selectedTransition && (
        <div className="space-y-2 pt-2 border-t border-border">
          <p className="text-[10px] text-text-muted uppercase">
            Selected: {selectedTransition.type}
          </p>

          {/* Duration slider */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className={LABEL_CLS}>Duration</label>
              <span className="text-xs text-text-secondary">
                {selectedTransition.duration.toFixed(1)}s
              </span>
            </div>
            <input
              type="range"
              min={0.1}
              max={5}
              step={0.1}
              value={selectedTransition.duration}
              onChange={(e) =>
                onUpdate(selectedTransition.id, {
                  duration: parseFloat(e.target.value),
                })
              }
              className="w-full accent-primary"
            />
          </div>

          {/* Easing dropdown */}
          <div className="space-y-1">
            <label className={LABEL_CLS}>Easing</label>
            <select
              value={selectedTransition.easing}
              onChange={(e) =>
                onUpdate(selectedTransition.id, {
                  easing: e.target.value as Transition["easing"],
                })
              }
              className={INPUT_CLS}
            >
              <option value="linear">Linear</option>
              <option value="ease-in">Ease In</option>
              <option value="ease-out">Ease Out</option>
              <option value="ease-in-out">Ease In-Out</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   9. CROP
   ══════════════════════════════════════════════════════════════════ */

const ASPECT_RATIOS: AspectRatio[] = [
  "free",
  "16:9",
  "9:16",
  "4:3",
  "1:1",
  "21:9",
  "4:5",
];

function CropSection({
  crop,
  onUpdate,
}: {
  crop: CropTransform;
  onUpdate: (crop: Partial<CropTransform>) => void;
}) {
  return (
    <div className="space-y-3">
      <h4 className={SECTION_TITLE_CLS}>Crop & Transform</h4>

      {/* Aspect ratio buttons */}
      <div className="space-y-1">
        <label className={LABEL_CLS}>Aspect Ratio</label>
        <div className="grid grid-cols-4 gap-1">
          {ASPECT_RATIOS.map((ar) => (
            <button
              key={ar}
              onClick={() => onUpdate({ aspectRatio: ar })}
              className={`px-2 py-1.5 text-[10px] rounded-lg border transition-colors ${
                crop.aspectRatio === ar ? TOGGLE_ON : TOGGLE_OFF
              }`}
            >
              {ar}
            </button>
          ))}
        </div>
      </div>

      {/* Crop X */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className={LABEL_CLS}>Crop X</label>
          <span className="text-xs text-text-secondary">{crop.x}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={crop.x}
          onChange={(e) => onUpdate({ x: parseInt(e.target.value) })}
          className="w-full accent-primary"
        />
      </div>

      {/* Crop Y */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className={LABEL_CLS}>Crop Y</label>
          <span className="text-xs text-text-secondary">{crop.y}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={crop.y}
          onChange={(e) => onUpdate({ y: parseInt(e.target.value) })}
          className="w-full accent-primary"
        />
      </div>

      {/* Width */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className={LABEL_CLS}>Width</label>
          <span className="text-xs text-text-secondary">{crop.width}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={crop.width}
          onChange={(e) => onUpdate({ width: parseInt(e.target.value) })}
          className="w-full accent-primary"
        />
      </div>

      {/* Height */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className={LABEL_CLS}>Height</label>
          <span className="text-xs text-text-secondary">{crop.height}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={crop.height}
          onChange={(e) => onUpdate({ height: parseInt(e.target.value) })}
          className="w-full accent-primary"
        />
      </div>

      {/* Rotation */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className={LABEL_CLS}>Rotation</label>
          <span className="text-xs text-text-secondary">{crop.rotation}&deg;</span>
        </div>
        <input
          type="range"
          min={-180}
          max={180}
          value={crop.rotation}
          onChange={(e) => onUpdate({ rotation: parseInt(e.target.value) })}
          className="w-full accent-primary"
        />
      </div>

      {/* Flip toggles */}
      <div className="flex gap-2">
        <button
          onClick={() => onUpdate({ flipH: !crop.flipH })}
          className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${
            crop.flipH ? TOGGLE_ON : TOGGLE_OFF
          }`}
        >
          Flip H
        </button>
        <button
          onClick={() => onUpdate({ flipV: !crop.flipV })}
          className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${
            crop.flipV ? TOGGLE_ON : TOGGLE_OFF
          }`}
        >
          Flip V
        </button>
      </div>

      {/* Reset */}
      <Button
        variant="ghost"
        size="sm"
        fullWidth
        onClick={() =>
          onUpdate({
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            rotation: 0,
            flipH: false,
            flipV: false,
            aspectRatio: "free",
          })
        }
      >
        Reset Crop
      </Button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   10. EFFECTS
   ══════════════════════════════════════════════════════════════════ */

function EffectsSection({
  onApplyPreset,
}: {
  onApplyPreset: (filters: Omit<FilterEffect, "id">[]) => void;
}) {
  return (
    <div className="space-y-3">
      <h4 className={SECTION_TITLE_CLS}>Effect Presets</h4>
      <p className="text-[10px] text-text-muted">
        Click a preset to apply its filters to the full timeline.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {EFFECT_PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() =>
              onApplyPreset(
                preset.filters.map((f) => ({
                  ...f,
                  startTime: 0,
                  endTime: editState?.duration ?? 0,
                }))
              )
            }
            className="p-3 bg-bg-surface2 rounded-lg border border-border hover:border-primary hover:bg-bg-surface3 transition-colors text-left"
          >
            <p className="text-xs text-text font-medium">{preset.name}</p>
            <p className="text-[10px] text-text-muted mt-0.5">
              {preset.filters.length} filter{preset.filters.length !== 1 ? "s" : ""}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   11. STICKERS
   ══════════════════════════════════════════════════════════════════ */

const COMMON_EMOJIS = [
  "\u{1F600}", "\u{1F602}", "\u{1F60D}", "\u{1F60E}", "\u{1F914}", "\u{1F92F}",
  "\u{1F60A}", "\u{1F609}", "\u{1F618}", "\u{1F622}", "\u{1F621}", "\u{1F47B}",
  "\u{1F525}", "\u{2764}\u{FE0F}", "\u{1F44D}", "\u{1F44E}", "\u{1F44F}", "\u{1F64C}",
  "\u{1F389}", "\u{1F388}", "\u{2B50}", "\u{1F31F}", "\u{1F4A5}", "\u{1F4AF}",
  "\u{1F3AC}", "\u{1F3A4}", "\u{1F3B5}", "\u{1F3B6}", "\u{1F4F7}", "\u{1F4F9}",
  "\u{1F6A8}", "\u{26A0}\u{FE0F}", "\u{2705}", "\u{274C}", "\u{2757}", "\u{2753}",
  "\u{1F4AC}", "\u{1F4AD}", "\u{1F4A1}", "\u{1F440}", "\u{1F4AA}", "\u{1F3C6}",
  "\u{1F680}", "\u{1F308}", "\u{2615}", "\u{1F355}", "\u{1F3AF}", "\u{1F381}",
];

const STICKER_ANIMATIONS: TextAnimation[] = [
  "none",
  "fade-in",
  "fade-out",
  "bounce",
  "zoom-in",
  "zoom-out",
  "slide-up",
  "slide-down",
  "glitch",
  "wave",
];

function StickersSection({
  selectedSticker,
  playhead,
  duration,
  stickers,
  onAdd,
  onRemove,
  onUpdate,
}: {
  selectedSticker: StickerOverlay | null;
  playhead: number;
  duration: number;
  stickers: StickerOverlay[];
  onAdd: (sticker: Omit<StickerOverlay, "id">) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<StickerOverlay>) => void;
}) {
  return (
    <div className="space-y-3">
      <h4 className={SECTION_TITLE_CLS}>Stickers</h4>

      {/* Emoji grid */}
      <div className="grid grid-cols-8 gap-1">
        {COMMON_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() =>
              onAdd({
                emoji,
                startTime: playhead,
                endTime: Math.min(playhead + 5, duration),
                x: 50,
                y: 50,
                size: 64,
                rotation: 0,
                opacity: 100,
                animation: "none",
              })
            }
            className="p-1 text-lg hover:bg-bg-surface3 rounded transition-colors"
            title={`Add ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Active stickers list */}
      {stickers.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-text-muted uppercase">
            Active ({stickers.length})
          </p>
          {stickers.map((s) => (
            <div
              key={s.id}
              className={`${ITEM_CLS} ${
                s.id === selectedSticker?.id
                  ? "bg-primary/10 border-primary/30"
                  : "bg-bg-surface2 border-border"
              }`}
            >
              <div>
                <span className="text-lg mr-1">{s.emoji}</span>
                <span className="text-text-muted text-[10px]">
                  {formatTime(s.startTime)} - {formatTime(s.endTime)}
                </span>
              </div>
              <button
                onClick={() => onRemove(s.id)}
                className={DELETE_BTN_CLS}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Selected sticker controls */}
      {selectedSticker && (
        <div className="space-y-2 pt-2 border-t border-border">
          <p className="text-[10px] text-text-muted uppercase">
            Selected: {selectedSticker.emoji}
          </p>

          {/* Size */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className={LABEL_CLS}>Size</label>
              <span className="text-xs text-text-secondary">
                {selectedSticker.size}px
              </span>
            </div>
            <input
              type="range"
              min={16}
              max={256}
              value={selectedSticker.size}
              onChange={(e) =>
                onUpdate(selectedSticker.id, {
                  size: parseInt(e.target.value),
                })
              }
              className="w-full accent-primary"
            />
          </div>

          {/* Rotation */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className={LABEL_CLS}>Rotation</label>
              <span className="text-xs text-text-secondary">
                {selectedSticker.rotation}&deg;
              </span>
            </div>
            <input
              type="range"
              min={-180}
              max={180}
              value={selectedSticker.rotation}
              onChange={(e) =>
                onUpdate(selectedSticker.id, {
                  rotation: parseInt(e.target.value),
                })
              }
              className="w-full accent-primary"
            />
          </div>

          {/* Opacity */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className={LABEL_CLS}>Opacity</label>
              <span className="text-xs text-text-secondary">
                {selectedSticker.opacity}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={selectedSticker.opacity}
              onChange={(e) =>
                onUpdate(selectedSticker.id, {
                  opacity: parseInt(e.target.value),
                })
              }
              className="w-full accent-primary"
            />
          </div>

          {/* Animation */}
          <div className="space-y-1">
            <label className={LABEL_CLS}>Animation</label>
            <select
              value={selectedSticker.animation}
              onChange={(e) =>
                onUpdate(selectedSticker.id, {
                  animation: e.target.value as TextAnimation,
                })
              }
              className={INPUT_CLS}
            >
              {STICKER_ANIMATIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          {/* Position X / Y */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="flex items-center justify-between">
                <label className={LABEL_CLS}>X</label>
                <span className="text-[10px] text-text-secondary">
                  {selectedSticker.x}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={selectedSticker.x}
                onChange={(e) =>
                  onUpdate(selectedSticker.id, {
                    x: parseFloat(e.target.value),
                  })
                }
                className="w-full accent-primary"
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className={LABEL_CLS}>Y</label>
                <span className="text-[10px] text-text-secondary">
                  {selectedSticker.y}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={selectedSticker.y}
                onChange={(e) =>
                  onUpdate(selectedSticker.id, {
                    y: parseFloat(e.target.value),
                  })
                }
                className="w-full accent-primary"
              />
            </div>
          </div>

          {/* Start / End time */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={LABEL_CLS}>Start</label>
              <input
                type="number"
                step={0.1}
                min={0}
                value={selectedSticker.startTime}
                onChange={(e) =>
                  onUpdate(selectedSticker.id, {
                    startTime: parseFloat(e.target.value) || 0,
                  })
                }
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>End</label>
              <input
                type="number"
                step={0.1}
                min={0}
                value={selectedSticker.endTime}
                onChange={(e) =>
                  onUpdate(selectedSticker.id, {
                    endTime: parseFloat(e.target.value) || 0,
                  })
                }
                className={INPUT_CLS}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   12. MARKERS
   ══════════════════════════════════════════════════════════════════ */

function MarkersSection({
  selectedMarker,
  playhead,
  markers,
  onAdd,
  onRemove,
  onUpdate,
}: {
  selectedMarker: TimelineMarker | null;
  playhead: number;
  markers: TimelineMarker[];
  onAdd: (time: number, label: string, type?: TimelineMarker["type"]) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<TimelineMarker>) => void;
}) {
  const [newLabel, setNewLabel] = useState("Marker");

  return (
    <div className="space-y-3">
      <h4 className={SECTION_TITLE_CLS}>Markers & Chapters</h4>

      {/* Add marker */}
      <div className="space-y-2">
        <label className={LABEL_CLS}>Label</label>
        <input
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Marker label..."
          className={INPUT_CLS}
        />
        <div className="flex gap-1">
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={() => onAdd(playhead, newLabel || "Marker", "marker")}
          >
            Add Marker
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={() => onAdd(playhead, newLabel || "Chapter", "chapter")}
          >
            Add Chapter
          </Button>
        </div>
        <p className="text-[10px] text-text-muted">
          At playhead: {formatTimestamp(playhead)}
        </p>
      </div>

      {/* Markers list */}
      {markers.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-text-muted uppercase">
            All Markers ({markers.length})
          </p>
          {markers.map((m) => (
            <div
              key={m.id}
              className={`${ITEM_CLS} ${
                m.id === selectedMarker?.id
                  ? "bg-primary/10 border-primary/30"
                  : "bg-bg-surface2 border-border"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: m.color }}
                  />
                  <span className="text-text truncate text-xs">{m.label}</span>
                  <span className="text-[10px] text-text-muted uppercase shrink-0">
                    {m.type}
                  </span>
                </div>
                <p className="text-[10px] text-text-muted font-mono">
                  {formatTimestamp(m.time)}
                </p>
              </div>
              <button
                onClick={() => onRemove(m.id)}
                className={`${DELETE_BTN_CLS} shrink-0`}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Selected marker editing */}
      {selectedMarker && (
        <div className="space-y-2 pt-2 border-t border-border">
          <p className="text-[10px] text-text-muted uppercase">Edit Marker</p>

          <div className="space-y-1">
            <label className={LABEL_CLS}>Label</label>
            <input
              type="text"
              value={selectedMarker.label}
              onChange={(e) =>
                onUpdate(selectedMarker.id, { label: e.target.value })
              }
              className={INPUT_CLS}
            />
          </div>

          <div className="space-y-1">
            <label className={LABEL_CLS}>Color</label>
            <input
              type="color"
              value={selectedMarker.color}
              onChange={(e) =>
                onUpdate(selectedMarker.id, { color: e.target.value })
              }
              className="w-full h-7 bg-bg-surface2 border border-border rounded cursor-pointer"
            />
          </div>

          <div className="space-y-1">
            <label className={LABEL_CLS}>Type</label>
            <select
              value={selectedMarker.type}
              onChange={(e) =>
                onUpdate(selectedMarker.id, {
                  type: e.target.value as TimelineMarker["type"],
                })
              }
              className={INPUT_CLS}
            >
              <option value="marker">Marker</option>
              <option value="chapter">Chapter</option>
              <option value="split">Split</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className={LABEL_CLS}>Time</label>
            <input
              type="number"
              step={0.1}
              min={0}
              value={selectedMarker.time}
              onChange={(e) =>
                onUpdate(selectedMarker.id, {
                  time: parseFloat(e.target.value) || 0,
                })
              }
              className={INPUT_CLS}
            />
          </div>
        </div>
      )}
    </div>
  );
}
