"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  ThumbsUp,
  ThumbsDown,
  Share2,
  Bookmark,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Heart,
  ToggleLeft,
  ToggleRight,
  MoreHorizontal,
  ShieldBan,
  Flag,
  MessageCircleOff,
  X,
  PanelRightClose,
  PanelRightOpen,
  Gift,
  Send,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import VideoPlayer from "@/components/video/VideoPlayer";
import PlaylistPanel from "@/components/video/PlaylistPanel";
import VideoCard from "@/components/video/VideoCard";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import Tabs from "@/components/ui/Tabs";
import Modal from "@/components/ui/Modal";
import GiftPanel from "@/components/credits/GiftPanel";
import { formatViews, formatTimeAgo, cn } from "@/lib/utils";
import type { DonationTier } from "@/lib/types";
import { DONATION_TIERS } from "@/lib/donation-tiers";

/* ───────── Types for API responses ───────── */
interface CreatorData {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  verifiedBadge: boolean;
  followerCount?: number;
}

interface VideoData {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  videoUrl?: string | null;
  durationSec: number;
  creatorId: string;
  views: number;
  impressions?: number;
  likes: number;
  dislikes: number;
  commentsCount: number;
  uploadDate: string;
  tags: string[];
  seriesId?: string | null;
  seriesOrder?: number | null;
  autoplayNextVideoId?: string | null;
  commentsEnabled?: boolean;
  creator: CreatorData;
  userLike?: string | null;
  resolutions?: Array<{ label: string; url: string; height: number }>;
}

interface CommentData {
  id: string;
  userId: string;
  videoId: string;
  text: string;
  likes: number;
  createdAt: string;
  userLiked?: boolean;
  user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    verifiedBadge: boolean;
  };
  replyCount?: number;
}

interface SeriesEpisodeData {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  durationSec: number;
  views: number;
  likes: number;
  seriesOrder: number | null;
  uploadDate: string;
}

interface SeriesData {
  id: string;
  title: string;
  description: string;
  coverUrl: string;
  creatorId: string;
  totalEpisodes: number;
  episodes: SeriesEpisodeData[];
  creator?: CreatorData;
}

function commentTimeAgo(dateStr: string): string {
  const ts = new Date(dateStr).getTime();
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return `${Math.floor(seconds / 604800)}w ago`;
}

