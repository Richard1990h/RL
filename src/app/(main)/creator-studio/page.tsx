"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import {
  Video as VideoIcon,
  Edit,
  Trash2,
  BarChart3,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Plus,
  X,
  Radio,
  Shield,
  Ban,
  Tv,
  DollarSign,
  Clock,
  Lock,
  Gift,
  Loader2,
  Film,
  CheckCircle,
  AlertCircle,
  Globe,
  Link as LinkIcon,
  Eye,
  EyeOff,
  Users,
  Copy,
  Check,
  ChevronDown,
  Monitor,
  Plug,
  Unplug,
  Key,
  Wifi,
} from "lucide-react";
import Tabs from "@/components/ui/Tabs";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Input from "@/components/ui/Input";
import Avatar from "@/components/ui/Avatar";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { formatViews, formatTimeAgo, cn } from "@/lib/utils";
import type { SeriesEpisode } from "@/lib/types";

const tabs = [
  { id: "content", label: "Content" },
  { id: "series", label: "Series" },
  { id: "live", label: "Live Settings" },
  { id: "moderation", label: "Moderation" },
  { id: "ads", label: "Ad Settings" },
  { id: "integrations", label: "Integrations" },
];

export default function CreatorStudioPage() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const [activeTab, setActiveTab] = useState("content");

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold text-text">Creator Studio</h1>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      <div className="mt-6">
        {activeTab === "content" && <ContentTab userId={currentUser?.id ?? ""} />}
        {activeTab === "series" && <SeriesTab userId={currentUser?.id ?? ""} />}
        {activeTab === "live" && <LiveSettingsTab />}
        {activeTab === "moderation" && <ModerationTab />}
        {activeTab === "ads" && <AdSettingsTab />}
        {activeTab === "integrations" && <IntegrationsTab />}
      </div>
    </div>
  );
}

/* ───────── Content Tab ───────── */
type VideoVisibility = "PUBLIC" | "UNLISTED" | "PRIVATE" | "FOLLOWERS_ONLY";

const VISIBILITY_OPTIONS: { value: VideoVisibility; label: string; icon: React.ReactNode; description: string }[] = [
  { value: "PUBLIC", label: "Public", icon: <Globe size={14} />, description: "Anyone can find and watch" },
  { value: "UNLISTED", label: "Unlisted", icon: <LinkIcon size={14} />, description: "Only people with the link" },
  { value: "PRIVATE", label: "Private", icon: <EyeOff size={14} />, description: "Only you can see" },
  { value: "FOLLOWERS_ONLY", label: "Followers", icon: <Users size={14} />, description: "Only your followers" },
];

function VisibilityBadge({ visibility }: { visibility: VideoVisibility }) {
  const opt = VISIBILITY_OPTIONS.find((o) => o.value === visibility) || VISIBILITY_OPTIONS[0];
  const colors: Record<VideoVisibility, string> = {
    PUBLIC: "bg-success/10 text-success border-success/20",
    UNLISTED: "bg-warning/10 text-warning border-warning/20",
    PRIVATE: "bg-text-muted/10 text-text-muted border-border",
    FOLLOWERS_ONLY: "bg-primary/10 text-primary border-primary/20",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full border", colors[visibility])}>
      {opt.icon} {opt.label}
    </span>
  );
}

