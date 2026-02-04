"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft,
  Camera,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock,
  Image as ImageIcon,
  Mic,
  MoreVertical,
  Phone,
  Plus,
  Search,
  Send,
  Settings,
  Shield,
  Smile,
  Trash2,
  Video,
  X,
  UserMinus,
  UserPlus,
  UserCheck,
  Ban,
  BellOff,
  UserCircle,
  Ghost,
  Timer,
  Eye,
  EyeOff,
  Lock,
  ImageOff,
  AlertTriangle,
  Play,
  Smartphone,
  Flame,
  Gift,
  Trophy,
  Bug,
  CheckCircle,
} from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import Modal from "@/components/ui/Modal";
import FriendTimeoutModal from "@/components/friends/FriendTimeoutModal";
import { useAuthStore } from "@/stores/auth-store";
import { useWalletStore } from "@/stores/wallet-store";
import { useUIStore } from "@/stores/ui-store";
import { useFriendsStore } from "@/stores/friends-store";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/types";

// ─── Types ──────────────────────────────────────────────────────────────────

type MessageStatus = "sent" | "delivered" | "opened" | "received";
type AutoDeleteOption = "immediately" | "after_24h" | "when_both_leave";
type DefaultDeleteTimer = "immediately" | "5s" | "10s" | "30s" | "24h";

interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: Date;
  read: boolean;
  type: "text" | "system" | "snap" | "photo" | "video" | "private" | "private-photo" | "screenshot-alert";
  reaction?: string;
  /** For private/ephemeral messages */
  privateOpened?: boolean;
  /** URL or placeholder for photo messages */
  photoUrl?: string;
  /** Delivery status for individual messages */
  msgStatus?: MessageStatus;
  /** Whether this message has been auto-deleted */
  autoDeleted?: boolean;
  /** Whether a media message has been viewed (snap behavior) */
  mediaViewed?: boolean;
  /** Once viewed, permanently opened -- cannot be re-viewed */
  permanentlyOpened?: boolean;
  /** Expiry label for 24h mode */
  expiresLabel?: string;
}

interface FriendChat {
  user: User;
  isOnline: boolean;
  streak: number;
  lastMessage: string;
  unread: boolean;
  status: MessageStatus;
  lastTimestamp: Date;
  messages: ChatMessage[];
}

// ─── Streak milestone helpers ────────────────────────────────────────────────

interface StreakMilestone {
  days: number;
  credits: number;
  label: string;
}

const STREAK_MILESTONES: StreakMilestone[] = [
  { days: 20, credits: 5, label: "5 bonus credits" },
  { days: 40, credits: 10, label: "10 bonus credits" },
  { days: 60, credits: 15, label: "15 bonus credits" },
  { days: 80, credits: 20, label: "20 bonus credits" },
  { days: 100, credits: 25, label: "25 bonus credits" },
  { days: 120, credits: 30, label: "30 bonus credits (cap)" },
  { days: 360, credits: 500, label: "$5.00 in credits (full year!)" },
];

function getNextMilestone(streak: number): StreakMilestone | null {
  for (const m of STREAK_MILESTONES) {
    if (streak < m.days) return m;
  }
  return null;
}

function getStreakProgress(streak: number): { percent: number; nextMilestone: StreakMilestone | null; prevDays: number } {
  let prevDays = 0;
  for (const m of STREAK_MILESTONES) {
    if (streak < m.days) {
      const range = m.days - prevDays;
      const progress = streak - prevDays;
      return { percent: Math.min((progress / range) * 100, 100), nextMilestone: m, prevDays };
    }
    prevDays = m.days;
  }
  return { percent: 100, nextMilestone: null, prevDays };
}

// ─── Helper: relative time ──────────────────────────────────────────────────

function relativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// ─── Status arrow component (list view) ─────────────────────────────────────

function StatusIndicator({ status, unread }: { status: MessageStatus; unread: boolean }) {
  if (unread && status === "received") {
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-accent">
        <span className="inline-block h-2 w-2 rounded-sm bg-accent" />
        New Chat
      </span>
    );
  }
  if (status === "sent") {
    return (
      <span className="flex items-center gap-1 text-xs text-danger">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 6L6 2L10 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6 2V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Sent
      </span>
    );
  }
  if (status === "delivered") {
    return (
      <span className="flex items-center gap-1 text-xs text-primary">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 6L6 2L10 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6 2V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Delivered
      </span>
    );
  }
  // opened
  return (
    <span className="flex items-center gap-1 text-xs text-text-muted">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M2 6L6 2L10 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Opened
    </span>
  );
}

// ─── Message status check marks (inline, per-message) ────────────────────────

function MessageStatusIcon({ status }: { status?: MessageStatus }) {
  if (!status) return null;
  if (status === "sent") {
    return (
      <span title="Sent" className="inline-flex text-text-muted">
        <Check size={12} />
      </span>
    );
  }
  if (status === "delivered") {
    return (
      <span title="Delivered" className="inline-flex text-text-muted">
        <CheckCheck size={12} />
      </span>
    );
  }
  if (status === "opened") {
    return (
      <span title="Opened" className="inline-flex text-[#8B5CF6]">
        <CheckCheck size={12} />
      </span>
    );
  }
  return null;
}

// ─── Private message countdown component ────────────────────────────────────

function PrivateCountdown({ seconds: initialSeconds, onExpire }: { seconds: number; onExpire: () => void }) {
  const [seconds, setSeconds] = useState(initialSeconds);

  useEffect(() => {
    if (seconds <= 0) {
      onExpire();
      return;
    }
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds, onExpire]);

  return (
    <span className="flex items-center gap-1 text-[10px] text-amber-400">
      <Timer size={10} />
      {seconds}s
    </span>
  );
}

// ─── Default delete timer settings dropdown ──────────────────────────────────

const DELETE_TIMER_OPTIONS: { value: DefaultDeleteTimer; label: string; seconds: number }[] = [
  { value: "immediately", label: "Immediately", seconds: 0 },
  { value: "5s", label: "5 seconds", seconds: 5 },
  { value: "10s", label: "10 seconds", seconds: 10 },
  { value: "30s", label: "30 seconds", seconds: 30 },
  { value: "24h", label: "24 hours", seconds: 86400 },
];