export default function WatchPage() {
  const params = useParams();
  const router = useRouter();
  const videoId = params.id as string;
  const { currentUser } = useAuthStore();

  /* ── Data state ── */
  const [video, setVideo] = useState<VideoData | null>(null);
  const [series, setSeries] = useState<SeriesData | null>(null);
  const [comments, setComments] = useState<CommentData[]>([]);
  const [relatedVideos, setRelatedVideos] = useState<VideoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  /* ── Fetch video data ── */
  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setNotFound(false);

      try {
        // Fetch video
        const videoRes = await api.videos.get(videoId) as { video: VideoData };
        if (cancelled) return;
        const videoData = videoRes.video;
        setVideo(videoData);

        // Fetch comments
        api.videos.comments(videoId).then((res: any) => {
          if (!cancelled) setComments(res.comments || []);
        }).catch(() => {});

        // Fetch related videos
        api.videos.list({ limit: "12" }).then((res: any) => {
          if (!cancelled) {
            const vids = (res.videos || []).filter((v: VideoData) => v.id !== videoId);
            setRelatedVideos(vids);
          }
        }).catch(() => {});

        // Fetch series if video belongs to one
        if (videoData.seriesId) {
          api.series.get(videoData.seriesId).then((res: any) => {
            if (!cancelled) setSeries(res.series || null);
          }).catch(() => {});
        } else {
          setSeries(null);
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [videoId]);

  const creator = video?.creator ?? null;

  /* ── Series videos mapped for PlaylistPanel ── */
  const seriesVideos = useMemo(() => {
    if (!series?.episodes) return [];
    return series.episodes.map((ep) => ({
      id: ep.id,
      title: ep.title,
      description: ep.description,
      thumbnailUrl: ep.thumbnailUrl,
      durationSec: ep.durationSec,
      creatorId: series.creatorId,
      views: ep.views,
      likes: ep.likes,
      dislikes: 0,
      commentsCount: 0,
      uploadDate: ep.uploadDate,
      tags: [] as string[],
      seriesId: series.id,
      seriesOrder: ep.seriesOrder ?? undefined,
    }));
  }, [series]);

  /* ── Series data mapped for PlaylistPanel component ── */
  const seriesForPanel = useMemo(() => {
    if (!series) return null;
    return {
      id: series.id,
      title: series.title,
      description: series.description,
      coverUrl: series.coverUrl,
      creatorId: series.creatorId,
      totalEpisodes: series.totalEpisodes,
      episodes: series.episodes.map((ep, idx) => ({
        videoId: ep.id,
        order: ep.seriesOrder ?? idx + 1,
      })),
    };
  }, [series]);

  /* ── Recommended / Up Next (non-series) ── */
  const upNextVideos = useMemo(() => {
    if (series) return [];
    return relatedVideos.slice(0, 6);
  }, [relatedVideos, series]);

  /* ── Local state ── */
  const [autoplayEnabled, setAutoplayEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        return JSON.parse(localStorage.getItem("rally-autoplay") ?? "true");
      } catch {
        return true;
      }
    }
    return true;
  });
  const [autoplayCountdown, setAutoplayCountdown] = useState<number | null>(null);
  const [autoplayNextVideo, setAutoplayNextVideo] = useState<VideoData | null>(null);
  const autoplayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [following, setFollowing] = useState(false);
  const [activeTab, setActiveTab] = useState(series ? "episodes" : "comments");
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [creatorMenuOpen, setCreatorMenuOpen] = useState(false);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [donateModalOpen, setDonateModalOpen] = useState(false);
  const [donating, setDonating] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const creatorMenuRef = useRef<HTMLDivElement>(null);
  const relatedScrollRef = useRef<HTMLDivElement>(null);

  /* ── Share handler ── */
  const handleShare = useCallback(async () => {
    const shareUrl = window.location.href;
    const shareTitle = video?.title || "Check out this video on Rally Live";

    // Use native Web Share API if available (mobile browsers, some desktop)
    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareTitle,
          url: shareUrl,
        });
        return;
      } catch (err: unknown) {
        // User cancelled or share failed — fall through to modal
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }

    // Desktop fallback: show share modal with platform options
    setShareModalOpen(true);
  }, [video?.title]);

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const shareTitle = video?.title || "Check out this video on Rally Live";
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedTitle = encodeURIComponent(shareTitle);

  const sharePlatforms = [
    { name: "X (Twitter)", icon: "𝕏", url: `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`, color: "bg-black text-white" },
    { name: "Facebook", icon: "f", url: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`, color: "bg-[#1877F2] text-white" },
    { name: "WhatsApp", icon: "💬", url: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`, color: "bg-[#25D366] text-white" },
    { name: "Telegram", icon: "✈", url: `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`, color: "bg-[#0088cc] text-white" },
    { name: "Reddit", icon: "r", url: `https://reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`, color: "bg-[#FF4500] text-white" },
    { name: "Email", icon: "✉", url: `mailto:?subject=${encodedTitle}&body=${encodedTitle}%0A${encodedUrl}`, color: "bg-gray-600 text-white" },
  ];


  /* ── Sync liked/disliked from API response ── */
  useEffect(() => {
    if (video?.userLike === "like") {
      setLiked(true);
      setDisliked(false);
    } else if (video?.userLike === "dislike") {
      setLiked(false);
      setDisliked(true);
    } else {
      setLiked(false);
      setDisliked(false);
    }
  }, [video?.userLike]);

  /* ── Sync commentsEnabled from API response ── */
  useEffect(() => {
    if (video?.commentsEnabled !== undefined) {
      setCommentsEnabled(video.commentsEnabled);
    }
  }, [video?.commentsEnabled]);

  /* ── Persist autoplay to localStorage ── */
  useEffect(() => {
    try {
      localStorage.setItem("rally-autoplay", JSON.stringify(autoplayEnabled));
    } catch {}
  }, [autoplayEnabled]);

  /* ── Initialize saved/bookmark state from localStorage ── */
  useEffect(() => {
    try {
      const bookmarks: string[] = JSON.parse(localStorage.getItem("rally-bookmarks") ?? "[]");
      setSaved(bookmarks.includes(videoId));
    } catch {}
  }, [videoId]);

  /* ── Update active tab when series loads ── */
  useEffect(() => {
    if (series) {
      setActiveTab("episodes");
    } else {
      setActiveTab("comments");
    }
  }, [series]);

  /* ── Like/Dislike handlers ── */
  const handleLike = useCallback(async () => {
    if (!currentUser) {
      useUIStore.getState().addToast("Please log in to like videos.", "error");
      return;
    }
    // Optimistic update
    const wasLiked = liked;
    setLiked((prev) => !prev);
    setDisliked(false);
    try {
      const res = await api.videos.like(videoId, true) as { action: string; likes: number; dislikes: number };
      setVideo((prev) => prev ? { ...prev, likes: res.likes, dislikes: res.dislikes } : prev);
      if (res.action === "liked") {
        setLiked(true);
        setDisliked(false);
      } else if (res.action === "removed") {
        setLiked(false);
      } else if (res.action === "disliked") {
        setLiked(false);
        setDisliked(true);
      }
    } catch {
      // Revert on error
      setLiked(wasLiked);
    }
  }, [currentUser, liked, videoId]);

  const handleDislike = useCallback(async () => {
    if (!currentUser) {
      useUIStore.getState().addToast("Please log in to dislike videos.", "error");
      return;
    }
    const wasDisliked = disliked;
    setDisliked((prev) => !prev);
    setLiked(false);
    try {
      const res = await api.videos.like(videoId, false) as { action: string; likes: number; dislikes: number };
      setVideo((prev) => prev ? { ...prev, likes: res.likes, dislikes: res.dislikes } : prev);
      if (res.action === "disliked") {
        setDisliked(true);
        setLiked(false);
      } else if (res.action === "removed") {
        setDisliked(false);
      } else if (res.action === "liked") {
        setDisliked(false);
        setLiked(true);
      }
    } catch {
      setDisliked(wasDisliked);
    }
  }, [currentUser, disliked, videoId]);

  /* ── Donate handler ── */
  const handleDonate = useCallback(async (tier: DonationTier) => {
    if (!currentUser) {
      useUIStore.getState().addToast("Please log in to send a gift.", "error");
      return;
    }
    if (donating) return;
    setDonating(true);
    try {
      const credits = Math.round(tier.valueCents);
      const res = await api.videos.donate(videoId, credits) as { message: string; creditsRemaining: number };
      useUIStore.getState().addToast(
        `${tier.iconKey} Sent ${tier.name} (${credits} credits) to ${creator?.displayName}! Balance: ${res.creditsRemaining}`,
        "success"
      );
      setDonateModalOpen(false);
    } catch (err: any) {
      useUIStore.getState().addToast(err.message || "Failed to send gift", "error");
    } finally {
      setDonating(false);
    }
  }, [currentUser, donating, videoId, creator?.displayName]);

  /* ── Follow/Unfollow handler ── */
  const handleFollow = useCallback(async () => {
    if (!currentUser) {
      useUIStore.getState().addToast("Please log in to follow creators.", "error");
      return;
    }
    if (!creator) return;
    const wasFollowing = following;
    setFollowing((p) => !p);
    try {
      if (wasFollowing) {
        await api.users.unfollow(creator.id);
      } else {
        await api.users.follow(creator.id);
      }
    } catch (err: any) {
      setFollowing(wasFollowing);
      // 409 = already following/not following, treat as success
      if (!err.message?.includes("already") && !err.message?.includes("not following")) {
        useUIStore.getState().addToast(err.message || "Failed to update follow status", "error");
      }
    }
  }, [currentUser, creator, following]);

  /* ── Comment like handler ── */
  const handleCommentLike = useCallback(async (commentId: string) => {
    if (!currentUser) return;
    // Optimistic update
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? { ...c, userLiked: !c.userLiked, likes: c.likes + (c.userLiked ? -1 : 1) }
          : c
      )
    );
    try {
      await api.videos.likeComment(videoId, commentId);
    } catch {
      // Revert on failure
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, userLiked: !c.userLiked, likes: c.likes + (c.userLiked ? -1 : 1) }
            : c
        )
      );
    }
  }, [currentUser, videoId]);

  /* ── Block handler ── */
  const handleBlock = useCallback(async () => {
    if (!currentUser || !creator) return;
    try {
      await api.users.block(creator.id);
      setBlockModalOpen(false);
      setFollowing(false);
      useUIStore.getState().addToast(`${creator.displayName} has been blocked.`, "success");
    } catch (err: any) {
      useUIStore.getState().addToast(err.message || "Failed to block user", "error");
    }
  }, [currentUser, creator]);

  /* ── Report handler ── */
  const handleReport = useCallback(async () => {
    if (!currentUser) {
      useUIStore.getState().addToast("Please log in to report.", "error");
      return;
    }
    if (!creator) return;
    try {
      await api.reports.create({
        reportedId: creator.id,
        reason: "Inappropriate content",
        type: "VIDEO",
        contentId: videoId,
      });
      useUIStore.getState().addToast("Report submitted. Thank you.", "success");
    } catch (err: any) {
      useUIStore.getState().addToast(err.message || "Failed to submit report", "error");
    }
  }, [currentUser, creator, videoId]);

  /* ── Comment submit handler ── */
  const handleCommentSubmit = useCallback(async () => {
    if (!currentUser) {
      useUIStore.getState().addToast("Please log in to comment.", "error");
      return;
    }
    const text = commentText.trim();
    if (!text || submittingComment) return;
    setSubmittingComment(true);
    try {
      const res = await api.videos.addComment(videoId, text) as { comment: CommentData };
      setComments((prev) => [res.comment, ...prev]);
      setCommentText("");
      setVideo((prev) => prev ? { ...prev, commentsCount: prev.commentsCount + 1 } : prev);
    } catch (err: any) {
      useUIStore.getState().addToast(err.message || "Failed to post comment", "error");
    } finally {
      setSubmittingComment(false);
    }
  }, [currentUser, commentText, submittingComment, videoId]);

  /* ── Close creator menu on outside click ── */
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (creatorMenuRef.current && !creatorMenuRef.current.contains(e.target as Node)) {
        setCreatorMenuOpen(false);
      }
    }
    if (creatorMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [creatorMenuOpen]);

  /* ── Autoplay handler with countdown ── */
  const navigateToVideo = useCallback((v: VideoData) => {
    const creatorUsername = v.creator?.username;
    if (creatorUsername) {
      router.push(`/@${creatorUsername}/${v.id}`);
    } else {
      router.push(`/watch/${v.id}`);
    }
  }, [router]);

  const cancelAutoplay = useCallback(() => {
    if (autoplayTimerRef.current) {
      clearInterval(autoplayTimerRef.current);
      autoplayTimerRef.current = null;
    }
    setAutoplayCountdown(null);
    setAutoplayNextVideo(null);
  }, []);

  const handleVideoEnded = useCallback(() => {
    if (!autoplayEnabled) return;

    // Find the next video
    let nextVid: VideoData | null = null;
    if (video?.autoplayNextVideoId) {
      // Look for it in related videos first
      nextVid = relatedVideos.find((v) => v.id === video.autoplayNextVideoId) || null;
      // If not found in related, create a minimal object so we can navigate
      if (!nextVid) {
        nextVid = {
          id: video.autoplayNextVideoId,
          title: "Next Video",
          thumbnailUrl: "",
          videoUrl: null,
          description: "",
          durationSec: 0,
          creatorId: video.creatorId,
          views: 0,
          likes: 0,
          dislikes: 0,
          commentsCount: 0,
          uploadDate: "",
          tags: [],
          creator: video.creator,
        };
      }
    } else if (relatedVideos.length > 0) {
      nextVid = relatedVideos[0];
    }

    if (!nextVid) return;

    // Start 10 second countdown
    setAutoplayNextVideo(nextVid);
    setAutoplayCountdown(10);

    const nextVideo = nextVid;
    autoplayTimerRef.current = setInterval(() => {
      setAutoplayCountdown((prev) => {
        if (prev === null || prev <= 1) {
          if (autoplayTimerRef.current) {
            clearInterval(autoplayTimerRef.current);
            autoplayTimerRef.current = null;
          }
          navigateToVideo(nextVideo);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, [video, autoplayEnabled, relatedVideos, navigateToVideo]);

  // Clean up timer on unmount or video change
  useEffect(() => {
    return () => {
      if (autoplayTimerRef.current) {
        clearInterval(autoplayTimerRef.current);
        autoplayTimerRef.current = null;
      }
    };
  }, [videoId]);

  /* ── Series episode select ── */
  const handleEpisodeSelect = useCallback(
    (id: string) => {
      const creatorUsername = video?.creator?.username;
      if (creatorUsername) {
        router.push(`/@${creatorUsername}/${id}`);
      } else {
        router.push(`/watch/${id}`);
      }
    },
    [router, video]
  );

  const scrollRelated = useCallback((direction: "left" | "right") => {
    if (!relatedScrollRef.current) return;
    const scrollAmount = 320;
    relatedScrollRef.current.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  }, []);

  /* ─────── Loading State ─────── */
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-text-muted">Loading video...</p>
        </div>
      </div>
    );
  }

  /* ─────── Not Found ─────── */
  if (notFound || !video || !creator) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-20 h-20 rounded-full bg-bg-surface2 flex items-center justify-center mb-6">
          <MessageSquare className="w-8 h-8 text-text-muted" />
        </div>
        <h1 className="text-2xl font-bold text-text mb-2">Video not found</h1>
        <p className="text-text-muted mb-6 max-w-md">
          The video you are looking for does not exist or may have been removed.
        </p>
        <Button variant="primary" onClick={() => router.push("/home")}>
          Back to Home
        </Button>
      </div>
    );
  }

  /* ── Computed like/dislike values ── */
  const currentLikes = video.likes;
  const currentDislikes = video.dislikes;
  const totalReactions = currentLikes + currentDislikes;
  const likeRatio = totalReactions > 0 ? (currentLikes / totalReactions) * 100 : 50;

  /* ─────── Mobile Tab Config ─────── */
  const mobileTabs = [
    ...(series ? [{ id: "episodes", label: "Episodes" }] : []),
    { id: "comments", label: "Comments" },
    { id: "more", label: "More" },
  ];

  /* ─────── Shared sub-components ─────── */

  const HorizontalActionButtons = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant={liked ? "primary" : "secondary"}
          size="sm"
          icon={<ThumbsUp className={`w-4 h-4 ${liked ? "fill-current" : ""}`} />}
          onClick={handleLike}
        >
          {formatViews(currentLikes)}
        </Button>
        <Button
          variant={disliked ? "danger" : "secondary"}
          size="sm"
          icon={<ThumbsDown className={`w-4 h-4 ${disliked ? "fill-current" : ""}`} />}
          onClick={handleDislike}
        >
          {formatViews(currentDislikes)}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={<Share2 className="w-4 h-4" />}
          onClick={handleShare}
        >
          Share
        </Button>
        <Button
          variant={saved ? "primary" : "secondary"}
          size="sm"
          icon={<Bookmark className="w-4 h-4" />}
          onClick={() => {
            setSaved((prev) => {
              const next = !prev;
              try {
                const bookmarks: string[] = JSON.parse(localStorage.getItem("rally-bookmarks") ?? "[]");
                if (next) {
                  if (!bookmarks.includes(videoId)) bookmarks.push(videoId);
                } else {
                  const idx = bookmarks.indexOf(videoId);
                  if (idx !== -1) bookmarks.splice(idx, 1);
                }
                localStorage.setItem("rally-bookmarks", JSON.stringify(bookmarks));
              } catch {}
              return next;
            });
          }}
        >
          {saved ? "Saved" : "Save"}
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 bg-bg-surface2 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${likeRatio}%`,
              background: `linear-gradient(90deg, var(--color-primary) 0%, var(--color-primary) ${likeRatio > 90 ? '100%' : '85%'}, var(--color-danger) 100%)`,
            }}
          />
        </div>
        <span className="text-[10px] text-text-muted whitespace-nowrap">
          {likeRatio.toFixed(0)}% liked
        </span>
      </div>
    </div>
  );

  /* ── Right panel action buttons (horizontal row for sidebar) ── */
  const SidebarActionButtons = (
    <div className="flex flex-col gap-2 p-4 bg-bg-surface border border-border rounded-xl mb-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={handleLike}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
            liked
              ? "bg-primary/15 text-primary"
              : "bg-bg-surface2 text-text-secondary hover:text-text hover:bg-bg-surface3"
          )}
        >
          <ThumbsUp className={cn("w-4 h-4", liked && "fill-current")} />
          <span className="text-xs">{formatViews(currentLikes)}</span>
        </button>
        <button
          onClick={handleDislike}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
            disliked
              ? "bg-danger/15 text-danger"
              : "bg-bg-surface2 text-text-secondary hover:text-text hover:bg-bg-surface3"
          )}
        >
          <ThumbsDown className={cn("w-4 h-4", disliked && "fill-current")} />
          <span className="text-xs">{formatViews(currentDislikes)}</span>
        </button>
        <button
          onClick={handleShare}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-bg-surface2 text-text-secondary hover:text-text hover:bg-bg-surface3 transition-colors"
        >
          <Share2 className="w-4 h-4" />
          <span className="text-xs">Share</span>
        </button>
        <button
          onClick={() => {
            setSaved((prev) => {
              const next = !prev;
              try {
                const bookmarks: string[] = JSON.parse(localStorage.getItem("rally-bookmarks") ?? "[]");
                if (next) {
                  if (!bookmarks.includes(videoId)) bookmarks.push(videoId);
                } else {
                  const idx = bookmarks.indexOf(videoId);
                  if (idx !== -1) bookmarks.splice(idx, 1);
                }
                localStorage.setItem("rally-bookmarks", JSON.stringify(bookmarks));
              } catch {}
              return next;
            });
          }}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
            saved
              ? "bg-primary/15 text-primary"
              : "bg-bg-surface2 text-text-secondary hover:text-text hover:bg-bg-surface3"
          )}
        >
          <Bookmark className={cn("w-4 h-4", saved && "fill-current")} />
          <span className="text-xs">{saved ? "Saved" : "Save"}</span>
        </button>
      </div>
      {/* Like ratio bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 bg-bg-surface2 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${likeRatio}%`,
              background: `linear-gradient(90deg, var(--color-primary) 0%, var(--color-primary) ${likeRatio > 90 ? '100%' : '85%'}, var(--color-danger) 100%)`,
            }}
          />
        </div>
        <span className="text-[10px] text-text-muted whitespace-nowrap">
          {likeRatio.toFixed(0)}% liked
        </span>
      </div>
    </div>
  );

  const CreatorRow = (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3">
        <Link href={`/profile/${creator.username}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <Avatar
            src={creator.avatarUrl}
            name={creator.displayName}
            size="lg"
            verified={creator.verifiedBadge}
          />
          <div>
            <p className="text-sm font-semibold text-text">
              {creator.displayName}
            </p>
            <p className="text-xs text-text-muted">
              {creator.followerCount ? formatViews(creator.followerCount) : "0"} followers
            </p>
          </div>
        </Link>

        {/* "..." menu for Block / Report */}
        <div className="relative" ref={creatorMenuRef}>
          <button
            onClick={() => setCreatorMenuOpen((p) => !p)}
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-bg-surface2 transition-colors"
            aria-label="More options"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
          {creatorMenuOpen && (
            <div className="absolute top-full left-0 mt-1 z-50 w-44 bg-bg-surface border border-border rounded-xl shadow-lg py-1 animate-[scaleIn_150ms_ease-out]">
              <button
                onClick={() => {
                  setCreatorMenuOpen(false);
                  setBlockModalOpen(true);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-danger hover:bg-bg-surface2 transition-colors"
              >
                <ShieldBan className="w-4 h-4" />
                Block User
              </button>
              <button
                onClick={() => {
                  setCreatorMenuOpen(false);
                  handleReport();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-text-secondary hover:bg-bg-surface2 transition-colors"
              >
                <Flag className="w-4 h-4" />
                Report
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant={following ? "secondary" : "gradient"}
          size="sm"
          onClick={handleFollow}
        >
          {following ? "Following" : "Follow"}
        </Button>
        <button
          onClick={() => setDonateModalOpen(true)}
          className="
            inline-flex items-center gap-1.5 px-4 py-2
            bg-gradient-to-r from-primary to-accent text-white
            font-semibold text-xs rounded-xl
            hover:opacity-90 active:scale-[0.97]
            transition-all duration-200
            shadow-[var(--shadow-glow)]
          "
        >
          <Gift size={14} />
          Donate
        </button>
      </div>
    </div>
  );

  const DescriptionBlock = (
    <div className="mt-4 p-4 bg-bg-surface2 rounded-xl">
      <div className="flex items-center gap-3 text-xs text-text-secondary mb-2">
        <span>{formatViews(video.impressions ?? video.views)} impression views</span>
        <span>{formatTimeAgo(video.uploadDate)}</span>
      </div>
      <p
        className={`text-sm text-text-secondary leading-relaxed ${
          showFullDescription ? "" : "line-clamp-3"
        }`}
      >
        {video.description}
      </p>
      {video.description.length > 100 && (
        <button
          onClick={() => setShowFullDescription((p) => !p)}
          className="flex items-center gap-1 mt-2 text-xs text-text-muted hover:text-text transition-colors"
        >
          {showFullDescription ? (
            <>
              Show less <ChevronUp className="w-3.5 h-3.5" />
            </>
          ) : (
            <>
              Show more <ChevronDown className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      )}
      {video.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {video.tags.map((tag) => (
            <Link
              key={tag}
              href={`/search?q=%23${encodeURIComponent(tag)}`}
              className="text-[11px] text-primary bg-primary/10 px-2 py-0.5 rounded-full hover:bg-primary/20 transition-colors"
            >
              #{tag}
            </Link>
          ))}
        </div>
      )}
    </div>
  );

  const CommentsSection = (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-text">Comments</h3>
          <span className="text-xs text-text-muted">
            {video.commentsCount}
          </span>
        </div>
        {/* Comment toggle (creator control) */}
        {video.creatorId === currentUser?.id && (
          <button
            onClick={async () => {
              const newVal = !commentsEnabled;
              setCommentsEnabled(newVal);
              try {
                await api.videos.update(videoId, { commentsEnabled: newVal });
                setVideo((prev) => prev ? { ...prev, commentsEnabled: newVal } : prev);
              } catch {
                setCommentsEnabled(!newVal);
                useUIStore.getState().addToast("Failed to update comment settings", "error");
              }
            }}
            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text transition-colors"
            title={commentsEnabled ? "Turn off comments" : "Turn on comments"}
          >
            <span className="text-text-muted">{commentsEnabled ? "On" : "Off"}</span>
            {commentsEnabled ? (
              <ToggleRight className="w-7 h-7 text-primary" />
            ) : (
              <ToggleLeft className="w-7 h-7 text-text-muted" />
            )}
          </button>
        )}
      </div>

      {!commentsEnabled ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <MessageCircleOff className="w-10 h-10 text-text-muted mb-3" />
          <p className="text-sm font-medium text-text-secondary">Comments are turned off</p>
          <p className="text-xs text-text-muted mt-1">The creator has disabled comments for this video.</p>
        </div>
      ) : (
        <>
          {/* Comment input */}
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
            <Avatar
              src={currentUser?.avatarUrl ?? null}
              name={currentUser?.displayName || "You"}
              size="sm"
            />
            <div className="flex-1 flex items-center gap-2">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCommentSubmit(); }}
                placeholder="Add a comment..."
                className="flex-1 bg-bg-surface2 rounded-lg px-4 py-2.5 text-sm text-text placeholder:text-text-muted outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={handleCommentSubmit}
                disabled={!commentText.trim() || submittingComment}
                className="p-2 rounded-lg text-primary hover:bg-primary/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Comment list */}
          <div className="space-y-5">
            {comments.map((comment) => {
              const commentUser = comment.user;
              if (!commentUser) return null;
              return (
                <div key={comment.id} className="flex gap-3">
                  <Avatar
                    src={commentUser.avatarUrl}
                    name={commentUser.displayName}
                    size="sm"
                    verified={commentUser.verifiedBadge}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-text">
                        {commentUser.displayName}
                      </span>
                      <span className="text-[10px] text-text-muted">
                        {commentTimeAgo(comment.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm text-text-secondary mt-0.5 leading-relaxed">
                      {comment.text}
                    </p>
                    <button
                      onClick={() => handleCommentLike(comment.id)}
                      className={`flex items-center gap-1.5 mt-1.5 text-xs transition-colors ${
                        comment.userLiked ? "text-danger" : "text-text-muted hover:text-danger"
                      }`}
                      title="Like comment"
                    >
                      <Heart className={`w-3 h-3 ${comment.userLiked ? "fill-current" : ""}`} />
                      {comment.likes}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );

  const AutoplayToggle = (
    <div className="flex items-center justify-between mb-3">
      <span className="text-xs text-text-secondary">Autoplay</span>
      <button
        onClick={() => setAutoplayEnabled((p: boolean) => !p)}
        className="text-text-secondary hover:text-text transition-colors"
        aria-label="Toggle autoplay"
      >
        {autoplayEnabled ? (
          <ToggleRight className="w-8 h-8 text-primary" />
        ) : (
          <ToggleLeft className="w-8 h-8" />
        )}
      </button>
    </div>
  );

  /* ── Autoplay Countdown Overlay ── */
  const AutoplayOverlay = autoplayCountdown !== null && autoplayNextVideo ? (
    <div className="absolute inset-0 z-20 bg-black/80 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 max-w-xs text-center px-4">
        {autoplayNextVideo.thumbnailUrl && (
          <img
            src={autoplayNextVideo.thumbnailUrl}
            alt={autoplayNextVideo.title}
            className="w-48 h-28 object-cover rounded-lg"
          />
        )}
        <div>
          <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Up Next</p>
          <p className="text-sm font-semibold text-text line-clamp-2">{autoplayNextVideo.title}</p>
          {autoplayNextVideo.creator?.displayName && (
            <p className="text-xs text-text-secondary mt-0.5">{autoplayNextVideo.creator.displayName}</p>
          )}
        </div>
        <div className="relative w-16 h-16">
          <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" className="text-bg-surface2" strokeWidth="3" />
            <circle
              cx="32" cy="32" r="28" fill="none" stroke="currentColor" className="text-primary"
              strokeWidth="3" strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 28}`}
              strokeDashoffset={`${2 * Math.PI * 28 * (1 - autoplayCountdown / 10)}`}
              style={{ transition: "stroke-dashoffset 1s linear" }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-text">
            {autoplayCountdown}
          </span>
        </div>
        <div className="flex gap-3">
          <button
            onClick={cancelAutoplay}
            className="px-4 py-2 rounded-lg bg-bg-surface2 text-text-secondary text-sm font-medium hover:bg-bg-surface3 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              cancelAutoplay();
              navigateToVideo(autoplayNextVideo);
            }}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/80 transition-colors"
          >
            Play Now
          </button>
        </div>
      </div>
    </div>
  ) : null;

  /* ── Related Videos horizontal scroll bar ── */
  const RelatedVideosBar = (
    <div className="relative group/related">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text">You may also like</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => scrollRelated("left")}
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-bg-surface2 transition-colors"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scrollRelated("right")}
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-bg-surface2 transition-colors"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div
        ref={relatedScrollRef}
        className="flex gap-4 overflow-x-auto scrollbar-hide pb-2 snap-x snap-mandatory"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {relatedVideos.map((v) => {
          const c = v.creator;
          if (!c) return null;
          return (
            <div key={v.id} className="w-[240px] shrink-0 snap-start">
              <VideoCard video={v} creator={c as any} />
            </div>
          );
        })}
      </div>
    </div>
  );

  /* ═══════════════════════════════════════════
     ──────── RENDER ────────
     ═══════════════════════════════════════════ */

  return (
    <div className="min-h-screen pb-20">
      {/* ══════════ DESKTOP LAYOUT ══════════ */}
      <div className="hidden md:block">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
          {/* ── Top row: Video + Right Panel ── */}
          <div className="flex gap-6 mt-2">
            {/* ── LEFT: Video + title + description ── */}
            <div className="flex-1 min-w-0">
              {/* Player */}
              <div className="relative rounded-xl overflow-hidden">
                <VideoPlayer
                  thumbnailUrl={video.thumbnailUrl}
                  videoUrl={video.videoUrl}
                  videoId={videoId}
                  durationSec={video.durationSec}
                  onEnded={handleVideoEnded}
                  autoplay={false}
                  resolutions={video.resolutions}
                />
                {AutoplayOverlay}
              </div>

              {/* Title + description (no vote buttons here anymore) */}
              <div className="mt-4">
                <h1 className="text-xl font-bold text-text leading-snug">
                  {video.title}
                </h1>
                <div className="flex items-center gap-3 text-xs text-text-muted mt-1">
                  <span>{formatViews(video.impressions ?? video.views)} impression views</span>
                  <span>{formatTimeAgo(video.uploadDate)}</span>
                </div>

                {/* Description */}
                {DescriptionBlock}
              </div>
            </div>

            {/* ── RIGHT: Collapsible Panel ── */}
            <div
              className={cn(
                "shrink-0 flex flex-col min-h-0 transition-all duration-300 ease-in-out",
                panelCollapsed ? "w-[64px]" : "w-[340px] xl:w-[380px]"
              )}
            >
              {/* Collapse/Expand toggle */}
              <div className={cn(
                "flex items-center mb-3",
                panelCollapsed ? "justify-center" : "justify-end"
              )}>
                <button
                  onClick={() => setPanelCollapsed((p) => !p)}
                  className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-bg-surface2 transition-colors"
                  aria-label={panelCollapsed ? "Expand panel" : "Collapse panel"}
                  title={panelCollapsed ? "Expand panel" : "Collapse panel"}
                >
                  {panelCollapsed ? (
                    <PanelRightOpen className="w-5 h-5" />
                  ) : (
                    <PanelRightClose className="w-5 h-5" />
                  )}
                </button>
              </div>

              {panelCollapsed ? (
                /* ── Collapsed state: avatar + name + follow ── */
                <div className="flex flex-col items-center gap-3 p-2 bg-bg-surface border border-border rounded-xl">
                  <Link href={`/profile/${creator.username}`} className="hover:opacity-80 transition-opacity">
                    <Avatar
                      src={creator.avatarUrl}
                      name={creator.displayName}
                      size="md"
                      verified={creator.verifiedBadge}
                    />
                  </Link>
                  <span
                    className="text-[11px] font-semibold text-text text-center leading-tight max-w-[56px] truncate"
                    title={creator.displayName}
                  >
                    {creator.displayName}
                  </span>
                  <button
                    onClick={handleFollow}
                    className={cn(
                      "text-[10px] font-medium px-2 py-1 rounded-lg transition-colors",
                      following
                        ? "bg-bg-surface2 text-text-secondary"
                        : "bg-primary text-white"
                    )}
                  >
                    {following ? "Following" : "Follow"}
                  </button>
                  <button
                    onClick={() => setDonateModalOpen(true)}
                    className="text-[10px] font-medium px-2 py-1 rounded-lg bg-gradient-to-r from-primary to-accent text-white hover:opacity-90 transition-all"
                    title="Send Gift"
                  >
                    <Gift size={12} />
                  </button>
                </div>
              ) : (
                /* ── Expanded state: full panel ── */
                <>
                  {/* Creator info */}
                  <div className="p-4 bg-bg-surface border border-border rounded-xl mb-4">
                    {CreatorRow}
                  </div>

                  {/* Like/Dislike/Share/Save buttons */}
                  {SidebarActionButtons}

                  {/* Autoplay toggle */}
                  {AutoplayToggle}

                  {/* Comments sidebar */}
                  <div className="flex-1 min-h-0 bg-bg-surface border border-border rounded-xl flex flex-col">
                    <div className="p-4 border-b border-border shrink-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="w-4 h-4 text-text-muted" />
                          <h3 className="text-sm font-semibold text-text">Comments</h3>
                          <span className="text-xs text-text-muted">{video.commentsCount}</span>
                        </div>
                        {video.creatorId === currentUser?.id && (
                          <button
                            onClick={async () => {
                              const newVal = !commentsEnabled;
                              setCommentsEnabled(newVal);
                              try {
                                await api.videos.update(videoId, { commentsEnabled: newVal });
                                setVideo((prev) => prev ? { ...prev, commentsEnabled: newVal } : prev);
                              } catch {
                                setCommentsEnabled(!newVal);
                                useUIStore.getState().addToast("Failed to update comment settings", "error");
                              }
                            }}
                            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text transition-colors"
                            title={commentsEnabled ? "Turn off comments" : "Turn on comments"}
                          >
                            <span className="text-text-muted">{commentsEnabled ? "On" : "Off"}</span>
                            {commentsEnabled ? (
                              <ToggleRight className="w-6 h-6 text-primary" />
                            ) : (
                              <ToggleLeft className="w-6 h-6 text-text-muted" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 max-h-[calc(100vh-380px)]" style={{ scrollbarWidth: "thin" }}>
                      {!commentsEnabled ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                          <MessageCircleOff className="w-10 h-10 text-text-muted mb-3" />
                          <p className="text-sm font-medium text-text-secondary">Comments are turned off</p>
                          <p className="text-xs text-text-muted mt-1">The creator has disabled comments for this video.</p>
                        </div>
                      ) : (
                        <>
                          {/* Comment input */}
                          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-border">
                            <Avatar
                              src={currentUser?.avatarUrl ?? null}
                              name={currentUser?.displayName || "You"}
                              size="sm"
                            />
                            <div className="flex-1 flex items-center gap-1">
                              <input
                                type="text"
                                value={commentText}
                                onChange={(e) => setCommentText(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") handleCommentSubmit(); }}
                                placeholder="Add a comment..."
                                className="flex-1 bg-bg-surface2 rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-muted outline-none focus:ring-1 focus:ring-primary min-w-0"
                              />
                              <button
                                onClick={handleCommentSubmit}
                                disabled={!commentText.trim() || submittingComment}
                                className="p-1.5 rounded-lg text-primary hover:bg-primary/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
                              >
                                <Send className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Comment list */}
                          <div className="space-y-4">
                            {comments.map((comment) => {
                              const commentUser = comment.user;
                              if (!commentUser) return null;
                              return (
                                <div key={comment.id} className="flex gap-2.5">
                                  <Avatar
                                    src={commentUser.avatarUrl}
                                    name={commentUser.displayName}
                                    size="sm"
                                    verified={commentUser.verifiedBadge}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-semibold text-text truncate">
                                        {commentUser.displayName}
                                      </span>
                                      <span className="text-[10px] text-text-muted shrink-0">
                                        {commentTimeAgo(comment.createdAt)}
                                      </span>
                                    </div>
                                    <p className="text-sm text-text-secondary mt-0.5 leading-relaxed">
                                      {comment.text}
                                    </p>
                                    <button
                                      onClick={() => handleCommentLike(comment.id)}
                                      className={`flex items-center gap-1.5 mt-1 text-xs transition-colors ${
                                        comment.userLiked ? "text-danger" : "text-text-muted hover:text-danger"
                                      }`}
                                      title="Like comment"
                                    >
                                      <Heart className={`w-3 h-3 ${comment.userLiked ? "fill-current" : ""}`} />
                                      {comment.likes}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Bottom: Episodes (if series) ── */}
          {seriesForPanel && (
            <div className="mt-6">
              <PlaylistPanel
                series={seriesForPanel}
                currentVideoId={videoId}
                onSelect={handleEpisodeSelect}
                videos={seriesVideos}
              />
            </div>
          )}

          {/* ── Bottom: Related videos horizontal scroll ── */}
          <div className="mt-6 border-t border-border pt-6">
            {RelatedVideosBar}
          </div>
        </div>
      </div>

      {/* ══════════ MOBILE LAYOUT ══════════ */}
      <div className="md:hidden">
        {/* Player */}
        <div className="w-full relative">
          <VideoPlayer
            thumbnailUrl={video.thumbnailUrl}
            videoUrl={video.videoUrl}
            videoId={videoId}
            durationSec={video.durationSec}
            onEnded={handleVideoEnded}
            autoplay={false}
          />
          {AutoplayOverlay}
        </div>

        <div className="px-4 mt-4">
          {/* Title */}
          <h1 className="text-lg font-bold text-text leading-snug">
            {video.title}
          </h1>

          {/* Stats line */}
          <div className="flex items-center gap-3 text-xs text-text-muted mt-1">
            <span>{formatViews(video.impressions ?? video.views)} impression views</span>
            <span>{formatTimeAgo(video.uploadDate)}</span>
          </div>

          {/* Creator row */}
          <div className="mt-4">{CreatorRow}</div>

          {/* Action buttons (horizontal on mobile) */}
          <div className="mt-4">{HorizontalActionButtons}</div>

          {/* Autoplay toggle */}
          <div className="mt-4">{AutoplayToggle}</div>

          {/* Related videos horizontal scroll */}
          <div className="mt-6 border-t border-border pt-4">
            {RelatedVideosBar}
          </div>

          {/* Episodes (if series) */}
          {seriesForPanel && (
            <div className="mt-6">
              <PlaylistPanel
                series={seriesForPanel}
                currentVideoId={videoId}
                onSelect={handleEpisodeSelect}
                videos={seriesVideos}
              />
            </div>
          )}

          {/* Comments */}
          <div className="mt-6 border-t border-border pt-4">
            {CommentsSection}
          </div>
        </div>
      </div>

      {/* ── Block User Confirmation Modal ── */}
      <Modal
        isOpen={blockModalOpen}
        onClose={() => setBlockModalOpen(false)}
        title="Block User"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar
              src={creator.avatarUrl}
              name={creator.displayName}
              size="lg"
              verified={creator.verifiedBadge}
            />
            <div>
              <p className="text-sm font-semibold text-text">{creator.displayName}</p>
              <p className="text-xs text-text-muted">@{creator.username}</p>
            </div>
          </div>
          <p className="text-sm text-text-secondary">
            Are you sure you want to block <strong className="text-text">{creator.displayName}</strong>? They will not be able to see your profile, send you messages, or interact with your content.
          </p>
          <div className="flex gap-3 pt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setBlockModalOpen(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleBlock}
              className="flex-1"
              icon={<ShieldBan className="w-4 h-4" />}
            >
              Block
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Donate / Gift Modal ── */}
      <Modal
        isOpen={donateModalOpen}
        onClose={() => setDonateModalOpen(false)}
        title={`Send a Gift to ${creator.displayName}`}
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Choose a gift to send. Credits will be deducted from your wallet.
          </p>
          <GiftPanel
            tiers={DONATION_TIERS}
            onSelect={handleDonate}
          />
          {donating && (
            <div className="flex items-center justify-center gap-2 py-2">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-text-muted">Sending gift...</span>
            </div>
          )}
        </div>
      </Modal>

      {/* ── Share Modal (desktop fallback) ── */}
      <Modal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        title="Share this video"
        size="sm"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {sharePlatforms.map((platform) => (
              <a
                key={platform.name}
                href={platform.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setShareModalOpen(false)}
                className={`flex flex-col items-center gap-2 p-3 rounded-xl ${platform.color} hover:opacity-80 transition-opacity`}
              >
                <span className="text-xl">{platform.icon}</span>
                <span className="text-xs font-medium">{platform.name}</span>
              </a>
            ))}
          </div>
          <div className="border-t border-border pt-3">
            <p className="text-xs text-text-muted mb-2">Or copy link</p>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 px-3 py-2 bg-bg-surface2 border border-border rounded-lg text-sm text-text truncate"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl);
                  useUIStore.getState().addToast("Link copied!", "success");
                  setShareModalOpen(false);
                }}
              >
                Copy
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
