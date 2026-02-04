"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Video as VideoIcon, X, Loader2 } from "lucide-react";
import Tabs from "@/components/ui/Tabs";
import Button from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";
import Card from "@/components/ui/Card";
import VideoCard from "@/components/video/VideoCard";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { formatViews } from "@/lib/utils";

/* ── Types for API responses ── */
interface UserData {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  isCreator: boolean;
  verifiedBadge: boolean;
  followerCount: number;
  followingCount: number;
  isPremium?: boolean;
  videoCount?: number;
  isFollowing?: boolean;
  isBlocked?: boolean;
}

interface CreatorData {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  verifiedBadge: boolean;
}

interface VideoData {
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
  seriesId?: string | null;
  seriesOrder?: number | null;
  creator: CreatorData;
}

interface SeriesData {
  id: string;
  title: string;
  description: string;
  coverUrl: string;
  creatorId: string;
  totalEpisodes: number;
  publicEpisodeCount?: number;
  creator?: CreatorData;
}

const profileTabs = [
  { id: "videos", label: "Videos" },
  { id: "series", label: "Series" },
  { id: "liked", label: "Liked" },
];

export default function ProfilePage() {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;
  const currentUser = useAuthStore((s) => s.currentUser);
  const [activeTab, setActiveTab] = useState("videos");
  const [isFollowing, setIsFollowing] = useState(false);

  /* ── Data state ── */
  const [user, setUser] = useState<UserData | null>(null);
  const [userVideos, setUserVideos] = useState<VideoData[]>([]);
  const [userSeries, setUserSeries] = useState<SeriesData[]>([]);
  const [likedVideos, setLikedVideos] = useState<VideoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  /* ── Followers / Following modal ── */
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);
  const [modalUsers, setModalUsers] = useState<{ id: string; username: string; displayName: string; avatarUrl: string | null; verifiedBadge: boolean }[]>([]);
  const [modalLoading, setModalLoading] = useState(false);

  const openFollowersModal = async () => {
    if (!user) return;
    setShowFollowersModal(true);
    setModalLoading(true);
    try {
      const res = await fetch(`/api/users/${user.id}/followers?limit=50`);
      const data = await res.json();
      setModalUsers(data.users || []);
    } catch {
      setModalUsers([]);
    } finally {
      setModalLoading(false);
    }
  };

  const openFollowingModal = async () => {
    if (!user) return;
    setShowFollowingModal(true);
    setModalLoading(true);
    try {
      const res = await fetch(`/api/users/${user.id}/following?limit=50`);
      const data = await res.json();
      setModalUsers(data.users || []);
    } catch {
      setModalUsers([]);
    } finally {
      setModalLoading(false);
    }
  };

  const closeModal = () => {
    setShowFollowersModal(false);
    setShowFollowingModal(false);
    setModalUsers([]);
  };

  /* ── Fetch user data ── */
  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setNotFound(false);

      try {
        // Search for user by username
        const searchRes = await api.search({ q: username, type: "users" }) as {
          users: UserData[];
        };

        if (cancelled) return;

        // Find exact username match
        const matchedUser = (searchRes.users || []).find(
          (u: UserData) => u.username === username
        );

        if (!matchedUser) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        // Fetch full user profile by ID
        const userRes = await api.users.get(matchedUser.id) as { user: UserData };
        if (cancelled) return;
        const userData = userRes.user;
        setUser(userData);
        setIsFollowing(userData.isFollowing ?? false);

        // Fetch user's videos
        api.videos.list({ creatorId: userData.id, limit: "200" }).then((res: any) => {
          if (!cancelled) setUserVideos(res.videos || []);
        }).catch(() => {});

        // Fetch user's series
        api.series.list({ creatorId: userData.id }).then((res: any) => {
          if (!cancelled) setUserSeries(res.series || []);
        }).catch(() => {});

        // Fetch liked videos
        api.videos.list({ likedBy: userData.id, limit: "12" }).then((res: any) => {
          if (!cancelled) setLikedVideos(res.videos || []);
        }).catch(() => {});
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [username]);

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-text-muted">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (notFound || !user) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-text-muted">
        <VideoIcon size={64} className="mb-4 opacity-30" />
        <h2 className="text-xl font-semibold text-text mb-2">User not found</h2>
        <p>The user @{username} does not exist.</p>
      </div>
    );
  }

  const isOwnProfile = currentUser?.id === user.id;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Banner */}
      <div className="h-40 sm:h-56 bg-gradient-to-r from-primary via-primary/60 to-accent rounded-b-2xl relative" />

      {/* Profile section */}
      <div className="px-4 sm:px-6">
        <div className="relative -mt-12 sm:-mt-16 flex flex-col sm:flex-row sm:items-end gap-4 mb-6">
          <div className="shrink-0">
            <div className="ring-4 ring-bg rounded-full">
              <Avatar
                src={user.avatarUrl}
                name={user.displayName}
                size="xl"
                verified={user.verifiedBadge}
              />
            </div>
          </div>

          <div className="flex-1 min-w-0 sm:pb-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-text">{user.displayName}</h1>
              {user.verifiedBadge && (
                <span className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <Check size={12} className="text-white" />
                </span>
              )}
            </div>
            <p className="text-sm text-text-muted">@{user.username}</p>
          </div>

          <div className="sm:pb-1">
            {isOwnProfile ? (
              <Button variant="secondary" onClick={() => router.push('/settings')}>Edit Profile</Button>
            ) : (
              <Button
                variant={isFollowing ? "secondary" : "gradient"}
                onClick={async () => {
                  const prev = isFollowing;
                  setIsFollowing(!prev);
                  try {
                    if (prev) {
                      await api.users.unfollow(user.id);
                    } else {
                      await api.users.follow(user.id);
                    }
                  } catch {
                    setIsFollowing(prev);
                  }
                }}
              >
                {isFollowing ? "Unfollow" : "Follow"}
              </Button>
            )}
          </div>
        </div>

        {/* Bio */}
        {user.bio && (
          <p className="text-sm text-text-secondary mb-4 max-w-xl">{user.bio}</p>
        )}

        {/* Stats */}
        <div className="flex gap-6 mb-6">
          <button onClick={openFollowersModal} className="text-center hover:opacity-80 transition-opacity">
            <p className="text-lg font-bold text-text">
              {formatViews(user.followerCount)}
            </p>
            <p className="text-xs text-text-muted">Followers</p>
          </button>
          <button onClick={openFollowingModal} className="text-center hover:opacity-80 transition-opacity">
            <p className="text-lg font-bold text-text">
              {formatViews(user.followingCount)}
            </p>
            <p className="text-xs text-text-muted">Following</p>
          </button>
          <div className="text-center">
            <p className="text-lg font-bold text-text">{userVideos.length}</p>
            <p className="text-xs text-text-muted">Videos</p>
          </div>
        </div>

        {/* Followers / Following Modal */}
        {(showFollowersModal || showFollowingModal) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={closeModal}>
            <div
              className="relative w-full max-w-md max-h-[70vh] rounded-2xl bg-bg-surface border border-border overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h3 className="text-lg font-semibold text-text">
                  {showFollowersModal ? "Followers" : "Following"}
                </h3>
                <button onClick={closeModal} className="rounded-full p-1 text-text-muted hover:text-text hover:bg-bg-surface2">
                  <X size={20} />
                </button>
              </div>
              <div className="overflow-y-auto max-h-[calc(70vh-56px)] p-2">
                {modalLoading && (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 size={24} className="animate-spin text-primary" />
                  </div>
                )}
                {!modalLoading && modalUsers.length === 0 && (
                  <p className="py-12 text-center text-sm text-text-muted">
                    {showFollowersModal ? "No followers yet." : "Not following anyone yet."}
                  </p>
                )}
                {!modalLoading && modalUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => { closeModal(); router.push(`/profile/${u.username}`); }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-bg-surface2"
                  >
                    <Avatar src={u.avatarUrl} name={u.displayName} size="sm" verified={u.verifiedBadge} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-text truncate">{u.displayName}</p>
                      <p className="text-xs text-text-muted truncate">@{u.username}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <Tabs tabs={profileTabs} activeTab={activeTab} onChange={setActiveTab} />

        {/* Tab content */}
        <div className="mt-6 pb-12">
          {activeTab === "videos" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {userVideos.map((video) => (
                <VideoCard key={video.id} video={{...video, seriesId: video.seriesId ?? undefined, seriesOrder: video.seriesOrder ?? undefined} as any} creator={(video.creator ?? user) as any} />
              ))}
              {userVideos.length === 0 && (
                <div className="col-span-full py-12 text-center text-text-muted">
                  No videos yet.
                </div>
              )}
            </div>
          )}

          {activeTab === "series" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {userSeries.map((series) => {
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
                          <h3 className="text-sm font-semibold text-text line-clamp-1">
                            {series.title}
                          </h3>
                          <p className="text-xs text-text-muted mt-1">
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
              {userSeries.length === 0 && (
                <div className="col-span-full py-12 text-center text-text-muted">
                  No series yet.
                </div>
              )}
            </div>
          )}

          {activeTab === "liked" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {likedVideos.map((video) => {
                const creator = video.creator;
                if (!creator) return null;
                return (
                  <VideoCard key={video.id} video={{...video, seriesId: video.seriesId ?? undefined, seriesOrder: video.seriesOrder ?? undefined} as any} creator={creator as any} />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