function DefaultDeleteTimerSettings({
  value,
  onChange,
}: {
  value: DefaultDeleteTimer;
  onChange: (v: DefaultDeleteTimer) => void;
}) {
  const [open, setOpen] = useState(false);
  const currentLabel = DELETE_TIMER_OPTIONS.find((o) => o.value === value)?.label ?? "Immediately";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg bg-[#1A1A24] px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-[#24243A] hover:text-text"
      >
        <Timer size={12} />
        <span>View timer: <span className="font-medium text-text">{currentLabel}</span></span>
        <ChevronDown size={12} className={cn("transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-[#2E2E48] bg-[#1A1A24] py-1 shadow-xl">
            <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Delete after recipient opens
            </div>
            {DELETE_TIMER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-[#24243A]",
                  value === opt.value ? "text-[#8B5CF6]" : "text-text-secondary"
                )}
              >
                {value === opt.value && <Check size={14} />}
                {value !== opt.value && <div className="w-[14px]" />}
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Auto-delete settings dropdown ───────────────────────────────────────────

function AutoDeleteSettings({
  value,
  onChange,
  replayEnabled,
  onReplayChange,
}: {
  value: AutoDeleteOption;
  onChange: (v: AutoDeleteOption) => void;
  replayEnabled: boolean;
  onReplayChange: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  const labels: Record<AutoDeleteOption, string> = {
    immediately: "Immediately",
    after_24h: "After 24 hours",
    when_both_leave: "When both leave chat",
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg bg-[#1A1A24] px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-[#24243A] hover:text-text"
      >
        <Settings size={12} />
        <span>Delete after viewing: <span className="font-medium text-text">{labels[value]}</span></span>
        <ChevronDown size={12} className={cn("transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-[#2E2E48] bg-[#1A1A24] py-1 shadow-xl">
            <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Auto-delete messages
            </div>
            {(Object.keys(labels) as AutoDeleteOption[]).map((opt) => (
              <button
                key={opt}
                onClick={() => { onChange(opt); setOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-[#24243A]",
                  value === opt ? "text-[#8B5CF6]" : "text-text-secondary"
                )}
              >
                {value === opt && <Check size={14} />}
                {value !== opt && <div className="w-[14px]" />}
                {labels[opt]}
              </button>
            ))}
            <div className="my-1 border-t border-[#2E2E48]" />
            <div className="px-3 py-2">
              <button
                onClick={() => onReplayChange(!replayEnabled)}
                className="flex w-full items-center justify-between text-sm"
              >
                <span className="flex items-center gap-2 text-text-secondary">
                  <Play size={14} />
                  Allow replay (media)
                </span>
                <div
                  className={cn(
                    "h-5 w-9 rounded-full transition-colors",
                    replayEnabled ? "bg-[#8B5CF6]" : "bg-[#2E2E48]"
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                      replayEnabled ? "translate-x-4" : "translate-x-0.5"
                    )}
                  />
                </div>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Streak badge component for friends list ─────────────────────────────────

function StreakBadge({ streak }: { streak: number }) {
  if (streak <= 0) return null;
  const { percent, nextMilestone } = getStreakProgress(streak);

  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="flex items-center gap-0.5 text-xs font-semibold text-[#F59E0B]">
        <Flame size={12} className="text-[#F59E0B]" />
        {streak}
      </span>
      {nextMilestone && (
        <div className="flex flex-col items-end gap-0.5">
          {/* Progress bar */}
          <div className="h-1 w-12 overflow-hidden rounded-full bg-[#2E2E48]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#F59E0B] to-[#EF4444]"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-[9px] leading-tight text-text-muted">
            {nextMilestone.days}d: {nextMilestone.label}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function MessagesPage() {
  const { currentUser } = useAuthStore();
  const [friends, setFriends] = useState<FriendChat[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatSearch, setNewChatSearch] = useState("");
  const [showTimestamps, setShowTimestamps] = useState<Record<string, boolean>>({});
  const [typingIndicator, setTypingIndicator] = useState(false);
  const [contextMenu, setContextMenu] = useState<string | null>(null);
  const [timeoutModal, setTimeoutModal] = useState<{ id: string; name: string } | null>(null);
  const [friendStatusMap, setFriendStatusMap] = useState<Record<string, "none" | "friends" | "request_sent" | "request_received">>({});
  const [friendTimeoutMap, setFriendTimeoutMap] = useState<Record<string, boolean>>({});

  // Friends store
  const {
    sendRequest: sendFriendRequest,
    cancelRequest: cancelFriendRequest,
    acceptRequest: acceptFriendRequest,
    removeFriend,
    setFriendTimeout,
  } = useFriendsStore();

  // Credit system - uses global wallet store
  const { credits: creditBalance, deductCredit } = useWalletStore();

  // Auto-delete settings (per chat, but we use a single global for simplicity)
  const [autoDeleteMode, setAutoDeleteMode] = useState<AutoDeleteOption>("immediately");
  const [replayEnabled, setReplayEnabled] = useState(false);

  // Default delete timer (sender's setting for how long recipient can view)
  const [defaultDeleteTimer, setDefaultDeleteTimer] = useState<DefaultDeleteTimer>("immediately");

  // Track messages pending auto-delete (by id)
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());

  // Private message state
  const [isPrivateMode, setIsPrivateMode] = useState(false);
  const [viewingPrivateId, setViewingPrivateId] = useState<string | null>(null);
  const [countingDown, setCountingDown] = useState<Record<string, boolean>>({});
  const [showPhotoAttach, setShowPhotoAttach] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);

  // Fullscreen image state
  const [fullscreenImage, setFullscreenImage] = useState<{
    url: string;
    isPrivate: boolean;
    msgId: string;
    countdownSeconds?: number;
  } | null>(null);

  // Bug report chat state
  const [bugChatActive, setBugChatActive] = useState(false);
  const [bugMessages, setBugMessages] = useState<{ id: string; from: "user" | "system"; text: string; time: Date }[]>([]);
  const [bugTitle, setBugTitle] = useState("");
  const [bugDescription, setBugDescription] = useState("");
  const [bugSubmitting, setBugSubmitting] = useState(false);
  const bugEndRef = useRef<HTMLDivElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // Double-send guard
  const sendingRef = useRef(false);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Helper: map API conversation response to FriendChat format
  const mapApiConversations = useCallback((apiConversations: Record<string, unknown>[]): FriendChat[] => {
    return apiConversations.map((c) => {
      const otherUser = c.otherUser as Record<string, unknown> | undefined;
      const lastMsg = c.lastMessage as Record<string, unknown> | undefined;
      const unreadCount = (c.unreadCount as number) || 0;

      const lastActiveAt = otherUser?.lastActiveAt ? new Date(otherUser.lastActiveAt as string) : null;
      const isOnline = lastActiveAt ? (Date.now() - lastActiveAt.getTime()) < 2 * 60 * 1000 : false;

      const user: User = {
        id: (otherUser?.id as string) || "",
        username: (otherUser?.username as string) || "",
        displayName: (otherUser?.displayName as string) || "",
        avatarUrl: (otherUser?.avatarUrl as string | null) || null,
        email: "",
        bio: null,
        verifiedBadge: (otherUser?.verifiedBadge as boolean) || false,
        isCreator: false,
        followerCount: 0,
        followingCount: 0,
      };

      const statusMap: Record<string, MessageStatus> = {
        SENT: "sent",
        DELIVERED: "delivered",
        OPENED: "opened",
      };

      const msgStatus = statusMap[(lastMsg?.status as string) || "SENT"] || "sent";
      const lastText = (lastMsg?.text as string) || (lastMsg?.mediaType ? "Media" : "");
      const lastCreatedAt = lastMsg?.createdAt ? new Date(lastMsg.createdAt as string) : new Date();
      const isSentByMe = (lastMsg?.senderId as string) === currentUser?.id;

      return {
        user,
        isOnline,
        streak: 0,
        lastMessage: lastText,
        unread: unreadCount > 0,
        status: (isSentByMe ? msgStatus : (unreadCount > 0 ? "received" : "opened")) as MessageStatus,
        lastTimestamp: lastCreatedAt,
        messages: [],
      };
    });
  }, [currentUser?.id]);

  // Helper: map API messages to ChatMessage format
  const mapApiMessages = useCallback((apiMessages: Record<string, unknown>[]): ChatMessage[] => {
    return apiMessages.map((m) => {
      const sender = m.sender as Record<string, unknown> | undefined;
      const statusMap: Record<string, MessageStatus> = {
        SENT: "sent",
        DELIVERED: "delivered",
        OPENED: "opened",
      };
      const isPrivate = m.isPrivate as boolean;
      const hasMedia = !!(m.mediaUrl as string);
      let msgType: ChatMessage["type"] = "text";
      if (hasMedia && isPrivate) msgType = "private-photo";
      else if (hasMedia) msgType = "photo";
      else if (isPrivate) msgType = "private";

      return {
        id: m.id as string,
        senderId: (sender?.id as string) || (m.senderId as string) || "",
        text: (m.text as string) || "",
        timestamp: new Date(m.createdAt as string),
        read: (m.status as string) === "OPENED",
        type: msgType,
        privateOpened: false,
        photoUrl: (m.mediaUrl as string) || undefined,
        msgStatus: statusMap[(m.status as string) || "SENT"] || "sent",
        autoDeleted: false,
        mediaViewed: false,
        permanentlyOpened: false,
      };
    });
  }, []);

  // Fetch conversations from API on mount + poll every 5s
  const fetchConversations = useCallback(async (isInitial = false) => {
    try {
      const [convRes, incomingRes] = await Promise.all([
        api.messages.conversations() as Promise<{ conversations?: Record<string, unknown>[] }>,
        api.friends.requests("incoming") as Promise<{ requests: Array<{ id: string; user: { id: string; username: string; displayName: string; avatarUrl: string | null }; createdAt: string }> }>,
      ]);

      // Build friend request entries as FriendChat items
      const requestEntries: FriendChat[] = (incomingRes.requests || []).map((r) => ({
        user: {
          id: r.user.id,
          username: r.user.username,
          displayName: r.user.displayName,
          avatarUrl: r.user.avatarUrl,
          email: "",
          bio: null,
          verifiedBadge: false,
          isCreator: false,
          followerCount: 0,
          followingCount: 0,
        },
        isOnline: false,
        streak: 0,
        lastMessage: "Sent you a friend request",
        unread: true,
        status: "received" as MessageStatus,
        lastTimestamp: new Date(r.createdAt),
        messages: [],
      }));

      // Update friend status map for incoming requests
      if (requestEntries.length > 0) {
        setFriendStatusMap((prev) => {
          const updated = { ...prev };
          for (const re of requestEntries) {
            updated[re.user.id] = "request_received";
          }
          return updated;
        });
      }

      if (convRes.conversations && convRes.conversations.length > 0) {
        const mapped = mapApiConversations(convRes.conversations);
        setFriends((prev) => {
          // Merge: preserve existing messages and local state, update metadata
          const merged = mapped.map((newConvo) => {
            const existing = prev.find((f) => f.user.id === newConvo.user.id);
            if (existing) {
              return {
                ...existing,
                isOnline: newConvo.isOnline,
                lastMessage: newConvo.lastMessage || existing.lastMessage,
                unread: newConvo.unread,
                status: newConvo.status,
                lastTimestamp: newConvo.lastTimestamp,
                user: { ...existing.user, ...newConvo.user },
              };
            }
            return newConvo;
          });

          // Preserve local-only conversations not yet in API (e.g. just started via new chat)
          const mergedIds = new Set(merged.map((f) => f.user.id));
          const localOnly = prev.filter((f) => !mergedIds.has(f.user.id) && f.messages.length > 0);

          // Add friend request entries that don't already have a conversation
          const existingIds = new Set([...mergedIds, ...localOnly.map((f) => f.user.id)]);
          const newRequests = requestEntries.filter((r) => !existingIds.has(r.user.id));
          return [...merged, ...localOnly, ...newRequests];
        });
      } else if (requestEntries.length > 0) {
        setFriends((prev) => {
          const existingIds = new Set(prev.map((f) => f.user.id));
          const newRequests = requestEntries.filter((r) => !existingIds.has(r.user.id));
          return [...prev.filter((f) => {
            // Remove old request entries that are no longer pending
            const isOldRequest = requestEntries.every((r) => r.user.id !== f.user.id) && f.lastMessage === "Sent you a friend request" && f.messages.length === 0;
            return !isOldRequest;
          }), ...newRequests];
        });
      }
      if (isInitial) {
        const usersRes = await fetch("/api/users", { credentials: "include" }).then(r => r.json()).catch(() => ({ users: [] }));
        const users = (usersRes as { users?: User[] }).users;
        if (users) setAllUsers(users);
      }
    } catch {
      // silently fail on polls
    }
  }, [mapApiConversations, currentUser?.id]);

  // Fetch messages for active conversation
  const fetchActiveMessages = useCallback(async (chatId: string) => {
    try {
      const res = await api.messages.getConversation(chatId) as {
        messages?: Record<string, unknown>[];
        streak?: { streakDays: number } | null;
      };
      if (res.messages) {
        const mapped = mapApiMessages(res.messages);
        setFriends((prev) =>
          prev.map((f) => {
            if (f.user.id !== chatId) return f;
            // Only update if server has newer messages we don't have locally
            const localIds = new Set(f.messages.map((m) => m.id));
            const newFromServer = mapped.filter((m) => !localIds.has(m.id));
            // Also check for messages we created optimistically (id starts with "msg-")
            const optimistic = f.messages.filter((m) => m.id.startsWith("msg-"));

            // Match optimistic messages to server messages by content + timestamp proximity
            // An optimistic message is "confirmed" if a server message has the same text
            // and senderId, and was created within 30 seconds of the optimistic one
            const usedServerIds = new Set<string>();
            const keepOptimistic = optimistic.filter((opt) => {
              const match = mapped.find((srv) =>
                !usedServerIds.has(srv.id) &&
                srv.senderId === opt.senderId &&
                srv.text === opt.text &&
                Math.abs(srv.timestamp.getTime() - opt.timestamp.getTime()) < 30000
              );
              if (match) {
                usedServerIds.add(match.id);
                return false; // server has this message, drop the optimistic one
              }
              return true; // keep: not yet on server
            });

            if (newFromServer.length === 0 && keepOptimistic.length === optimistic.length) {
              return f; // no changes
            }

            // Merge: server messages + optimistic ones not yet confirmed
            const serverMsgs = mapped;
            const mergedMessages = [...serverMsgs, ...keepOptimistic].sort(
              (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
            );

            return {
              ...f,
              messages: mergedMessages,
              streak: res.streak?.streakDays ?? f.streak,
            };
          })
        );
      }
    } catch {
      // silently fail
    }
  }, [mapApiMessages]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchConversations(true).finally(() => {
      if (!cancelled) setLoading(false);
    });

    // Poll conversations every 5 seconds
    const convInterval = setInterval(() => {
      if (!cancelled) fetchConversations();
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(convInterval);
    };
  }, [fetchConversations]);

  // Fetch friend status and timeout data — poll every 10s so sender sees acceptance
  const refreshFriendStatuses = useCallback(async () => {
    if (!friends.length) return;
    try {
      const [friendsRes, outRes, inRes, timeoutsRes] = await Promise.all([
        api.friends.list() as Promise<{ friends: Array<{ id: string }> }>,
        api.friends.requests("outgoing") as Promise<{ requests: Array<{ user: { id: string } }> }>,
        api.friends.requests("incoming") as Promise<{ requests: Array<{ user: { id: string } }> }>,
        fetch("/api/friends/timeouts", { credentials: "include" }).then((r) => r.ok ? r.json() : { timeouts: [] }) as Promise<{ timeouts: Array<{ targetId: string }> }>,
      ]);
      const map: Record<string, "none" | "friends" | "request_sent" | "request_received"> = {};
      const tMap: Record<string, boolean> = {};
      for (const f of friends) {
        const uid = f.user.id;
        if (friendsRes.friends.some((fr) => fr.id === uid)) map[uid] = "friends";
        else if (outRes.requests.some((r) => r.user.id === uid)) map[uid] = "request_sent";
        else if (inRes.requests.some((r) => r.user.id === uid)) map[uid] = "request_received";
        else map[uid] = "none";
        tMap[uid] = timeoutsRes.timeouts.some((t) => t.targetId === uid);
      }
      setFriendStatusMap((prev) => {
        const changed = Object.keys(map).some((k) => (prev[k] || "none") !== map[k]);
        return changed ? { ...prev, ...map } : prev;
      });
      setFriendTimeoutMap(tMap);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friends.length]);

  useEffect(() => {
    if (!friends.length) return;
    refreshFriendStatuses();
    const interval = setInterval(refreshFriendStatuses, 10000);
    return () => clearInterval(interval);
  }, [refreshFriendStatuses]);

  // Poll active chat messages every 3 seconds
  useEffect(() => {
    if (!activeChatId) return;

    // Fetch messages immediately when opening a chat
    fetchActiveMessages(activeChatId);

    const msgInterval = setInterval(() => {
      fetchActiveMessages(activeChatId);
    }, 3000);

    return () => clearInterval(msgInterval);
  }, [activeChatId, fetchActiveMessages]);

  const activeChat = friends.find((f) => f.user.id === activeChatId) ?? null;

  // Get countdown seconds from default delete timer
  const getCountdownSeconds = (): number => {
    const opt = DELETE_TIMER_OPTIONS.find((o) => o.value === defaultDeleteTimer);
    if (!opt || opt.seconds === 0) return 5; // fallback for "immediately"
    if (opt.seconds > 60) return 5; // for 24h we still show a 5s preview
    return opt.seconds;
  };

  // Sort: unread first, then online, then by timestamp
  const sortedFriends = [...friends].sort((a, b) => {
    if (a.unread !== b.unread) return a.unread ? -1 : 1;
    if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
    return b.lastTimestamp.getTime() - a.lastTimestamp.getTime();
  });

  const filteredFriends = sortedFriends.filter((f) =>
    f.user.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.user.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Auto-scroll to bottom of messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [activeChat?.messages.length, scrollToBottom]);

  // Auto-scroll bug chat
  useEffect(() => {
    bugEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [bugMessages]);

  const handleBugSubmit = async () => {
    if (!bugTitle.trim() || !bugDescription.trim() || bugSubmitting) return;

    setBugSubmitting(true);
    setBugMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, from: "user", text: `Bug: ${bugTitle.trim()}\n\n${bugDescription.trim()}`, time: new Date() },
    ]);

    try {
      const res = await fetch("/api/bugs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: bugTitle.trim(),
          description: bugDescription.trim(),
          page: window.location.pathname,
        }),
      });
      const data = await res.json();

      if (res.ok) {
        setBugMessages((prev) => [
          ...prev,
          { id: `sys-ok-${Date.now()}`, from: "system", text: "Bug report submitted! Our team will review and fix it. You can submit another one below.", time: new Date() },
        ]);
        setBugTitle("");
        setBugDescription("");
      } else {
        setBugMessages((prev) => [
          ...prev,
          { id: `sys-err-${Date.now()}`, from: "system", text: `Error: ${data.error || "Failed to submit"}. Try again.`, time: new Date() },
        ]);
      }
    } catch {
      setBugMessages((prev) => [
        ...prev,
        { id: `sys-err-${Date.now()}`, from: "system", text: "Network error. Please try again.", time: new Date() },
      ]);
    }

    setBugSubmitting(false);
  };

  // Mark as read when opening chat
  useEffect(() => {
    if (activeChatId) {
      // Update local state immediately
      setFriends((prev) =>
        prev.map((f) =>
          f.user.id === activeChatId
            ? { ...f, unread: false, status: f.status === "received" ? "opened" : f.status }
            : f
        )
      );

      // Mark unread messages as opened on the server
      const chat = friends.find((f) => f.user.id === activeChatId);
      if (chat) {
        const unreadMessages = chat.messages.filter(
          (m) => m.senderId !== currentUser?.id && m.msgStatus === "received"
        );
        for (const msg of unreadMessages) {
          api.messages.openMessage(activeChatId, msg.id).catch(() => {
            // silently fail
          });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId]);

  // Auto-delete logic: ONLY for private messages when mode is "immediately"
  useEffect(() => {
    if (autoDeleteMode !== "immediately") return;
    if (!activeChat) return;

    const openedPrivateMessages = activeChat.messages.filter(
      (m) =>
        m.msgStatus === "opened" &&
        !m.autoDeleted &&
        (m.type === "private" || m.type === "private-photo") &&
        m.senderId !== "system" &&
        !pendingDeletes.has(m.id)
    );

    openedPrivateMessages.forEach((msg) => {
      setPendingDeletes((prev) => new Set(prev).add(msg.id));
      setTimeout(() => {
        setFriends((prev) =>
          prev.map((f) =>
            f.user.id === activeChatId
              ? {
                  ...f,
                  messages: f.messages.map((m) =>
                    m.id === msg.id ? { ...m, autoDeleted: true } : m
                  ),
                }
              : f
          )
        );
        setPendingDeletes((prev) => {
          const next = new Set(prev);
          next.delete(msg.id);
          return next;
        });
      }, 2500);
    });
  }, [activeChat, autoDeleteMode, pendingDeletes, activeChatId]);

  // Handle opening a private message
  const handleOpenPrivate = useCallback((msgId: string) => {
    setViewingPrivateId(msgId);
    setCountingDown((prev) => ({ ...prev, [msgId]: true }));
  }, []);

  // Handle private message expiry after countdown
  const handlePrivateExpire = useCallback((msgId: string) => {
    setCountingDown((prev) => ({ ...prev, [msgId]: false }));
    setViewingPrivateId(null);
    setFriends((prev) =>
      prev.map((f) =>
        f.user.id === activeChatId
          ? {
              ...f,
              messages: f.messages.map((m) =>
                m.id === msgId ? { ...m, privateOpened: true } : m
              ),
            }
          : f
      )
    );
  }, [activeChatId]);

  // Handle viewing a media message (snap behavior) -- permanently opens it
  const handleViewMedia = useCallback((msgId: string) => {
    setFriends((prev) =>
      prev.map((f) =>
        f.user.id === activeChatId
          ? {
              ...f,
              messages: f.messages.map((m) =>
                m.id === msgId ? { ...m, mediaViewed: true, permanentlyOpened: true } : m
              ),
            }
          : f
      )
    );
  }, [activeChatId]);

  // Voice recording handlers
  const startRecording = useCallback(async () => {
    if (!activeChatId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4" });
      recordingChunksRef.current = [];
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data);
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
    } catch {
      useUIStore.getState().addToast("Microphone access denied", "error");
    }
  }, [activeChatId]);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
    }
    mediaRecorderRef.current = null;
    recordingChunksRef.current = [];
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
    setIsRecording(false);
    setRecordingDuration(0);
  }, []);

  const sendRecording = useCallback(() => {
    if (!mediaRecorderRef.current || !activeChatId) return;
    const recorder = mediaRecorderRef.current;

    recorder.onstop = () => {
      recorder.stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType });
      recordingChunksRef.current = [];

      // Convert blob to base64 data URL and send as audio message
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;

        const newMsg: ChatMessage = {
          id: `msg-${Date.now()}`,
          senderId: currentUser?.id ?? "",
          text: "Voice message",
          timestamp: new Date(),
          read: false,
          type: "photo" as ChatMessage["type"],
          photoUrl: base64,
          msgStatus: "sent",
          mediaViewed: false,
          permanentlyOpened: false,
        };

        api.messages.send({
          receiverId: activeChatId,
          text: "Voice message",
          mediaUrl: base64,
          mediaType: "audio",
          isPrivate: isPrivateMode,
          deleteAfter: isPrivateMode ? autoDeleteMode : "never",
        }).catch(() => {});

        setFriends((prev) =>
          prev.map((f) =>
            f.user.id === activeChatId
              ? { ...f, messages: [...f.messages, newMsg], lastMessage: "Voice message", lastTimestamp: new Date(), status: "sent" as MessageStatus }
              : f
          )
        );
      };
      reader.readAsDataURL(blob);
    };

    if (recorder.state !== "inactive") recorder.stop();
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
    setIsRecording(false);
    setRecordingDuration(0);
  }, [activeChatId, currentUser?.id, isPrivateMode, autoDeleteMode]);

  // Send message handler
  const handleSend = () => {
    if (sendingRef.current) return;
    const hasText = chatInput.trim().length > 0;
    const hasPhoto = pendingPhoto !== null;
    if (!hasText && !hasPhoto) return;
    if (!activeChatId) return;
    sendingRef.current = true;

    // Credit check - only costs credits in private mode
    if (isPrivateMode) {
      if (creditBalance <= 0) { sendingRef.current = false; return; }
      deductCredit();
    }

    let msgType: ChatMessage["type"] = "text";
    if (hasPhoto && isPrivateMode) msgType = "private-photo";
    else if (hasPhoto) msgType = "photo";
    else if (isPrivateMode) msgType = "private";

    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      senderId: currentUser?.id ?? "",
      text: hasText ? chatInput.trim() : "",
      timestamp: new Date(),
      read: false,
      type: msgType,
      privateOpened: false,
      photoUrl: hasPhoto ? pendingPhoto! : undefined,
      msgStatus: "sent",
      mediaViewed: false,
      permanentlyOpened: false,
    };

    const textToSend = hasText ? chatInput.trim() : undefined;
    const photoToSend = hasPhoto ? pendingPhoto! : undefined;

    // Clear input immediately to prevent re-sends
    setChatInput("");
    setPendingPhoto(null);

    // Send via API (fire-and-forget, UI updates optimistically)
    api.messages.send({
      receiverId: activeChatId,
      text: textToSend,
      mediaUrl: photoToSend,
      mediaType: hasPhoto ? "photo" : undefined,
      isPrivate: isPrivateMode,
      deleteAfter: isPrivateMode ? autoDeleteMode : "never",
    }).catch(() => {}).finally(() => { sendingRef.current = false; });

    const lastMsgPreview = isPrivateMode
      ? (hasPhoto ? "Private photo" : "Private message")
      : (hasPhoto ? "Photo" : chatInput.trim());

    setFriends((prev) =>
      prev.map((f) =>
        f.user.id === activeChatId
          ? {
              ...f,
              messages: [...f.messages, newMsg],
              lastMessage: lastMsgPreview,
              lastTimestamp: new Date(),
              status: "sent" as MessageStatus,
            }
          : f
      )
    );
    // Private mode is persistent -- do NOT reset it here

    // Simulate message status progression: sent -> delivered -> opened
    const msgId = newMsg.id;

    // Mark as delivered after 600ms
    setTimeout(() => {
      setFriends((prev) =>
        prev.map((f) =>
          f.user.id === activeChatId
            ? {
                ...f,
                status: "delivered" as MessageStatus,
                messages: f.messages.map((m) =>
                  m.id === msgId ? { ...m, msgStatus: "delivered" as MessageStatus } : m
                ),
              }
            : f
        )
      );
    }, 600);

    // Mark as opened after 1000ms
    setTimeout(() => {
      setFriends((prev) =>
        prev.map((f) =>
          f.user.id === activeChatId
            ? {
                ...f,
                status: "opened" as MessageStatus,
                messages: f.messages.map((m) =>
                  m.id === msgId ? { ...m, msgStatus: "opened" as MessageStatus, read: true } : m
                ),
              }
            : f
        )
      );

      // If private mode and auto-delete is "immediately", schedule deletion
      if (isPrivateMode && autoDeleteMode === "immediately") {
        setPendingDeletes((prev) => new Set(prev).add(msgId));
        setTimeout(() => {
          setFriends((prev) =>
            prev.map((f) =>
              f.user.id === activeChatId
                ? {
                    ...f,
                    messages: f.messages.map((m) =>
                      m.id === msgId ? { ...m, autoDeleted: true } : m
                    ),
                  }
                : f
            )
          );
          setPendingDeletes((prev) => {
            const next = new Set(prev);
            next.delete(msgId);
            return next;
          });
        }, 2500);
      }
    }, 1000);

  };

  // Send a photo attachment -- costs 1 credit only in private mode
  const handleAttachPhoto = (url: string) => {
    setPendingPhoto(url);
    setShowPhotoAttach(false);
  };

  // Take a picture using device camera
  const handleTakePicture = async () => {
    if (isPrivateMode && creditBalance <= 0) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      const video = document.createElement("video");
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      await video.play();
      // Wait a frame for the video to render
      await new Promise((r) => setTimeout(r, 300));
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        setPendingPhoto(dataUrl);
      }
      stream.getTracks().forEach((t) => t.stop());
      setShowPhotoAttach(false);
    } catch {
      // Camera not available — fall back to file picker
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.capture = "user";
      input.onchange = () => {
        const file = input.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            setPendingPhoto(reader.result as string);
            setShowPhotoAttach(false);
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
    }
  };

  // Open image in fullscreen overlay
  const handleImageFullscreen = useCallback((url: string, msgId: string, isPrivate: boolean, countdownSeconds?: number) => {
    setFullscreenImage({ url, isPrivate, msgId, countdownSeconds });
  }, []);

  // Close fullscreen overlay
  const closeFullscreen = useCallback(() => {
    setFullscreenImage(null);
  }, []);

  // Handle fullscreen timer expiry (for private images)
  const handleFullscreenTimerExpire = useCallback(() => {
    if (fullscreenImage) {
      handlePrivateExpire(fullscreenImage.msgId);
      setFullscreenImage(null);
    }
  }, [fullscreenImage, handlePrivateExpire]);

  // Delete a single message (remove from local state + call API)
  const handleDeleteMessage = useCallback((msgId: string) => {
    if (!activeChatId) return;
    setFriends((prev) =>
      prev.map((f) =>
        f.user.id === activeChatId
          ? { ...f, messages: f.messages.filter((m) => m.id !== msgId) }
          : f
      )
    );
    // Call API to mark as deleted on server (fire-and-forget)
    if (!msgId.startsWith("msg-")) {
      api.messages.openMessage(activeChatId, msgId).catch(() => {});
    }
  }, [activeChatId]);

  // Toggle message timestamp
  const toggleTimestamp = (msgId: string) => {
    setShowTimestamps((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  // Reaction handler (double tap simulation)
  const handleReaction = (msgId: string) => {
    setFriends((prev) =>
      prev.map((f) =>
        f.user.id === activeChatId
          ? {
              ...f,
              messages: f.messages.map((m) =>
                m.id === msgId
                  ? { ...m, reaction: m.reaction ? undefined : "\u2764\uFE0F" }
                  : m
              ),
            }
          : f
      )
    );
  };

  // New chat from user list
  const availableUsers = allUsers.filter(
    (u) => u.id !== currentUser?.id && !friends.some((f) => f.user.id === u.id)
  );
  const filteredNewUsers = availableUsers.filter(
    (u) =>
      u.displayName.toLowerCase().includes(newChatSearch.toLowerCase()) ||
      u.username.toLowerCase().includes(newChatSearch.toLowerCase())
  );

  // Block a user
  const handleBlockUser = async (userId: string, displayName: string) => {
    if (!confirm(`Block ${displayName}? They won't be able to message you.`)) return;
    try {
      await api.users.block(userId);
      // Remove from friends list and close chat if open
      setFriends((prev) => prev.filter((f) => f.user.id !== userId));
      if (activeChatId === userId) setActiveChatId(null);
      setContextMenu(null);
    } catch {
      useUIStore.getState().addToast("Failed to block user. Try again.", "error");
    }
  };

  // Remove conversation (delete)
  const handleRemoveConversation = async (userId: string, displayName: string) => {
    if (!confirm(`Remove conversation with ${displayName}? Messages will be deleted.`)) return;
    try {
      await api.messages.deleteConversation(userId);
      setFriends((prev) => prev.filter((f) => f.user.id !== userId));
      if (activeChatId === userId) setActiveChatId(null);
      setContextMenu(null);
    } catch {
      useUIStore.getState().addToast("Failed to delete conversation. Try again.", "error");
    }
  };

  const startNewChat = async (user: User) => {
    // Check if conversation already exists
    const existing = friends.find((f) => f.user.id === user.id);
    if (existing) {
      setShowNewChat(false);
      setNewChatSearch("");
      setActiveChatId(user.id);
      return;
    }

    const newChat: FriendChat = {
      user,
      isOnline: false,
      streak: 0,
      lastMessage: "New conversation",
      unread: false,
      status: "opened",
      lastTimestamp: new Date(),
      messages: [],
    };
    setFriends((prev) => [newChat, ...prev]);
    setShowNewChat(false);
    setNewChatSearch("");
    setActiveChatId(user.id);
  };

  // ─── Render: Message bubble ────────────────────────────────────────────

  const renderMessageBubble = (msg: ChatMessage, isMe: boolean) => {
    const isPrivate = msg.type === "private" || msg.type === "private-photo";
    const isPhoto = msg.type === "photo" || msg.type === "private-photo";
    const isVideo = msg.type === "video";
    const isMedia = isPhoto || isVideo;
    const isOpened = msg.privateOpened === true;
    const isCurrentlyViewing = viewingPrivateId === msg.id;
    const isCountingDownNow = countingDown[msg.id] === true;

    // Auto-deleted message - for private mode, remove entirely after 2s
    if (msg.autoDeleted) {
      if (isPrivate) {
        // Schedule full removal of the "deleted" placeholder after 2s
        setTimeout(() => {
          setFriends((prev) =>
            prev.map((f) =>
              f.user.id === activeChatId
                ? { ...f, messages: f.messages.filter((m) => m.id !== msg.id) }
                : f
            )
          );
        }, 2000);
      }
      return (
        <div
          className={cn(
            "flex max-w-[280px] items-center gap-2 rounded-2xl border border-dashed px-3.5 py-2 text-sm",
            isPrivate ? "animate-pulse" : "",
            isMe
              ? "rounded-br-md border-[#2E2E48] bg-[#1A1A24]/50"
              : "rounded-bl-md border-[#2E2E48] bg-[#1A1A24]/50"
          )}
        >
          <Trash2 size={14} className="shrink-0 text-text-muted" />
          <span className="text-text-muted italic">Message deleted</span>
        </div>
      );
    }

    // Private message that has been opened
    if (isPrivate && isOpened && !isCurrentlyViewing) {
      return (
        <div
          className={cn(
            "flex max-w-[280px] items-center gap-2 rounded-2xl border border-dashed px-3.5 py-2 text-sm",
            isMe
              ? "rounded-br-md border-[#8B5CF6]/30 bg-[#8B5CF6]/5"
              : "rounded-bl-md border-[#6366F1]/30 bg-[#6366F1]/5"
          )}
        >
          <EyeOff size={14} className="shrink-0 text-text-muted" />
          <span className="text-text-muted italic">
            {isPhoto ? "Photo has been viewed" : "Message has been opened"}
          </span>
        </div>
      );
    }

    // Private message currently being viewed (countdown active)
    if (isPrivate && isCurrentlyViewing && isCountingDownNow) {
      return (
        <div
          className={cn(
            "relative max-w-[280px] rounded-2xl border border-dashed px-3.5 py-2 text-sm",
            isMe
              ? "rounded-br-md border-[#8B5CF6]/40 bg-[#8B5CF6]/10"
              : "rounded-bl-md border-[#6366F1]/40 bg-[#6366F1]/10"
          )}
        >
          <div className="mb-1 flex items-center gap-1.5">
            <Ghost size={12} className="text-amber-400" />
            <PrivateCountdown seconds={getCountdownSeconds()} onExpire={() => handlePrivateExpire(msg.id)} />
          </div>
          {isPhoto && msg.photoUrl ? (
            <div className="overflow-hidden rounded-lg">
              <img
                src={msg.photoUrl}
                alt="Private photo"
                className="h-32 w-full object-cover cursor-pointer"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  handleImageFullscreen(msg.photoUrl!, msg.id, true, getCountdownSeconds());
                }}
              />
            </div>
          ) : (
            <span className={isMe ? "text-white" : "text-text"}>{msg.text}</span>
          )}
          {isPhoto && msg.text && (
            <p className={cn("mt-1 text-xs", isMe ? "text-white/80" : "text-text-secondary")}>
              {msg.text}
            </p>
          )}
        </div>
      );
    }

    // Private message not yet opened -- tap to view
    if (isPrivate && !isOpened) {
      return (
        <button
          onClick={() => handleOpenPrivate(msg.id)}
          className={cn(
            "group/prv flex max-w-[280px] items-center gap-2.5 rounded-2xl border border-dashed px-3.5 py-2.5 text-sm transition-all hover:scale-[1.02]",
            isMe
              ? "rounded-br-md border-[#8B5CF6]/40 bg-[#8B5CF6]/10 hover:bg-[#8B5CF6]/15"
              : "rounded-bl-md border-[#6366F1]/40 bg-[#6366F1]/10 hover:bg-[#6366F1]/15"
          )}
        >
          {isPhoto ? (
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg">
              <img
                src={msg.photoUrl}
                alt=""
                className="h-full w-full object-cover blur-lg brightness-50"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <ImageOff size={18} className="text-white/70" />
              </div>
            </div>
          ) : (
            <Ghost size={18} className={cn(
              "shrink-0 transition-transform group-hover/prv:scale-110",
              isMe ? "text-[#8B5CF6]" : "text-[#6366F1]"
            )} />
          )}
          <div className="min-w-0 text-left">
            <span className={cn(
              "font-medium",
              isMe ? "text-[#8B5CF6]" : "text-[#6366F1]"
            )}>
              {isPhoto ? "Private photo" : "Private message"}
            </span>
            <span className="mt-0.5 flex items-center gap-1 text-[10px] text-text-muted">
              <Eye size={10} /> Tap to view
            </span>
          </div>
        </button>
      );
    }

    // Photo / Video message (non-private) -- always visible, no snap behavior
    if ((isPhoto || isVideo) && msg.photoUrl) {
      const mediaLabel = isVideo ? "Video" : "Photo";

      return (
        <div
          className={cn(
            "relative max-w-[280px] overflow-hidden rounded-2xl text-sm",
            isMe
              ? "rounded-br-md bg-[#8B5CF6]"
              : "rounded-bl-md bg-[#1A1A24]"
          )}
        >
          <img
            src={msg.photoUrl}
            alt={mediaLabel}
            className="h-40 w-full object-cover cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              handleImageFullscreen(msg.photoUrl!, msg.id, false);
            }}
          />
          {msg.text && (
            <p className={cn("px-3.5 pt-2 text-sm", isMe ? "text-white" : "text-text")}>
              {msg.text}
            </p>
          )}
          <div className="flex items-center gap-1.5 px-3 py-1.5">
            {isVideo ? (
              <Play size={12} className={isMe ? "text-white/60" : "text-text-muted"} />
            ) : (
              <Camera size={12} className={isMe ? "text-white/60" : "text-text-muted"} />
            )}
            <span className={cn("text-xs", isMe ? "text-white/60" : "text-text-muted")}>
              {mediaLabel}
            </span>
            <span className={cn("ml-auto text-[10px]", isMe ? "text-white/50" : "text-text-muted")}>
              {formatTimestamp(msg.timestamp)}
            </span>
            {isMe && <MessageStatusIcon status={msg.msgStatus} />}
          </div>
        </div>
      );
    }

    // Regular text message - no auto-delete for normal messages
    return (
      <div
        className={cn(
          "relative max-w-[280px] rounded-2xl px-3.5 py-2 text-sm leading-relaxed transition-all",
          isMe
            ? "rounded-br-md bg-[#8B5CF6] text-white"
            : "rounded-bl-md bg-[#1A1A24] text-text",
          msg.read && isMe && "opacity-80"
        )}
      >
        {msg.text}

        {/* Inline timestamp + status for all messages */}
        <span className={cn(
          "mt-1 flex items-center justify-end gap-1 text-[10px]",
          isMe ? "text-white/50" : "text-text-muted"
        )}>
          {formatTimestamp(msg.timestamp)}
          {isMe && <MessageStatusIcon status={msg.msgStatus} />}
        </span>
      </div>
    );
  };

  // ─── Render: Friends List Panel ─────────────────────────────────────────

  const renderFriendsList = () => (
    <div className="flex h-full flex-col bg-[#0F0F14]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <div className="shrink-0">
          <Avatar
            src={currentUser?.avatarUrl}
            name={currentUser?.displayName ?? "You"}
            size="sm"
          />
        </div>
        <h1 className="text-lg font-bold text-text">Chat</h1>
        <button
          onClick={() => setShowNewChat(true)}
          className="rounded-full p-2 text-text-secondary transition-colors hover:bg-[#1A1A24] hover:text-text"
        >
          <Plus size={22} />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 pb-3 pt-1">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search friends..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-full bg-[#1A1A24] py-2 pl-9 pr-4 text-sm text-text placeholder:text-text-muted outline-none focus:ring-1 focus:ring-[#8B5CF6]/40"
          />
        </div>
      </div>

      {/* Friends list */}
      <div className="flex-1 overflow-y-auto">
        {/* Bug Report pinned chat */}
        <button
          onClick={() => {
            setBugChatActive(true);
            setActiveChatId(null);
          }}
          className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#1A1A24] border-b border-[#2E2E48]/50 ${
            bugChatActive ? "bg-[#1A1A24]" : ""
          }`}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/20">
            <Bug size={20} className="text-red-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-red-400">Bug Reports</span>
              <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full font-medium">SUPPORT</span>
            </div>
            <p className="mt-0.5 truncate text-xs text-text-muted">
              Report bugs to help improve Rally Live
            </p>
          </div>
        </button>

        {loading ? (
          <div className="flex items-center justify-center px-4 py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filteredFriends.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <p className="text-sm text-text-muted">No conversations found</p>
          </div>
        ) : (
          filteredFriends.map((friend) => (
            <div
              key={friend.user.id}
              role="button"
              tabIndex={0}
              onClick={() => {
                setActiveChatId(friend.user.id);
                setBugChatActive(false);
                setContextMenu(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setActiveChatId(friend.user.id);
                  setBugChatActive(false);
                  setContextMenu(null);
                }
              }}
              className="group relative flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors"
              style={(() => {
                const fst = friendStatusMap[friend.user.id] || "none";
                const clr = friendTimeoutMap[friend.user.id]
                  ? "#F59E0B"
                  : fst === "friends"
                    ? "#22C55E"
                    : fst === "request_sent" || fst === "request_received"
                      ? "#38BDF8"
                      : null;
                if (clr) {
                  return { backgroundColor: activeChatId === friend.user.id ? `${clr}33` : `${clr}1F` };
                }
                return activeChatId === friend.user.id ? { backgroundColor: "#1A1A24" } : {};
              })()}
            >
              {/* Friend status accent bar */}
              <div
                className="absolute left-0 top-1/2 h-8 w-[3px] -translate-y-1/2 rounded-r-full transition-colors"
                style={{
                  backgroundColor: friendTimeoutMap[friend.user.id]
                    ? "#F59E0B"
                    : (friendStatusMap[friend.user.id] || "none") === "friends"
                      ? "#22C55E"
                      : (friendStatusMap[friend.user.id] || "none") === "request_sent" || (friendStatusMap[friend.user.id] || "none") === "request_received"
                        ? "#38BDF8"
                        : "transparent",
                }}
              />

              {/* Avatar */}
              <Avatar
                src={friend.user.avatarUrl}
                name={friend.user.displayName}
                size="md"
                online={friend.isOnline}
                verified={friend.user.verifiedBadge}
              />

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span
                    className={`truncate text-sm ${
                      friend.unread ? "font-bold text-text" : "font-medium text-text"
                    }`}
                  >
                    {friend.user.displayName}
                  </span>
                  <span className="ml-2 shrink-0 text-[11px] text-text-muted">
                    {relativeTime(friend.lastTimestamp)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  {(friendStatusMap[friend.user.id] || "none") === "request_received" && friend.lastMessage === "Sent you a friend request" ? (
                    <span className="text-xs font-semibold" style={{ color: "#38BDF8" }}>
                      Friend Request
                    </span>
                  ) : (
                    <>
                      <StatusIndicator status={friend.status} unread={friend.unread} />
                      {!friend.unread && friend.status !== "received" && (
                        <span className="truncate text-xs text-text-muted">
                          {friend.lastMessage}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Accept/Decline for incoming friend requests */}
              {(friendStatusMap[friend.user.id] || "none") === "request_received" && friend.lastMessage === "Sent you a friend request" ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      setFriendStatusMap((prev) => ({ ...prev, [friend.user.id]: "friends" }));
                      try {
                        await acceptFriendRequest(friend.user.id);
                      } catch {
                        setFriendStatusMap((prev) => ({ ...prev, [friend.user.id]: "request_received" }));
                      }
                    }}
                    className="rounded-md px-2.5 py-1 text-xs font-semibold text-white transition-colors"
                    style={{ backgroundColor: "#22C55E" }}
                  >
                    Accept
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      setFriendStatusMap((prev) => ({ ...prev, [friend.user.id]: "none" }));
                      setFriends((prev) => prev.filter((f) => f.user.id !== friend.user.id));
                      try {
                        await useFriendsStore.getState().declineRequest(friend.user.id);
                      } catch {
                        setFriendStatusMap((prev) => ({ ...prev, [friend.user.id]: "request_received" }));
                      }
                    }}
                    className="rounded-md border px-2.5 py-1 text-xs font-semibold text-text-secondary transition-colors hover:text-text"
                    style={{ borderColor: "#2E2E48" }}
                  >
                    Decline
                  </button>
                </div>
              ) : (
                <>
                  {/* Streak badge with progress */}
                  <StreakBadge streak={friend.streak} />
                </>
              )}

              {/* Context menu trigger */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setContextMenu(contextMenu === friend.user.id ? null : friend.user.id);
                }}
                className="shrink-0 rounded p-1 text-text-muted opacity-0 transition-opacity hover:bg-[#24243A] hover:text-text group-hover:opacity-100"
              >
                <MoreVertical size={16} />
              </button>

              {/* Context dropdown */}
              {contextMenu === friend.user.id && (() => {
                const fStatus = friendStatusMap[friend.user.id] || "none";
                const hasTimeout = friendTimeoutMap[friend.user.id];
                const statusColor = hasTimeout
                  ? "#F59E0B"
                  : fStatus === "friends"
                    ? "#22C55E"
                    : fStatus === "request_sent" || fStatus === "request_received"
                      ? "#38BDF8"
                      : null;
                const statusLabel = hasTimeout
                  ? "Timed Out"
                  : fStatus === "friends"
                    ? "Friends"
                    : fStatus === "request_sent"
                      ? "Request Sent"
                      : fStatus === "request_received"
                        ? "Request Received"
                        : null;

                return (
                  <div
                    className="absolute right-4 top-full z-50 w-56 rounded-lg border py-1 shadow-xl transition-colors"
                    style={{
                      borderColor: statusColor ? `${statusColor}99` : "#2E2E48",
                      backgroundColor: statusColor ? `${statusColor}18` : "#1A1A24",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Status indicator at top */}
                    {statusLabel && statusColor && (
                      <div
                        className="flex items-center gap-2 px-3 py-2 text-xs font-semibold"
                        style={{ color: statusColor }}
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: statusColor }}
                        />
                        {statusLabel}
                      </div>
                    )}

                    <a
                      href={`/profile/${friend.user.username}`}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-[#24243A] hover:text-text"
                    >
                      <UserCircle size={16} /> View Profile
                    </a>

                    {/* Friend actions based on status */}
                    {fStatus === "none" && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          setFriendStatusMap((prev) => ({ ...prev, [friend.user.id]: "request_sent" }));
                          try {
                            await sendFriendRequest(friend.user.id);
                          } catch {
                            // If already friends (409), reflect that; otherwise reset
                            refreshFriendStatuses();
                          }
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-[#24243A] hover:text-text"
                      >
                        <UserPlus size={16} /> Add Friend
                      </button>
                    )}
                    {fStatus === "request_sent" && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          setFriendStatusMap((prev) => ({ ...prev, [friend.user.id]: "none" }));
                          try {
                            await cancelFriendRequest(friend.user.id);
                          } catch {
                            setFriendStatusMap((prev) => ({ ...prev, [friend.user.id]: "request_sent" }));
                          }
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[#38BDF8] hover:bg-[#24243A]"
                      >
                        <Clock size={16} /> Cancel Request
                      </button>
                    )}
                    {fStatus === "request_received" && (
                      <>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            setFriendStatusMap((prev) => ({ ...prev, [friend.user.id]: "friends" }));
                            try {
                              await acceptFriendRequest(friend.user.id);
                            } catch {
                              setFriendStatusMap((prev) => ({ ...prev, [friend.user.id]: "request_received" }));
                            }
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[#22C55E] hover:bg-[#24243A]"
                        >
                          <Check size={16} /> Accept Friend Request
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            setFriendStatusMap((prev) => ({ ...prev, [friend.user.id]: "none" }));
                            try {
                              await useFriendsStore.getState().declineRequest(friend.user.id);
                            } catch {
                              setFriendStatusMap((prev) => ({ ...prev, [friend.user.id]: "request_received" }));
                            }
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-[#24243A] hover:text-text"
                        >
                          <X size={16} /> Decline Friend Request
                        </button>
                      </>
                    )}
                    {fStatus === "friends" && (
                      <>
                        {hasTimeout ? (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              setFriendTimeoutMap((prev) => ({ ...prev, [friend.user.id]: false }));
                              try {
                                await useFriendsStore.getState().removeFriendTimeout(friend.user.id);
                              } catch {
                                setFriendTimeoutMap((prev) => ({ ...prev, [friend.user.id]: true }));
                              }
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[#F59E0B] hover:bg-[#24243A]"
                          >
                            <BellOff size={16} /> Remove Timeout
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setTimeoutModal({ id: friend.user.id, name: friend.user.displayName });
                              setContextMenu(null);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-[#24243A] hover:text-text"
                          >
                            <BellOff size={16} /> Friend Timeout
                          </button>
                        )}
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!confirm(`Remove ${friend.user.displayName} as a friend?`)) return;
                            setFriendStatusMap((prev) => ({ ...prev, [friend.user.id]: "none" }));
                            setFriendTimeoutMap((prev) => ({ ...prev, [friend.user.id]: false }));
                            try {
                              await removeFriend(friend.user.id);
                            } catch {
                              setFriendStatusMap((prev) => ({ ...prev, [friend.user.id]: "friends" }));
                            }
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-warning hover:bg-[#24243A]"
                        >
                          <UserMinus size={16} /> Remove Friend
                        </button>
                      </>
                    )}

                    <div className="my-1 border-t border-[#2E2E48]" />

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveConversation(friend.user.id, friend.user.displayName);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-[#24243A]"
                    >
                      <Trash2 size={16} /> Delete Conversation
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleBlockUser(friend.user.id, friend.user.displayName);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-[#24243A]"
                    >
                      <Ban size={16} /> Block
                    </button>
                  </div>
                );
              })()}
            </div>
          ))
        )}
      </div>
    </div>
  );

  // ─── Render: Chat Thread ──────────────────────────────────────────────

  const renderChatThread = () => {
    if (!activeChat) {
      return (
        <div className="flex h-full flex-col items-center justify-center bg-[#0F0F14] text-center">
          <div className="mb-4 rounded-full bg-[#1A1A24] p-6">
            <Send size={32} className="text-text-muted" />
          </div>
          <h3 className="text-lg font-semibold text-text">Your Messages</h3>
          <p className="mt-1 max-w-xs text-sm text-text-muted">
            Send a message to start a conversation with your friends.
          </p>
          <button
            onClick={() => setShowNewChat(true)}
            className="mt-4 rounded-full bg-[#8B5CF6] px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7C3AED]"
          >
            New Chat
          </button>
        </div>
      );
    }

    return (
      <div className="flex h-full flex-col bg-[#0F0F14]">
        {/* Chat header with credit balance */}
        <div className="flex items-center gap-3 border-b border-[#2E2E48] px-4 py-3">
          <button
            onClick={() => setActiveChatId(null)}
            className="shrink-0 rounded-full p-1 text-text-secondary transition-colors hover:bg-[#1A1A24] hover:text-text md:hidden"
          >
            <ArrowLeft size={22} />
          </button>
          <Avatar
            src={activeChat.user.avatarUrl ?? undefined}
            name={activeChat.user.displayName}
            size="sm"
            online={activeChat.isOnline}
            verified={activeChat.user.verifiedBadge}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-text">
              {activeChat.user.displayName}
            </p>
            <p className="text-xs text-text-muted">
              {activeChat.isOnline ? (
                <span className="text-[#10B981]">Online</span>
              ) : (new Date().getTime() - new Date(activeChat.lastTimestamp).getTime()) < 15 * 60 * 1000 ? (
                <span className="text-yellow-400">Away</span>
              ) : (
                `Last seen ${relativeTime(activeChat.lastTimestamp)}`
              )}
            </p>
          </div>
          {/* Credit balance display */}
          <div className="flex items-center gap-1.5 rounded-full bg-[#1A1A24] px-3 py-1.5">
            <CircleDollarSign size={14} className="text-[#F59E0B]" />
            <span className="text-xs font-semibold text-text">{creditBalance}</span>
            <span className="text-[10px] text-text-muted">credits</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => useUIStore.getState().addToast("Voice calls are not available yet", "info")}
              className="rounded-full p-2 text-text-secondary transition-colors hover:bg-[#1A1A24] hover:text-text"
            >
              <Phone size={20} />
            </button>
            <button
              onClick={() => useUIStore.getState().addToast("Video calls are not available yet", "info")}
              className="rounded-full p-2 text-text-secondary transition-colors hover:bg-[#1A1A24] hover:text-text"
            >
              <Video size={20} />
            </button>
          </div>
        </div>

        {/* Settings bar: auto-delete + view timer - ONLY shown in private mode */}
        {isPrivateMode && (
          <div className="flex flex-wrap items-center gap-2 border-b border-amber-500/30 bg-amber-500/5 px-4 py-2">
            <Ghost size={14} className="shrink-0 text-amber-400" />
            <AutoDeleteSettings
              value={autoDeleteMode}
              onChange={setAutoDeleteMode}
              replayEnabled={replayEnabled}
              onReplayChange={setReplayEnabled}
            />
            <DefaultDeleteTimerSettings
              value={defaultDeleteTimer}
              onChange={setDefaultDeleteTimer}
            />
          </div>
        )}

        {/* Streak info bar (if streak > 0) */}
        {activeChat.streak > 0 && (() => {
          const { percent, nextMilestone } = getStreakProgress(activeChat.streak);
          return (
            <div className="flex items-center gap-3 border-b border-[#2E2E48]/50 bg-[#1A1A24]/30 px-4 py-2">
              <div className="flex items-center gap-1.5">
                <Flame size={14} className="text-[#F59E0B]" />
                <span className="text-xs font-semibold text-[#F59E0B]">{activeChat.streak}-day streak</span>
              </div>
              {nextMilestone && (
                <div className="flex flex-1 items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#2E2E48]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#F59E0B] to-[#EF4444] transition-all"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span className="flex items-center gap-1 text-[10px] text-text-muted">
                    <Gift size={10} className="text-[#F59E0B]" />
                    {nextMilestone.days}d: {nextMilestone.label}
                  </span>
                </div>
              )}
              {!nextMilestone && (
                <span className="flex items-center gap-1 text-[10px] text-[#10B981]">
                  <Trophy size={10} />
                  All milestones reached!
                </span>
              )}
            </div>
          );
        })()}

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <div className="flex flex-col gap-1">
            {activeChat.messages.map((msg, idx) => {
              const isMe = msg.senderId === currentUser?.id;
              const isSystem = msg.type === "system";
              const isScreenshotAlert = msg.type === "screenshot-alert";
              const isPrivate = msg.type === "private" || msg.type === "private-photo";
              const isLastFromThem =
                !isMe &&
                !isSystem &&
                !isScreenshotAlert &&
                (idx === activeChat.messages.length - 1 ||
                  activeChat.messages[idx + 1]?.senderId !== msg.senderId ||
                  activeChat.messages[idx + 1]?.type === "system" ||
                  activeChat.messages[idx + 1]?.type === "screenshot-alert");

              if (isSystem) {
                return (
                  <div key={msg.id} className="my-3 text-center">
                    <span className="rounded-full bg-[#1A1A24] px-3 py-1 text-xs text-text-muted">
                      {msg.text}
                    </span>
                  </div>
                );
              }

              // Screenshot alert notification
              if (isScreenshotAlert) {
                return (
                  <div key={msg.id} className="my-2 text-center">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-3 py-1 text-xs text-amber-400">
                      <Smartphone size={12} />
                      {msg.text}
                    </span>
                  </div>
                );
              }

              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                  <div className={`group/msg flex items-end gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                    {/* Bitmoji avatar for their messages (only on last in group) */}
                    {!isMe && isLastFromThem ? (
                      <img
                        src={activeChat.user.avatarUrl ?? undefined}
                        alt=""
                        className="mb-1 h-6 w-6 shrink-0 rounded-full"
                      />
                    ) : !isMe ? (
                      <div className="w-6 shrink-0" />
                    ) : null}

                    {/* Delete button - shown on hover (non-private messages only) */}
                    {!isPrivate && !msg.autoDeleted && msg.type !== "system" && msg.type !== "screenshot-alert" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteMessage(msg.id);
                        }}
                        className={cn(
                          "mb-1 shrink-0 rounded-full p-1.5 text-text-muted opacity-0 transition-all hover:bg-danger/20 hover:text-danger group-hover/msg:opacity-100",
                          isMe ? "order-first" : ""
                        )}
                        title="Delete message"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}

                    {/* Message bubble */}
                    <div
                      onClick={() => {
                        if (!isPrivate || msg.privateOpened || countingDown[msg.id]) {
                          toggleTimestamp(msg.id);
                        }
                      }}
                      onDoubleClick={() => {
                        // Don't trigger reaction on image messages - double-click opens fullscreen
                        const hasPhoto = (msg.type === "photo" || msg.type === "video" || msg.type === "private-photo") && msg.photoUrl;
                        if (!hasPhoto) {
                          handleReaction(msg.id);
                        }
                      }}
                      className="relative cursor-pointer"
                    >
                      {renderMessageBubble(msg, isMe)}

                      {/* Ghost indicator for private messages */}
                      {isPrivate && !msg.privateOpened && !countingDown[msg.id] && (
                        <div className={cn(
                          "absolute -top-1.5 rounded-full bg-[#0F0F14] p-0.5",
                          isMe ? "-left-1.5" : "-right-1.5"
                        )}>
                          <Ghost size={12} className="text-amber-400" />
                        </div>
                      )}

                      {/* Reaction */}
                      {msg.reaction && (
                        <span className="absolute -bottom-2.5 right-2 rounded-full bg-[#24243A] px-1.5 py-0.5 text-xs shadow-sm">
                          {msg.reaction}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Timestamp (shown on tap) */}
                  {showTimestamps[msg.id] && (
                    <span
                      className={`mt-0.5 flex items-center gap-1 text-[10px] text-text-muted ${
                        isMe ? "mr-1" : "ml-8"
                      }`}
                    >
                      {formatTimestamp(msg.timestamp)}
                      {isMe && <MessageStatusIcon status={msg.msgStatus} />}
                      {isMe && msg.read && " Opened"}
                      {isPrivate && " \u00B7 "}
                      {isPrivate && (
                        <span className="inline-flex items-center gap-0.5 text-amber-400">
                          <Ghost size={9} /> Private
                        </span>
                      )}
                    </span>
                  )}

                  {/* Opened status for private messages */}
                  {isPrivate && msg.privateOpened && (
                    <span
                      className={cn(
                        "mt-0.5 flex items-center gap-1 text-[10px] text-text-muted",
                        isMe ? "mr-1" : "ml-8"
                      )}
                    >
                      <Eye size={9} /> Opened {relativeTime(msg.timestamp)}
                    </span>
                  )}

                  {/* Read receipt under last sent message */}
                  {isMe &&
                    !isPrivate &&
                    idx === activeChat.messages.length - 1 &&
                    activeChat.status === "opened" && (
                      <span className="mr-1 mt-0.5 flex items-center gap-1 text-[10px] text-text-muted">
                        <CheckCheck size={10} className="text-[#8B5CF6]" />
                        Opened {relativeTime(msg.timestamp)}
                      </span>
                    )}
                </div>
              );
            })}

            {/* Typing indicator */}
            {typingIndicator && (
              <div className="flex items-end gap-2">
                <img
                  src={activeChat.user.avatarUrl ?? undefined}
                  alt=""
                  className="mb-1 h-6 w-6 rounded-full"
                />
                <div className="rounded-2xl rounded-bl-md bg-[#1A1A24] px-4 py-2.5">
                  <div className="flex items-center gap-1">
                    <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted [animation-delay:0ms]" />
                    <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted [animation-delay:150ms]" />
                    <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Server retention notice */}
        <div className="flex items-center gap-2 border-t border-[#2E2E48]/50 bg-[#1A1A24]/30 px-4 py-1.5">
          <Shield size={11} className="shrink-0 text-text-muted" />
          <p className="text-[10px] leading-tight text-text-muted">
            Messages are deleted from view after opening. Rally Live retains all messages, media, and chat logs on our servers for safety and compliance.
          </p>
        </div>

        {/* Pending photo preview */}
        {pendingPhoto && (
          <div className="border-t border-[#2E2E48] bg-[#1A1A24]/50 px-3 py-2">
            <div className="flex items-center gap-3">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg">
                <img src={pendingPhoto} alt="Attached" className="h-full w-full object-cover" />
                <button
                  onClick={() => setPendingPhoto(null)}
                  className="absolute -right-0.5 -top-0.5 rounded-full bg-[#0F0F14] p-0.5 text-text-muted hover:text-text"
                >
                  <X size={12} />
                </button>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-text">Photo attached</p>
                <p className="text-[10px] text-text-muted">
                  {isPrivateMode ? "Will be sent as a private photo (view-once)" : "Add a caption or send as-is"}
                </p>
              </div>
              {isPrivateMode && <Ghost size={14} className="shrink-0 text-amber-400" />}
            </div>
          </div>
        )}

        {/* Private mode persistent indicator banner */}
        {isPrivateMode && (
          <div className="flex items-center gap-2 border-t-2 border-amber-500/60 bg-amber-500/10 px-4 py-2">
            <Ghost size={16} className="shrink-0 text-amber-400" />
            <span className="text-xs font-bold text-amber-400">
              Private Mode ON
            </span>
            <span className="text-[10px] text-amber-400/70">
              - Messages auto-delete after viewing
            </span>
            <button
              onClick={() => setIsPrivateMode(false)}
              className="ml-auto shrink-0 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[10px] font-semibold text-amber-400 transition-colors hover:bg-amber-500/30"
            >
              Turn OFF
            </button>
          </div>
        )}

        {/* Input area */}
        <div className="border-t border-[#2E2E48] px-3 py-2.5">
          {/* No credits warning - only shown when private mode is on */}
          {isPrivateMode && creditBalance <= 0 && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-danger/10 border border-danger/20 px-3 py-2">
              <AlertTriangle size={14} className="shrink-0 text-danger" />
              <span className="text-xs text-danger font-medium">Buy credits to send private messages</span>
              <a
                href="/credits"
                className="ml-auto rounded-full bg-[#8B5CF6] px-3 py-1 text-[10px] font-semibold text-white hover:bg-[#7C3AED]"
              >
                Buy Credits
              </a>
            </div>
          )}
          <div className="flex items-center gap-2">
            {/* Camera / photo attach button */}
            <button
              onClick={() => setShowPhotoAttach(true)}
              className="shrink-0 rounded-full p-2 text-text-secondary transition-colors hover:bg-[#1A1A24] hover:text-text"
            >
              <Camera size={22} />
            </button>

            {/* Private mode toggle -- persistent, stays ON until user turns OFF */}
            <button
              onClick={() => setIsPrivateMode(!isPrivateMode)}
              className={cn(
                "shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all",
                isPrivateMode
                  ? "bg-amber-500/20 text-amber-400 ring-2 ring-amber-500/40 hover:bg-amber-500/30"
                  : "bg-[#1A1A24] text-text-muted hover:bg-[#24243A] hover:text-text"
              )}
              title={isPrivateMode ? "Private mode ON - tap to turn OFF" : "Turn ON private/disappearing messages"}
            >
              <Ghost size={16} />
              <span>{isPrivateMode ? "ON" : "OFF"}</span>
            </button>

            <div className="relative flex-1">
              <input
                ref={chatInputRef}
                type="text"
                placeholder={
                  isPrivateMode && creditBalance <= 0
                    ? "No credits remaining..."
                    : isPrivateMode
                      ? "Private message..."
                      : "Send a chat"
                }
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={isPrivateMode && creditBalance <= 0}
                className={cn(
                  "w-full rounded-full py-2.5 pl-4 pr-10 text-sm text-text placeholder:text-text-muted outline-none focus:ring-1",
                  isPrivateMode
                    ? "bg-amber-500/5 ring-1 ring-amber-500/20 placeholder:text-amber-400/40 focus:ring-amber-500/40"
                    : "bg-[#1A1A24] focus:ring-[#8B5CF6]/40",
                  isPrivateMode && creditBalance <= 0 && "opacity-50 cursor-not-allowed"
                )}
              />
              {!chatInput.trim() && !pendingPhoto && creditBalance > 0 && (
                <button className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text">
                  <Smile size={20} />
                </button>
              )}
            </div>

            {chatInput.trim() || pendingPhoto ? (
              <div className="flex items-center gap-1.5">
                {/* Credit cost indicator - only in private mode */}
                {isPrivateMode && (
                  <div className="flex flex-col items-center">
                    <span className="flex items-center gap-1 text-[10px] text-text-muted">
                      <CircleDollarSign size={10} className="text-[#F59E0B]" />
                      1 credit
                    </span>
                    <span className="text-[9px] text-text-muted">($0.01)</span>
                  </div>
                )}
                <button
                  onClick={handleSend}
                  disabled={isPrivateMode && creditBalance <= 0}
                  className={cn(
                    "shrink-0 rounded-full p-2.5 transition-colors",
                    isPrivateMode && creditBalance <= 0 && "opacity-40 cursor-not-allowed",
                    isPrivateMode
                      ? "bg-gradient-to-br from-amber-500 to-orange-500"
                      : ""
                  )}
                  style={
                    !isPrivateMode
                      ? { background: "linear-gradient(135deg, #8B5CF6, #06B6D4)" }
                      : undefined
                  }
                >
                  <Send size={18} className="text-white" />
                </button>
              </div>
            ) : (
              <>
                {isRecording ? (
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 text-sm text-red-400">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                      {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, "0")}
                    </span>
                    <button
                      onClick={cancelRecording}
                      className="shrink-0 rounded-full p-2 text-text-secondary transition-colors hover:bg-[#1A1A24] hover:text-danger"
                    >
                      <X size={20} />
                    </button>
                    <button
                      onClick={sendRecording}
                      className="shrink-0 rounded-full p-2.5 transition-colors"
                      style={{ background: "linear-gradient(135deg, #8B5CF6, #06B6D4)" }}
                    >
                      <Send size={16} className="text-white" />
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => setShowPhotoAttach(true)}
                      className="shrink-0 rounded-full p-2 text-text-secondary transition-colors hover:bg-[#1A1A24] hover:text-text"
                    >
                      <ImageIcon size={22} />
                    </button>
                    <button
                      onClick={startRecording}
                      className="shrink-0 rounded-full p-2 text-text-secondary transition-colors hover:bg-[#1A1A24] hover:text-text"
                    >
                      <Mic size={22} />
                    </button>
                  </>
                )}
              </>
            )}
          </div>

          {/* Credit cost label below input - only shown in private mode */}
          {isPrivateMode && !chatInput.trim() && !pendingPhoto && creditBalance > 0 && (
            <div className="mt-1.5 flex items-center justify-center gap-1 text-[10px] text-text-muted">
              <CircleDollarSign size={10} className="text-[#F59E0B]" />
              <span>Private mode: 1 credit ($0.01) per message, photo, or camera capture</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ─── Render: Bug Report Chat ────────────────────────────────────────

  const renderBugChat = () => {
    return (
      <div className="flex h-full flex-col bg-[#0F0F14]">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[#2E2E48] bg-[#0F0F14] px-4 py-3">
          <button
            onClick={() => setBugChatActive(false)}
            className="rounded-full p-1.5 text-text-muted transition-colors hover:bg-[#1A1A24] hover:text-text md:hidden"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/20">
            <Bug size={20} className="text-red-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-text">Bug Reports</h2>
            <p className="text-[11px] text-red-400/70">Help us improve Rally Live</p>
          </div>
        </div>

        {/* Previous submissions + messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Welcome message if no submissions yet */}
          {bugMessages.length === 0 && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-[#1A1A24] px-4 py-3 text-sm">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Bug size={12} className="text-red-400" />
                  <span className="text-[10px] font-medium text-red-400">Rally Live Team</span>
                </div>
                <p className="text-gray-300">Found a bug? Fill out the form below and our dev team will fix it. Be as detailed as you can!</p>
              </div>
            </div>
          )}

          {bugMessages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                  msg.from === "user"
                    ? "bg-red-500/20 text-red-200 rounded-br-sm"
                    : "bg-[#1A1A24] text-gray-300 rounded-bl-sm"
                }`}
              >
                {msg.from === "system" && (
                  <div className="flex items-center gap-1.5 mb-1">
                    {msg.text.startsWith("Error") ? (
                      <AlertTriangle size={12} className="text-yellow-400" />
                    ) : (
                      <CheckCircle size={12} className="text-green-400" />
                    )}
                    <span className="text-[10px] font-medium text-red-400">Rally Live Team</span>
                  </div>
                )}
                <p className="whitespace-pre-wrap">{msg.text}</p>
                <p className="mt-1 text-[10px] text-gray-600">
                  {msg.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))}
          <div ref={bugEndRef} />
        </div>

        {/* Bug report form - always visible at bottom */}
        <div className="border-t border-[#2E2E48] bg-[#0F0F14] px-4 py-4 space-y-3">
          {/* Title field */}
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">
              What&apos;s the bug? <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={bugTitle}
              onChange={(e) => setBugTitle(e.target.value)}
              placeholder="e.g. Video won't play on mobile"
              maxLength={200}
              disabled={bugSubmitting}
              className="w-full rounded-xl bg-[#1A1A24] border border-[#2E2E48] py-2.5 px-3 text-sm text-text placeholder:text-text-muted outline-none focus:ring-1 focus:ring-red-500/40 focus:border-red-500/30 disabled:opacity-50"
            />
          </div>

          {/* Description field */}
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">
              Describe what happened <span className="text-red-400">*</span>
            </label>
            <textarea
              value={bugDescription}
              onChange={(e) => setBugDescription(e.target.value)}
              placeholder="What happened? What did you expect? What were you doing when it broke?"
              maxLength={5000}
              rows={3}
              disabled={bugSubmitting}
              className="w-full rounded-xl bg-[#1A1A24] border border-[#2E2E48] py-2.5 px-3 text-sm text-text placeholder:text-text-muted outline-none focus:ring-1 focus:ring-red-500/40 focus:border-red-500/30 resize-none disabled:opacity-50"
            />
          </div>

          {/* Submit button */}
          <button
            onClick={handleBugSubmit}
            disabled={!bugTitle.trim() || !bugDescription.trim() || bugSubmitting}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {bugSubmitting ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Send size={14} />
            )}
            {bugSubmitting ? "Submitting..." : "Submit Bug Report"}
          </button>
        </div>
      </div>
    );
  };

  // ─── Main layout ──────────────────────────────────────────────────────

  return (
    <>
      {/* Close context menu on click outside */}
      {contextMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
      )}

      <div className="flex h-[calc(100vh-4rem)] md:h-screen">
        {/* Left Panel: Friends list */}
        {/* On mobile: show only if no active chat */}
        <div
          className={`w-full shrink-0 border-r border-[#2E2E48] md:block md:w-80 ${
            activeChatId || bugChatActive ? "hidden" : "block"
          }`}
        >
          {renderFriendsList()}
        </div>

        {/* Right Panel: Chat thread or Bug Report */}
        {/* On mobile: show only if active chat or bug chat */}
        <div
          className={`min-w-0 flex-1 ${
            activeChatId || bugChatActive ? "block" : "hidden md:block"
          }`}
        >
          {bugChatActive ? renderBugChat() : renderChatThread()}
        </div>
      </div>

      {/* New Chat Modal */}
      <Modal isOpen={showNewChat} onClose={() => { setShowNewChat(false); setNewChatSearch(""); }} title="New Chat">
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search users..."
              value={newChatSearch}
              onChange={(e) => setNewChatSearch(e.target.value)}
              className="w-full rounded-full bg-[#24243A] py-2 pl-9 pr-4 text-sm text-text placeholder:text-text-muted outline-none focus:ring-1 focus:ring-[#8B5CF6]/40"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filteredNewUsers.length === 0 ? (
              <p className="py-4 text-center text-sm text-text-muted">
                No users found
              </p>
            ) : (
              filteredNewUsers.map((user) => (
                <button
                  key={user.id}
                  onClick={() => startNewChat(user)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[#24243A]"
                >
                  <Avatar
                    src={user.avatarUrl}
                    name={user.displayName}
                    size="sm"
                    verified={user.verifiedBadge}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text">
                      {user.displayName}
                    </p>
                    <p className="truncate text-xs text-text-muted">
                      @{user.username}
                    </p>
                  </div>
                  <ChevronRight size={16} className="ml-auto shrink-0 text-text-muted" />
                </button>
              ))
            )}
          </div>
        </div>
      </Modal>

      {/* Fullscreen Image Overlay */}
      {fullscreenImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 transition-opacity duration-200"
          onClick={closeFullscreen}
        >
          {/* Close button */}
          <button
            onClick={closeFullscreen}
            className="absolute right-4 top-4 z-50 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
            aria-label="Close fullscreen"
          >
            <X size={24} />
          </button>

          {/* Timer overlay for private images */}
          {fullscreenImage.isPrivate && fullscreenImage.countdownSeconds && (
            <div className="absolute left-1/2 top-6 z-50 -translate-x-1/2">
              <div className="flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 backdrop-blur-sm">
                <Ghost size={16} className="text-amber-400" />
                <PrivateCountdown
                  seconds={fullscreenImage.countdownSeconds}
                  onExpire={handleFullscreenTimerExpire}
                />
              </div>
            </div>
          )}

          {/* Centered image */}
          <img
            src={fullscreenImage.url}
            alt="Fullscreen preview"
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Photo Attach Modal */}
      <Modal
        isOpen={showPhotoAttach}
        onClose={() => setShowPhotoAttach(false)}
        title="Attach Photo"
      >
        <div className="flex flex-col gap-3">
          <p className="text-xs text-text-muted">
            Select a photo to attach to your message.
            {isPrivateMode && (
              <span className="ml-1 inline-flex items-center gap-1 text-amber-400">
                <Ghost size={10} /> Private mode is on -- photo will be view-once.
              </span>
            )}
          </p>
          {/* Credit cost reminder - only in private mode */}
          {isPrivateMode && (
            <div className="flex items-center gap-1.5 rounded-lg bg-[#1A1A24] px-3 py-1.5">
              <CircleDollarSign size={12} className="text-[#F59E0B]" />
              <span className="text-[10px] text-text-muted">Private mode: each photo costs 1 credit ($0.01 USD)</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleTakePicture}
              className="flex flex-col items-center justify-center gap-2 h-32 rounded-xl border border-[#2E2E48] transition-all hover:border-[#8B5CF6]/50 hover:ring-1 hover:ring-[#8B5CF6]/30 hover:bg-[#1A1A24]"
            >
              <Camera size={28} className="text-[#8B5CF6]" />
              <span className="text-xs text-text-muted">Take Photo</span>
            </button>
            <button
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = "image/*";
                input.onchange = () => {
                  const file = input.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = () => {
                      handleAttachPhoto(reader.result as string);
                    };
                    reader.readAsDataURL(file);
                  }
                };
                input.click();
              }}
              className="flex flex-col items-center justify-center gap-2 h-32 rounded-xl border border-[#2E2E48] transition-all hover:border-[#8B5CF6]/50 hover:ring-1 hover:ring-[#8B5CF6]/30 hover:bg-[#1A1A24]"
            >
              <ImageIcon size={28} className="text-[#8B5CF6]" />
              <span className="text-xs text-text-muted">Choose Photo</span>
            </button>
          </div>
          <button
            onClick={handleTakePicture}
            disabled={isPrivateMode && creditBalance <= 0}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl border border-dashed border-[#2E2E48] py-6 text-text-muted transition-colors hover:border-[#8B5CF6]/40 hover:bg-[#1A1A24]/50 hover:text-text",
              isPrivateMode && creditBalance <= 0 && "opacity-40 cursor-not-allowed"
            )}
          >
            <Camera size={20} />
            <span className="text-sm">Take a picture{isPrivateMode ? " (1 credit)" : ""}</span>
          </button>
        </div>
      </Modal>

      {/* Friend Timeout Modal */}
      {timeoutModal && (
        <FriendTimeoutModal
          isOpen={!!timeoutModal}
          onClose={() => setTimeoutModal(null)}
          friendName={timeoutModal.name}
          onSelect={(minutes) => {
            setFriendTimeout(timeoutModal.id, minutes);
            setFriendTimeoutMap((prev) => ({ ...prev, [timeoutModal.id]: true }));
          }}
        />
      )}
    </>
  );
}
