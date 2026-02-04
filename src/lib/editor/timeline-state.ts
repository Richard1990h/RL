// Data structure for video edits (trim, cuts, clips, text, filters, speed, audio, transitions, transforms, keyframes)

export interface TrimPoints {
  inPoint: number;  // seconds
  outPoint: number; // seconds
}

export interface CutSegment {
  id: string;
  start: number; // seconds
  end: number;   // seconds
}

export interface TimelineMarker {
  id: string;
  time: number;
  label: string;
  color: string;
  type: "marker" | "split" | "chapter";
}

export interface TextOverlay {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  x: number; // position as % (0-100)
  y: number; // position as % (0-100)
  fontSize: number;
  fontFamily: string;
  color: string;
  backgroundColor: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  textAlign: "left" | "center" | "right";
  opacity: number; // 0-100
  rotation: number; // degrees
  letterSpacing: number; // px
  lineHeight: number; // multiplier
  shadow: boolean;
  shadowColor: string;
  shadowBlur: number;
  outline: boolean;
  outlineColor: string;
  outlineWidth: number;
  animation: TextAnimation;
  zIndex: number;
}

export type TextAnimation = "none" | "fade-in" | "fade-out" | "slide-up" | "slide-down" | "slide-left" | "slide-right" | "typewriter" | "bounce" | "zoom-in" | "zoom-out" | "glitch" | "wave";

export type FilterType = "brightness" | "contrast" | "saturation" | "grayscale" | "sepia" | "blur" | "sharpen" | "vignette" | "noise" | "film-grain" | "hue-rotate" | "invert" | "temperature" | "tint" | "highlights" | "shadows" | "vibrance" | "clarity";

export interface FilterEffect {
  id: string;
  type: FilterType;
  value: number; // 0-200 (100 = normal, varies by type)
  startTime: number;
  endTime: number;
}

export interface SpeedSegment {
  id: string;
  startTime: number;
  endTime: number;
  speed: number; // 0.1 - 16.0
  easing: SpeedEasing; // for speed ramping
  reverse: boolean;
  maintainPitch: boolean;
}

export type SpeedEasing = "linear" | "ease-in" | "ease-out" | "ease-in-out";

export interface AudioAdjustment {
  volume: number;    // 0-200 (100 = normal)
  muted: boolean;
  fadeIn: number;     // seconds
  fadeOut: number;    // seconds
  bass: number;       // -100 to 100
  treble: number;     // -100 to 100
  noiseReduction: number; // 0-100
  normalize: boolean;
  compressor: boolean;
}

export interface Transition {
  id: string;
  type: TransitionType;
  startTime: number; // where the transition begins
  duration: number;  // transition length in seconds (0.1 - 5)
  easing: "linear" | "ease-in" | "ease-out" | "ease-in-out";
}

export type TransitionType =
  | "fade" | "dissolve" | "crossfade"
  | "wipe-left" | "wipe-right" | "wipe-up" | "wipe-down"
  | "slide-left" | "slide-right" | "slide-up" | "slide-down"
  | "zoom-in" | "zoom-out"
  | "blur" | "pixelate"
  | "spin" | "flip"
  | "iris-open" | "iris-close"
  | "glitch" | "flash";

export interface CropTransform {
  x: number;      // crop from left (0-100)
  y: number;      // crop from top (0-100)
  width: number;  // crop width (0-100)
  height: number; // crop height (0-100)
  rotation: number; // degrees
  flipH: boolean;
  flipV: boolean;
  aspectRatio: AspectRatio;
}

export type AspectRatio = "free" | "16:9" | "9:16" | "4:3" | "1:1" | "21:9" | "4:5";

export interface Keyframe {
  id: string;
  time: number;
  property: string; // e.g. "x", "y", "opacity", "scale", "rotation"
  value: number;
  easing: "linear" | "ease-in" | "ease-out" | "ease-in-out" | "bezier";
}

export interface KeyframeTrack {
  id: string;
  targetId: string; // text overlay or effect ID
  targetType: "text" | "filter" | "transform";
  keyframes: Keyframe[];
}

export interface FreezeFrame {
  id: string;
  time: number;     // source time to freeze
  duration: number;  // how long to hold the freeze
  startTime: number; // where it appears in timeline
}

export interface EffectPreset {
  id: string;
  name: string;
  filters: Omit<FilterEffect, "id" | "startTime" | "endTime">[];
}

