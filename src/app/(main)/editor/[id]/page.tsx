"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Film, Save, Cloud } from "lucide-react";
import Button from "@/components/ui/Button";
import VideoEditor from "@/components/editor/VideoEditor";
import { useEditorStore } from "@/stores/editor-store";

const AUTO_SAVE_INTERVAL = 30000; // 30 seconds

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { initialize, reset, loadProject, saveProject, hasUnsavedChanges } = useEditorStore();
  const isSaving = useEditorStore((s) => s.isSaving);
  const lastSavedAt = useEditorStore((s) => s.lastSavedAt);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doAutoSave = useCallback(() => {
    const state = useEditorStore.getState();
    if (state.hasUnsavedChanges && state.editState && !state.isSaving) {
      state.saveProject();
    }
  }, []);

  useEffect(() => {
    async function loadMedia() {
      try {
        // Try loading as a video first (from creator studio)
        const videoRes = await fetch(`/api/videos/${id}`, {
          credentials: "include",
        });

        if (videoRes.ok) {
          const data = await videoRes.json();
          const video = data.video;
          if (video) {
            initialize(
              video.id,
              video.videoUrl || video.url,
              video.title,
              video.duration || video.durationSec || 0,
              "video"
            );
            // Try to load saved project
            await loadProject();
            setLoading(false);
            return;
          }
        }

        // Fall back to loading as a recording
        const recRes = await fetch(`/api/recordings?id=${id}`, {
          credentials: "include",
        });

        if (!recRes.ok) {
          setError("Video not found");
          setLoading(false);
          return;
        }

        const recData = await recRes.json();
        const recording = recData.recordings?.[0] || recData.recording;

        if (!recording || recording.status !== "READY") {
          setError("Recording is not ready for editing");
          setLoading(false);
          return;
        }

        initialize(
          recording.id,
          recording.filePath,
          recording.title,
          recording.durationSec,
          "recording"
        );
        // Try to load saved project
        await loadProject();
      } catch {
        setError("Failed to load video");
      } finally {
        setLoading(false);
      }
    }

    loadMedia();

    // Set up auto-save interval
    autoSaveRef.current = setInterval(doAutoSave, AUTO_SAVE_INTERVAL);

    // Save on beforeunload
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const state = useEditorStore.getState();
      if (state.hasUnsavedChanges) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      // Save before unmounting
      doAutoSave();
      if (autoSaveRef.current) clearInterval(autoSaveRef.current);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      reset();
    };
  }, [id, initialize, reset, loadProject, doAutoSave]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <Film size={48} className="text-text-muted mx-auto" />
          <p className="text-text-secondary">{error}</p>
          <Button variant="primary" size="sm" onClick={() => router.back()}>
            <ArrowLeft size={14} className="mr-1" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 bg-bg-surface border-b border-border">
        <button
          onClick={() => router.back()}
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-bg-surface2 text-text-secondary hover:text-text transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <Film size={20} className="text-primary" />
        <span className="text-sm font-semibold text-text">Video Editor</span>

        <div className="ml-auto flex items-center gap-2">
          {/* Save status indicator */}
          {isSaving ? (
            <span className="flex items-center gap-1.5 text-xs text-text-muted">
              <Cloud size={14} className="animate-pulse" />
              Saving...
            </span>
          ) : lastSavedAt ? (
            <span className="flex items-center gap-1.5 text-xs text-text-muted">
              <Cloud size={14} className="text-green-500" />
              Saved
            </span>
          ) : null}

          {hasUnsavedChanges && !isSaving && (
            <button
              onClick={() => saveProject()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-bg-surface2 hover:bg-bg-surface3 text-text-secondary hover:text-text transition-colors"
            >
              <Save size={13} />
              Save
            </button>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <VideoEditor />
      </div>
    </div>
  );
}