function VisibilityDropdown({
  videoId,
  currentVisibility,
  onUpdate,
}: {
  videoId: string;
  currentVisibility: VideoVisibility;
  onUpdate: (videoId: string, visibility: VideoVisibility) => void;
}) {
  const [open, setOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleChange = async (visibility: VideoVisibility) => {
    if (visibility === currentVisibility) { setOpen(false); return; }
    setUpdating(true);
    try {
      await api.videos.update(videoId, { visibility });
      onUpdate(videoId, visibility);
    } catch {
      // failed silently
    } finally {
      setUpdating(false);
      setOpen(false);
    }
  };

  const copyShareLink = () => {
    const username = useAuthStore.getState().currentUser?.username;
    const videoPath = username ? `/@${username}/${videoId}` : `/watch/${videoId}`;
    const url = `${window.location.origin}${videoPath}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={updating}
        className="inline-flex items-center gap-1 text-xs hover:bg-bg-surface2 rounded-lg px-1.5 py-1 transition-colors"
      >
        {updating ? <Loader2 size={12} className="animate-spin" /> : <VisibilityBadge visibility={currentVisibility} />}
        <ChevronDown size={12} className="text-text-muted" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-56 bg-bg-surface border border-border rounded-xl shadow-lg overflow-hidden">
            {VISIBILITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleChange(opt.value)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-bg-surface2 transition-colors",
                  opt.value === currentVisibility && "bg-primary/5"
                )}
              >
                <span className={cn("shrink-0", opt.value === currentVisibility ? "text-primary" : "text-text-muted")}>{opt.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-xs font-medium", opt.value === currentVisibility ? "text-primary" : "text-text")}>{opt.label}</p>
                  <p className="text-[10px] text-text-muted">{opt.description}</p>
                </div>
                {opt.value === currentVisibility && <Check size={14} className="text-primary shrink-0" />}
              </button>
            ))}
            {currentVisibility === "UNLISTED" && (
              <div className="border-t border-border px-3 py-2.5">
                <button
                  onClick={copyShareLink}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg bg-bg-surface2 hover:bg-bg-surface3 text-xs text-text-secondary transition-colors"
                >
                  {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                  {copied ? "Link copied!" : "Copy shareable link"}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function RecordingProgressPopup({ recordings }: { recordings: any[] }) {
  const processing = recordings.filter((r: any) => r.status === "PROCESSING");
  if (processing.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {processing.map((rec: any) => {
        const progress = rec.progress || 0;
        const label = progress < 60 ? "Uploading..." : progress < 90 ? "Processing..." : "Finalizing...";
        return (
          <div
            key={rec.id}
            className="bg-bg-surface border border-border rounded-xl shadow-xl p-4 space-y-2 animate-in slide-in-from-bottom-4"
          >
            <div className="flex items-center gap-2">
              <Loader2 size={16} className="animate-spin text-primary shrink-0" />
              <span className="text-sm font-medium text-text truncate">{rec.title}</span>
            </div>
            <div className="w-full bg-bg-surface3 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted">{label}</span>
              <span className="text-xs font-medium text-primary">{progress}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ContentTab({ userId }: { userId: string }) {
  const [myVideos, setMyVideos] = useState<any[]>([]);
  const [myRecordings, setMyRecordings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDeleteVideo = async (videoId: string) => {
    if (!confirm("Are you sure you want to delete this video?")) return;
    setDeletingId(videoId);
    try {
      await api.videos.delete(videoId);
      setMyVideos((prev) => prev.filter((v) => v.id !== videoId));
    } catch {
      // failed silently
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteRecording = async (recordingId: string) => {
    if (!confirm("Are you sure you want to delete this recording?")) return;
    setDeletingId(recordingId);
    try {
      await api.recordings.delete(recordingId);
      setMyRecordings((prev) => prev.filter((r) => r.id !== recordingId));
    } catch {
      // failed silently
    } finally {
      setDeletingId(null);
    }
  };

  const handleVisibilityUpdate = (videoId: string, visibility: VideoVisibility) => {
    setMyVideos((prev) => prev.map((v) => v.id === videoId ? { ...v, visibility } : v));
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const loadVideos = api.videos
      .list({ creatorId: userId, limit: "200" })
      .then((res: any) => {
        if (!cancelled) setMyVideos(res.videos || []);
      })
      .catch(() => {
        if (!cancelled) setMyVideos([]);
      });

    const loadRecordings = api.recordings
      .list()
      .then((res: any) => {
        if (!cancelled) setMyRecordings(res.recordings || []);
      })
      .catch(() => {
        if (!cancelled) setMyRecordings([]);
      });

    Promise.all([loadVideos, loadRecordings]).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [userId]);

  // Poll processing recordings every 3 seconds to update progress
  useEffect(() => {
    const hasProcessing = myRecordings.some((r: any) => r.status === "PROCESSING");
    if (!hasProcessing) return;

    const pollProgress = async () => {
      const processingIds = myRecordings
        .filter((r: any) => r.status === "PROCESSING")
        .map((r: any) => r.id);

      for (const id of processingIds) {
        try {
          const res = await fetch(`/api/recordings/${id}`, { credentials: "include" });
          if (res.ok) {
            const data = await res.json();
            const updated = data.recording;
            setMyRecordings((prev) =>
              prev.map((r) =>
                r.id === id
                  ? { ...r, status: updated.status, progress: updated.progress, durationSec: updated.durationSec || r.durationSec }
                  : r
              )
            );
          }
        } catch {}
      }
    };

    const interval = setInterval(pollProgress, 3000);
    return () => clearInterval(interval);
  }, [myRecordings]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <RecordingProgressPopup recordings={myRecordings} />
      <div className="flex justify-end">
        <Link href="/upload-stream">
          <Button variant="gradient" icon={<Plus size={18} />}>
            Upload New
          </Button>
        </Link>
      </div>

      <Card padding="sm" className="overflow-hidden">
        <div className="max-h-[600px] overflow-y-auto overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-bg-surface z-10">
            <tr className="border-b border-border text-left text-text-muted">
              <th className="py-3 px-3 font-medium">Video</th>
              <th className="py-3 px-3 font-medium hidden sm:table-cell">Visibility</th>
              <th className="py-3 px-3 font-medium hidden md:table-cell" title="The number of times an ad was served on this video. Creators earn revenue from ad impressions.">Impression Views</th>
              <th className="py-3 px-3 font-medium hidden md:table-cell">Likes</th>
              <th className="py-3 px-3 font-medium hidden lg:table-cell">Date</th>
              <th className="py-3 px-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {myVideos.map((video: any) => (
              <tr
                key={video.id}
                className="border-b border-border/50 hover:bg-bg-surface2/50 transition-colors"
              >
                <td className="py-3 px-3">
                  <div className="flex items-center gap-3">
                    <div className="w-20 h-12 rounded bg-bg-surface2 overflow-hidden shrink-0">
                      {video.thumbnailUrl ? (
                        <img
                          src={`${video.thumbnailUrl}?v=2`}
                          alt={video.title}
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Film size={16} className="text-text-muted" />
                        </div>
                      )}
                    </div>
                    <span className="text-text font-medium line-clamp-2 text-sm">
                      {video.title}
                    </span>
                  </div>
                </td>
                <td className="py-3 px-3 hidden sm:table-cell">
                  <VisibilityDropdown
                    videoId={video.id}
                    currentVisibility={video.visibility || "PUBLIC"}
                    onUpdate={handleVisibilityUpdate}
                  />
                </td>
                <td className="py-3 px-3 hidden md:table-cell text-text-secondary" title="Impression Views — the number of times an ad was served on this video.">
                  {formatViews(video.impressions ?? video.views)}
                </td>
                <td className="py-3 px-3 hidden md:table-cell text-text-secondary">
                  {formatViews(video.likes)}
                </td>
                <td className="py-3 px-3 hidden lg:table-cell text-text-muted">
                  {formatTimeAgo(video.uploadDate)}
                </td>
                <td className="py-3 px-3">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/editor/${video.id}`}
                      className="inline-flex p-2 rounded-lg hover:bg-bg-surface2 text-text-secondary hover:text-text transition-colors"
                      title="Edit video"
                    >
                      <Edit size={16} />
                    </Link>
                    <button
                      onClick={() => handleDeleteVideo(video.id)}
                      disabled={deletingId === video.id}
                      className="p-2 rounded-lg hover:bg-bg-surface2 text-text-secondary hover:text-danger transition-colors disabled:opacity-50"
                      title="Delete video"
                    >
                      {deletingId === video.id ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Trash2 size={16} />
                      )}
                    </button>
                    <Link href="/analytics" className="inline-flex p-2 rounded-lg hover:bg-bg-surface2 text-text-secondary hover:text-accent transition-colors">
                      <BarChart3 size={16} />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        {myVideos.length === 0 && (
          <div className="py-12 text-center text-text-muted">
            <VideoIcon size={48} className="mx-auto mb-3 opacity-50" />
            <p>No videos yet. Upload your first video to get started.</p>
          </div>
        )}
      </Card>

      {/* ── Recordings from Live Streams ── */}
      <h2 className="text-lg font-semibold text-text mt-8 mb-3 flex items-center gap-2">
        <Film size={20} className="text-danger" />
        Stream Recordings
      </h2>

      <Card padding="sm" className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-muted">
              <th className="py-3 px-3 font-medium">Recording</th>
              <th className="py-3 px-3 font-medium hidden sm:table-cell">Status</th>
              <th className="py-3 px-3 font-medium hidden md:table-cell">Duration</th>
              <th className="py-3 px-3 font-medium hidden lg:table-cell">Date</th>
              <th className="py-3 px-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {myRecordings.map((rec: any) => {
              const isReady = rec.status === "READY";
              const isFailed = rec.status === "FAILED";
              return (
                <tr
                  key={rec.id}
                  className="border-b border-border/50 hover:bg-bg-surface2/50 transition-colors"
                >
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-3">
                      <div className="w-20 h-12 rounded bg-bg-surface2 overflow-hidden shrink-0 flex items-center justify-center">
                        {rec.thumbnailUrl ? (
                          <img src={`${rec.thumbnailUrl}?v=2`} alt={rec.title} className="w-full h-full object-cover" />
                        ) : (
                          <Film size={20} className="text-text-muted" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <span className="text-text font-medium line-clamp-1 text-sm block">
                          {rec.title}
                        </span>
                        {rec.liveStream && (
                          <span className="text-xs text-text-muted">
                            from: {rec.liveStream.title}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-3 hidden sm:table-cell">
                    {isReady && (
                      <Badge variant="new">
                        <CheckCircle size={12} className="mr-1" />
                        Ready
                      </Badge>
                    )}
                    {isFailed && (
                      <Badge variant="default">
                        <AlertCircle size={12} className="mr-1" />
                        Failed
                      </Badge>
                    )}
                    {!isReady && !isFailed && (
                      <div className="flex flex-col gap-1">
                        <Badge variant="default">
                          <Loader2 size={12} className="mr-1 animate-spin" />
                          Processing
                        </Badge>
                        <div className="w-20 bg-bg-surface3 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all duration-500"
                            style={{ width: `${rec.progress || 0}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-text-muted">{rec.progress || 0}%</span>
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-3 hidden md:table-cell text-text-secondary">
                    {rec.durationSec > 0
                      ? `${Math.floor(rec.durationSec / 60)}:${String(rec.durationSec % 60).padStart(2, "0")}`
                      : "—"}
                  </td>
                  <td className="py-3 px-3 hidden lg:table-cell text-text-muted">
                    {formatTimeAgo(rec.createdAt)}
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center justify-end gap-1">
                      {isReady && (
                        <Link
                          href={`/editor/${rec.id}`}
                          className="p-2 rounded-lg hover:bg-bg-surface2 text-text-secondary hover:text-text transition-colors"
                          title="Edit recording"
                        >
                          <Edit size={16} />
                        </Link>
                      )}
                      <button
                        onClick={() => handleDeleteRecording(rec.id)}
                        disabled={deletingId === rec.id}
                        className="p-2 rounded-lg hover:bg-bg-surface2 text-text-secondary hover:text-danger transition-colors disabled:opacity-50"
                        title="Delete recording"
                      >
                        {deletingId === rec.id ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Trash2 size={16} />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {myRecordings.length === 0 && (
          <div className="py-12 text-center text-text-muted">
            <Film size={48} className="mx-auto mb-3 opacity-50" />
            <p>No recordings yet. Record your next live stream to see it here.</p>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ───────── Series Tab ───────── */
function SeriesTab({ userId }: { userId: string }) {
  const [mySeries, setMySeries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSeries, setExpandedSeries] = useState<string | null>(null);
  const [episodeOrders, setEpisodeOrders] = useState<Record<string, SeriesEpisode[]>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.series
      .list({ creatorId: userId })
      .then((res: any) => {
        if (!cancelled) {
          const seriesList = res.series || [];
          setMySeries(seriesList);
          const map: Record<string, SeriesEpisode[]> = {};
          seriesList.forEach((s: any) => {
            if (s.episodes) {
              map[s.id] = [...s.episodes].sort((a: SeriesEpisode, b: SeriesEpisode) => a.order - b.order);
            }
          });
          setEpisodeOrders(map);
        }
      })
      .catch(() => {
        if (!cancelled) setMySeries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [userId]);

  const moveEpisode = (seriesId: string, index: number, direction: "up" | "down") => {
    setEpisodeOrders((prev) => {
      const eps = [...(prev[seriesId] || [])];
      const swapIdx = direction === "up" ? index - 1 : index + 1;
      if (swapIdx < 0 || swapIdx >= eps.length) return prev;
      [eps[index], eps[swapIdx]] = [eps[swapIdx], eps[index]];
      const updated = eps.map((ep, i) => ({ ...ep, order: i + 1 }));

      // Persist the reorder to the server for the two swapped episodes
      const changedEps = [updated[index], updated[swapIdx]];
      changedEps.forEach((ep) => {
        api.videos.update(ep.videoId, { seriesOrder: ep.order }).catch(() => {});
      });

      return { ...prev, [seriesId]: updated };
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link href="/upload-stream">
          <Button variant="gradient" icon={<Plus size={18} />}>
            Create New Series
          </Button>
        </Link>
      </div>

      <div className="grid gap-4">
        {mySeries.map((series: any) => {
          const episodes = episodeOrders[series.id] || series.episodes;
          const isExpanded = expandedSeries === series.id;

          return (
            <Card key={series.id} padding="md">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="w-full sm:w-40 h-24 rounded-lg bg-bg-surface2 overflow-hidden shrink-0">
                  <img
                    src={series.coverUrl}
                    alt={series.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-text">{series.title}</h3>
                  <p className="text-sm text-text-muted mt-1">
                    {series.totalEpisodes} episodes
                  </p>
                  <p className="text-sm text-text-secondary mt-1 line-clamp-2">
                    {series.description}
                  </p>
                </div>
                <div className="flex sm:flex-col gap-2 shrink-0">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setExpandedSeries(isExpanded ? null : series.id)
                    }
                  >
                    {isExpanded ? "Close" : "Manage"}
                  </Button>
                </div>
              </div>

              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-border space-y-2">
                  <p className="text-xs text-text-muted uppercase tracking-wider font-medium mb-2">
                    Episode Order
                  </p>
                  {episodes.map((ep, idx) => {
                    return (
                      <div
                        key={ep.videoId}
                        className="flex items-center gap-3 px-3 py-2 bg-bg-surface2 rounded-lg"
                      >
                        <GripVertical
                          size={16}
                          className="text-text-muted shrink-0"
                        />
                        <span className="text-sm text-text-muted w-6">
                          {ep.order}
                        </span>
                        <span className="text-sm text-text flex-1 truncate">
                          {ep.titleOverride || ep.videoId}
                        </span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => moveEpisode(series.id, idx, "up")}
                            disabled={idx === 0}
                            className="p-1 rounded hover:bg-bg-surface3 text-text-secondary disabled:opacity-30 transition-colors"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            onClick={() => moveEpisode(series.id, idx, "down")}
                            disabled={idx === episodes.length - 1}
                            className="p-1 rounded hover:bg-bg-surface3 text-text-secondary disabled:opacity-30 transition-colors"
                          >
                            <ArrowDown size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}

        {mySeries.length === 0 && (
          <Card padding="lg">
            <div className="py-8 text-center text-text-muted">
              <p>No series yet. Create your first series to organize your content.</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

/* ───────── Live Settings Tab ───────── */
function LiveSettingsTab() {
  const router = useRouter();
  const [streamTitle, setStreamTitle] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [mode, setMode] = useState("standard");
  const [guestLimit, setGuestLimit] = useState(4);
  const [roundLength, setRoundLength] = useState(60);
  const [teamSize, setTeamSize] = useState("2");
  const [loaded, setLoaded] = useState(false);

  // Load settings from API on mount
  useEffect(() => {
    api.creator.getLiveSettings()
      .then((res: any) => {
        const s = res.liveSettings || {};
        if (s.streamTitle) setStreamTitle(s.streamTitle);
        if (s.tags) setTags(s.tags);
        if (s.mode) setMode(s.mode);
        if (s.guestLimit) setGuestLimit(s.guestLimit);
        if (s.roundLength) setRoundLength(s.roundLength);
        if (s.teamSize) setTeamSize(s.teamSize);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // Save settings to API on change (debounced via loaded flag to skip initial load)
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => {
      api.creator.updateLiveSettings({ streamTitle, tags, mode, guestLimit, roundLength, teamSize }).catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [streamTitle, tags, mode, guestLimit, roundLength, teamSize, loaded]);

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag) && tags.length < 10) {
      setTags([...tags, tag]);
      setTagInput("");
    }
  };

  const removeTag = (t: string) => setTags(tags.filter((x) => x !== t));

  return (
    <div className="max-w-2xl space-y-6">
      <Card padding="lg">
        <div className="space-y-5">
          <Input
            label="Stream Title"
            placeholder="What are you streaming today?"
            value={streamTitle}
            onChange={(e) => setStreamTitle(e.target.value)}
          />

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Tags</label>
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  placeholder="Add a tag..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                />
              </div>
              <Button variant="secondary" size="sm" onClick={addTag}>
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/20 text-primary text-sm rounded-full"
                  >
                    #{tag}
                    <button
                      onClick={() => removeTag(tag)}
                      className="hover:text-white transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">Mode</label>
            <SegmentedControl
              options={[
                { id: "standard", label: "Standard" },
                { id: "timer_wars", label: "Timer Wars" },
                { id: "tower_wars", label: "Tower Wars" },
              ]}
              value={mode}
              onChange={setMode}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">
              Guest Limit
            </label>
            <input
              type="number"
              min={2}
              max={8}
              value={guestLimit}
              onChange={(e) =>
                setGuestLimit(
                  Math.min(8, Math.max(2, parseInt(e.target.value) || 2))
                )
              }
              className="w-24 bg-bg-surface2 text-text border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
            />
          </div>

          {mode === "timer_wars" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">
                Round Length (seconds)
              </label>
              <input
                type="number"
                min={15}
                max={300}
                value={roundLength}
                onChange={(e) =>
                  setRoundLength(
                    Math.min(300, Math.max(15, parseInt(e.target.value) || 60))
                  )
                }
                className="w-32 bg-bg-surface2 text-text border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
              />
            </div>
          )}

          {mode === "tower_wars" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">
                Team Size
              </label>
              <SegmentedControl
                options={[
                  { id: "2", label: "2v2" },
                  { id: "3", label: "3v3" },
                  { id: "4", label: "4v4" },
                ]}
                value={teamSize}
                onChange={setTeamSize}
              />
            </div>
          )}
        </div>
      </Card>

      <Button
        variant="gradient"
        size="lg"
        fullWidth
        icon={<Radio size={20} />}
        onClick={() => router.push(`/upload-stream?tab=go-live&title=${encodeURIComponent(streamTitle)}&mode=${mode}&guestLimit=${guestLimit}&roundLength=${roundLength}&teamSize=${teamSize}&tags=${encodeURIComponent(tags.join(","))}`)}
      >
        Go Live
      </Button>
    </div>
  );
}

/* ───────── Moderation Tab ───────── */
function ModerationTab() {
  const [bannedWords, setBannedWords] = useState<string[]>([]);
  const [wordInput, setWordInput] = useState("");
  const [mutedUsers, setMutedUsers] = useState<{ id: string; displayName: string; username: string; avatarUrl: string }[]>([]);
  const [blockLinks, setBlockLinks] = useState(true);
  const [slowMode, setSlowMode] = useState(false);
  const [followersOnly, setFollowersOnly] = useState(false);
  const [modSaved, setModSaved] = useState(false);

  // Load moderation settings from API on mount
  useEffect(() => {
    api.creator.getModerationSettings()
      .then((res: any) => {
        const s = res.moderationSettings || {};
        if (s.bannedWords) setBannedWords(s.bannedWords);
        if (s.mutedUsers) setMutedUsers(s.mutedUsers);
        if (typeof s.blockLinks === "boolean") setBlockLinks(s.blockLinks);
        if (typeof s.slowMode === "boolean") setSlowMode(s.slowMode);
        if (typeof s.followersOnly === "boolean") setFollowersOnly(s.followersOnly);
      })
      .catch(() => {});
  }, []);

  const saveModerationSettings = async () => {
    try {
      await api.creator.updateModerationSettings({ bannedWords, mutedUsers, blockLinks, slowMode, followersOnly });
      setModSaved(true);
      setTimeout(() => setModSaved(false), 2000);
    } catch {}
  };

  const addWord = () => {
    const word = wordInput.trim().toLowerCase();
    if (word && !bannedWords.includes(word)) {
      setBannedWords([...bannedWords, word]);
      setWordInput("");
    }
  };

  const removeWord = (w: string) => setBannedWords(bannedWords.filter((x) => x !== w));
  const unmuteUser = (id: string) => setMutedUsers(mutedUsers.filter((u) => u.id !== id));

  return (
    <div className="max-w-2xl space-y-6">
      {/* Banned Words */}
      <Card padding="lg">
        <div className="flex items-center gap-2 mb-4">
          <Ban size={20} className="text-danger" />
          <h3 className="text-lg font-semibold text-text">Banned Words</h3>
        </div>

        <div className="flex gap-2 mb-4">
          <div className="flex-1">
            <Input
              placeholder="Add a banned word..."
              value={wordInput}
              onChange={(e) => setWordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addWord();
                }
              }}
            />
          </div>
          <Button variant="danger" size="sm" onClick={addWord}>
            Add
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {bannedWords.map((word) => (
            <span
              key={word}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-danger/10 text-danger text-sm rounded-full border border-danger/20"
            >
              {word}
              <button
                onClick={() => removeWord(word)}
                className="hover:text-white transition-colors"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      </Card>

      {/* Muted Users */}
      <Card padding="lg">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={20} className="text-warning" />
          <h3 className="text-lg font-semibold text-text">Muted Users</h3>
        </div>

        <div className="space-y-3">
          {mutedUsers.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between p-3 bg-bg-surface2 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <Avatar src={user.avatarUrl} name={user.displayName} size="sm" />
                <div>
                  <p className="text-sm font-medium text-text">
                    {user.displayName}
                  </p>
                  <p className="text-xs text-text-muted">@{user.username}</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => unmuteUser(user.id)}>
                Unmute
              </Button>
            </div>
          ))}

          {mutedUsers.length === 0 && (
            <p className="text-sm text-text-muted text-center py-4">
              No muted users.
            </p>
          )}
        </div>
      </Card>

      {/* Auto-mod Toggles */}
      <Card padding="lg">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={20} className="text-primary" />
          <h3 className="text-lg font-semibold text-text">Auto-Moderation</h3>
        </div>

        <div className="space-y-4">
          <ToggleRow
            label="Block Links"
            description="Prevent users from posting links in chat"
            checked={blockLinks}
            onChange={setBlockLinks}
          />
          <ToggleRow
            label="Slow Mode"
            description="Limit messages to one every 10 seconds"
            checked={slowMode}
            onChange={setSlowMode}
          />
          <ToggleRow
            label="Followers-only Chat"
            description="Only followers can send messages"
            checked={followersOnly}
            onChange={setFollowersOnly}
          />
        </div>
      </Card>

      <Button variant="primary" size="lg" fullWidth onClick={saveModerationSettings}>
        {modSaved ? "Settings Saved!" : "Save Moderation Settings"}
      </Button>
    </div>
  );
}

/* ───────── Ad Revenue Tier helpers ───────── */
interface AdTier {
  minFollowers: number;
  maxFollowers: number | null;
  revenuePercent: number;
  label: string;
  unlocksControls: boolean;
}

const AD_TIERS: AdTier[] = [
  { minFollowers: 0, maxFollowers: 9_999, revenuePercent: 10, label: "Starter", unlocksControls: false },
  { minFollowers: 10_000, maxFollowers: 19_999, revenuePercent: 50, label: "Partner", unlocksControls: true },
  { minFollowers: 20_000, maxFollowers: null, revenuePercent: 80, label: "Elite", unlocksControls: true },
];

function getCurrentTier(followers: number): AdTier {
  for (let i = AD_TIERS.length - 1; i >= 0; i--) {
    if (followers >= AD_TIERS[i].minFollowers) return AD_TIERS[i];
  }
  return AD_TIERS[0];
}

function getNextTier(followers: number): AdTier | null {
  const current = getCurrentTier(followers);
  const idx = AD_TIERS.indexOf(current);
  return idx < AD_TIERS.length - 1 ? AD_TIERS[idx + 1] : null;
}

function getTierProgress(followers: number): number {
  const next = getNextTier(followers);
  if (!next) return 100;
  const current = getCurrentTier(followers);
  const range = next.minFollowers - current.minFollowers;
  const progress = followers - current.minFollowers;
  return Math.min((progress / range) * 100, 100);
}

/* ───────── Ad Settings Tab ───────── */
function AdSettingsTab() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const followerCount = currentUser?.followerCount ?? 0;
  const currentTier = getCurrentTier(followerCount);
  const nextTier = getNextTier(followerCount);
  const tierProgress = getTierProgress(followerCount);
  const isUnlocked = currentTier.unlocksControls;

  const [preRollAds, setPreRollAds] = useState(1);
  const [midRollAds, setMidRollAds] = useState(1);
  const [liveAdFrequency, setLiveAdFrequency] = useState("every_30");
  const [donationSkipEnabled, setDonationSkipEnabled] = useState(false);
  const [donationSkipAmount, setDonationSkipAmount] = useState("100");
  const [adSaved, setAdSaved] = useState(false);

  // Load ad settings from API on mount
  useEffect(() => {
    api.ads.getSettings()
      .then((res: any) => {
        const s = res.adSettings;
        if (s) {
          if (typeof s.adsPerVideo === "number") setPreRollAds(s.adsPerVideo);
          if (typeof s.adsPerLiveHour === "number") setMidRollAds(s.adsPerLiveHour);
          if (typeof s.creditsToSkip === "number") {
            setDonationSkipEnabled(s.creditsToSkip > 0);
            setDonationSkipAmount(String(s.creditsToSkip));
          }
        }
      })
      .catch(() => {});
  }, []);

  const saveAdSettings = async () => {
    try {
      await api.ads.updateSettings({
        adsPerVideo: preRollAds + midRollAds,
        adsPerLiveHour: liveAdFrequency === "start_only" ? 0 : liveAdFrequency === "every_15" ? 4 : liveAdFrequency === "every_30" ? 2 : 1,
        creditsToSkip: donationSkipEnabled ? parseInt(donationSkipAmount) || 200 : 0,
      });
      setAdSaved(true);
      setTimeout(() => setAdSaved(false), 2000);
    } catch {}
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Ad Revenue Tier Card */}
      <Card padding="lg">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign size={20} className="text-success" />
          <h3 className="text-lg font-semibold text-text">Ad Revenue Share</h3>
        </div>

        {/* Current tier prominent display */}
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-accent/10 border border-primary/20 p-5 mb-5">
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-primary/5" />
          <p className="text-text-muted text-xs font-medium uppercase tracking-wider mb-1">Your Ad Revenue Share</p>
          <p className="text-4xl font-bold text-primary">{currentTier.revenuePercent}%</p>
          <p className="text-text-secondary text-sm mt-1">
            Tier: <span className="text-text font-semibold">{currentTier.label}</span>
            {" "}&middot;{" "}
            <span className="text-text-muted">{formatViews(followerCount)} followers</span>
          </p>
        </div>

        {/* Tier system breakdown */}
        <div className="space-y-3 mb-5">
          {AD_TIERS.map((tier, idx) => {
            const isCurrent = tier === currentTier;
            const isReached = followerCount >= tier.minFollowers;
            return (
              <div
                key={idx}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                  isCurrent
                    ? "bg-primary/10 border-primary/30"
                    : isReached
                      ? "bg-bg-surface2 border-border"
                      : "bg-bg-surface2/50 border-border/50 opacity-60"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                  isCurrent ? "bg-primary/20" : "bg-bg-surface3"
                )}>
                  <span className={cn(
                    "text-sm font-bold",
                    isCurrent ? "text-primary" : "text-text-muted"
                  )}>{tier.revenuePercent}%</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-semibold", isCurrent ? "text-text" : "text-text-secondary")}>
                    {tier.label} Tier
                    {isCurrent && <span className="ml-2 text-[10px] font-bold uppercase tracking-wider bg-primary/20 text-primary px-2 py-0.5 rounded-full">Current</span>}
                  </p>
                  <p className="text-xs text-text-muted">
                    {tier.maxFollowers
                      ? `${formatViews(tier.minFollowers)} - ${formatViews(tier.maxFollowers)} followers`
                      : `${formatViews(tier.minFollowers)}+ followers`}
                    {tier.unlocksControls && " \u00B7 Ad controls unlocked"}
                  </p>
                </div>
                {isReached && (
                  <div className="shrink-0">
                    <div className="w-5 h-5 rounded-full bg-success/20 flex items-center justify-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-success" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Progress toward next tier */}
        {nextTier && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-muted">Progress to {nextTier.label} Tier ({nextTier.revenuePercent}%)</span>
              <span className="text-text-secondary font-medium">
                {formatViews(followerCount)} / {formatViews(nextTier.minFollowers)}
              </span>
            </div>
            <div className="h-2.5 bg-bg-surface2 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all"
                style={{ width: `${tierProgress}%` }}
              />
            </div>
            <p className="text-[11px] text-text-muted">
              {formatViews(nextTier.minFollowers - followerCount)} more followers to unlock {nextTier.revenuePercent}% revenue share
            </p>
          </div>
        )}
        {!nextTier && (
          <p className="text-sm text-success font-medium">
            You have reached the highest ad revenue tier!
          </p>
        )}
      </Card>

      {!isUnlocked ? (
        <Card padding="lg">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-bg-surface2 flex items-center justify-center mb-4">
              <Lock size={28} className="text-text-muted" />
            </div>
            <h3 className="text-lg font-semibold text-text mb-2">Ad Controls Locked</h3>
            <p className="text-sm text-text-muted max-w-md">
              Reach 10,000 followers to unlock ad controls and earn 50% ad revenue.
              You currently have{" "}
              <span className="text-text font-medium">{formatViews(followerCount)}</span> followers
              and earn <span className="text-text font-medium">{currentTier.revenuePercent}%</span> of ad revenue.
            </p>
          </div>
        </Card>
      ) : (
        <>
          {/* Pre-roll Ads */}
          <Card padding="lg">
            <div className="flex items-center gap-2 mb-4">
              <Tv size={20} className="text-primary" />
              <h3 className="text-lg font-semibold text-text">Video Ad Settings</h3>
            </div>
            <p className="text-xs text-text-muted mb-5">
              You have {formatViews(followerCount)} followers. Ad controls are unlocked.
              You earn <span className="text-primary font-semibold">{currentTier.revenuePercent}%</span> of all ad revenue.
            </p>

            <div className="space-y-5">
              {/* Pre-roll count */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">
                  Pre-roll Ads on Videos
                </label>
                <p className="text-xs text-text-muted">Ads shown before the video starts playing</p>
                <div className="flex gap-2 mt-2">
                  {[0, 1, 2, 3].map((n) => (
                    <button
                      key={n}
                      onClick={() => setPreRollAds(n)}
                      className={cn(
                        "px-4 py-2 rounded-lg text-sm font-medium transition-colors border",
                        preRollAds === n
                          ? "bg-primary text-white border-primary"
                          : "bg-bg-surface2 text-text-secondary border-border hover:border-primary"
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mid-roll count */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">
                  Mid-roll Ads on Videos (for videos &gt; 5 min)
                </label>
                <p className="text-xs text-text-muted">Ads inserted during longer videos</p>
                <div className="flex gap-2 mt-2">
                  {[0, 1, 2, 3].map((n) => (
                    <button
                      key={n}
                      onClick={() => setMidRollAds(n)}
                      className={cn(
                        "px-4 py-2 rounded-lg text-sm font-medium transition-colors border",
                        midRollAds === n
                          ? "bg-primary text-white border-primary"
                          : "bg-bg-surface2 text-text-secondary border-border hover:border-primary"
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Live Stream Ad Frequency */}
          <Card padding="lg">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={20} className="text-accent" />
              <h3 className="text-lg font-semibold text-text">Live Stream Ad Frequency</h3>
            </div>

            <div className="space-y-2">
              {[
                { id: "start_only", label: "One at start only" },
                { id: "every_15", label: "Every 15 minutes" },
                { id: "every_30", label: "Every 30 minutes" },
                { id: "every_60", label: "Every hour" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setLiveAdFrequency(opt.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors border text-left",
                    liveAdFrequency === opt.id
                      ? "bg-primary/10 text-text border-primary"
                      : "bg-bg-surface2 text-text-secondary border-border hover:border-primary"
                  )}
                >
                  <div
                    className={cn(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                      liveAdFrequency === opt.id ? "border-primary" : "border-border"
                    )}
                  >
                    {liveAdFrequency === opt.id && (
                      <div className="w-2 h-2 rounded-full bg-primary" />
                    )}
                  </div>
                  {opt.label}
                </button>
              ))}
            </div>
          </Card>

          {/* Credits to Skip Ads */}
          <Card padding="lg">
            <div className="flex items-center gap-2 mb-4">
              <Gift size={20} className="text-success" />
              <h3 className="text-lg font-semibold text-text">Credits to Skip Ad</h3>
            </div>

            <div className="space-y-4">
              <ToggleRow
                label="Enable Credits to Skip"
                description="Viewers can send credits to skip ads during your content"
                checked={donationSkipEnabled}
                onChange={setDonationSkipEnabled}
              />

              {donationSkipEnabled && (
                <div className="space-y-1.5 pl-1">
                  <label className="text-sm font-medium text-text-secondary">
                    Minimum Credits Amount
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { value: "50", label: "50 credits" },
                      { value: "100", label: "100 credits" },
                      { value: "200", label: "200 credits" },
                      { value: "500", label: "500 credits" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setDonationSkipAmount(opt.value)}
                        className={cn(
                          "px-4 py-2 rounded-lg text-sm font-medium transition-colors border flex items-center gap-1",
                          donationSkipAmount === opt.value
                            ? "bg-success/20 text-success border-success"
                            : "bg-bg-surface2 text-text-secondary border-border hover:border-success"
                        )}
                      >
                        <Gift size={14} />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Button variant="primary" size="lg" fullWidth onClick={saveAdSettings}>
            {adSaved ? "Settings Saved!" : "Save Ad Settings"}
          </Button>
        </>
      )}
    </div>
  );
}

/* ───────── Integrations Tab ───────── */
function IntegrationsTab() {
  const [streamlabsToken, setStreamlabsToken] = useState("");
  const [streamlabsMasked, setStreamlabsMasked] = useState<string | null>(null);
  const [streamlabsConnected, setStreamlabsConnected] = useState(false);

  const [obsHost, setObsHost] = useState("localhost");
  const [obsPort, setObsPort] = useState("4455");
  const [obsPassword, setObsPassword] = useState("");
  const [obsPasswordMasked, setObsPasswordMasked] = useState<string | null>(null);
  const [obsConnected, setObsConnected] = useState(false);

  // RTMP Stream Key (for OBS / Streamlabs to stream to Rally Live)
  const [rtmpStreamKey, setRtmpStreamKey] = useState("");
  const [rtmpUrl, setRtmpUrl] = useState("");
  const [keyVisible, setKeyVisible] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Load on mount
  useEffect(() => {
    api.creator.getIntegrations()
      .then((res: any) => {
        const i = res.integrations || {};
        setStreamlabsConnected(Boolean(i.streamlabsConnected));
        setStreamlabsMasked(i.streamlabsTokenMasked || null);
        setObsHost(i.obsHost || "localhost");
        setObsPort(String(i.obsPort || 4455));
        setObsConnected(Boolean(i.obsConnected));
        setObsPasswordMasked(i.obsPasswordMasked || null);
      })
      .catch(() => {});

    // Load RTMP stream key
    api.creator.getStreamKey()
      .then((res: any) => {
        if (res.streamKey) setRtmpStreamKey(res.streamKey);
        if (res.rtmpUrl) setRtmpUrl(res.rtmpUrl);
      })
      .catch(() => {});
  }, []);

  const handleRegenerateKey = async () => {
    setRegenerating(true);
    try {
      const res: any = await api.creator.regenerateStreamKey();
      if (res.streamKey) setRtmpStreamKey(res.streamKey);
      setKeyVisible(true);
    } catch {} finally { setRegenerating(false); }
  };

  const copyToClipboard = (text: string, setter: (v: boolean) => void) => {
    navigator.clipboard.writeText(text).then(() => {
      setter(true);
      setTimeout(() => setter(false), 2000);
    }).catch(() => {});
  };

  const saveIntegrations = async () => {
    setSaving(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        obsHost,
        obsPort: Number(obsPort) || 4455,
      };
      // Only send token/password if user typed a new one
      if (streamlabsToken) payload.streamlabsToken = streamlabsToken;
      if (obsPassword) payload.obsPassword = obsPassword;

      const res: any = await api.creator.updateIntegrations(payload);
      const i = res.integrations || {};
      setStreamlabsConnected(Boolean(i.streamlabsConnected));
      setStreamlabsMasked(i.streamlabsTokenMasked || null);
      setObsConnected(Boolean(i.obsConnected));
      setObsPasswordMasked(i.obsPasswordMasked || null);
      setStreamlabsToken("");
      setObsPassword("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Failed to save integrations");
    } finally {
      setSaving(false);
    }
  };

  const disconnectStreamlabs = async () => {
    setSaving(true);
    try {
      const res: any = await api.creator.updateIntegrations({ streamlabsToken: "" });
      const i = res.integrations || {};
      setStreamlabsConnected(false);
      setStreamlabsMasked(null);
      setStreamlabsToken("");
    } catch {} finally { setSaving(false); }
  };

  const disconnectObs = async () => {
    setSaving(true);
    try {
      const res: any = await api.creator.updateIntegrations({ obsPassword: "" });
      const i = res.integrations || {};
      setObsConnected(false);
      setObsPasswordMasked(null);
      setObsPassword("");
    } catch {} finally { setSaving(false); }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* RTMP Stream Key — for streaming to Rally Live from OBS / Streamlabs */}
      <Card padding="lg">
        <div className="flex items-center gap-2 mb-1">
          <Radio size={20} className="text-danger" />
          <h3 className="text-lg font-semibold text-text">Stream to Rally Live</h3>
        </div>
        <p className="text-xs text-text-muted mb-4">
          Use these settings in OBS Studio or Streamlabs to stream directly to Rally Live. Your stream will appear on the platform just like a browser-based stream.
        </p>

        <div className="space-y-3">
          {/* Server URL */}
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">Server URL</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 p-2.5 bg-bg-surface2 rounded-lg border border-border font-mono text-sm text-text">
                {rtmpUrl || "rtmp://rallylive.ca/live"}
              </div>
              <button
                onClick={() => copyToClipboard(rtmpUrl || "rtmp://rallylive.ca/live", setUrlCopied)}
                className="p-2.5 bg-bg-surface2 rounded-lg border border-border hover:border-primary transition-colors"
                title="Copy URL"
              >
                {urlCopied ? <Check size={16} className="text-success" /> : <Copy size={16} className="text-text-muted" />}
              </button>
            </div>
          </div>

          {/* Stream Key */}
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">Stream Key</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 p-2.5 bg-bg-surface2 rounded-lg border border-border font-mono text-sm text-text overflow-hidden">
                {rtmpStreamKey ? (
                  keyVisible ? rtmpStreamKey : "•".repeat(Math.min(rtmpStreamKey.length, 40))
                ) : (
                  <span className="text-text-muted">Loading...</span>
                )}
              </div>
              <button
                onClick={() => setKeyVisible(!keyVisible)}
                className="p-2.5 bg-bg-surface2 rounded-lg border border-border hover:border-primary transition-colors"
                title={keyVisible ? "Hide key" : "Show key"}
              >
                {keyVisible ? <EyeOff size={16} className="text-text-muted" /> : <Eye size={16} className="text-text-muted" />}
              </button>
              <button
                onClick={() => copyToClipboard(rtmpStreamKey, setKeyCopied)}
                className="p-2.5 bg-bg-surface2 rounded-lg border border-border hover:border-primary transition-colors"
                title="Copy key"
              >
                {keyCopied ? <Check size={16} className="text-success" /> : <Copy size={16} className="text-text-muted" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-[11px] text-text-muted">
              Never share your stream key. Anyone with it can stream to your channel.
            </p>
            <button
              onClick={handleRegenerateKey}
              disabled={regenerating}
              className="text-xs text-danger hover:text-danger/80 font-medium"
            >
              {regenerating ? "Regenerating..." : "Reset Key"}
            </button>
          </div>
        </div>

        {/* OBS Setup Instructions */}
        <div className="mt-4 p-3 bg-bg-surface2/50 rounded-lg border border-border/50">
          <p className="text-xs font-medium text-text-secondary mb-2">Quick Setup:</p>
          <ol className="text-[11px] text-text-muted space-y-1 list-decimal list-inside">
            <li>Open OBS Studio or Streamlabs → Settings → Stream</li>
            <li>Set Service to <span className="text-text font-medium">Custom</span></li>
            <li>Paste the <span className="text-text font-medium">Server URL</span> above</li>
            <li>Paste your <span className="text-text font-medium">Stream Key</span></li>
            <li>Click &quot;Start Streaming&quot; — you&apos;re live on Rally Live!</li>
          </ol>
        </div>
      </Card>

      {/* Streamlabs */}
      <Card padding="lg">
        <div className="flex items-center gap-2 mb-1">
          <Wifi size={20} className="text-[#80f5d2]" />
          <h3 className="text-lg font-semibold text-text">Streamlabs</h3>
          {streamlabsConnected && (
            <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-success bg-success/10 px-2 py-0.5 rounded-full border border-success/20">
              <Plug size={12} /> Connected
            </span>
          )}
        </div>
        <p className="text-xs text-text-muted mb-4">
          Connect your Streamlabs Socket API Token to trigger alerts, read donations, and overlay events on your Rally Live stream.
        </p>

        {streamlabsConnected && streamlabsMasked ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-bg-surface2 rounded-lg">
              <Key size={16} className="text-text-muted shrink-0" />
              <span className="text-sm text-text font-mono flex-1">{streamlabsMasked}</span>
              <button
                onClick={disconnectStreamlabs}
                disabled={saving}
                className="text-xs text-danger hover:text-danger/80 font-medium flex items-center gap-1"
              >
                <Unplug size={12} /> Disconnect
              </button>
            </div>
            <p className="text-xs text-text-muted">To update, enter a new token below and save.</p>
          </div>
        ) : null}

        <div className="mt-3">
          <Input
            label="Socket API Token"
            placeholder="eyJhbGciOiJIUz..."
            type="password"
            value={streamlabsToken}
            onChange={(e) => setStreamlabsToken(e.target.value)}
          />
          <p className="text-[11px] text-text-muted mt-1">
            Find this at streamlabs.com → Settings → API Settings → Socket API Token
          </p>
        </div>
      </Card>

      {/* OBS WebSocket */}
      <Card padding="lg">
        <div className="flex items-center gap-2 mb-1">
          <Monitor size={20} className="text-[#4c4c4c]" />
          <h3 className="text-lg font-semibold text-text">OBS WebSocket</h3>
          {obsConnected && (
            <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-success bg-success/10 px-2 py-0.5 rounded-full border border-success/20">
              <Plug size={12} /> Connected
            </span>
          )}
        </div>
        <p className="text-xs text-text-muted mb-4">
          Connect to OBS Studio via WebSocket to control scenes, sources, and streaming remotely from Rally Live.
        </p>

        {obsConnected && obsPasswordMasked ? (
          <div className="space-y-3 mb-4">
            <div className="flex items-center gap-3 p-3 bg-bg-surface2 rounded-lg">
              <Key size={16} className="text-text-muted shrink-0" />
              <span className="text-sm text-text font-mono flex-1">{obsPasswordMasked}</span>
              <button
                onClick={disconnectObs}
                disabled={saving}
                className="text-xs text-danger hover:text-danger/80 font-medium flex items-center gap-1"
              >
                <Unplug size={12} /> Disconnect
              </button>
            </div>
          </div>
        ) : null}

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Input
                label="Host"
                placeholder="localhost"
                value={obsHost}
                onChange={(e) => setObsHost(e.target.value)}
              />
            </div>
            <div>
              <Input
                label="Port"
                placeholder="4455"
                value={obsPort}
                onChange={(e) => setObsPort(e.target.value.replace(/\D/g, "").slice(0, 5))}
              />
            </div>
          </div>
          <Input
            label="Password"
            placeholder="Enter OBS WebSocket password"
            type="password"
            value={obsPassword}
            onChange={(e) => setObsPassword(e.target.value)}
          />
          <p className="text-[11px] text-text-muted">
            OBS → Tools → WebSocket Server Settings → Show Connect Info
          </p>
        </div>
      </Card>

      {error && (
        <div className="flex items-center gap-2 text-sm text-danger">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <Button
        variant="primary"
        size="lg"
        fullWidth
        disabled={saving}
        icon={saving ? <Loader2 size={18} className="animate-spin" /> : <Plug size={18} />}
        onClick={saveIntegrations}
      >
        {saved ? "Integrations Saved!" : saving ? "Saving..." : "Save Integrations"}
      </Button>
    </div>
  );
}

/* ───────── Toggle Row helper ───────── */
function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-text">{label}</p>
        <p className="text-xs text-text-muted">{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative w-11 h-6 rounded-full transition-colors shrink-0",
          checked ? "bg-primary" : "bg-bg-surface3"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
            checked && "translate-x-5"
          )}
        />
      </button>
    </div>
  );
}
