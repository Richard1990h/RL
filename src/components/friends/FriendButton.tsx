"use client";

import { useState, useEffect } from "react";
import { UserPlus, UserCheck, Clock, Check, X } from "lucide-react";
import { useFriendsStore } from "@/stores/friends-store";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";

interface FriendButtonProps {
  userId: string;
  className?: string;
}

type FriendStatus = "none" | "friends" | "request_sent" | "request_received" | "loading";

export default function FriendButton({ userId, className = "" }: FriendButtonProps) {
  const { currentUser } = useAuthStore();
  const { sendRequest, cancelRequest, acceptRequest, declineRequest, removeFriend } = useFriendsStore();
  const [status, setStatus] = useState<FriendStatus>("loading");
  const [showDropdown, setShowDropdown] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!currentUser || currentUser.id === userId) {
      setStatus("none");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        // Check if friends
        const friendsRes = await api.friends.list() as { friends: Array<{ id: string }> };
        if (cancelled) return;
        if (friendsRes.friends.some((f) => f.id === userId)) {
          setStatus("friends");
          return;
        }

        // Check outgoing requests
        const outRes = await api.friends.requests("outgoing") as { requests: Array<{ user: { id: string } }> };
        if (cancelled) return;
        if (outRes.requests.some((r) => r.user.id === userId)) {
          setStatus("request_sent");
          return;
        }

        // Check incoming requests
        const inRes = await api.friends.requests("incoming") as { requests: Array<{ user: { id: string } }> };
        if (cancelled) return;
        if (inRes.requests.some((r) => r.user.id === userId)) {
          setStatus("request_received");
          return;
        }

        setStatus("none");
      } catch {
        if (!cancelled) setStatus("none");
      }
    })();

    return () => { cancelled = true; };
  }, [currentUser, userId]);

  if (!currentUser || currentUser.id === userId || status === "loading") return null;

  const handleAction = async (action: () => Promise<void>, newStatus: FriendStatus) => {
    setBusy(true);
    try {
      await action();
      setStatus(newStatus);
    } catch {}
    setBusy(false);
    setShowDropdown(false);
  };

  if (status === "none") {
    return (
      <button
        onClick={() => handleAction(() => sendRequest(userId), "request_sent")}
        disabled={busy}
        className={`flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50 ${className}`}
      >
        <UserPlus size={16} />
        Add Friend
      </button>
    );
  }

  if (status === "request_sent") {
    return (
      <button
        onClick={() => handleAction(() => cancelRequest(userId), "none")}
        disabled={busy}
        className={`flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-surface2 disabled:opacity-50 ${className}`}
      >
        <Clock size={16} />
        Request Sent
      </button>
    );
  }

  if (status === "request_received") {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <button
          onClick={() => handleAction(() => acceptRequest(userId), "friends")}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg bg-success px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-success/80 disabled:opacity-50"
        >
          <Check size={16} />
          Accept
        </button>
        <button
          onClick={() => handleAction(() => declineRequest(userId), "none")}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-surface2 disabled:opacity-50"
        >
          <X size={16} />
          Decline
        </button>
      </div>
    );
  }

  // status === "friends"
  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className={`flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-bg-surface2 ${className}`}
      >
        <UserCheck size={16} className="text-success" />
        Friends
      </button>
      {showDropdown && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-border bg-bg-surface p-1 shadow-lg">
            <button
              onClick={() => handleAction(() => removeFriend(userId), "none")}
              disabled={busy}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-danger transition-colors hover:bg-bg-surface2"
            >
              Remove Friend
            </button>
          </div>
        </>
      )}
    </div>
  );
}
