"use client";

import { useUploadStore } from "@/stores/upload-store";
import { Upload, X, Check, AlertCircle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

function formatEta(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return "";
  if (seconds < 60) return `${seconds}s left`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s left`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m left`;
}

function formatSpeed(bps: number): string {
  if (bps <= 0) return "";
  if (bps < 1024) return `${Math.round(bps)} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function UploadWidget() {
  const router = useRouter();
  const {
    isUploading,
    fileName,
    fileSize,
    progress,
    error,
    uploadedUrl,
    uploadedFileName,
    etaSeconds,
    speedBps,
    cancelUpload,
    clearUpload,
  } = useUploadStore();

  // Don't show if nothing is happening
  if (!isUploading && !error && !uploadedUrl) return null;

  return (
    <div className="fixed bottom-20 left-4 md:bottom-4 md:left-4 z-[99] w-80 max-w-[calc(100vw-2rem)]">
      <div className="bg-bg-surface border border-border rounded-xl shadow-[var(--shadow-medium)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            {isUploading ? (
              <Loader2 size={16} className="text-primary animate-spin" />
            ) : error ? (
              <AlertCircle size={16} className="text-danger" />
            ) : (
              <Check size={16} className="text-success" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text truncate">
              {isUploading
                ? "Uploading video..."
                : error
                  ? "Upload failed"
                  : "Upload complete"}
            </p>
            <p className="text-xs text-text-muted truncate">
              {fileName || "video"}
              {fileSize > 0 ? ` (${formatSize(fileSize)})` : ""}
            </p>
          </div>
          <button
            onClick={() => {
              if (isUploading) {
                cancelUpload();
              } else {
                clearUpload();
              }
            }}
            className="shrink-0 p-1 text-text-muted hover:text-text transition-colors"
            aria-label={isUploading ? "Cancel upload" : "Dismiss"}
          >
            <X size={16} />
          </button>
        </div>

        {/* Progress bar */}
        {isUploading && (
          <div className="px-4 pb-3">
            <div className="w-full bg-bg-surface3 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all duration-500 ease-out"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[11px] text-text-muted">
                {Math.round(progress)}%
                {speedBps > 0 ? ` · ${formatSpeed(speedBps)}` : ""}
              </span>
              <span className="text-[11px] text-text-muted">
                {formatEta(etaSeconds ?? null)}
              </span>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && !isUploading && (
          <div className="px-4 pb-3">
            <p className="text-xs text-danger mb-2 line-clamp-2">{error}</p>
            <button
              onClick={() => {
                clearUpload();
                router.push("/upload");
              }}
              className="px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Success state */}
        {uploadedUrl && !isUploading && !error && (
          <div className="px-4 pb-3">
            <button
              onClick={() => {
                router.push("/upload");
              }}
              className="px-3 py-1.5 text-xs font-medium bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
            >
              Continue editing details
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