export interface StickerOverlay {
  id: string;
  emoji: string;
  startTime: number;
  endTime: number;
  x: number;
  y: number;
  size: number; // px
  rotation: number;
  opacity: number;
  animation: TextAnimation;
}

export interface EditState {
  duration: number;
  trim: TrimPoints;
  cuts: CutSegment[];
  markers: TimelineMarker[];
  textOverlays: TextOverlay[];
  filters: FilterEffect[];
  speedSegments: SpeedSegment[];
  audio: AudioAdjustment;
  transitions: Transition[];
  crop: CropTransform;
  keyframeTracks: KeyframeTrack[];
  freezeFrames: FreezeFrame[];
  stickers: StickerOverlay[];
  playhead: number;
  isPlaying: boolean;
  zoom: number; // pixels per second
}

export function createDefaultTextOverlay(startTime: number, endTime: number): Omit<TextOverlay, "id"> {
  return {
    text: "Your text here",
    startTime,
    endTime,
    x: 50,
    y: 50,
    fontSize: 32,
    fontFamily: "sans-serif",
    color: "#FFFFFF",
    backgroundColor: "rgba(0,0,0,0.5)",
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    textAlign: "center",
    opacity: 100,
    rotation: 0,
    letterSpacing: 0,
    lineHeight: 1.2,
    shadow: false,
    shadowColor: "#000000",
    shadowBlur: 4,
    outline: false,
    outlineColor: "#000000",
    outlineWidth: 2,
    animation: "none",
    zIndex: 0,
  };
}

