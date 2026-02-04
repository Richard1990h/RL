"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, Flame, Loader2 } from "lucide-react";
import Link from "next/link";
import Tabs from "@/components/ui/Tabs";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Avatar from "@/components/ui/Avatar";
import VideoCard from "@/components/video/VideoCard";
import LiveCard from "@/components/live/LiveCard";
import { api } from "@/lib/api";
import { formatViews } from "@/lib/utils";

const filterTabs = [
  { id: "all", label: "All" },
  { id: "videos", label: "Videos" },
  { id: "creators", label: "Creators" },
  { id: "series", label: "Series" },
  { id: "live", label: "Live" },
];

const trendingSearches = [
  "Tower Wars",
  "Beat Battle",
  "Pixel Art",
  "Live Cooking",
  "HIIT Workout",
  "React Tutorial",
  "Lo-Fi Beats",
  "Street Food",
  "Timer Wars",
  "Philosophy",
];

type SearchCreator = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  verifiedBadge: boolean;
  followerCount?: number;
};

type SearchVideo = {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  durationSec: number;
  creatorId: string;
  views: number;
  likes: number;
  dislikes: number;
  commentsCount: number;
  uploadDate: string;
  tags: string[];
  creator: SearchCreator;
};

type SearchSeries = {
  id: string;
  title: string;
  description: string;
  coverUrl: string;
  creatorId: string;
  totalEpisodes: number;
  creator: SearchCreator;
};

type SearchStream = {
  id: string;
  title: string;
  tags: string[];
  hostId: string;
  host: SearchCreator;
  [key: string]: unknown;
};

type SearchUser = SearchCreator & {
  isCreator?: boolean;
  bio?: string | null;
};

