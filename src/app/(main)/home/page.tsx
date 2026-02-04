"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { ChevronRight, ToggleLeft, ToggleRight } from "lucide-react";
import { api } from "@/lib/api";
import type { Video, User, LiveRoom, Series } from "@/lib/types";
import VideoCard from "@/components/video/VideoCard";
import LiveCard from "@/components/live/LiveCard";
import Button from "@/components/ui/Button";

type VideoWithCreator = Video & {
  creator: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string | null;
    verifiedBadge: boolean;
  };
};

type LiveStreamWithHost = LiveRoom & {
  host: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string | null;
    verifiedBadge: boolean;
  };
};

const FILTER_TABS = [
  { id: "all", label: "All" },
  { id: "trending", label: "Trending" },
  { id: "gaming", label: "Gaming" },
  { id: "game-dev", label: "Game Dev" },
  { id: "cooking", label: "Cooking" },
  { id: "diy", label: "DIY" },
  { id: "crypto", label: "Crypto" },
  { id: "lifestyle", label: "Lifestyle" },
  { id: "outdoors", label: "Outdoors" },
  { id: "crafts", label: "Crafts" },
] as const;

const TAG_MAP: Record<string, string[]> = {
  all: [],
  trending: [],
  gaming: ["gaming"],
  "game-dev": ["game-dev"],
  cooking: ["cooking"],
  diy: ["diy"],
  crypto: ["crypto"],
  lifestyle: ["lifestyle"],
  outdoors: ["outdoors"],
  crafts: ["crafts"],
};

const ITEMS_PER_PAGE = 12;

function creatorToUser(creator: VideoWithCreator["creator"]): User {
  return {
    id: creator.id,
    username: creator.username,
    displayName: creator.displayName,
    email: "",
    avatarUrl: creator.avatarUrl,
    bio: null,
    followerCount: 0,
    followingCount: 0,
    isCreator: true,
    verifiedBadge: creator.verifiedBadge,
  };
}

function hostToUser(host: LiveStreamWithHost["host"]): User {
  return {
    id: host.id,
    username: host.username,
    displayName: host.displayName,
    email: "",
    avatarUrl: host.avatarUrl,
    bio: null,
    followerCount: 0,
    followingCount: 0,
    isCreator: true,
    verifiedBadge: host.verifiedBadge,
  };
}

