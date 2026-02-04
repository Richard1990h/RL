"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Eye,
  Share2,
  Heart,
  MessageCircle,
  ChevronUp,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type { LiveRoom, User, DonationTier } from "@/lib/types";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Drawer from "@/components/ui/Drawer";
import ChatPanel from "@/components/live/ChatPanel";
import GiftPanel from "@/components/credits/GiftPanel";
import DonateButton from "@/components/credits/DonateButton";
import { DONATION_TIERS } from "@/lib/donation-tiers";

function formatViewers(n: number): string {
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

/* ---------- Regular Live View ---------- */

function RegularLiveView({ room, host, initialMessages }: { room: LiveRoom; host: User; initialMessages: { id: string; userId: string; text: string; timestamp: number }[] }) {
  const { currentUser } = useAuthStore();
  const myId = currentUser?.id ?? "";
  const [isFollowing, setIsFollowing] = useState(false);
  const [showGiftDrawer, setShowGiftDrawer] = useState(false);
  const [showChatDrawer, setShowChatDrawer] = useState(false);
  const [chatMessages, setChatMessages] = useState(initialMessages);
  const [inQueue, setInQueue] = useState(false);
  const [queueJoining, setQueueJoining] = useState(false);

  const handleJoinQueue = useCallback(async () => {
    if (inQueue) return;
    setQueueJoining(true);
    try {
      await api.live.join(room.id, "guest");
      setInQueue(true);
    } catch {
      // Failed to join
    } finally {
      setQueueJoining(false);
    }
  }, [room.id, inQueue]);

  const [viewerCount, setViewerCount] = useState(room.viewerCount);
  const [streamFrame, setStreamFrame] = useState<string | null>(null);
  const frameTimestampRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Auto-join stream as viewer on mount
  useEffect(() => {
    api.live.join(room.id, "viewer").then((res: any) => {
      if (res.viewerCount) setViewerCount(res.viewerCount);
    }).catch(() => {
      // Already joined or other error - that's OK
    });
  }, [room.id]);

  // Play audio chunk from base64 webm data
  const playAudioChunk = useCallback(async (base64Audio: string) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === "suspended") await ctx.resume();

      const binaryStr = atob(base64Audio);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const audioBuffer = await ctx.decodeAudioData(bytes.buffer);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.start(0);
    } catch {
      // Audio decode failed — skip this chunk
    }
  }, []);

  // Poll video frames + audio from streamer every 2 seconds
  useEffect(() => {
    const fetchFrame = async () => {
      try {
        const res = await fetch(`/api/live/${room.id}/frame`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data.frame && data.updatedAt > frameTimestampRef.current) {
            setStreamFrame(`data:image/jpeg;base64,${data.frame}`);
            frameTimestampRef.current = data.updatedAt;
          }
          // Play audio if available
          if (data.audio) {
            playAudioChunk(data.audio);
          }
        }
      } catch {}
    };
    fetchFrame();
    const interval = setInterval(fetchFrame, 2000);
    return () => clearInterval(interval);
  }, [room.id, playAudioChunk]);

  // Poll viewer count every 10 seconds
  useEffect(() => {
    const fetchCount = async () => {
      try {
        const res = await fetch(`/api/live/${room.id}`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data.liveStream?.viewerCount !== undefined) {
            setViewerCount(data.liveStream.viewerCount);
          }
        }
      } catch {}
    };
    const interval = setInterval(fetchCount, 10000);
    return () => clearInterval(interval);
  }, [room.id]);

  // Build a minimal users array for ChatPanel from the host + messages
  const users = [host] as User[];

  // Poll chat messages every 3 seconds
  useEffect(() => {
    const fetchChat = async () => {
      try {
        const res = await api.live.chat(room.id) as { messages?: { id: string; userId: string; text: string; createdAt: string; isDonation?: boolean; creditAmount?: number }[] };
        if (res.messages) {
          setChatMessages(res.messages.map((m) => ({
            id: m.id,
            userId: m.userId,
            text: m.text,
            timestamp: new Date(m.createdAt).getTime(),
          })));
        }
      } catch {}
    };
    fetchChat();
    const interval = setInterval(fetchChat, 3000);
    return () => clearInterval(interval);
  }, [room.id]);

  // Check follow status on mount
  useEffect(() => {
    api.friends.list()
      .then((res: any) => {
        const friends = res.friends || [];
        if (friends.some((f: any) => f.id === host.id)) setIsFollowing(true);
      })
      .catch(() => {});
  }, [host.id]);

  const handleSendChat = useCallback(async (text: string) => {
    // Optimistic local update
    setChatMessages((prev) => [
      ...prev,
      {
        id: `msg-${Date.now()}`,
        userId: myId,
        text,
        timestamp: Date.now(),
      },
    ]);
    try {
      await api.live.sendChat(room.id, { text });
    } catch {
      // Message will appear from next poll if successful
    }
  }, [myId, room.id]);

  const handleGiftSelect = useCallback(
    async (tier: DonationTier) => {
      // Optimistic chat update
      setChatMessages((prev) => [
        ...prev,
        {
          id: `gift-${Date.now()}`,
          userId: myId,
          text: `sent a ${tier.name}!`,
          timestamp: Date.now(),
        },
      ]);
      setShowGiftDrawer(false);
      try {
        await api.live.sendChat(room.id, {
          text: `sent a ${tier.name}!`,
          isDonation: true,
          creditAmount: tier.valueCents,
        });
      } catch {
        // Failed donation — will be reflected on next poll
      }
    },
    [myId, room.id]
  );

  const handleShare = useCallback(() => {
    if (navigator.share) {
      navigator.share({ title: room.title, url: window.location.href });
    } else {
      navigator.clipboard.writeText(window.location.href);
    }
  }, [room.title]);

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-64px)]">
      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Video / stream area */}
        <div className="relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden">
          {streamFrame ? (
            <img
              src={streamFrame}
              alt="Live stream"
              className="w-full h-full object-contain"
            />
          ) : (
            <>
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-accent/10" />
              <div className="flex flex-col items-center gap-3">
                <Avatar src={host.avatarUrl} name={host.displayName} size="xl" />
                <p className="text-sm text-text-muted">Connecting to stream...</p>
              </div>
            </>
          )}
          {/* LIVE badge */}
          <div className="absolute top-3 left-3">
            <Badge variant="live">LIVE</Badge>
          </div>
          {/* Viewer count */}
          <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 bg-black/60 rounded-lg text-xs text-white">
            <Eye size={14} />
            {formatViewers(viewerCount)}
          </div>
        </div>

        {/* Host info bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-bg-surface">
          <Link href={`/profile/${host.username}`} className="flex items-center gap-3 min-w-0 hover:opacity-80 transition-opacity">
            <Avatar
              src={host.avatarUrl}
              name={host.displayName}
              size="md"
              online
              verified={host.verifiedBadge}
            />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-text truncate">
                {host.displayName}
              </h2>
              <p className="text-xs text-text-muted truncate">{room.title}</p>
            </div>
          </Link>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant={isFollowing ? "secondary" : "primary"}
              size="sm"
              icon={<Heart size={14} className={isFollowing ? "fill-current text-danger" : ""} />}
              onClick={async () => {
                const newState = !isFollowing;
                setIsFollowing(newState);
                try {
                  if (newState) {
                    await api.users.follow(host.id);
                  } else {
                    await api.users.unfollow(host.id);
                  }
                } catch {
                  setIsFollowing(!newState); // rollback
                }
              }}
            >
              {isFollowing ? "Following" : "Follow"}
            </Button>
            <Button variant="ghost" size="sm" icon={<Share2 size={14} />} onClick={handleShare}>
              Share
            </Button>
          </div>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 px-4 py-2 border-b border-border bg-bg-surface">
          {room.tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] text-text-muted bg-bg-surface2 rounded px-2 py-0.5"
            >
              #{tag}
            </span>
          ))}
        </div>

        {/* Mobile bottom bar */}
        <div className="flex items-center justify-between px-4 py-3 lg:hidden bg-bg-surface border-t border-border mt-auto">
          <Button
            variant="ghost"
            size="sm"
            icon={<MessageCircle size={16} />}
            onClick={() => setShowChatDrawer(true)}
          >
            Chat
          </Button>
          <DonateButton onClick={() => setShowGiftDrawer(true)} />
          <Button variant="ghost" size="sm" icon={<Share2 size={16} />} onClick={handleShare}>
            Share
          </Button>
        </div>

        {/* Desktop: gift button row */}
        <div className="hidden lg:flex items-center gap-3 px-4 py-3 bg-bg-surface">
          <DonateButton onClick={() => setShowGiftDrawer(true)} />
        </div>
      </div>

      {/* Desktop chat panel */}
      <div className="hidden lg:flex w-80 xl:w-96 shrink-0 border-l border-border">
        <ChatPanel messages={chatMessages} onSend={handleSendChat} users={users} onJoinQueue={room.isBattleRoom ? handleJoinQueue : undefined} inQueue={inQueue} queueJoining={queueJoining} queueCost={0} />
      </div>

      {/* Mobile chat drawer */}
      <Drawer
        isOpen={showChatDrawer}
        onClose={() => setShowChatDrawer(false)}
        title="Live Chat"
        side="bottom"
      >
        <div className="h-80">
          <ChatPanel messages={chatMessages} onSend={handleSendChat} users={users} onJoinQueue={room.isBattleRoom ? handleJoinQueue : undefined} inQueue={inQueue} queueJoining={queueJoining} queueCost={0} />
        </div>
      </Drawer>

      {/* Gift drawer */}
      <Drawer
        isOpen={showGiftDrawer}
        onClose={() => setShowGiftDrawer(false)}
        title="Send a Gift"
        side="bottom"
      >
        <GiftPanel tiers={DONATION_TIERS} onSelect={handleGiftSelect} />
      </Drawer>
    </div>
  );
}

