"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import { useFriendsStore } from "@/stores/friends-store";
import { useAuthStore } from "@/stores/auth-store";

export default function OnlineFriendsWidget() {
  const { isLoggedIn } = useAuthStore();
  const { friends, fetchFriends } = useFriendsStore();

  useEffect(() => {
    if (isLoggedIn) {
      fetchFriends();
      // Refresh every 2 minutes
      const interval = setInterval(() => fetchFriends(), 2 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [isLoggedIn, fetchFriends]);

  if (!isLoggedIn) return null;

  const onlineFriends = friends.filter((f) => f.isOnline).slice(0, 5);

  if (onlineFriends.length === 0) return null;

  return (
    <section className="mb-6">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-text-secondary">
        <Users size={14} className="text-success" />
        Online Friends
      </h3>
      <ul className="flex flex-col gap-2">
        {onlineFriends.map((friend) => (
          <li key={friend.id}>
            <Link
              href={`/profile/${friend.username}`}
              className="group flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-bg-surface2"
            >
              <Avatar
                src={friend.avatarUrl}
                name={friend.displayName}
                size="sm"
                online
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text group-hover:text-primary-light">
                  {friend.displayName}
                </p>
                <p className="truncate text-xs text-text-muted">
                  @{friend.username}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {friends.filter((f) => f.isOnline).length > 5 && (
        <Link
          href="/friends"
          className="mt-2 block text-center text-xs font-medium text-primary hover:text-primary-light transition-colors"
        >
          View all friends
        </Link>
      )}
    </section>
  );
}