type SearchResults = {
  videos: SearchVideo[];
  users: SearchUser[];
  series: SearchSeries[];
  streams: SearchStream[];
};

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [filteredVideos, setFilteredVideos] = useState<SearchVideo[]>([]);
  const [filteredCreators, setFilteredCreators] = useState<SearchUser[]>([]);
  const [filteredSeries, setFilteredSeries] = useState<SearchSeries[]>([]);
  const [filteredLive, setFilteredLive] = useState<SearchStream[]>([]);
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});
  const abortRef = useRef<AbortController | null>(null);

  const toggleFollow = useCallback(async (userId: string) => {
    const prev = !!followingMap[userId];
    setFollowingMap((m) => ({ ...m, [userId]: !prev }));
    try {
      if (prev) {
        await api.users.unfollow(userId);
      } else {
        await api.users.follow(userId);
      }
    } catch {
      setFollowingMap((m) => ({ ...m, [userId]: prev }));
    }
  }, [followingMap]);

  const q = query.toLowerCase().trim();

  // Debounced search API call
  useEffect(() => {
    if (!q) {
      setFilteredVideos([]);
      setFilteredCreators([]);
      setFilteredSeries([]);
      setFilteredLive([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const timer = setTimeout(async () => {
      // Cancel any in-flight request
      if (abortRef.current) {
        abortRef.current.abort();
      }
      abortRef.current = new AbortController();

      try {
        const results = (await api.search({ q })) as SearchResults;
        setFilteredVideos(results.videos ?? []);
        setFilteredCreators(results.users ?? []);
        setFilteredSeries(results.series ?? []);
        setFilteredLive(results.streams ?? []);
      } catch {
        // Only clear on non-abort errors
        setFilteredVideos([]);
        setFilteredCreators([]);
        setFilteredSeries([]);
        setFilteredLive([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [q]);

  const hasResults =
    filteredVideos.length > 0 ||
    filteredCreators.length > 0 ||
    filteredSeries.length > 0 ||
    filteredLive.length > 0;

  const showVideos =
    (activeFilter === "all" || activeFilter === "videos") &&
    filteredVideos.length > 0;
  const showCreators =
    (activeFilter === "all" || activeFilter === "creators") &&
    filteredCreators.length > 0;
  const showSeries =
    (activeFilter === "all" || activeFilter === "series") &&
    filteredSeries.length > 0;
  const showLive =
    (activeFilter === "all" || activeFilter === "live") &&
    filteredLive.length > 0;

  const noFilterResults =
    q && !loading && !showVideos && !showCreators && !showSeries && !showLive;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Search input */}
      <div className="relative">
        <Search
          size={20}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
        />
        <input
          type="text"
          placeholder="Search videos, creators, series, live..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-bg-surface2 text-text placeholder:text-text-muted border border-border rounded-2xl pl-12 pr-12 py-4 text-base transition-colors hover:border-border-light focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* Show filter tabs only when there's a query */}
      {q && <Tabs tabs={filterTabs} activeTab={activeFilter} onChange={setActiveFilter} />}

      {/* Trending searches when no query */}
      {!q && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Flame size={20} className="text-warning" />
            <h2 className="text-lg font-semibold text-text">Trending Searches</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {trendingSearches.map((term) => (
              <button
                key={term}
                onClick={() => setQuery(term)}
                className="px-4 py-2 bg-bg-surface2 hover:bg-bg-surface3 text-text-secondary hover:text-text text-sm rounded-full border border-border transition-colors"
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading state */}
      {q && loading && (
        <div className="py-16 text-center">
          <Loader2 size={48} className="mx-auto text-text-muted/30 mb-4 animate-spin" />
          <p className="text-sm text-text-muted">Searching...</p>
        </div>
      )}

      {/* Results */}
      {q && !loading && hasResults && (
        <div className="space-y-8">
          {/* Videos */}
          {showVideos && (
            <section>
              <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">
                Videos ({filteredVideos.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredVideos.map((video) => {
                  const creator = video.creator;
                  if (!creator) return null;
                  return (
                    <VideoCard key={video.id} video={video} creator={creator} />
                  );
                })}
              </div>
            </section>
          )}

          {/* Creators */}
          {showCreators && (
            <section>
              <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">
                Creators ({filteredCreators.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredCreators.map((user) => (
                  <Link key={user.id} href={`/profile/${user.username}`}>
                    <Card hoverable padding="md">
                      <div className="flex items-center gap-4">
                        <Avatar
                          src={user.avatarUrl}
                          name={user.displayName}
                          size="lg"
                          verified={user.verifiedBadge}
                        />
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-text">
                            {user.displayName}
                          </h4>
                          <p className="text-xs text-text-muted">
                            @{user.username}
                          </p>
                          <p className="text-xs text-text-secondary mt-1">
                            {formatViews(user.followerCount ?? 0)} followers
                          </p>
                        </div>
                        <Button
                          variant={followingMap[user.id] ? "secondary" : "primary"}
                          size="sm"
                          onClick={(e: React.MouseEvent) => {
                            e.preventDefault();
                            toggleFollow(user.id);
                          }}
                        >
                          {followingMap[user.id] ? "Following" : "Follow"}
                        </Button>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Series */}
          {showSeries && (
            <section>
              <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">
                Series ({filteredSeries.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filteredSeries.map((series) => {
                  const creator = series.creator;
                  return (
                    <Link key={series.id} href={`/series/${series.id}`}>
                      <Card hoverable padding="sm">
                        <div className="flex gap-4">
                          <div className="w-32 h-20 rounded-lg bg-bg-surface2 overflow-hidden shrink-0">
                            <img
                              src={series.coverUrl}
                              alt={series.title}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-semibold text-text line-clamp-1">
                              {series.title}
                            </h4>
                            <p className="text-xs text-text-muted mt-0.5">
                              {creator?.displayName} &middot;{" "}
                              {series.totalEpisodes} episodes
                            </p>
                            <p className="text-xs text-text-secondary mt-1 line-clamp-2">
                              {series.description}
                            </p>
                          </div>
                        </div>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* Live */}
          {showLive && (
            <section>
              <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">
                Live Now ({filteredLive.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredLive.map((room) => {
                  const host = room.host;
                  if (!host) return null;
                  return <LiveCard key={room.id} room={room} host={host} />;
                })}
              </div>
            </section>
          )}
        </div>
      )}

      {/* No results */}
      {noFilterResults && (
        <div className="py-16 text-center">
          <Search size={48} className="mx-auto text-text-muted/30 mb-4" />
          <h3 className="text-lg font-semibold text-text mb-2">No results found</h3>
          <p className="text-sm text-text-muted">
            No results for &quot;{query}&quot;. Try a different search term.
          </p>
        </div>
      )}
    </div>
  );
}
