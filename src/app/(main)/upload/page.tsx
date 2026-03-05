"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  Image,
  Film,
  Tag,
  Plus,
  Check,
  ChevronDown,
  X,
  Sparkles,
  Info,
  Globe,
  Lock,
  EyeOff,
  Layers,
  GripVertical,
  Loader2,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Card from "@/components/ui/Card";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useUploadStore } from "@/stores/upload-store";
import { generateTagsFromTitle } from "@/lib/auto-tags";
import type { Series } from "@/lib/types";
import { cn } from "@/lib/utils";

// Simulated user-created series store (persists during session)
interface UserSeries {
  id: string;
  title: string;
  description: string;
  episodeCount: number;
}

const THUMBNAIL_OPTIONS = [
  { id: "t1", label: "Auto-generated 1" },
  { id: "t2", label: "Auto-generated 2" },
  { id: "t3", label: "Auto-generated 3" },
];

type Visibility = "public" | "private" | "unlisted";

export default function UploadPage() {
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.currentUser);
  const userId = currentUser?.id ?? "";

  // Fetched series from API
  const [fetchedSeries, setFetchedSeries] = useState<any[]>([]);
  const [seriesLoading, setSeriesLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setSeriesLoading(true);
    api.series
      .list({ creatorId: userId })
      .then((res: any) => {
        if (!cancelled) setFetchedSeries(res.series || []);
      })
      .catch(() => {
        if (!cancelled) setFetchedSeries([]);
      })
      .finally(() => {
        if (!cancelled) setSeriesLoading(false);
      });
    return () => { cancelled = true; };
  }, [userId]);

  // Video upload state — lives in global store so it survives navigation
  const uploadStore = useUploadStore();
  const uploadedFile = uploadStore.uploadedFileName;
  const uploadedFileUrl = uploadStore.uploadedUrl;
  const uploadProgress = uploadStore.progress;
  const isUploading = uploadStore.isUploading;

  // Generated thumbnails from video frames (data URLs for preview)
  const [generatedThumbnails, setGeneratedThumbnails] = useState<string[]>([]);
  // Saved thumbnail URLs (file paths on server)
  const [savedThumbnailUrls, setSavedThumbnailUrls] = useState<string[]>([]);
  const [isGeneratingThumbnails, setIsGeneratingThumbnails] = useState(false);
  // Video duration in seconds
  const [videoDurationSec, setVideoDurationSec] = useState(0);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  // Thumbnail state
  const [thumbnailMode, setThumbnailMode] = useState<"auto" | "custom">("auto");
  const [selectedThumbnail, setSelectedThumbnail] = useState<string>("t1");
  const [customThumbnailName, setCustomThumbnailName] = useState<string | null>(null);

  // Visibility state
  const [visibility, setVisibility] = useState<Visibility>("public");

  // Series state
  const [isPartOfSeries, setIsPartOfSeries] = useState(false);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [seriesDropdownOpen, setSeriesDropdownOpen] = useState(false);
  const [showCreateSeriesModal, setShowCreateSeriesModal] = useState(false);
  const [newSeriesTitle, setNewSeriesTitle] = useState("");
  const [newSeriesDescription, setNewSeriesDescription] = useState("");
  const [userCreatedSeries, setUserCreatedSeries] = useState<UserSeries[]>([]);

  // Success state
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [publishedVideoId, setPublishedVideoId] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<"PROCESSING" | "READY" | "FAILED">("PROCESSING");

  // Upload error — sync from global store
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (uploadStore.error) {
      setUploadError(uploadStore.error);
    }
  }, [uploadStore.error]);

  // Validation
  const [titleError, setTitleError] = useState(false);

  // Dropdown ref for click outside
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSeriesDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Poll processing status after publish
  useEffect(() => {
    if (!publishedVideoId || processingStatus !== "PROCESSING") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/videos/${publishedVideoId}/status`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          if (data.status === "READY" || data.status === "FAILED") {
            setProcessingStatus(data.status);
          }
        }
      } catch {
        // Keep polling on network error
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [publishedVideoId, processingStatus]);

  // Compute episode info for selected series
  const getSeriesEpisodeInfo = () => {
    if (!selectedSeriesId) return null;

    // Check user-created series
    const userSeries = userCreatedSeries.find((s) => s.id === selectedSeriesId);
    if (userSeries) {
      const nextEp = userSeries.episodeCount + 1;
      return {
        title: userSeries.title,
        currentCount: userSeries.episodeCount,
        nextEpisode: nextEp,
        label: `${nextEp} of ${nextEp}`,
      };
    }

    // Check fetched series from API
    const existingSeries = fetchedSeries.find((s: any) => s.id === selectedSeriesId);
    if (existingSeries) {
      const nextEp = (existingSeries.totalEpisodes || 0) + 1;
      return {
        title: existingSeries.title,
        currentCount: existingSeries.totalEpisodes || 0,
        nextEpisode: nextEp,
        label: `${nextEp} of ${nextEp}`,
      };
    }

    return null;
  };

  const seriesInfo = getSeriesEpisodeInfo();

  // Real file ref for upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [realFile, setRealFile] = useState<File | null>(null);

  // Extract thumbnail frames from a video file and save them to the server
  const extractThumbnails = useCallback(async (file: File) => {
    setIsGeneratingThumbnails(true);
    setSavedThumbnailUrls([]);
    setGeneratedThumbnails([]);

    try {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.src = url;

      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error("Failed to load video"));
      });

      const duration = video.duration;
      setVideoDurationSec(Math.round(duration));
      const times = [duration * 0.25, duration * 0.5, duration * 0.75];
      const thumbnails: string[] = [];

      for (const time of times) {
        video.currentTime = time;
        await new Promise<void>((resolve) => {
          video.onseeked = () => resolve();
        });

        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 360;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, 640, 360);
          thumbnails.push(canvas.toDataURL("image/jpeg", 0.85));
        }
      }

      URL.revokeObjectURL(url);
      setGeneratedThumbnails(thumbnails);

      // Save thumbnails to server as actual files
      const savedUrls: string[] = [];
      for (const dataUrl of thumbnails) {
        try {
          const res = await fetch("/api/upload/thumbnail", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ dataUrl }),
          });
          if (res.ok) {
            const data = await res.json();
            savedUrls.push(data.url);
          }
        } catch {
          // If saving fails, keep the data URL as fallback
        }
      }
      setSavedThumbnailUrls(savedUrls);
    } catch (err) {
      console.error("Thumbnail extraction failed:", err);
    } finally {
      setIsGeneratingThumbnails(false);
    }
  }, []);

  // Handle file selection and upload via API
  const handleFileUpload = useCallback(() => {
    if (isUploading || uploadedFile) return;
    // Trigger hidden file input
    fileInputRef.current?.click();
  }, [isUploading, uploadedFile]);

  const handleFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRealFile(file);
    setUploadError(null);

    // Start upload via global store — survives page navigation
    uploadStore.startUpload(file);

    // Extract thumbnail frames from the video (runs locally)
    extractThumbnails(file);

    // Reset file input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [extractThumbnails, uploadStore]);

  const handleRemoveFile = () => {
    uploadStore.clearUpload();
    setRealFile(null);
    setGeneratedThumbnails([]);
    setSavedThumbnailUrls([]);
    setIsGeneratingThumbnails(false);
  };

  // Tag handling
  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim().toLowerCase())) {
        setTags([...tags, tagInput.trim().toLowerCase()]);
      }
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  // Publishing state
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  // Publish
  const handlePublish = async () => {
    if (!title.trim()) {
      setTitleError(true);
      return;
    }
    if (!uploadedFileUrl) {
      setPublishError("Please upload a video first.");
      return;
    }
    setTitleError(false);
    setPublishError(null);
    setIsPublishing(true);

    try {
      const videoData: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim(),
        tags,
        visibility,
        thumbnailMode,
        selectedThumbnail: thumbnailMode === "auto" ? selectedThumbnail : undefined,
        videoUrl: uploadedFileUrl,
        durationSec: videoDurationSec,
      };

      // Include selected thumbnail (use saved server URL, fall back to data URL)
      if (thumbnailMode === "auto") {
        const thumbIdx = parseInt(selectedThumbnail.replace("t", "")) - 1;
        if (savedThumbnailUrls[thumbIdx]) {
          videoData.thumbnailUrl = savedThumbnailUrls[thumbIdx];
        } else if (generatedThumbnails[thumbIdx]) {
          videoData.thumbnailUrl = generatedThumbnails[thumbIdx];
        }
      }

      // Only attach series if it's a real DB id (not a local fallback)
      if (isPartOfSeries && selectedSeriesId && !selectedSeriesId.startsWith("local-")) {
        videoData.seriesId = selectedSeriesId;
      }

      const result = await api.videos.create(videoData) as { video: { id: string } };

      // If publishing to a user-created series, increment the episode count
      if (isPartOfSeries && selectedSeriesId) {
        setUserCreatedSeries((prev) =>
          prev.map((s) =>
            s.id === selectedSeriesId
              ? { ...s, episodeCount: s.episodeCount + 1 }
              : s
          )
        );
      }

      setPublishedVideoId(result.video.id);
      setProcessingStatus("PROCESSING");
      setShowSuccessModal(true);
    } catch (err: any) {
      setPublishError(err?.message || "Failed to publish video. Please try again.");
    } finally {
      setIsPublishing(false);
    }
  };

  // Create series (saves to DB so it can be used on publish)
  const handleCreateSeries = async () => {
    if (!newSeriesTitle.trim()) return;
    try {
      const res = await fetch("/api/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: newSeriesTitle.trim(),
          description: newSeriesDescription.trim(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const newSeries: UserSeries = {
          id: data.series.id,
          title: data.series.title,
          description: data.series.description || "",
          episodeCount: 0,
        };
        setUserCreatedSeries((prev) => [...prev, newSeries]);
        setSelectedSeriesId(data.series.id);
      }
    } catch {
      // Fallback: create locally but don't attach to video on publish
      const newSeries: UserSeries = {
        id: `local-${Date.now()}`,
        title: newSeriesTitle.trim(),
        description: newSeriesDescription.trim(),
        episodeCount: 0,
      };
      setUserCreatedSeries((prev) => [...prev, newSeries]);
      setSelectedSeriesId(newSeries.id);
    }
    setShowCreateSeriesModal(false);
    setNewSeriesTitle("");
    setNewSeriesDescription("");
  };

  // Custom thumbnail upload via hidden file input
  const customThumbnailInputRef = useRef<HTMLInputElement>(null);
  const [customThumbnailUrl, setCustomThumbnailUrl] = useState<string | null>(null);

  const handleCustomThumbnailUpload = () => {
    customThumbnailInputRef.current?.click();
  };

  const handleCustomThumbnailSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (customThumbnailUrl) URL.revokeObjectURL(customThumbnailUrl);
    const url = URL.createObjectURL(file);
    setCustomThumbnailUrl(url);
    setCustomThumbnailName(file.name);
    setThumbnailMode("custom");
    if (customThumbnailInputRef.current) customThumbnailInputRef.current.value = "";
  };

  const visibilityOptions: { value: Visibility; label: string; icon: typeof Globe; desc: string }[] = [
    { value: "public", label: "Public", icon: Globe, desc: "Anyone can find and watch" },
    { value: "unlisted", label: "Unlisted", icon: EyeOff, desc: "Only people with the link" },
    { value: "private", label: "Private", icon: Lock, desc: "Only you can watch" },
  ];

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text mb-2">Upload Video</h1>
          <p className="text-text-secondary">
            Share your content with the Rally Live community
          </p>
        </div>

        <Card padding="lg" className="space-y-8">
          {/* -------- Video Upload Area -------- */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,video/mp4,video/webm,video/quicktime,video/3gpp,.mp4,.webm,.mov,.avi,.mkv,.3gp,.m4v"
              className="hidden"
              onChange={handleFileSelected}
            />
            <input
              ref={customThumbnailInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleCustomThumbnailSelected}
            />
            <label className="text-sm font-medium text-text-secondary mb-2 block">
              Video File
            </label>
            {!uploadedFile && !isUploading ? (
              <button
                type="button"
                onClick={handleFileUpload}
                className="w-full border-2 border-dashed border-border rounded-xl p-12 flex flex-col items-center gap-3 hover:border-primary/50 hover:bg-bg-surface2/50 transition-colors cursor-pointer group"
              >
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Upload size={28} className="text-primary" />
                </div>
                <p className="text-text font-medium">
                  Drag &amp; drop or click to upload
                </p>
                <p className="text-text-muted text-sm">
                  MP4, MOV, AVI — any file size
                </p>
              </button>
            ) : (
              <div className="w-full border border-border rounded-xl p-5 bg-bg-surface2/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Film size={20} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-text font-medium text-sm truncate">
                      {uploadedFile || realFile?.name || "my-video.mp4"}
                    </p>
                    <p className="text-text-muted text-xs">
                      {uploadedFile
                        ? "Upload complete — you can fill in details below"
                        : `Uploading${realFile ? ` (${(realFile.size / (1024 * 1024)).toFixed(1)} MB)` : ""}... You can browse other pages.`}
                    </p>
                  </div>
                  {uploadedFile ? (
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-success/20 flex items-center justify-center">
                        <Check size={14} className="text-success" />
                      </div>
                      <button
                        onClick={handleRemoveFile}
                        className="p-1 rounded-md hover:bg-bg-surface3 text-text-muted hover:text-text transition-colors"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : null}
                </div>
                {/* Progress bar */}
                <div className="mt-3 w-full bg-bg-surface3 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${Math.min(uploadProgress, 100)}%` }}
                  />
                </div>
                {!uploadedFile && (
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-text-muted text-xs">
                      {Math.min(Math.round(uploadProgress), 100)}%
                      {uploadStore.speedBps > 0 && (
                        <span className="ml-1.5 text-text-muted/70">
                          · {uploadStore.speedBps < 1024 * 1024
                            ? `${(uploadStore.speedBps / 1024).toFixed(1)} KB/s`
                            : `${(uploadStore.speedBps / (1024 * 1024)).toFixed(1)} MB/s`}
                        </span>
                      )}
                    </p>
                    {uploadStore.etaSeconds != null && uploadStore.etaSeconds > 0 && (
                      <p className="text-text-muted text-xs">
                        {uploadStore.etaSeconds < 60
                          ? `${uploadStore.etaSeconds}s left`
                          : uploadStore.etaSeconds < 3600
                            ? `${Math.floor(uploadStore.etaSeconds / 60)}m ${uploadStore.etaSeconds % 60}s left`
                            : `${Math.floor(uploadStore.etaSeconds / 3600)}h ${Math.floor((uploadStore.etaSeconds % 3600) / 60)}m left`}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            {uploadError && (
              <div className="mt-3 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3">
                <p className="text-red-400 text-sm">{uploadError}</p>
                <button
                  type="button"
                  onClick={() => {
                    setUploadError(null);
                    fileInputRef.current?.click();
                  }}
                  className="mt-2 px-4 py-1.5 text-xs font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                >
                  Try Again
                </button>
              </div>
            )}

            {/* Thumbnail generation status */}
            {isGeneratingThumbnails && (
              <div className="mt-3 flex items-center gap-3 rounded-xl bg-primary/5 border border-primary/20 px-4 py-3">
                <Loader2 size={18} className="text-primary animate-spin shrink-0" />
                <div>
                  <p className="text-text text-sm font-medium">Generating thumbnails...</p>
                  <p className="text-text-muted text-xs">Extracting preview frames from your video</p>
                </div>
              </div>
            )}
            {!isGeneratingThumbnails && generatedThumbnails.length > 0 && uploadedFile && (
              <div className="mt-3 flex items-center gap-3 rounded-xl bg-success/5 border border-success/20 px-4 py-3">
                <Check size={18} className="text-success shrink-0" />
                <p className="text-text text-sm">Thumbnails ready — choose one below</p>
              </div>
            )}
          </div>

          {/* -------- Title -------- */}
          <div>
            <Input
              label="Title *"
              placeholder="Give your video a title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (e.target.value.trim()) setTitleError(false);
              }}
              onBlur={() => {
                // Auto-generate tags from title if none have been added yet
                if (title.trim() && tags.length === 0) {
                  const autoTags = generateTagsFromTitle(title);
                  if (autoTags.length > 0) setTags(autoTags);
                }
              }}
              className={titleError ? "!border-danger focus:!ring-danger/30 focus:!border-danger" : ""}
            />
            {titleError && (
              <p className="text-danger text-xs mt-1">Title is required</p>
            )}
          </div>

          {/* -------- Description -------- */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-secondary">
              Description
            </label>
            <textarea
              rows={4}
              placeholder="Tell viewers about your video..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-bg-surface2 text-text placeholder:text-text-muted border border-border rounded-xl px-3 py-2.5 text-sm transition-colors hover:border-border-light focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 resize-none"
            />
          </div>

          {/* -------- Tags -------- */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-secondary flex items-center gap-1.5">
              <Tag size={14} />
              Tags
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/15 text-primary text-xs font-medium rounded-full"
                >
                  #{tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="hover:text-white transition-colors"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
            <Input
              placeholder="Type a tag and press Enter"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              icon={<Tag size={16} />}
            />
          </div>

          {/* -------- Thumbnail Picker -------- */}
          <div className="flex flex-col gap-3">
            <label className="text-sm font-medium text-text-secondary flex items-center gap-1.5">
              <Image size={14} />
              Thumbnail
            </label>
            <p className="text-text-muted text-xs -mt-1">
              Choose from auto-generated options or upload your own
            </p>

            {/* Auto-generated thumbnails */}
            <div className="grid grid-cols-3 gap-3">
              {THUMBNAIL_OPTIONS.map((thumb, idx) => (
                <button
                  key={thumb.id}
                  type="button"
                  onClick={() => {
                    setThumbnailMode("auto");
                    setSelectedThumbnail(thumb.id);
                  }}
                  className={cn(
                    "relative aspect-video rounded-lg overflow-hidden border-2 transition-all group",
                    thumbnailMode === "auto" && selectedThumbnail === thumb.id
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-border hover:border-border-light"
                  )}
                >
                  {generatedThumbnails[idx] ? (
                    <img
                      src={generatedThumbnails[idx]}
                      alt={thumb.label}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-bg-surface2 to-bg-surface3 flex items-center justify-center">
                      <span className="text-text-muted text-xs">
                        {uploadedFile ? "Generating..." : thumb.label}
                      </span>
                    </div>
                  )}
                  {thumbnailMode === "auto" && selectedThumbnail === thumb.id && (
                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                      <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                        <Check size={14} className="text-white" />
                      </div>
                    </div>
                  )}
                  <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                    {thumb.label}
                  </span>
                </button>
              ))}
            </div>

            {/* Custom upload option */}
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-border" />
              <span className="text-text-muted text-xs">or</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {customThumbnailName ? (
              <div
                className={cn(
                  "flex items-center gap-3 border rounded-xl p-3 transition-all",
                  thumbnailMode === "custom"
                    ? "border-primary bg-primary/5"
                    : "border-border"
                )}
              >
                <div className="w-20 aspect-video rounded-lg bg-bg-surface3 flex items-center justify-center overflow-hidden">
                  {customThumbnailUrl ? (
                    <img src={customThumbnailUrl} alt="Custom thumbnail" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                      <span className="text-text-muted text-[10px]">Custom</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-text text-sm font-medium truncate">{customThumbnailName}</p>
                  <p className="text-text-muted text-xs">Custom thumbnail</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setThumbnailMode("custom");
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                      thumbnailMode === "custom"
                        ? "bg-primary text-white"
                        : "bg-bg-surface2 text-text-secondary hover:bg-bg-surface3"
                    )}
                  >
                    {thumbnailMode === "custom" ? "Selected" : "Use This"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (customThumbnailUrl) URL.revokeObjectURL(customThumbnailUrl);
                      setCustomThumbnailUrl(null);
                      setCustomThumbnailName(null);
                      setThumbnailMode("auto");
                    }}
                    className="p-1 rounded-md text-text-muted hover:text-danger transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleCustomThumbnailUpload}
                className="w-full border border-dashed border-border rounded-xl p-4 flex items-center justify-center gap-2 hover:border-primary/50 hover:bg-bg-surface2/30 transition-colors cursor-pointer"
              >
                <Upload size={16} className="text-text-muted" />
                <span className="text-text-muted text-sm">Upload custom thumbnail (16:9)</span>
              </button>
            )}
          </div>

          {/* -------- Visibility -------- */}
          <div className="flex flex-col gap-3">
            <label className="text-sm font-medium text-text-secondary flex items-center gap-1.5">
              <Globe size={14} />
              Visibility
            </label>
            <div className="grid grid-cols-3 gap-3">
              {visibilityOptions.map((opt) => {
                const Icon = opt.icon;
                const isActive = visibility === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setVisibility(opt.value)}
                    className={cn(
                      "flex flex-col items-center gap-2 border rounded-xl p-4 transition-all",
                      isActive
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-border-light"
                    )}
                  >
                    <Icon
                      size={20}
                      className={isActive ? "text-primary" : "text-text-muted"}
                    />
                    <span
                      className={cn(
                        "text-sm font-medium",
                        isActive ? "text-primary" : "text-text-muted"
                      )}
                    >
                      {opt.label}
                    </span>
                    <span className="text-[10px] text-text-muted text-center leading-tight">
                      {opt.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* -------- Series Section -------- */}
          <div className="border-t border-border pt-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Layers size={18} className="text-primary" />
                </div>
                <div>
                  <p className="text-text font-medium">Series</p>
                  <p className="text-text-muted text-sm">
                    Add this video to a series playlist
                  </p>
                </div>
              </div>
              {/* Toggle switch */}
              <button
                type="button"
                onClick={() => setIsPartOfSeries(!isPartOfSeries)}
                className={cn(
                  "relative w-11 h-6 rounded-full transition-colors duration-200",
                  isPartOfSeries ? "bg-primary" : "bg-bg-surface3"
                )}
                role="switch"
                aria-checked={isPartOfSeries}
              >
                <span
                  className={cn(
                    "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200 shadow-sm",
                    isPartOfSeries ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            {isPartOfSeries && (
              <div className="space-y-4 pl-12">
                {/* Series dropdown */}
                <div className="flex flex-col gap-1.5" ref={dropdownRef}>
                  <label className="text-sm font-medium text-text-secondary">
                    Select Series
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setSeriesDropdownOpen(!seriesDropdownOpen)}
                      className="w-full flex items-center justify-between bg-bg-surface2 border border-border rounded-xl px-3 py-2.5 text-sm text-text hover:border-border-light transition-colors"
                    >
                      <span className={selectedSeriesId ? "text-text" : "text-text-muted"}>
                        {selectedSeriesId
                          ? (userCreatedSeries.find((s) => s.id === selectedSeriesId)?.title ??
                            fetchedSeries.find((s: any) => s.id === selectedSeriesId)?.title ??
                            "Choose a series...")
                          : "Choose a series..."}
                      </span>
                      <ChevronDown
                        size={16}
                        className={cn(
                          "text-text-muted transition-transform",
                          seriesDropdownOpen && "rotate-180"
                        )}
                      />
                    </button>

                    {seriesDropdownOpen && (
                      <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-bg-surface border border-border rounded-xl shadow-lg overflow-hidden">
                        {/* User-created series */}
                        {userCreatedSeries.map((series) => (
                          <button
                            key={series.id}
                            type="button"
                            onClick={() => {
                              setSelectedSeriesId(series.id);
                              setSeriesDropdownOpen(false);
                            }}
                            className={cn(
                              "w-full text-left px-3 py-2.5 text-sm hover:bg-bg-surface2 transition-colors flex items-center justify-between",
                              selectedSeriesId === series.id && "text-primary bg-primary/5"
                            )}
                          >
                            <div>
                              <span className="block">{series.title}</span>
                              <span className="text-text-muted text-xs">
                                {series.episodeCount} {series.episodeCount === 1 ? "episode" : "episodes"}
                              </span>
                            </div>
                            {selectedSeriesId === series.id && (
                              <Check size={14} className="text-primary" />
                            )}
                          </button>
                        ))}

                        {/* Fetched series from API */}
                        {fetchedSeries.map((series: any) => (
                          <button
                            key={series.id}
                            type="button"
                            onClick={() => {
                              setSelectedSeriesId(series.id);
                              setSeriesDropdownOpen(false);
                            }}
                            className={cn(
                              "w-full text-left px-3 py-2.5 text-sm hover:bg-bg-surface2 transition-colors flex items-center justify-between",
                              selectedSeriesId === series.id && "text-primary bg-primary/5"
                            )}
                          >
                            <div>
                              <span className="block">{series.title}</span>
                              <span className="text-text-muted text-xs">
                                {series.totalEpisodes || 0} episodes
                              </span>
                            </div>
                            {selectedSeriesId === series.id && (
                              <Check size={14} className="text-primary" />
                            )}
                          </button>
                        ))}

                        {/* Create new */}
                        <button
                          type="button"
                          onClick={() => {
                            setSeriesDropdownOpen(false);
                            setShowCreateSeriesModal(true);
                          }}
                          className="w-full text-left px-3 py-2.5 text-sm hover:bg-bg-surface2 transition-colors border-t border-border text-primary flex items-center gap-2"
                        >
                          <Plus size={14} />
                          Create New Series
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Episode info card */}
                {seriesInfo && (
                  <div className="bg-bg-surface2 rounded-xl p-4 border border-border">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-text font-medium text-sm">{seriesInfo.title}</h4>
                      <span className="px-2.5 py-1 rounded-full bg-primary/15 text-primary text-xs font-bold">
                        Episode {seriesInfo.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-bg-surface3 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all duration-500"
                          style={{
                            width: seriesInfo.currentCount === 0
                              ? "100%"
                              : `${Math.min(100, (seriesInfo.currentCount / Math.max(1, seriesInfo.nextEpisode)) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                    {seriesInfo.currentCount > 0 ? (
                      <p className="text-text-muted text-xs mt-2">
                        This will be episode {seriesInfo.nextEpisode}. Series currently has {seriesInfo.currentCount}{" "}
                        {seriesInfo.currentCount === 1 ? "episode" : "episodes"}.
                      </p>
                    ) : (
                      <p className="text-text-muted text-xs mt-2">
                        This will be the first episode in the series.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* -------- Publish Button -------- */}
          <div className="border-t border-border pt-6 space-y-3">
            {/* Summary line */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
              <span className="flex items-center gap-1">
                {visibility === "public" && <><Globe size={12} /> Public</>}
                {visibility === "unlisted" && <><EyeOff size={12} /> Unlisted</>}
                {visibility === "private" && <><Lock size={12} /> Private</>}
              </span>
              {isPartOfSeries && seriesInfo && (
                <>
                  <span className="text-border">|</span>
                  <span className="flex items-center gap-1">
                    <Layers size={12} />
                    {seriesInfo.title} - Ep {seriesInfo.nextEpisode}
                  </span>
                </>
              )}
              {thumbnailMode === "custom" && customThumbnailName && (
                <>
                  <span className="text-border">|</span>
                  <span className="flex items-center gap-1">
                    <Image size={12} />
                    Custom thumbnail
                  </span>
                </>
              )}
            </div>

            {publishError && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 mb-3">
                <p className="text-red-400 text-sm">{publishError}</p>
              </div>
            )}
            <Button
              variant="gradient"
              size="lg"
              fullWidth
              onClick={handlePublish}
              disabled={isPublishing || isGeneratingThumbnails || !uploadedFileUrl}
              icon={isPublishing ? <Loader2 size={20} className="animate-spin" /> : isGeneratingThumbnails ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
            >
              {isPublishing ? "Publishing..." : isGeneratingThumbnails ? "Generating Thumbnails..." : !uploadedFileUrl ? "Upload a Video First" : "Publish Video"}
            </Button>
          </div>
        </Card>
      </div>

      {/* -------- Create Series Modal -------- */}
      <Modal
        isOpen={showCreateSeriesModal}
        onClose={() => setShowCreateSeriesModal(false)}
        title="Create New Series"
      >
        <div className="space-y-4">
          <Input
            label="Series Title"
            placeholder='e.g. "Kings Road Map"'
            value={newSeriesTitle}
            onChange={(e) => setNewSeriesTitle(e.target.value)}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-secondary">
              Description
            </label>
            <textarea
              rows={3}
              placeholder="Describe your series..."
              value={newSeriesDescription}
              onChange={(e) => setNewSeriesDescription(e.target.value)}
              className="w-full bg-bg-surface2 text-text placeholder:text-text-muted border border-border rounded-xl px-3 py-2.5 text-sm transition-colors hover:border-border-light focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 resize-none"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-text-secondary mb-1.5 block">
              Cover Image
            </label>
            <div className="border border-dashed border-border rounded-xl p-6 flex flex-col items-center gap-2 hover:border-primary/50 transition-colors cursor-pointer">
              <Image size={20} className="text-text-muted" />
              <p className="text-text-muted text-xs">
                Click to upload cover (16:9)
              </p>
            </div>
          </div>
          <div className="bg-bg-surface2 rounded-xl p-3 flex items-start gap-2">
            <Info size={14} className="text-accent shrink-0 mt-0.5" />
            <p className="text-text-secondary text-xs">
              After creating the series, this upload will be episode 1 of 1. Each new upload you add will increment automatically.
            </p>
          </div>
          <Button
            variant="gradient"
            fullWidth
            onClick={handleCreateSeries}
            disabled={!newSeriesTitle.trim()}
            icon={<Plus size={18} />}
          >
            Create Series
          </Button>
        </div>
      </Modal>

      {/* -------- Success Modal -------- */}
      <Modal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        title={processingStatus === "READY" ? "Video Published!" : processingStatus === "FAILED" ? "Processing Failed" : "Processing Video..."}
        size="sm"
      >
        <div className="flex flex-col items-center text-center py-4">
          {processingStatus === "PROCESSING" && (
            <>
              <div className="relative w-20 h-20 mb-4">
                <div className="relative w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center">
                  <Loader2 size={36} className="text-primary animate-spin" />
                </div>
              </div>
              <h3 className="text-xl font-bold text-text mb-1">
                Optimizing your video...
              </h3>
              <p className="text-text-secondary text-sm mb-2">
                &quot;{title || "Untitled"}&quot; is being re-encoded for fast playback. This runs in the background — you can close this page.
              </p>
              <div className="w-full mt-3 mb-4">
                <div className="w-full bg-bg-surface3 rounded-full h-2 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-primary to-accent rounded-full animate-pulse" style={{ width: "60%" }} />
                </div>
                <p className="text-text-muted text-xs mt-2">
                  Re-encoding to H.264 MP4 with fast-start...
                </p>
              </div>
            </>
          )}

          {processingStatus === "READY" && (
            <>
              {/* Success animation */}
              <div className="relative w-20 h-20 mb-4">
                <div className="absolute inset-0 rounded-full bg-success/20 animate-ping" />
                <div className="relative w-20 h-20 rounded-full bg-success/20 flex items-center justify-center">
                  <Check size={36} className="text-success" />
                </div>
                {[...Array(8)].map((_, i) => (
                  <span
                    key={i}
                    className="absolute w-2 h-2 rounded-full"
                    style={{
                      backgroundColor:
                        i % 3 === 0 ? "#8B5CF6" : i % 3 === 1 ? "#06B6D4" : "#F59E0B",
                      top: `${50 + Math.sin((i * Math.PI * 2) / 8) * 50}%`,
                      left: `${50 + Math.cos((i * Math.PI * 2) / 8) * 50}%`,
                      animation: `confettiFloat 1.5s ease-out ${i * 0.1}s infinite`,
                      transform: "translate(-50%, -50%)",
                    }}
                  />
                ))}
              </div>
              <h3 className="text-xl font-bold text-text mb-1">
                Your video is live!
              </h3>
              <p className="text-text-secondary text-sm mb-2">
                &quot;{title || "Untitled"}&quot; has been optimized and published.
              </p>
            </>
          )}

          {processingStatus === "FAILED" && (
            <>
              <div className="relative w-20 h-20 mb-4">
                <div className="relative w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center">
                  <X size={36} className="text-red-400" />
                </div>
              </div>
              <h3 className="text-xl font-bold text-text mb-1">
                Processing failed
              </h3>
              <p className="text-text-secondary text-sm mb-2">
                &quot;{title || "Untitled"}&quot; could not be processed. The video format may be unsupported. Try uploading an MP4 file.
              </p>
            </>
          )}

          {/* Show series info in success */}
          {processingStatus !== "PROCESSING" && isPartOfSeries && seriesInfo && (
            <div className="mb-4 px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium">
              Added as Episode {seriesInfo.nextEpisode} of {seriesInfo.title}
            </div>
          )}

          {/* Show visibility */}
          <p className="text-text-muted text-xs mb-4 flex items-center gap-1">
            {visibility === "public" && <><Globe size={12} /> Published as Public</>}
            {visibility === "unlisted" && <><EyeOff size={12} /> Published as Unlisted</>}
            {visibility === "private" && <><Lock size={12} /> Published as Private</>}
          </p>

          {processingStatus === "READY" && publishedVideoId && (
            <Button
              variant="gradient"
              fullWidth
              onClick={() => {
                const username = currentUser?.username;
                if (username) {
                  router.push(`/@${username}/${publishedVideoId}`);
                } else {
                  router.push(`/watch/${publishedVideoId}`);
                }
              }}
            >
              View Video
            </Button>
          )}

          {processingStatus === "FAILED" && (
            <Button
              variant="gradient"
              fullWidth
              onClick={() => {
                setShowSuccessModal(false);
                setPublishedVideoId(null);
              }}
            >
              Try Again
            </Button>
          )}

          {processingStatus === "PROCESSING" && (
            <Button
              variant="gradient"
              fullWidth
              onClick={() => setShowSuccessModal(false)}
            >
              Close &amp; Continue
            </Button>
          )}
        </div>

        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes confettiFloat {
            0% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            100% { opacity: 0; transform: translate(-50%, -50%) scale(0) translateY(-20px); }
          }
        `}} />
      </Modal>
    </div>
  );
}
