// Editor store - timeline state, undo/redo, export progress

import { create } from "zustand";
import {
  type EditState,
  type TextOverlay,
  type FilterEffect,
  type SpeedSegment,
  type AudioAdjustment,
  type Transition,
  type CropTransform,
  type StickerOverlay,
  type TimelineMarker,
  createInitialEditState,
  createDefaultTextOverlay,
  addCut,
  removeCut,
  setTrimIn,
  setTrimOut,
  addTextOverlay,
  removeTextOverlay,
  updateTextOverlay,
  addFilter,
  removeFilter,
  updateFilter,
  addSpeedSegment,
  removeSpeedSegment,
  updateSpeedSegment,
  splitAtPlayhead,
  setAudioAdjustment,
  addTransition,
  removeTransition,
  updateTransition,
  setCropTransform,
  addFreezeFrame,
  removeFreezeFrame,
  addSticker,
  removeSticker,
  updateSticker,
  addMarker,
  removeMarker,
  updateMarker,
} from "@/lib/editor/timeline-state";
import type { ExportProgress } from "@/lib/editor/export-manager";

export type EditorTool =
  | "select" | "trim" | "cut" | "split" | "text" | "filters" | "speed" | "audio"
  | "transitions" | "crop" | "effects" | "stickers" | "markers";

export interface EditorStoreState {
  // Recording info
  recordingId: string | null;
  recordingUrl: string | null;
  recordingTitle: string | null;
  mediaType: "recording" | "video";

  // Edit state
  editState: EditState | null;
  undoStack: EditState[];
  redoStack: EditState[];

  // Save state
  isSaving: boolean;
  lastSavedAt: number | null;
  hasUnsavedChanges: boolean;
  projectId: string | null;

  // Export
  exportProgress: ExportProgress | null;
  exportedUrl: string | null;

  // Selection & tools
  selectedCutId: string | null;
  selectedTextId: string | null;
  selectedFilterId: string | null;
  selectedSpeedId: string | null;
  selectedTransitionId: string | null;
  selectedStickerId: string | null;
  selectedMarkerId: string | null;
  activeTool: EditorTool;
  cutToolActive: boolean;
  cutMarkStart: number | null;

  // Actions
  initialize: (recordingId: string, url: string, title: string, duration: number, mediaType?: "recording" | "video") => void;
  setPlayhead: (time: number) => void;
  setPlaying: (playing: boolean) => void;
  setZoom: (zoom: number) => void;
  setActiveTool: (tool: EditorTool) => void;

  // Trim
  trimIn: (time: number) => void;
  trimOut: (time: number) => void;

  // Cuts
  addCutSegment: (start: number, end: number) => void;
  removeCutSegment: (cutId: string) => void;
  selectCut: (cutId: string | null) => void;
  setCutToolActive: (active: boolean) => void;
  setCutMarkStart: (time: number | null) => void;

  // Text overlays
  addText: (overlay: Omit<TextOverlay, "id">) => void;
  removeText: (textId: string) => void;
  updateText: (textId: string, updates: Partial<TextOverlay>) => void;
  selectText: (textId: string | null) => void;

  // Filters
  addFilterEffect: (filter: Omit<FilterEffect, "id">) => void;
  removeFilterEffect: (filterId: string) => void;
  updateFilterEffect: (filterId: string, updates: Partial<FilterEffect>) => void;
  selectFilter: (filterId: string | null) => void;

  // Speed
  setSpeed: (segment: Omit<SpeedSegment, "id">) => void;
  removeSpeed: (segmentId: string) => void;
  updateSpeed: (segmentId: string, updates: Partial<SpeedSegment>) => void;
  selectSpeed: (segmentId: string | null) => void;

  // Split
  splitAtCurrentPlayhead: () => void;

  // Audio
  setAudio: (audio: Partial<AudioAdjustment>) => void;

  // Transitions
  addTransitionEffect: (transition: Omit<Transition, "id">) => void;
  removeTransitionEffect: (transitionId: string) => void;
  updateTransitionEffect: (transitionId: string, updates: Partial<Transition>) => void;
  selectTransition: (transitionId: string | null) => void;

