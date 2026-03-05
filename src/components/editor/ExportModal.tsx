"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Download,
  Loader2,
  Check,
  AlertTriangle,
  Upload,
  ExternalLink,
  ChevronDown,
  X,
  Film,
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import type { ExportProgress } from "@/lib/editor/export-manager";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (resolution: string, format: string, quality: string) => void;
  progress: ExportProgress | null;
  exportedUrl: string | null;
  videoTitle?: string;
}

type Visibility = "PUBLIC" | "UNLISTED" | "PRIVATE" | "FOLLOWERS_ONLY";

interface PublishState {
  status: "idle" | "publishing" | "success" | "error";
  videoId?: string;
  videoSlug?: string;
  error?: string;
}

const RESOLUTIONS: { value: string; label: string; desc: string; recommended?: boolean }[] = [
  { value: "480p", label: "SD (480p)", desc: "Smaller file, faster export" },
  { value: "720p", label: "HD (720p)", desc: "Good quality, moderate size" },
  { value: "1080p", label: "Full HD (1080p)", desc: "Best balance of quality and size", recommended: true },
  { value: "4k", label: "4K (2160p)", desc: "Maximum quality, large file" },
];

const FORMATS = [
  { value: "mp4", label: "MP4", desc: "Best compatibility" },
  { value: "webm", label: "WebM", desc: "Smaller size, web-optimized" },
] as const;

const QUALITY_PRESETS = [
  { value: "draft", label: "Draft", desc: "Fast export, lower quality" },
  { value: "standard", label: "Standard", desc: "Balanced speed and quality" },
  { value: "high", label: "High", desc: "Slower export, best quality" },
] as const;

const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: "PUBLIC", label: "Public" },
  { value: "UNLISTED", label: "Unlisted" },
  { value: "PRIVATE", label: "Private" },
  { value: "FOLLOWERS_ONLY", label: "Followers Only" },
];

