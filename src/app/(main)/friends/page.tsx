"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Users,
  UserPlus,
  Clock,
  Check,
  X,
  MoreVertical,
  MessageCircle,
  BellOff,
  UserMinus,
  Ban,
} from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import FriendTimeoutModal from "@/components/friends/FriendTimeoutModal";
import { useAuthStore } from "@/stores/auth-store";
import { useFriendsStore } from "@/stores/friends-store";
import { api } from "@/lib/api";
import { cn, formatTimeAgo } from "@/lib/utils";
import Link from "next/link";

type Tab = "friends" | "incoming" | "outgoing";

export default function FriendsPage() {
  const { isLoggedIn } = useAuthStore();
  const {
    friends,
    incomingRequests,
    outgoingRequests,
    isLoading,
    incomingCount,
    fetchFriends,
    fetchIncomingRequests,
    fetchOutgoingRequests,
    acceptRequest,
    declineRequest,
    cancelRequest,
    removeFriend,
    setFriendTimeout,
  } = useFriendsStore();

  const [tab, setTab] = useState<Tab>("friends");
  const [search, setSearch] = useState("");
  const [contextMenu, setContextMenu] = useState<string | null>(null);
  const [timeoutModal, setTimeoutModal] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (isLoggedIn) {
      fetchFriends();
      fetchIncomingRequests();
      fetchOutgoingRequests();
    }
  }, [isLoggedIn, fetchFriends, fetchIncomingRequests, fetchOutgoingRequests]);

  const handleSearch = useCallback(
    (q: string) => {
      setSearch(q);
      fetchFriends(q || undefined);
    },
    [fetchFriends]
  );

  const handleBlock = async (userId: string) => {
    try {
      await api.users.block(userId);
      fetchFriends();
      fetchIncomingRequests();
      fetchOutgoingRequests();
    } catch {}
    setContextMenu(null);
  };

  if (!isLoggedIn) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Users size={48} className="mb-4 text-text-muted" />
        <p className="text-lg font-medium text-text">Sign in to see your friends</p>
        <Link href="/login" className="mt-4 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white hover:bg-primary-dark transition-colors">
          Sign In
        </Link>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "friends", label: "Friends", count: friends.length },
    { key: "incoming", label: "Incoming Requests", count: incomingCount },
    { key: "outgoing", label: "Outgoing Requests", count: outgoingRequests.length },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold text-text">Friends</h1>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-bg-surface2 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors",
              tab === t.key
                ? "bg-bg-surface text-text shadow-sm"
                : "text-text-secondary hover:text-text"
            )}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span
                className={cn(
                  "ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold",
                  t.key === "incoming" && tab !== "incoming"
                    ? "bg-danger text-white"
                    : "bg-bg-surface2 text-text-muted"
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Friends Tab */}
      {tab === "friends" && (
        <>
          {/* Search */}
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search friends..."
              className="w-full rounded-lg border border-border bg-bg-surface2 py-2.5 pl-10 pr-4 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
            />
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-sm text-text-muted">Loading...</div>
          ) : friends.length === 0 ? (
            <div className="flex flex-col items-center py-12">
              <Users size={40} className="mb-3 text-text-muted" />
              <p className="text-sm text-text-muted">
                {search ? "No friends match your search" : "No friends yet"}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {friends.map((friend) => (
                <li
                  key={friend.id}
                  className="group relative flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-bg-surface2"
                >
                  <Link href={`/profile/${friend.username}`} className="flex items-center gap-3 flex-1 min-w-0">
                    <Avatar
                      src={friend.avatarUrl}
                      name={friend.displayName}
                      size="md"
                      online={friend.isOnline}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text">
                        {friend.displayName}
                      </p>
                      <p className="truncate text-xs text-text-muted">
                        @{friend.username}
                        {!friend.isOnline && friend.lastActiveAt && (
                          <> &middot; {formatTimeAgo(friend.lastActiveAt)}</>
                        )}
                      </p>
                    </div>
                  </Link>

                  {/* Context menu button */}
                  <button
                    onClick={() => setContextMenu(contextMenu === friend.id ? null : friend.id)}
                    className="rounded-md p-1.5 text-text-muted opacity-0 transition-all hover:bg-bg-surface2 hover:text-text group-hover:opacity-100"
                  >
                    <MoreVertical size={16} />
                  </button>

                  {/* Context menu dropdown */}
                  {contextMenu === friend.id && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
                      <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-border bg-bg-surface p-1 shadow-lg">
                        <Link
                          href={`/messages?user=${friend.id}`}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-text transition-colors hover:bg-bg-surface2"
                          onClick={() => setContextMenu(null)}
                        >
                          <MessageCircle size={14} />
                          Message
                        </Link>
                        <button
                          onClick={() => {
                            setTimeoutModal({ id: friend.id, name: friend.displayName });
                            setContextMenu(null);
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-text transition-colors hover:bg-bg-surface2"
                        >
                          <BellOff size={14} />
                          Mute Notifications
                        </button>
                        <button
                          onClick={() => {
                            removeFriend(friend.id);
                            setContextMenu(null);
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-warning transition-colors hover:bg-bg-surface2"
                        >
                          <UserMinus size={14} />
                          Remove Friend
                        </button>
                        <button
                          onClick={() => handleBlock(friend.id)}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-danger transition-colors hover:bg-bg-surface2"
                        >
                          <Ban size={14} />
                          Block
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* Incoming Requests Tab */}
      {tab === "incoming" && (
        <>
          {incomingRequests.length === 0 ? (
            <div className="flex flex-col items-center py-12">
              <UserPlus size={40} className="mb-3 text-text-muted" />
              <p className="text-sm text-text-muted">No incoming friend requests</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {incomingRequests.map((req) => (
                <li
                  key={req.id}
                  className="flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-bg-surface2"
                >
                  <Link href={`/profile/${req.user.username}`} className="flex items-center gap-3 flex-1 min-w-0">
                    <Avatar
                      src={req.user.avatarUrl}
                      name={req.user.displayName}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text">
                        {req.user.displayName}
                      </p>
                      <p className="truncate text-xs text-text-muted">
                        @{req.user.username} &middot; {formatTimeAgo(req.createdAt)}
                      </p>
                    </div>
                  </Link>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => acceptRequest(req.user.id)}
                      className="flex items-center gap-1.5 rounded-lg bg-success px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-success/80"
                    >
                      <Check size={14} />
                      Accept
                    </button>
                    <button
                      onClick={() => declineRequest(req.user.id)}
                      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-surface2"
                    >
                      <X size={14} />
                      Decline
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* Outgoing Requests Tab */}
      {tab === "outgoing" && (
        <>
          {outgoingRequests.length === 0 ? (
            <div className="flex flex-col items-center py-12">
              <Clock size={40} className="mb-3 text-text-muted" />
              <p className="text-sm text-text-muted">No pending outgoing requests</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {outgoingRequests.map((req) => (
                <li
                  key={req.id}
                  className="flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-bg-surface2"
                >
                  <Link href={`/profile/${req.user.username}`} className="flex items-center gap-3 flex-1 min-w-0">
                    <Avatar
                      src={req.user.avatarUrl}
                      name={req.user.displayName}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text">
                        {req.user.displayName}
                      </p>
                      <p className="truncate text-xs text-text-muted">
                        @{req.user.username} &middot; {formatTimeAgo(req.createdAt)}
                      </p>
                    </div>
                  </Link>
                  <button
                    onClick={() => cancelRequest(req.user.id)}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-surface2"
                  >
                    <X size={14} />
                    Cancel
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* Timeout Modal */}
      {timeoutModal && (
        <FriendTimeoutModal
          isOpen={!!timeoutModal}
          onClose={() => setTimeoutModal(null)}
          friendName={timeoutModal.name}
          onSelect={(minutes) => setFriendTimeout(timeoutModal.id, minutes)}
        />
      )}
    </div>
  );
}