export default function HomePage() {
  const [activeFilter, setActiveFilter] = useState("all");
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  const [autoplay, setAutoplay] = useState(true);

  const [videos, setVideos] = useState<VideoWithCreator[]>([]);
  const [liveRooms, setLiveRooms] = useState<LiveStreamWithHost[]>([]);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      try {
        const [videosRes, liveRes, seriesRes] = await Promise.all([
          api.videos.list({ sort: "recent", limit: "100" }) as Promise<{ videos: VideoWithCreator[] }>,
          api.live.list() as Promise<{ streams: LiveStreamWithHost[] }>,
          api.series.list() as Promise<{ series: Series[] }>,
        ]);

        if (!cancelled) {
          setVideos(videosRes.videos || []);
          setLiveRooms(liveRes.streams || []);
          setSeriesList(seriesRes.series || []);
        }
      } catch (err) {
        console.error("Failed to fetch home page data:", err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, []);

  const findSeries = (seriesId?: string) =>
    seriesId ? seriesList.find((s) => s.id === seriesId) ?? null : null;

  // Compute episode number for a video from its series episode list
  const getEpisodeNumber = (videoId: string, seriesId?: string): number | null => {
    if (!seriesId) return null;
    const s = findSeries(seriesId);
    if (!s || !s.episodes) return null;
    const ep = s.episodes.find((e: { videoId: string; order: number }) => e.videoId === videoId);
    if (ep) return ep.order;
    // Fallback: position in the list
    const idx = s.episodes.findIndex((e: { videoId: string }) => e.videoId === videoId);
    return idx >= 0 ? idx + 1 : null;
  };

  const filteredVideos = useMemo(() => {
    if (activeFilter === "all") return videos;
    if (activeFilter === "trending") {
      return [...videos].sort((a, b) => b.views - a.views);
    }
    const tags = TAG_MAP[activeFilter] || [];
    if (tags.length === 0) return videos;
    return videos.filter((v) =>
      v.tags.some((t) => tags.includes(t.toLowerCase()))
    );
  }, [activeFilter, videos]);

  const displayedVideos = filteredVideos.slice(0, visibleCount);
  const hasMore = visibleCount < filteredVideos.length;

  const handleFilterChange = (filterId: string) => {
    setActiveFilter(filterId);
    setVisibleCount(ITEMS_PER_PAGE);
  };

  if (loading) {
    return (
      <div className="min-h-screen pb-20">
        {/* Loading skeleton for Live Now section */}
        <section className="mb-8">
          <div className="px-4 sm:px-6 pt-4 pb-2">
            <div className="h-6 w-32 bg-bg-surface2 rounded animate-pulse" />
          </div>
          <div className="flex gap-4 px-4 sm:px-6 pb-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="shrink-0 w-[280px] sm:w-[300px] h-[160px] bg-bg-surface2 rounded-xl animate-pulse" />
            ))}
          </div>
        </section>

        {/* Loading skeleton for filter tabs */}
        <div className="px-4 sm:px-6 mb-6 flex gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-9 w-20 bg-bg-surface2 rounded-lg animate-pulse" />
          ))}
        </div>

        {/* Loading skeleton for video grid */}
        <section className="px-4 sm:px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <div className="aspect-video bg-bg-surface2 rounded-xl animate-pulse" />
                <div className="flex gap-3">
                  <div className="w-9 h-9 rounded-full bg-bg-surface2 animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-bg-surface2 rounded animate-pulse" />
                    <div className="h-3 w-2/3 bg-bg-surface2 rounded animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      {/* ── Live Now Section ── */}
      {liveRooms.length > 0 && (
        <section className="mb-8">
          <div className="px-4 sm:px-6 pt-4 pb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-danger" />
              </span>
              <h2 className="text-lg font-semibold text-text">Live Now</h2>
            </div>
            <Link href="/live" className="flex items-center gap-1 text-sm text-text-secondary hover:text-primary transition-colors">
              See all
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="relative">
            <div className="flex gap-4 overflow-x-auto no-scrollbar px-4 sm:px-6 pb-2">
              {liveRooms.slice(0, 5).map((room) => {
                const host = hostToUser(room.host);
                return (
                  <div key={room.id} className="shrink-0 w-[280px] sm:w-[300px]">
                    <LiveCard room={room} host={host} />
                  </div>
                );
              })}
            </div>
            {/* Fade edge */}
            <div className="absolute top-0 right-0 bottom-2 w-12 bg-gradient-to-l from-bg to-transparent pointer-events-none" />
          </div>
        </section>
      )}

      {/* ── Filter Tabs + Autoplay ── */}
      <div className="px-4 sm:px-6 mb-6 flex items-center gap-4">
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 flex-1">
          {FILTER_TABS.map((tab) => {
            const isActive = tab.id === activeFilter;
            return (
              <button
                key={tab.id}
                onClick={() => handleFilterChange(tab.id)}
                className={`
                  shrink-0 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200
                  ${
                    isActive
                      ? "bg-primary text-white"
                      : "bg-bg-surface2 text-text-secondary hover:bg-bg-surface3 hover:text-text"
                  }
                `}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        {/* Autoplay toggle */}
        <button
          onClick={() => setAutoplay(!autoplay)}
          className="shrink-0 flex items-center gap-1.5 text-sm text-text-secondary hover:text-text transition-colors"
          title={autoplay ? "Autoplay is on" : "Autoplay is off"}
        >
          {autoplay ? (
            <ToggleRight size={22} className="text-primary" />
          ) : (
            <ToggleLeft size={22} className="text-text-muted" />
          )}
          <span className="hidden sm:inline text-xs">Autoplay</span>
        </button>
      </div>

      {/* ── Video Grid ── */}
      <section className="px-4 sm:px-6">
        {displayedVideos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-text-muted text-lg mb-2">No videos found</p>
            <p className="text-text-muted text-sm">
              Try a different category filter
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8">
            {displayedVideos.map((video) => {
              const creator = creatorToUser(video.creator);
              const epNum = getEpisodeNumber(video.id, video.seriesId);
              const videoWithOrder = epNum != null ? { ...video, seriesOrder: epNum } : video;
              return (
                <VideoCard key={video.id} video={videoWithOrder} creator={creator} series={findSeries(video.seriesId)} />
              );
            })}
          </div>
        )}

        {/* Load More */}
        {hasMore && (
          <div className="flex justify-center mt-10">
            <Button
              variant="secondary"
              size="lg"
              onClick={() => setVisibleCount((prev) => prev + ITEMS_PER_PAGE)}
            >
              Load More
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