/* ---------- Battle Room View ---------- */

function BattleRoomView({ room }: { room: LiveRoom }) {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-64px)] bg-bg p-4">
      <div className="text-center space-y-4">
        <Badge variant="live">LIVE BATTLE</Badge>
        <h1 className="text-2xl font-bold text-text">{room.title}</h1>
        <p className="text-text-secondary">
          This room is running a live battle. Join the battle room for the full experience.
        </p>
        <Button
          variant="gradient"
          size="lg"
          onClick={() => router.push(`/battle/${room.id}`)}
        >
          Enter Battle Room
        </Button>
      </div>
    </div>
  );
}

/* ---------- Main Page ---------- */

export default function LiveRoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;

  const [room, setRoom] = useState<(LiveRoom & { host: User }) | null>(null);
  const [chatMessages, setChatMessages] = useState<{ id: string; userId: string; text: string; timestamp: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [streamRes, chatRes] = await Promise.all([
          api.live.get(roomId) as Promise<{ liveStream: Record<string, unknown> }>,
          api.live.chat(roomId) as Promise<{ messages: { id: string; userId: string; text: string; timestamp: number }[] }>,
        ]);
        if (!cancelled) {
          const ls = streamRes.liveStream;
          if (!ls || ls.status === "ENDED") {
            setNotFound(true);
          } else {
            // Normalize Prisma LiveStream → LiveRoom shape
            const normalized: LiveRoom & { host: User } = {
              id: ls.id as string,
              hostId: ls.hostId as string,
              title: ls.title as string,
              tags: Array.isArray(ls.tags) ? ls.tags as string[] : [],
              viewerCount: (ls.viewerCount as number) ?? 0,
              isBattleRoom: (ls.isBattle as boolean) ?? false,
              mode: (ls.mode as string).toLowerCase() as LiveRoom["mode"],
              participants: ((ls.participants as { userId: string; role: string }[]) ?? []).map((p) => ({
                userId: p.userId ?? (p as Record<string, unknown>).user?.toString() ?? "",
                role: (p.role?.toLowerCase() ?? "guest") as "host" | "guest",
              })),
              startTime: (ls.startedAt as string) ?? (ls.createdAt as string) ?? "",
              roundTimeSec: (ls.roundTimeSec as number) ?? 0,
              host: ls.host as User,
            };
            setRoom(normalized);
            setChatMessages(chatRes.messages || []);
          }
        }
      } catch (err) {
        console.error("Failed to load live room:", err);
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [roomId]);

  if (loading) {
    return (
      <div className="flex flex-col h-[calc(100vh-64px)]">
        <div className="w-full aspect-video bg-bg-surface2 animate-pulse" />
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-10 h-10 rounded-full bg-bg-surface2 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 bg-bg-surface2 rounded animate-pulse" />
            <div className="h-3 w-48 bg-bg-surface2 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !room) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-64px)] bg-bg">
        <h1 className="text-xl font-bold text-text mb-2">Room not found</h1>
        <p className="text-text-secondary mb-4">
          This live room doesn&apos;t exist or has ended.
        </p>
        <Button variant="primary" onClick={() => router.push("/live")}>
          Browse Live Rooms
        </Button>
      </div>
    );
  }

  if (room.isBattleRoom) {
    return <BattleRoomView room={room} />;
  }

  return <RegularLiveView room={room} host={room.host} initialMessages={chatMessages} />;
}