export function createInitialEditState(duration: number): EditState {
  return {
    duration,
    trim: { inPoint: 0, outPoint: duration },
    cuts: [],
    markers: [],
    textOverlays: [],
    filters: [],
    speedSegments: [],
    audio: { volume: 100, muted: false, fadeIn: 0, fadeOut: 0, bass: 0, treble: 0, noiseReduction: 0, normalize: false, compressor: false },
    transitions: [],
    crop: { x: 0, y: 0, width: 100, height: 100, rotation: 0, flipH: false, flipV: false, aspectRatio: "free" },
    keyframeTracks: [],
    freezeFrames: [],
    stickers: [],
    playhead: 0,
    isPlaying: false,
    zoom: 10, // 10px per second default
  };
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function addCut(state: EditState, start: number, end: number): EditState {
  const id = generateId("cut");
  return {
    ...state,
    cuts: [...state.cuts, { id, start, end }].sort((a, b) => a.start - b.start),
  };
}

export function removeCut(state: EditState, cutId: string): EditState {
  return {
    ...state,
    cuts: state.cuts.filter((c) => c.id !== cutId),
  };
}

export function setTrimIn(state: EditState, inPoint: number): EditState {
  return {
    ...state,
    trim: { ...state.trim, inPoint: Math.max(0, Math.min(inPoint, state.trim.outPoint - 0.1)) },
  };
}

export function setTrimOut(state: EditState, outPoint: number): EditState {
  return {
    ...state,
    trim: { ...state.trim, outPoint: Math.max(state.trim.inPoint + 0.1, Math.min(outPoint, state.duration)) },
  };
}

// Text overlays
export function addTextOverlay(state: EditState, overlay: Omit<TextOverlay, "id">): EditState {
  const id = generateId("text");
  return {
    ...state,
    textOverlays: [...state.textOverlays, { ...overlay, id }],
  };
}

export function removeTextOverlay(state: EditState, overlayId: string): EditState {
  return {
    ...state,
    textOverlays: state.textOverlays.filter((t) => t.id !== overlayId),
  };
}

export function updateTextOverlay(state: EditState, overlayId: string, updates: Partial<TextOverlay>): EditState {
  return {
    ...state,
    textOverlays: state.textOverlays.map((t) =>
      t.id === overlayId ? { ...t, ...updates } : t
    ),
  };
}

// Filters
export function addFilter(state: EditState, filter: Omit<FilterEffect, "id">): EditState {
  const id = generateId("filter");
  return {
    ...state,
    filters: [...state.filters, { ...filter, id }],
  };
}

export function removeFilter(state: EditState, filterId: string): EditState {
  return {
    ...state,
    filters: state.filters.filter((f) => f.id !== filterId),
  };
}

// Speed segments
export function addSpeedSegment(state: EditState, segment: Omit<SpeedSegment, "id">): EditState {
  const id = generateId("speed");
  const full: SpeedSegment = {
    ...segment,
    id,
  };
  return {
    ...state,
    speedSegments: [...state.speedSegments, full].sort((a, b) => a.startTime - b.startTime),
  };
}

export function removeSpeedSegment(state: EditState, segmentId: string): EditState {
  return {
    ...state,
    speedSegments: state.speedSegments.filter((s) => s.id !== segmentId),
  };
}

export function updateSpeedSegment(state: EditState, segmentId: string, updates: Partial<SpeedSegment>): EditState {
  return {
    ...state,
    speedSegments: state.speedSegments.map((s) => s.id === segmentId ? { ...s, ...updates } : s),
  };
}

// Split at playhead - adds a split marker
export function splitAtPlayhead(state: EditState, time: number): EditState {
  const id = generateId("split");
  return {
    ...state,
    markers: [...state.markers, { id, time, label: "Split", color: "#F59E0B", type: "split" }],
  };
}

// Audio adjustment
export function setAudioAdjustment(state: EditState, audio: Partial<AudioAdjustment>): EditState {
  return {
    ...state,
    audio: { ...state.audio, ...audio },
  };
}

// Calculate effective duration after trims and cuts
export function getEffectiveDuration(state: EditState): number {
  let duration = state.trim.outPoint - state.trim.inPoint;
  for (const cut of state.cuts) {
    const cutStart = Math.max(cut.start, state.trim.inPoint);
    const cutEnd = Math.min(cut.end, state.trim.outPoint);
    if (cutEnd > cutStart) {
      duration -= cutEnd - cutStart;
    }
  }
  return Math.max(0, duration);
}

// Check if a time position is within a cut (should be skipped)
export function isInCut(state: EditState, time: number): boolean {
  return state.cuts.some((cut) => time >= cut.start && time < cut.end);
}

// Get the next valid position after cuts
export function getNextValidPosition(state: EditState, time: number): number {
  for (const cut of state.cuts) {
    if (time >= cut.start && time < cut.end) {
      return cut.end;
    }
  }
  return time;
}

// Get active text overlays at a given time
export function getActiveTextOverlays(state: EditState, time: number): TextOverlay[] {
  return state.textOverlays.filter((t) => time >= t.startTime && time <= t.endTime);
}

// Get active filters at a given time
export function getActiveFilters(state: EditState, time: number): FilterEffect[] {
  return state.filters.filter((f) => time >= f.startTime && time <= f.endTime);
}

// Get speed at a given time (returns 1.0 if no speed segment covers it)
export function getSpeedAtTime(state: EditState, time: number): number {
  const segment = state.speedSegments.find((s) => time >= s.startTime && time <= s.endTime);
  return segment ? segment.speed : 1.0;
}

// Transitions
export function addTransition(state: EditState, transition: Omit<Transition, "id">): EditState {
  const id = generateId("trans");
  return {
    ...state,
    transitions: [...state.transitions, { ...transition, id }].sort((a, b) => a.startTime - b.startTime),
  };
}

export function removeTransition(state: EditState, transitionId: string): EditState {
  return {
    ...state,
    transitions: state.transitions.filter((t) => t.id !== transitionId),
  };
}

export function updateTransition(state: EditState, transitionId: string, updates: Partial<Transition>): EditState {
  return {
    ...state,
    transitions: state.transitions.map((t) => t.id === transitionId ? { ...t, ...updates } : t),
  };
}

// Crop/Transform
export function setCropTransform(state: EditState, crop: Partial<CropTransform>): EditState {
  return {
    ...state,
    crop: { ...state.crop, ...crop },
  };
}

// Freeze frames
export function addFreezeFrame(state: EditState, time: number, duration: number): EditState {
  const id = generateId("freeze");
  return {
    ...state,
    freezeFrames: [...state.freezeFrames, { id, time, duration, startTime: time }].sort((a, b) => a.startTime - b.startTime),
  };
}

export function removeFreezeFrame(state: EditState, freezeId: string): EditState {
  return {
    ...state,
    freezeFrames: state.freezeFrames.filter((f) => f.id !== freezeId),
  };
}

// Stickers
export function addSticker(state: EditState, sticker: Omit<StickerOverlay, "id">): EditState {
  const id = generateId("sticker");
  return {
    ...state,
    stickers: [...state.stickers, { ...sticker, id }],
  };
}

export function removeSticker(state: EditState, stickerId: string): EditState {
  return {
    ...state,
    stickers: state.stickers.filter((s) => s.id !== stickerId),
  };
}

export function updateSticker(state: EditState, stickerId: string, updates: Partial<StickerOverlay>): EditState {
  return {
    ...state,
    stickers: state.stickers.map((s) => s.id === stickerId ? { ...s, ...updates } : s),
  };
}

// Markers/Chapters
export function addMarker(state: EditState, time: number, label: string, type: TimelineMarker["type"] = "marker"): EditState {
  const id = generateId("marker");
  const color = type === "chapter" ? "#3B82F6" : type === "split" ? "#F59E0B" : "#8B5CF6";
  return {
    ...state,
    markers: [...state.markers, { id, time, label, color, type }].sort((a, b) => a.time - b.time),
  };
}

export function removeMarker(state: EditState, markerId: string): EditState {
  return {
    ...state,
    markers: state.markers.filter((m) => m.id !== markerId),
  };
}

export function updateMarker(state: EditState, markerId: string, updates: Partial<TimelineMarker>): EditState {
  return {
    ...state,
    markers: state.markers.map((m) => m.id === markerId ? { ...m, ...updates } : m),
  };
}

// Update filter effect
export function updateFilter(state: EditState, filterId: string, updates: Partial<FilterEffect>): EditState {
  return {
    ...state,
    filters: state.filters.map((f) => f.id === filterId ? { ...f, ...updates } : f),
  };
}

// Get active stickers at a given time
export function getActiveStickers(state: EditState, time: number): StickerOverlay[] {
  return state.stickers.filter((s) => time >= s.startTime && time <= s.endTime);
}

// Get active transition at a given time
export function getActiveTransition(state: EditState, time: number): Transition | null {
  return state.transitions.find((t) => time >= t.startTime && time <= t.startTime + t.duration) || null;
}

// Built-in effect presets
export const EFFECT_PRESETS: EffectPreset[] = [
  { id: "preset_cinematic", name: "Cinematic", filters: [{ type: "contrast", value: 120 }, { type: "saturation", value: 85 }, { type: "temperature", value: 90 }, { type: "vignette", value: 40 }] },
  { id: "preset_vintage", name: "Vintage", filters: [{ type: "sepia", value: 40 }, { type: "contrast", value: 90 }, { type: "saturation", value: 70 }, { type: "noise", value: 20 }, { type: "vignette", value: 30 }] },
  { id: "preset_bw", name: "Black & White", filters: [{ type: "grayscale", value: 100 }, { type: "contrast", value: 120 }] },
  { id: "preset_warm", name: "Warm", filters: [{ type: "temperature", value: 130 }, { type: "saturation", value: 110 }, { type: "brightness", value: 105 }] },
  { id: "preset_cool", name: "Cool", filters: [{ type: "temperature", value: 70 }, { type: "saturation", value: 90 }, { type: "brightness", value: 105 }] },
  { id: "preset_dramatic", name: "Dramatic", filters: [{ type: "contrast", value: 150 }, { type: "saturation", value: 130 }, { type: "shadows", value: 30 }, { type: "vignette", value: 50 }] },
  { id: "preset_dreamy", name: "Dreamy", filters: [{ type: "blur", value: 15 }, { type: "brightness", value: 115 }, { type: "saturation", value: 120 }, { type: "contrast", value: 85 }] },
  { id: "preset_retro", name: "Retro", filters: [{ type: "sepia", value: 25 }, { type: "contrast", value: 110 }, { type: "film-grain", value: 30 }, { type: "vignette", value: 25 }] },
  { id: "preset_neon", name: "Neon", filters: [{ type: "saturation", value: 180 }, { type: "contrast", value: 130 }, { type: "vibrance", value: 150 }] },
  { id: "preset_matte", name: "Matte", filters: [{ type: "contrast", value: 80 }, { type: "shadows", value: 130 }, { type: "saturation", value: 85 }] },
  { id: "preset_hdr", name: "HDR", filters: [{ type: "contrast", value: 140 }, { type: "clarity", value: 150 }, { type: "highlights", value: 80 }, { type: "shadows", value: 130 }] },
  { id: "preset_sunset", name: "Sunset", filters: [{ type: "temperature", value: 140 }, { type: "saturation", value: 120 }, { type: "highlights", value: 120 }, { type: "vignette", value: 20 }] },
];