  // Crop/Transform
  setCrop: (crop: Partial<CropTransform>) => void;

  // Freeze frames
  addFreeze: (time: number, duration: number) => void;
  removeFreeze: (freezeId: string) => void;

  // Stickers
  addStickerOverlay: (sticker: Omit<StickerOverlay, "id">) => void;
  removeStickerOverlay: (stickerId: string) => void;
  updateStickerOverlay: (stickerId: string, updates: Partial<StickerOverlay>) => void;
  selectSticker: (stickerId: string | null) => void;

  // Markers/Chapters
  addMarkerAt: (time: number, label: string, type?: TimelineMarker["type"]) => void;
  removeMarkerById: (markerId: string) => void;
  updateMarkerById: (markerId: string, updates: Partial<TimelineMarker>) => void;
  selectMarker: (markerId: string | null) => void;

  // Apply effect preset (multiple filters at once)
  applyEffectPreset: (filters: Omit<FilterEffect, "id">[]) => void;

  // Undo/redo
  undo: () => void;
  redo: () => void;

  // Export
  setExportProgress: (progress: ExportProgress | null) => void;
  setExportedUrl: (url: string | null) => void;

  // Delete selected element
  deleteSelected: () => void;

  // Save/load project
  saveProject: () => Promise<void>;
  loadProject: () => Promise<boolean>;
  markUnsaved: () => void;

  reset: () => void;
}

function pushUndo(state: EditorStoreState): { undoStack: EditState[]; redoStack: EditState[]; hasUnsavedChanges: boolean } {
  if (!state.editState) return { undoStack: state.undoStack, redoStack: [], hasUnsavedChanges: true };
  return {
    undoStack: [...state.undoStack, { ...state.editState }].slice(-50),
    redoStack: [],
    hasUnsavedChanges: true,
  };
}