export default function ExportModal({
  isOpen,
  onClose,
  onExport,
  progress,
  exportedUrl,
  videoTitle = "",
}: ExportModalProps) {
  const [resolution, setResolution] = useState("1080p");
  const [format, setFormat] = useState("mp4");
  const [quality, setQuality] = useState("standard");

  // Publish form state
  const [showPublish, setShowPublish] = useState(false);
  const [title, setTitle] = useState(videoTitle);
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("PUBLIC");
  const [tagsInput, setTagsInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [publishState, setPublishState] = useState<PublishState>({ status: "idle" });

  const isExporting =
    progress?.status === "preparing" || progress?.status === "exporting";
  const isDone = progress?.status === "done" && !!exportedUrl;

  const handleStartExport = useCallback(() => {
    onExport(resolution, format, quality);
  }, [onExport, resolution, format, quality]);

  const handleAddTag = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        const tag = tagsInput.trim().replace(/^#/, "");
        if (tag && !tags.includes(tag) && tags.length < 10) {
          setTags((prev) => [...prev, tag]);
          setTagsInput("");
        }
      }
    },
    [tagsInput, tags]
  );

  const handleRemoveTag = useCallback((tagToRemove: string) => {
    setTags((prev) => prev.filter((t) => t !== tagToRemove));
  }, []);

  const handlePublish = useCallback(async () => {
    if (!exportedUrl || !title.trim()) return;

    setPublishState({ status: "publishing" });

    try {
      const result = (await api.videos.create({
        title: title.trim(),
        description: description.trim(),
        visibility,
        tags,
        videoUrl: exportedUrl,
      })) as { video?: { id: string; slug?: string } };

      setPublishState({
        status: "success",
        videoId: result.video?.id,
        videoSlug: result.video?.slug,
      });
    } catch (err) {
      setPublishState({
        status: "error",
        error: err instanceof Error ? err.message : "Failed to publish video",
      });
    }
  }, [exportedUrl, title, description, visibility, tags]);

  const handleClose = useCallback(() => {
    // Reset publish state when closing
    setShowPublish(false);
    setPublishState({ status: "idle" });
    setDescription("");
    setTags([]);
    setTagsInput("");
    setVisibility("PUBLIC");
    onClose();
  }, [onClose]);

  // Reset title when videoTitle prop changes
  useEffect(() => {
    if (videoTitle && title === "" && !showPublish) {
      setTitle(videoTitle);
    }
  }, [videoTitle, showPublish]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Export Video" size="md">
      <div className="space-y-5">
        {/* ── Step 1: Export Settings ── */}
        {!progress && !exportedUrl && (
          <>
            <p className="text-sm text-text-secondary">
              Configure your export settings. All trims, cuts, and effects will
              be applied.
            </p>

            {/* Resolution */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                Resolution
              </label>
              <div className="grid grid-cols-2 gap-2">
                {RESOLUTIONS.map((res) => (
                  <button
                    key={res.value}
                    onClick={() => setResolution(res.value)}
                    className={cn(
                      "p-3 rounded-xl border text-left transition-colors",
                      resolution === res.value
                        ? "border-primary bg-primary/10"
                        : "border-border bg-bg-surface2 hover:border-primary/50"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-text">
                        {res.label}
                      </p>
                      {res.recommended && (
                        <span className="text-[10px] text-primary font-medium bg-primary/10 px-1.5 py-0.5 rounded">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-muted mt-0.5">{res.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Format & Quality row */}
            <div className="grid grid-cols-2 gap-4">
              {/* Format */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  Format
                </label>
                <div className="space-y-1.5">
                  {FORMATS.map((fmt) => (
                    <button
                      key={fmt.value}
                      onClick={() => setFormat(fmt.value)}
                      className={cn(
                        "w-full p-2.5 rounded-xl border text-left transition-colors",
                        format === fmt.value
                          ? "border-primary bg-primary/10"
                          : "border-border bg-bg-surface2 hover:border-primary/50"
                      )}
                    >
                      <p className="text-sm font-semibold text-text">
                        {fmt.label}
                      </p>
                      <p className="text-xs text-text-muted">{fmt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quality */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  Quality
                </label>
                <div className="space-y-1.5">
                  {QUALITY_PRESETS.map((q) => (
                    <button
                      key={q.value}
                      onClick={() => setQuality(q.value)}
                      className={cn(
                        "w-full p-2.5 rounded-xl border text-left transition-colors",
                        quality === q.value
                          ? "border-primary bg-primary/10"
                          : "border-border bg-bg-surface2 hover:border-primary/50"
                      )}
                    >
                      <p className="text-sm font-semibold text-text">
                        {q.label}
                      </p>
                      <p className="text-xs text-text-muted">{q.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Export button */}
            <Button
              variant="primary"
              className="w-full"
              onClick={handleStartExport}
            >
              <Film size={16} />
              Export Video
            </Button>
          </>
        )}

        {/* ── Step 2: Exporting Progress ── */}
        {isExporting && (
          <div className="text-center py-6 space-y-4">
            <Loader2 size={40} className="text-primary mx-auto animate-spin" />
            <div>
              <p className="text-sm font-semibold text-text">
                {progress?.status === "preparing"
                  ? "Preparing export..."
                  : "Exporting video..."}
              </p>
              <p className="text-xs text-text-muted mt-1">
                This may take a few moments
              </p>
            </div>
            <div className="w-full bg-bg-surface2 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progress?.progress || 0}%` }}
              />
            </div>
            <p className="text-xs text-text-muted">
              {Math.round(progress?.progress || 0)}%
            </p>
          </div>
        )}

        {/* ── Step 3: Export Complete ── */}
        {isDone && !showPublish && publishState.status === "idle" && (
          <div className="text-center py-6 space-y-5">
            <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto">
              <Check size={32} className="text-success" />
            </div>
            <p className="text-sm font-semibold text-text">Export complete!</p>

            <div className="flex flex-col gap-2.5">
              <a
                href={exportedUrl}
                download
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/80 transition-colors"
              >
                <Download size={16} />
                Download Video
              </a>
              <button
                onClick={() => {
                  setTitle(videoTitle || "");
                  setShowPublish(true);
                }}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-border bg-bg-surface2 text-text rounded-xl text-sm font-medium hover:border-primary hover:text-primary transition-colors"
              >
                <Upload size={16} />
                Publish to Creator Studio
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Publish Form ── */}
        {isDone && showPublish && publishState.status !== "success" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Upload size={16} className="text-primary" />
              <h3 className="text-sm font-semibold text-text">
                Publish to Creator Studio
              </h3>
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">
                Title <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter a title for your video"
                maxLength={100}
                className="w-full px-3 py-2 rounded-xl border border-border bg-bg-surface2 text-text text-sm placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your video..."
                rows={3}
                maxLength={2000}
                className="w-full px-3 py-2 rounded-xl border border-border bg-bg-surface2 text-text text-sm placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors resize-none"
              />
            </div>

            {/* Visibility */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">
                Visibility
              </label>
              <div className="relative">
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as Visibility)}
                  className="w-full appearance-none px-3 py-2 pr-8 rounded-xl border border-border bg-bg-surface2 text-text text-sm focus:outline-none focus:border-primary transition-colors"
                >
                  {VISIBILITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
                />
              </div>
            </div>

            {/* Tags */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">
                Tags{" "}
                <span className="text-text-muted font-normal">
                  (press Enter to add, max 10)
                </span>
              </label>
              <div className="flex flex-wrap gap-1.5 p-2 rounded-xl border border-border bg-bg-surface2 min-h-[38px]">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-xs font-medium rounded-lg"
                  >
                    #{tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-primary/70 transition-colors"
                      aria-label={`Remove tag ${tag}`}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  onKeyDown={handleAddTag}
                  placeholder={tags.length === 0 ? "Add tags..." : ""}
                  className="flex-1 min-w-[80px] bg-transparent text-text text-xs placeholder:text-text-muted focus:outline-none"
                />
              </div>
            </div>

            {/* Publish error */}
            {publishState.status === "error" && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/20">
                <AlertTriangle size={14} className="text-danger shrink-0" />
                <p className="text-xs text-danger">
                  {publishState.error || "Failed to publish. Please try again."}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowPublish(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-border text-text-secondary text-sm font-medium hover:bg-bg-surface2 transition-colors"
              >
                Back
              </button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={handlePublish}
                disabled={
                  !title.trim() || publishState.status === "publishing"
                }
              >
                {publishState.status === "publishing" ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Publishing...
                  </>
                ) : (
                  <>
                    <Upload size={14} />
                    Publish
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 5: Publish Success ── */}
        {publishState.status === "success" && (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto">
              <Check size={32} className="text-success" />
            </div>
            <div>
              <p className="text-sm font-semibold text-text">
                Published successfully!
              </p>
              <p className="text-xs text-text-muted mt-1">
                Your video is now live on Creator Studio.
              </p>
            </div>
            {publishState.videoId && (
              <a
                href={(() => {
                  const username = useAuthStore.getState().currentUser?.username;
                  const vid = publishState.videoSlug || publishState.videoId;
                  return username ? `/@${username}/${vid}` : `/watch/${vid}`;
                })()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/80 transition-colors"
              >
                <ExternalLink size={14} />
                View Video
              </a>
            )}
            <div>
              <button
                onClick={handleClose}
                className="text-xs text-text-muted hover:text-text transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* ── Error State ── */}
        {progress?.status === "error" && (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-danger/20 flex items-center justify-center mx-auto">
              <AlertTriangle size={32} className="text-danger" />
            </div>
            <p className="text-sm font-semibold text-text">Export failed</p>
            <p className="text-xs text-text-muted">
              {progress.error || "An unexpected error occurred"}
            </p>
            <Button variant="primary" size="sm" onClick={handleStartExport}>
              Try Again
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
