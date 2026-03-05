"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Heart,
  MessageCircle,
  Users,
  Gift,
  Radio,
  Swords,
  Star,
  Bell,
  Check,
  Flame,
  Loader2,
} from "lucide-react";
import Tabs from "@/components/ui/Tabs";
import Button from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { formatTimeAgo, cn } from "@/lib/utils";

// Raw shape from the API (Prisma model)
interface ApiNotification {
  id: string;
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
  relatedId?: string | null;
  relatedUsername?: string | null;
  userId?: string;
}

// Normalised shape used in the UI
interface Notification {
  id: string;
  type: string;
  message: string;
  read: boolean;
  timestamp: string;
  relatedId?: string;
  relatedUsername?: string;
  userId?: string;
}

/** Map the API record into the shape the page expects */
function normalizeNotification(raw: ApiNotification): Notification {
  return {
    id: raw.id,
    type: raw.type.toLowerCase(), // COMMENT → comment, FOLLOW → follow, etc.
    message: raw.message,
    read: raw.read,
    timestamp: raw.createdAt,
    relatedId: raw.relatedId ?? undefined,
    relatedUsername: raw.relatedUsername ?? undefined,
    userId: raw.userId,
  };
}

const filterTabs = [
  { id: "all", label: "All" },
  { id: "mentions", label: "Mentions" },
  { id: "gifts", label: "Gifts" },
  { id: "system", label: "System" },
];

const typeIcons: Record<string, React.ReactNode> = {
  follow: <Users size={18} />,
  like: <Heart size={18} />,
  comment: <MessageCircle size={18} />,
  donation: <Gift size={18} />,
  gift: <Gift size={18} />,
  live: <Radio size={18} />,
  live_start: <Radio size={18} />,
  battle_invite: <Swords size={18} />,
  message: <MessageCircle size={18} />,
  private_message: <MessageCircle size={18} />,
  friend_request: <Users size={18} />,
  friend_accept: <Users size={18} />,
  subscription: <Star size={18} />,
  service_order: <Star size={18} />,
  system: <Bell size={18} />,
  streak_bonus: <Flame size={18} />,
};

const typeColors: Record<string, string> = {
  follow: "text-accent bg-accent/10",
  like: "text-danger bg-danger/10",
  comment: "text-primary bg-primary/10",
  donation: "text-warning bg-warning/10",
  gift: "text-warning bg-warning/10",
  live: "text-danger bg-danger/10",
  live_start: "text-danger bg-danger/10",
  battle_invite: "text-primary bg-primary/10",
  message: "text-primary bg-primary/10",
  private_message: "text-warning bg-warning/10",
  friend_request: "text-accent bg-accent/10",
  friend_accept: "text-accent bg-accent/10",
  subscription: "text-primary bg-primary/10",
  service_order: "text-primary bg-primary/10",
  system: "text-text-muted bg-bg-surface2",
  streak_bonus: "text-warning bg-warning/10",
};

export default function NotificationsPage() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState("all");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch notifications from API
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.notifications
      .list()
      .then((res: unknown) => {
        if (cancelled) return;
        const data = res as { notifications?: ApiNotification[] };
        setNotifications((data.notifications ?? []).map(normalizeNotification));
      })
      .catch(() => {
        if (!cancelled) setNotifications([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const markAllRead = () => {
    api.notifications.markRead({ all: true }).catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const filtered = notifications.filter((n) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "mentions") return n.type === "comment" || n.type === "like";
    if (activeFilter === "gifts") return n.type === "gift" || n.type === "donation" || n.type === "streak_bonus";
    if (activeFilter === "system") return n.type === "live" || n.type === "live_start" || n.type === "battle_invite" || n.type === "system" || n.type === "subscription" || n.type === "service_order";
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-text">Notifications</h1>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-semibold bg-primary text-white rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={markAllRead} icon={<Check size={16} />}>
          Mark all read
        </Button>
      </div>

      {/* Filter tabs */}
      <Tabs tabs={filterTabs} activeTab={activeFilter} onChange={setActiveFilter} />

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      )}

      {/* Notifications list */}
      {!loading && <div className="space-y-2">
        {filtered.map((notification) => {
          return (
            <div
              key={notification.id}
              onClick={() => {
                if (!notification.read) {
                  api.notifications.markRead({ ids: [notification.id] }).catch(() => {});
                  setNotifications((prev) =>
                    prev.map((n) => n.id === notification.id ? { ...n, read: true } : n)
                  );
                }
                const t = notification.type;
                const rid = notification.relatedId;
                const rusername = notification.relatedUsername;

                // Video-related: comment, like → go to the video
                if ((t === "comment" || t === "like") && rid) {
                  router.push(`/watch/${rid}`);
                }
                // Follow → go to that user's profile (use username, not ID)
                else if (t === "follow" && rusername) {
                  router.push(`/profile/${rusername}`);
                }
                // Messages & private messages → open messages
                else if (t === "message" || t === "private_message") {
                  router.push("/messages");
                }
                // Friend request / accept → use username if available, fallback to messages
                else if (t === "friend_request" || t === "friend_accept") {
                  if (rusername) {
                    router.push(`/profile/${rusername}`);
                  } else {
                    router.push("/messages");
                  }
                }
                // Donations / gifts → wallet
                else if (t === "donation" || t === "gift") {
                  router.push("/wallet");
                }
                // Someone went live → go to live page (or their stream if relatedId)
                else if (t === "live" || t === "live_start") {
                  router.push(rid ? `/live/${rid}` : "/live");
                }
                // Battle invite → live
                else if (t === "battle_invite") {
                  router.push(rid ? `/battle/${rid}` : "/live");
                }
                // Subscription / service order → wallet
                else if (t === "subscription" || t === "service_order") {
                  router.push("/wallet");
                }
                // Streak bonus → messages (streaks are in chat)
                else if (t === "streak_bonus") {
                  router.push("/messages");
                }
                // System notifications → stay on notifications
                else if (t === "system") {
                  // no navigation
                }
              }}
              className={cn(
                "flex items-start gap-3 p-4 rounded-xl transition-colors cursor-pointer hover:bg-bg-surface2/80",
                !notification.read
                  ? "bg-bg-surface border-l-2 border-l-accent"
                  : "bg-bg-surface/50"
              )}
            >
              {/* Type icon */}
              <div
                className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center shrink-0",
                  typeColors[notification.type] || "text-text-muted bg-bg-surface2"
                )}
              >
                {typeIcons[notification.type] || <Bell size={18} />}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "text-sm leading-snug",
                    !notification.read ? "text-text font-medium" : "text-text-secondary"
                  )}
                >
                  {notification.message}
                </p>
                <p className="text-xs text-text-muted mt-1">
                  {formatTimeAgo(notification.timestamp)}
                </p>
              </div>

              {/* Unread dot */}
              {!notification.read && (
                <div className="w-2 h-2 rounded-full bg-accent shrink-0 mt-2" />
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="py-16 text-center text-text-muted">
            <Bell size={48} className="mx-auto mb-3 opacity-30" />
            <p>No notifications in this category.</p>
          </div>
        )}
      </div>}
    </div>
  );
}