export const useEditorStore = create<EditorStoreState>((set, get) => ({
  recordingId: null,
  recordingUrl: null,
  recordingTitle: null,
  mediaType: "recording" as const,
  editState: null,
  undoStack: [],
  redoStack: [],
  isSaving: false,
  lastSavedAt: null,
  hasUnsavedChanges: false,
  projectId: null,
  exportProgress: null,
  exportedUrl: null,
  selectedCutId: null,
  selectedTextId: null,
  selectedFilterId: null,
  selectedSpeedId: null,
  selectedTransitionId: null,
  selectedStickerId: null,
  selectedMarkerId: null,
  activeTool: "select",
  cutToolActive: false,
  cutMarkStart: null,

  initialize: (recordingId, url, title, duration, mediaType = "recording") =>
    set({
      recordingId,
      recordingUrl: url,
      recordingTitle: title,
      mediaType,
      editState: createInitialEditState(duration),
      undoStack: [],
      redoStack: [],
      exportProgress: null,
      exportedUrl: null,
      activeTool: "select",
      hasUnsavedChanges: false,
      lastSavedAt: null,
      projectId: null,
    }),

  setPlayhead: (time) =>
    set((state) => ({
      editState: state.editState ? { ...state.editState, playhead: time } : null,
    })),

  setPlaying: (playing) =>
    set((state) => ({
      editState: state.editState ? { ...state.editState, isPlaying: playing } : null,
    })),

  setZoom: (zoom) =>
    set((state) => ({
      editState: state.editState ? { ...state.editState, zoom: Math.max(2, Math.min(100, zoom)) } : null,
    })),

  setActiveTool: (tool) =>
    set((state) => ({
      activeTool: tool,
      cutToolActive: tool === "cut",
      cutMarkStart: tool === "cut" ? state.cutMarkStart : null,
    })),

  trimIn: (time) =>
    set((state) => {
      if (!state.editState) return {};
      const stacks = pushUndo(state);
      return { editState: setTrimIn(state.editState, time), ...stacks };
    }),

  trimOut: (time) =>
    set((state) => {
      if (!state.editState) return {};
      const stacks = pushUndo(state);
      return { editState: setTrimOut(state.editState, time), ...stacks };
    }),

  addCutSegment: (start, end) =>
    set((state) => {
      if (!state.editState) return {};
      const stacks = pushUndo(state);
      return { editState: addCut(state.editState, start, end), ...stacks };
    }),

  removeCutSegment: (cutId) =>
    set((state) => {
      if (!state.editState) return {};
      const stacks = pushUndo(state);
      return {
        editState: removeCut(state.editState, cutId),
        selectedCutId: state.selectedCutId === cutId ? null : state.selectedCutId,
        ...stacks,
      };
    }),

  selectCut: (cutId) => set({ selectedCutId: cutId }),
  setCutToolActive: (active) => set({ cutToolActive: active, cutMarkStart: null }),
  setCutMarkStart: (time) => set({ cutMarkStart: time }),

  // Text overlays
  addText: (overlay) =>
    set((state) => {
      if (!state.editState) return {};
      const stacks = pushUndo(state);
      const newState = addTextOverlay(state.editState, overlay);
      const newId = newState.textOverlays[newState.textOverlays.length - 1].id;
      return { editState: newState, selectedTextId: newId, ...stacks };
    }),

  removeText: (textId) =>
    set((state) => {
      if (!state.editState) return {};
      const stacks = pushUndo(state);
      return {
        editState: removeTextOverlay(state.editState, textId),
        selectedTextId: state.selectedTextId === textId ? null : state.selectedTextId,
        ...stacks,
      };
    }),

  updateText: (textId, updates) =>
    set((state) => {
      if (!state.editState) return {};
      const stacks = pushUndo(state);
      return { editState: updateTextOverlay(state.editState, textId, updates), ...stacks };
    }),

  selectText: (textId) => set({ selectedTextId: textId }),

  // Filters
  addFilterEffect: (filter) =>
    set((state) => {
      if (!state.editState) return {};
      const stacks = pushUndo(state);
      const newState = addFilter(state.editState, filter);
      const newId = newState.filters[newState.filters.length - 1].id;
      return { editState: newState, selectedFilterId: newId, ...stacks };
    }),

  removeFilterEffect: (filterId) =>
    set((state) => {
      if (!state.editState) return {};
      const stacks = pushUndo(state);
      return {
        editState: removeFilter(state.editState, filterId),
        selectedFilterId: state.selectedFilterId === filterId ? null : state.selectedFilterId,
        ...stacks,
      };
    }),

  updateFilterEffect: (filterId, updates) =>
    set((state) => {
      if (!state.editState) return {};
      const stacks = pushUndo(state);
      return { editState: updateFilter(state.editState, filterId, updates), ...stacks };
    }),

  selectFilter: (filterId) => set({ selectedFilterId: filterId }),

  // Speed
  setSpeed: (segment) =>
    set((state) => {
      if (!state.editState) return {};
      const stacks = pushUndo(state);
      const newState = addSpeedSegment(state.editState, segment);
      const newId = newState.speedSegments[newState.speedSegments.length - 1].id;
      return { editState: newState, selectedSpeedId: newId, ...stacks };
    }),

  removeSpeed: (segmentId) =>
    set((state) => {
      if (!state.editState) return {};
      const stacks = pushUndo(state);
      return {
        editState: removeSpeedSegment(state.editState, segmentId),
        selectedSpeedId: state.selectedSpeedId === segmentId ? null : state.selectedSpeedId,
        ...stacks,
      };
    }),

  updateSpeed: (segmentId, updates) =>
    set((state) => {
      if (!state.editState) return {};
      const stacks = pushUndo(state);
      return { editState: updateSpeedSegment(state.editState, segmentId, updates), ...stacks };
    }),

  selectSpeed: (segmentId) => set({ selectedSpeedId: segmentId }),

  // Split
  splitAtCurrentPlayhead: () =>
    set((state) => {
      if (!state.editState) return {};
      const stacks = pushUndo(state);
      return { editState: splitAtPlayhead(state.editState, state.editState.playhead), ...stacks };
    }),

  // Audio
  setAudio: (audio) =>
    set((state) => {
      if (!state.editState) return {};
      const stacks = pushUndo(state);
      return { editState: setAudioAdjustment(state.editState, audio), ...stacks };
    }),

  // Transitions
  addTransitionEffect: (transition) =>
    set((state) => {
      if (!state.editState) return {};
      const stacks = pushUndo(state);
      const newState = addTransition(state.editState, transition);
      const newId = newState.transitions[newState.transitions.length - 1].id;
      return { editState: newState, selectedTransitionId: newId, ...stacks };
    }),

  removeTransitionEffect: (transitionId) =>
    set((state) => {
      if (!state.editState) return {};
      const stacks = pushUndo(state);
      return {
        editState: removeTransition(state.editState, transitionId),
        selectedTransitionId: state.selectedTransitionId === transitionId ? null : state.selectedTransitionId,
        ...stacks,
      };
    }),

  updateTransitionEffect: (transitionId, updates) =>
    set((state) => {
      if (!state.editState) return {};
      const stacks = pushUndo(state);
      return { editState: updateTransition(state.editState, transitionId, updates), ...stacks };
    }),

  selectTransition: (transitionId) => set({ selectedTransitionId: transitionId }),

  // Crop/Transform
  setCrop: (crop) =>
    set((state) => {
      if (!state.editState) return {};
      const stacks = pushUndo(state);
      return { editState: setCropTransform(state.editState, crop), ...stacks };
    }),

  // Freeze frames
  addFreeze: (time, duration) =>
    set((state) => {
      if (!state.editState) return {};
      const stacks = pushUndo(state);
      return { editState: addFreezeFrame(state.editState, time, duration), ...stacks };
    }),

  removeFreeze: (freezeId) =>
    set((state) => {
      if (!state.editState) return {};
      const stacks = pushUndo(state);
      return { editState: removeFreezeFrame(state.editState, freezeId), ...stacks };
    }),

  // Stickers
  addStickerOverlay: (sticker) =>
    set((state) => {
      if (!state.editState) return {};
      const stacks = pushUndo(state);
      const newState = addSticker(state.editState, sticker);
      const newId = newState.stickers[newState.stickers.length - 1].id;
      return { editState: newState, selectedStickerId: newId, ...stacks };
    }),

  removeStickerOverlay: (stickerId) =>
    set((state) => {
      if (!state.editState) return {};
      const stacks = pushUndo(state);
      return {
        editState: removeSticker(state.editState, stickerId),
        selectedStickerId: state.selectedStickerId === stickerId ? null : state.selectedStickerId,
        ...stacks,
      };
    }),

  updateStickerOverlay: (stickerId, updates) =>
    set((state) => {
      if (!state.editState) return {};
      const stacks = pushUndo(state);
      return { editState: updateSticker(state.editState, stickerId, updates), ...stacks };
    }),

  selectSticker: (stickerId) => set({ selectedStickerId: stickerId }),

  // Markers
  addMarkerAt: (time, label, type = "marker") =>
    set((state) => {
      if (!state.editState) return {};
      const stacks = pushUndo(state);
      return { editState: addMarker(state.editState, time, label, type), ...stacks };
    }),

  removeMarkerById: (markerId) =>
    set((state) => {
      if (!state.editState) return {};
      const stacks = pushUndo(state);
      return {
        editState: removeMarker(state.editState, markerId),
        selectedMarkerId: state.selectedMarkerId === markerId ? null : state.selectedMarkerId,
        ...stacks,
      };
    }),

  updateMarkerById: (markerId, updates) =>
    set((state) => {
      if (!state.editState) return {};
      const stacks = pushUndo(state);
      return { editState: updateMarker(state.editState, markerId, updates), ...stacks };
    }),

  selectMarker: (markerId) => set({ selectedMarkerId: markerId }),

  // Apply effect preset
  applyEffectPreset: (filters) =>
    set((state) => {
      if (!state.editState) return {};
      const stacks = pushUndo(state);
      let es = state.editState;
      for (const f of filters) {
        es = addFilter(es, {
          ...f,
          startTime: es.trim.inPoint,
          endTime: es.trim.outPoint,
        });
      }
      return { editState: es, ...stacks };
    }),

  // Delete selected element
  deleteSelected: () =>
    set((state) => {
      if (!state.editState) return {};
      const stacks = pushUndo(state);
      if (state.selectedCutId) {
        return { editState: removeCut(state.editState, state.selectedCutId), selectedCutId: null, ...stacks };
      }
      if (state.selectedTextId) {
        return { editState: removeTextOverlay(state.editState, state.selectedTextId), selectedTextId: null, ...stacks };
      }
      if (state.selectedFilterId) {
        return { editState: removeFilter(state.editState, state.selectedFilterId), selectedFilterId: null, ...stacks };
      }
      if (state.selectedSpeedId) {
        return { editState: removeSpeedSegment(state.editState, state.selectedSpeedId), selectedSpeedId: null, ...stacks };
      }
      if (state.selectedTransitionId) {
        return { editState: removeTransition(state.editState, state.selectedTransitionId), selectedTransitionId: null, ...stacks };
      }
      if (state.selectedStickerId) {
        return { editState: removeSticker(state.editState, state.selectedStickerId), selectedStickerId: null, ...stacks };
      }
      if (state.selectedMarkerId) {
        return { editState: removeMarker(state.editState, state.selectedMarkerId), selectedMarkerId: null, ...stacks };
      }
      return {};
    }),

  undo: () =>
    set((state) => {
      if (state.undoStack.length === 0 || !state.editState) return {};
      const previous = state.undoStack[state.undoStack.length - 1];
      return {
        editState: previous,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, state.editState],
      };
    }),

  redo: () =>
    set((state) => {
      if (state.redoStack.length === 0 || !state.editState) return {};
      const next = state.redoStack[state.redoStack.length - 1];
      return {
        editState: next,
        undoStack: [...state.undoStack, state.editState],
        redoStack: state.redoStack.slice(0, -1),
      };
    }),

  setExportProgress: (progress) => set({ exportProgress: progress }),
  setExportedUrl: (url) => set({ exportedUrl: url }),

  // Save project to server
  saveProject: async () => {
    const state = get();
    if (!state.recordingId || !state.editState || state.isSaving) return;

    set({ isSaving: true });
    try {
      const res = await fetch("/api/editor/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          mediaId: state.recordingId,
          mediaType: state.mediaType,
          title: state.recordingTitle || "Untitled Project",
          editState: state.editState,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        set({
          isSaving: false,
          lastSavedAt: Date.now(),
          hasUnsavedChanges: false,
          projectId: data.project?.id || state.projectId,
        });
      } else {
        set({ isSaving: false });
      }
    } catch {
      set({ isSaving: false });
    }
  },

  // Load project from server
  loadProject: async () => {
    const state = get();
    if (!state.recordingId) return false;

    try {
      const res = await fetch(`/api/editor/project?mediaId=${state.recordingId}`, {
        credentials: "include",
      });

      if (!res.ok) return false;

      const data = await res.json();
      if (data.project?.editState) {
        set({
          editState: data.project.editState as EditState,
          projectId: data.project.id,
          lastSavedAt: new Date(data.project.updatedAt).getTime(),
          hasUnsavedChanges: false,
          undoStack: [],
          redoStack: [],
        });
        return true;
      }
    } catch {
      // Failed to load — continue with fresh state
    }
    return false;
  },

  markUnsaved: () => set({ hasUnsavedChanges: true }),

  reset: () =>
    set({
      recordingId: null,
      recordingUrl: null,
      recordingTitle: null,
      mediaType: "recording" as const,
      editState: null,
      undoStack: [],
      redoStack: [],
      isSaving: false,
      lastSavedAt: null,
      hasUnsavedChanges: false,
      projectId: null,
      exportProgress: null,
      exportedUrl: null,
      selectedCutId: null,
      selectedTextId: null,
      selectedFilterId: null,
      selectedSpeedId: null,
      selectedTransitionId: null,
      selectedStickerId: null,
      selectedMarkerId: null,
      activeTool: "select",
      cutToolActive: false,
      cutMarkStart: null,
    }),
}));
