"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Eye,
  Share2,
  Heart,
  MessageCircle,
  X,
  Volume2,
  VolumeX,
  Gift,
  Crown,
} from "lucide-react";
import Hls from "hls.js";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type { LiveRoom, User, DonationTier } from "@/lib/types";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Drawer from "@/components/ui/Drawer";
import ChatPanel from "@/components/live/ChatPanel";
import GiftPanel from "@/components/credits/GiftPanel";
import DonationAlert, { useDonationAlertQueue } from "@/components/live/DonationAlert";
import { DONATION_TIERS } from "@/lib/donation-tiers";

function formatViewers(n: number): string {
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatLiveElapsed(start: string): string {
  const startMs = new Date(start).getTime();
  if (!Number.isFinite(startMs)) return "00:00";
  const sec = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/* ────────────────────────────────────────────────────────────────────────────
   Participant type from the API (includes user details)
   ──────────────────────────────────────────────────────────────────────────── */
interface StreamParticipant {
  userId: string;
  role: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
}

interface ApiParticipant {
  userId?: string;
  role?: string;
  status?: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string | null;
  user?: {
    id?: string;
    displayName?: string;
    username?: string;
    avatarUrl?: string | null;
  };
}

interface JoinViewerResponse {
  viewerCount?: number;
}

interface FriendsListResponse {
  friends?: Array<{ id?: string }>;
}

function toStreamParticipant(participant: ApiParticipant): StreamParticipant {
  return {
    userId: participant.userId ?? participant.user?.id ?? "",
    role: participant.role?.toLowerCase() ?? "guest",
    displayName: participant.user?.displayName ?? participant.displayName ?? "Guest",
    username: participant.user?.username ?? participant.username ?? "",
    avatarUrl: participant.user?.avatarUrl ?? participant.avatarUrl ?? null,
  };
}

/* ---------- Regular Live View ---------- */

function RegularLiveView({
  room,
  host,
  initialMessages,
  participants,
}: {
  room: LiveRoom;
  host: User;
  initialMessages: { id: string; userId: string; text: string; timestamp: number }[];
  participants: StreamParticipant[];
}) {
  const { currentUser } = useAuthStore();
  const myId = currentUser?.id ?? "";
  const [isFollowing, setIsFollowing] = useState(false);
  const [showGiftDrawer, setShowGiftDrawer] = useState(false);
  const [showChatDrawer, setShowChatDrawer] = useState(false);
  const [chatMessages, setChatMessages] = useState(initialMessages);
  const [inQueue, setInQueue] = useState(false);
  const [queueJoining, setQueueJoining] = useState(false);
  const [requestStatus, setRequestStatus] = useState<"none" | "pending" | "accepted" | "rejected">("none");

  // Volume controls
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const volumeRef = useRef(1);
  const mutedRef = useRef(false);

  // Sticky gift recipient — persists who you're sending gifts to
  const [giftRecipient, setGiftRecipient] = useState<StreamParticipant | null>(null);
  const [lastGiftTier, setLastGiftTier] = useState<DonationTier | null>(null);
  const [showRecipientPicker, setShowRecipientPicker] = useState(false);

  // Donation alert queue
  const { current: currentDonationAlert, enqueue: enqueueDonationAlert, handleComplete: handleDonationAlertComplete } = useDonationAlertQueue();
  const seenDonationIdsRef = useRef<Set<string>>(new Set());

  const isRoomsMode = room.mode === "rooms";

  // Live-updating participant list
  const [liveParticipants, setLiveParticipants] = useState<StreamParticipant[]>(participants);
  const sessionLabel = useMemo(() => {
    const raw = ((room as LiveRoom & { sessionState?: string }).sessionState || "live").toLowerCase();
    if (raw === "scheduled") return "SCHEDULED";
    if (raw === "ending") return "ENDING";
    if (raw === "ended") return "ENDED";
    return "LIVE";
  }, [room]);

  const handleJoinQueue = useCallback(async () => {
    if (inQueue || requestStatus === "pending") return;
    setQueueJoining(true);
    try {
      const res = await api.live.join(room.id, "guest") as { status?: string; alreadyJoined?: boolean };
      if (res.status === "PENDING") {
        setRequestStatus("pending");
      } else if (res.alreadyJoined) {
        setInQueue(true);
        setRequestStatus("accepted");
      } else {
        setInQueue(true);
        setRequestStatus("accepted");
      }
    } catch {
      // Failed to join
    } finally {
      setQueueJoining(false);
    }
  }, [room.id, inQueue, requestStatus]);

  const [viewerCount, setViewerCount] = useState(room.viewerCount);
  const [streamFrame, setStreamFrame] = useState<string | null>(null);
  const frameTimestampRef = useRef(0);
  const audioTimestampRef = useRef(0);

  // HLS playback state (for RTMP-sourced streams from OBS/Streamlabs)
  const [hlsUrl, setHlsUrl] = useState<string | null>(null);
  const [hlsReady, setHlsReady] = useState(false);
  const hlsVideoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Auto-join stream as viewer on mount
  useEffect(() => {
    api.live.join(room.id, "viewer").then((res) => {
      const joinRes = res as JoinViewerResponse;
      if (joinRes.viewerCount) setViewerCount(joinRes.viewerCount);
    }).catch(() => {});
  }, [room.id]);

  // Check if this stream has HLS (RTMP source from OBS/Streamlabs)
  useEffect(() => {
    fetch(`/api/live/${room.id}/hls`, { credentials: "include" })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.hlsUrl) setHlsUrl(data.hlsUrl);
      })
      .catch(() => {});
  }, [room.id]);

  // Initialize HLS.js player when hlsUrl is available
  useEffect(() => {
    if (!hlsUrl || !hlsVideoRef.current) return;

    const video = hlsVideoRef.current;

    // Native HLS support (Safari)
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = hlsUrl;
      video.addEventListener("loadeddata", () => setHlsReady(true));
      return;
    }

    // hls.js for other browsers
    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 6,
      });
      hlsRef.current = hls;
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setHlsReady(true);
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          // HLS failed — fall back to frame polling
          setHlsUrl(null);
          setHlsReady(false);
        }
      });

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }
  }, [hlsUrl]);

  // Sync volume to HLS video element
  useEffect(() => {
    if (hlsVideoRef.current) {
      hlsVideoRef.current.volume = muted ? 0 : volume;
      hlsVideoRef.current.muted = muted;
    }
  }, [volume, muted]);

  // Keep refs in sync with state
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  // Audio playback
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const prevAudioBlobUrlRef = useRef<string | null>(null);

  const playAudioChunk = useCallback(async (base64Audio: string) => {
    try {
      const binaryStr = atob(base64Audio);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      if (prevAudioBlobUrlRef.current) {
        URL.revokeObjectURL(prevAudioBlobUrlRef.current);
      }
      const blob = new Blob([bytes], { type: "audio/webm" });
      const url = URL.createObjectURL(blob);
      prevAudioBlobUrlRef.current = url;

      if (!audioElRef.current) {
        audioElRef.current = new Audio();
      }
      const audio = audioElRef.current;
      audio.src = url;
      audio.volume = mutedRef.current ? 0 : volumeRef.current;
      audio.play().catch(() => {});
    } catch {}
  }, []);

  // Poll video frames every 500ms for low-latency video, play audio only when new
  // Skip frame polling when HLS is active (RTMP-sourced stream handles its own video)
  useEffect(() => {
    if (hlsReady) return; // HLS handles video/audio natively
    let fetching = false;
    const fetchFrame = async () => {
      if (fetching) return; // skip if previous fetch still in progress
      fetching = true;
      try {
        const res = await fetch(`/api/live/${room.id}/frame`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data.frame && data.updatedAt > frameTimestampRef.current) {
            setStreamFrame(`data:image/jpeg;base64,${data.frame}`);
            frameTimestampRef.current = data.updatedAt;
          }
          // Only play audio when it's a NEW chunk (different audioUpdatedAt)
          if (data.audio && data.audioUpdatedAt > audioTimestampRef.current) {
            audioTimestampRef.current = data.audioUpdatedAt;
            playAudioChunk(data.audio);
          }
        }
      } catch {}
      fetching = false;
    };
    fetchFrame();
    const interval = setInterval(fetchFrame, 500);
    return () => clearInterval(interval);
  }, [room.id, playAudioChunk, hlsReady]);

  // Poll viewer count + participants every 5 seconds
  useEffect(() => {
    const fetchStreamData = async () => {
      try {
        const res = await fetch(`/api/live/${room.id}`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data.liveStream?.viewerCount !== undefined) {
            setViewerCount(data.liveStream.viewerCount);
          }
          // Update participant list in real-time
          const rawParticipants = (data.liveStream?.participants as ApiParticipant[]) ?? [];
          if (rawParticipants.length > 0) {
            // Check own participant status for request-to-join flow
            const myParticipant = rawParticipants.find((p) => (p.userId ?? p.user?.id) === myId);
            if (myParticipant) {
              const status = myParticipant.status?.toLowerCase();
              if (status === "active" && requestStatus === "pending") {
                setRequestStatus("accepted");
                setInQueue(true);
              } else if (status === "rejected" && requestStatus === "pending") {
                setRequestStatus("rejected");
              }
            }

            const updated: StreamParticipant[] = rawParticipants.map(toStreamParticipant);
            // Ensure host is always included
            if (!updated.some((p) => p.userId === host.id)) {
              updated.unshift({
                userId: host.id,
                role: "host",
                displayName: host.displayName,
                username: host.username,
                avatarUrl: host.avatarUrl ?? null,
              });
            }
            setLiveParticipants(updated);
          }
        }
      } catch {}
    };
    fetchStreamData();
    const interval = setInterval(fetchStreamData, 5000);
    return () => clearInterval(interval);
  }, [room.id, host, myId, requestStatus]);

  const users = [host] as User[];

  // Donation tier lookup — find the highest tier whose valueCents <= amount, fall back to first tier
  const getDonationTier = useCallback((amount: number) => {
    const sorted = [...DONATION_TIERS].sort((a, b) => b.valueCents - a.valueCents);
    const tier = sorted.find((t) => amount >= t.valueCents) ?? DONATION_TIERS[0];
    const animationType = tier.animationType as "none" | "sparkle" | "explosion" | "takeover";
    // Map the visual animation intensity to the donation-alert category.
    const category: "basic" | "premium" | "legendary" =
      animationType === "takeover" ? "legendary"
      : animationType === "none" ? "basic"
      : "premium";
    return {
      name: tier.name,
      iconKey: tier.iconKey,
      rarityColor: tier.rarityColor,
      animationType,
      category,
    };
  }, []);

  // Poll chat messages every 3 seconds
  useEffect(() => {
    const fetchChat = async () => {
      try {
        const res = await api.live.chat(room.id) as { messages?: { id: string; userId: string; text: string; createdAt: string; isDonation?: boolean; creditAmount?: number }[] };
        if (res.messages) {
          res.messages.forEach((m) => {
            if (m.isDonation && m.creditAmount && m.creditAmount > 0 && !seenDonationIdsRef.current.has(m.id)) {
              seenDonationIdsRef.current.add(m.id);
              const tier = getDonationTier(m.creditAmount);
              enqueueDonationAlert({
                id: m.id,
                from: m.userId,
                avatar: "",
                tierName: tier.name,
                tierIcon: tier.iconKey,
                amount: m.creditAmount,
                rarityColor: tier.rarityColor,
                animationType: tier.animationType,
                category: tier.category,
              });
            }
          });
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
  }, [room.id, getDonationTier, enqueueDonationAlert]);

  // Follow check
  useEffect(() => {
    api.friends.list()
      .then((res) => {
        const friends = ((res as FriendsListResponse).friends) || [];
        if (friends.some((f) => f.id === host.id)) setIsFollowing(true);
      })
      .catch(() => {});
  }, [host.id]);

  const handleSendChat = useCallback(async (text: string) => {
    setChatMessages((prev) => [...prev, { id: `msg-${Date.now()}`, userId: myId, text, timestamp: Date.now() }]);
    try { await api.live.sendChat(room.id, { text }); } catch {}
  }, [myId, room.id]);

  const handleGiftSelect = useCallback(
    async (tier: DonationTier) => {
      setLastGiftTier(tier);
      const recipientName = giftRecipient?.displayName || host.displayName;
      setChatMessages((prev) => [...prev, { id: `gift-${Date.now()}`, userId: myId, text: `sent a ${tier.name} to ${recipientName}!`, timestamp: Date.now() }]);
      setShowGiftDrawer(false);
      try {
        await api.live.sendChat(room.id, {
          text: `sent a ${tier.name} to ${recipientName}!`,
          isDonation: true,
          creditAmount: tier.valueCents,
        });
      } catch {}
    },
    [myId, room.id, giftRecipient, host.displayName]
  );

  // Quick re-send last gift to same recipient
  const handleQuickGift = useCallback(async () => {
    if (!lastGiftTier || !giftRecipient) return;
    const recipientName = giftRecipient.displayName;
    setChatMessages((prev) => [...prev, { id: `gift-${Date.now()}`, userId: myId, text: `sent a ${lastGiftTier.name} to ${recipientName}!`, timestamp: Date.now() }]);
    try {
      await api.live.sendChat(room.id, {
        text: `sent a ${lastGiftTier.name} to ${recipientName}!`,
        isDonation: true,
        creditAmount: lastGiftTier.valueCents,
      });
    } catch {}
  }, [myId, room.id, lastGiftTier, giftRecipient]);

  const handleShare = useCallback(() => {
    if (navigator.share) {
      navigator.share({ title: room.title, url: window.location.href });
    } else {
      navigator.clipboard.writeText(window.location.href);
    }
  }, [room.title]);

  // Grid class for rooms mode participant layout — auto-size based on count
  const getRoomsGridClass = (count: number): string => {
    if (count <= 1) return "grid-cols-1";
    if (count <= 2) return "grid-cols-2";
    if (count <= 4) return "grid-cols-2";
    if (count <= 6) return "grid-cols-3";
    if (count <= 8) return "grid-cols-4";
    return "grid-cols-5";
  };

  // ─── Render participant box (viewer side — no Send Credits between them) ───
  const renderParticipantBox = (p: StreamParticipant, isHostBox: boolean) => (
    <button
      key={p.userId}
      className={`flex flex-col gap-1.5 text-left transition-all ${
        giftRecipient?.userId === p.userId ? "ring-2 ring-primary rounded-2xl" : ""
      }`}
      onClick={() => {
        setGiftRecipient(p);
        setShowRecipientPicker(false);
      }}
    >
      <div className="relative rounded-2xl border border-border/60 overflow-hidden flex items-center justify-center bg-gradient-to-br from-bg-surface2 to-bg-surface3 aspect-video hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200">
        {/* Host box shows the captured frame */}
        {isHostBox && streamFrame ? (
          <img src={streamFrame} alt={p.displayName} className="w-full h-full object-cover" />
        ) : (
          <img
            src={p.avatarUrl ?? undefined}
            alt={p.displayName}
            className={`rounded-full border-2 ${isHostBox ? "border-warning/60" : "border-primary/30"} w-16 h-16`}
          />
        )}
        {/* Host badge */}
        {isHostBox && (
          <span className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 bg-warning/90 text-black text-[10px] font-bold rounded-full shadow-sm">
            <Crown size={10} /> Host
          </span>
        )}
        {/* Selected indicator */}
        {giftRecipient?.userId === p.userId && (
          <div className="absolute top-2 right-2 px-2 py-0.5 bg-primary/90 text-white text-[10px] font-bold rounded-full">
            <Gift size={10} className="inline mr-0.5" /> Selected
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-medium text-text truncate">{p.displayName}</span>
      </div>
    </button>
  );

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-64px)]">
      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* ── Stream area ────────────────────────────────────────────── */}
        {isRoomsMode && liveParticipants.length > 1 ? (
          /* Rooms mode: show participant grid */
          <div className="relative p-3 bg-bg">
            <div className={`grid gap-3 ${getRoomsGridClass(liveParticipants.length)}`}>
              {liveParticipants.map((p) => renderParticipantBox(p, p.userId === host.id))}
            </div>
            {/* Donation alert overlay */}
            {currentDonationAlert && (
              <div className="absolute inset-0 z-30 pointer-events-none">
                <DonationAlert alert={currentDonationAlert} onComplete={handleDonationAlertComplete} />
              </div>
            )}
            {/* LIVE badge */}
            <div className="absolute top-5 left-5 z-20">
              <Badge variant="live">LIVE</Badge>
            </div>
            {/* Viewer count */}
            <div className="absolute top-5 right-5 z-20 flex items-center gap-1.5 px-2.5 py-1 bg-black/60 rounded-lg text-xs text-white">
              <Eye size={14} />
              {formatViewers(viewerCount)}
            </div>
          </div>
        ) : (
          /* Standard / single-view mode */
          <div className="relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden">
            {hlsReady ? (
              <video
                ref={hlsVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-contain"
              />
            ) : streamFrame ? (
              <img src={streamFrame} alt="Live stream" className="w-full h-full object-contain" />
            ) : (
              <>
                {/* Hidden video el for HLS init before ready */}
                <video ref={hlsVideoRef} className="hidden" playsInline muted />
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-accent/10" />
                <div className="flex flex-col items-center gap-3">
                  <Avatar src={host.avatarUrl} name={host.displayName} size="xl" />
                  <p className="text-sm text-text-muted">Connecting to stream...</p>
                </div>
              </>
            )}
            {currentDonationAlert && (
              <DonationAlert alert={currentDonationAlert} onComplete={handleDonationAlertComplete} />
            )}
            <div className="absolute top-3 left-3">
              <Badge variant="live">LIVE</Badge>
            </div>
            <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 bg-black/60 rounded-lg text-xs text-white">
              <Eye size={14} />
              {formatViewers(viewerCount)}
            </div>
          </div>
        )}

        {/* Live event pulse bar (distinct from VOD) */}
        <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-danger/40 bg-gradient-to-r from-danger/15 via-bg-surface to-primary/10">
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger opacity-80" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-danger" />
            </span>
            <span className="text-xs font-semibold tracking-wide text-danger">{sessionLabel} EVENT</span>
            <span className="text-[11px] text-text-secondary">Elapsed {formatLiveElapsed(room.startTime)}</span>
            <span className="text-[11px] text-text-secondary">{Math.max(1, liveParticipants.length)} on stage</span>
          </div>
          <div className="text-[10px] text-text-muted shrink-0">Viewer mode: server-authoritative</div>
        </div>

        {/* Volume controls */}
        <div className="flex items-center gap-2 px-4 py-2 bg-bg-surface border-b border-border">
          <button
            onClick={() => {
              const newMuted = !muted;
              setMuted(newMuted);
              if (audioElRef.current) audioElRef.current.volume = newMuted ? 0 : volume;
            }}
            className="p-1 rounded hover:bg-bg-surface2 text-text-secondary hover:text-text transition-colors"
          >
            {muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={muted ? 0 : volume}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setVolume(v);
              setMuted(false);
              if (audioElRef.current) audioElRef.current.volume = v;
            }}
            className="flex-1 h-1.5 accent-primary cursor-pointer"
          />
          <span className="text-[10px] text-text-muted w-8 text-right">
            {muted ? "0" : Math.round(volume * 100)}%
          </span>
        </div>

        {/* Host info bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-bg-surface">
          <Link href={`/profile/${host.username}`} className="flex items-center gap-3 min-w-0 hover:opacity-80 transition-opacity">
            <Avatar src={host.avatarUrl} name={host.displayName} size="md" online verified={host.verifiedBadge} />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-text truncate">{host.displayName}</h2>
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
                  if (newState) await api.users.follow(host.id);
                  else await api.users.unfollow(host.id);
                } catch { setIsFollowing(!newState); }
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
            <span key={tag} className="text-[10px] text-text-muted bg-bg-surface2 rounded px-2 py-0.5">
              #{tag}
            </span>
          ))}
        </div>

        {/* ── Gift bar with sticky recipient ─────────────────────────── */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-bg-surface border-b border-border">
          {/* Recipient selector */}
          <div className="relative">
            <button
              onClick={() => setShowRecipientPicker(!showRecipientPicker)}
              className="flex items-center gap-2 px-3 py-1.5 bg-bg-surface2 hover:bg-bg-surface3 border border-border rounded-full text-xs text-text transition-colors"
            >
              {giftRecipient ? (
                <>
                  <img src={giftRecipient.avatarUrl ?? undefined} alt="" className="w-4 h-4 rounded-full" />
                  <span className="font-medium truncate max-w-[80px]">{giftRecipient.displayName}</span>
                </>
              ) : (
                <>
                  <Gift size={12} className="text-text-muted" />
                  <span className="text-text-muted">Pick recipient</span>
                </>
              )}
              <X size={10} className="text-text-muted" />
            </button>

            {/* Recipient dropdown */}
            {showRecipientPicker && (
              <div className="absolute bottom-full left-0 mb-1 w-48 bg-bg-surface border border-border rounded-xl shadow-lg py-1 z-30 max-h-48 overflow-y-auto">
                {/* Always show host first */}
                <button
                  onClick={() => {
                    setGiftRecipient({ userId: host.id, role: "host", displayName: host.displayName, username: host.username, avatarUrl: host.avatarUrl ?? null });
                    setShowRecipientPicker(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-bg-surface2 transition-colors text-left"
                >
                  <img src={host.avatarUrl ?? undefined} alt="" className="w-5 h-5 rounded-full" />
                  <span className="text-xs font-medium text-text truncate">{host.displayName}</span>
                  <span className="text-[9px] text-warning ml-auto">Host</span>
                </button>
                {liveParticipants.filter((p) => p.userId !== host.id).map((p) => (
                  <button
                    key={p.userId}
                    onClick={() => { setGiftRecipient(p); setShowRecipientPicker(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-bg-surface2 transition-colors text-left"
                  >
                    <img src={p.avatarUrl ?? undefined} alt="" className="w-5 h-5 rounded-full" />
                    <span className="text-xs font-medium text-text truncate">{p.displayName}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Send Gift button — opens tier picker */}
          <button
            onClick={() => setShowGiftDrawer(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-primary to-accent text-white text-xs font-bold rounded-full hover:opacity-90 transition-opacity shadow-md"
          >
            <Gift size={14} />
            Send Gift
          </button>

          {/* Quick re-send: if recipient + last gift are set, show tap-to-resend */}
          {giftRecipient && lastGiftTier && (
            <button
              onClick={handleQuickGift}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-success/20 hover:bg-success/30 border border-success/30 text-success text-xs font-medium rounded-full transition-colors"
              title={`Send another ${lastGiftTier.name} to ${giftRecipient.displayName}`}
            >
              <span>{lastGiftTier.iconKey}</span>
              <span>{lastGiftTier.name}</span>
              <span className="text-[10px] opacity-70">tap again</span>
            </button>
          )}
        </div>

        {/* Mobile bottom bar */}
        <div className="flex items-center justify-between px-4 py-3 lg:hidden bg-bg-surface border-t border-border mt-auto">
          <Button variant="ghost" size="sm" icon={<MessageCircle size={16} />} onClick={() => setShowChatDrawer(true)}>
            Chat
          </Button>
          <Button variant="ghost" size="sm" icon={<Share2 size={16} />} onClick={handleShare}>
            Share
          </Button>
        </div>
      </div>

      {/* Desktop chat panel */}
      <div className="hidden lg:flex w-80 xl:w-96 shrink-0 border-l border-border">
        <ChatPanel messages={chatMessages} onSend={handleSendChat} users={users} onJoinQueue={room.isBattleRoom ? handleJoinQueue : undefined} inQueue={inQueue} queueJoining={queueJoining} queueCost={0} requestStatus={requestStatus} />
      </div>

      {/* Mobile chat drawer */}
      <Drawer isOpen={showChatDrawer} onClose={() => setShowChatDrawer(false)} title="Live Chat" side="bottom">
        <div className="h-80">
          <ChatPanel messages={chatMessages} onSend={handleSendChat} users={users} onJoinQueue={room.isBattleRoom ? handleJoinQueue : undefined} inQueue={inQueue} queueJoining={queueJoining} queueCost={0} requestStatus={requestStatus} />
        </div>
      </Drawer>

      {/* Gift drawer — tier picker */}
      <Drawer
        isOpen={showGiftDrawer}
        onClose={() => setShowGiftDrawer(false)}
        title={giftRecipient ? `Send Gift to ${giftRecipient.displayName}` : "Send a Gift"}
        side="bottom"
      >
        {!giftRecipient ? (
          <div className="p-4 text-center">
            <p className="text-sm text-text-secondary mb-3">Pick who you want to send a gift to first</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setGiftRecipient({ userId: host.id, role: "host", displayName: host.displayName, username: host.username, avatarUrl: host.avatarUrl ?? null });
                }}
                className="flex items-center gap-2 p-3 bg-bg-surface2 hover:bg-bg-surface3 rounded-xl transition-colors"
              >
                <img src={host.avatarUrl ?? undefined} alt="" className="w-8 h-8 rounded-full" />
                <span className="text-xs font-medium text-text">{host.displayName}</span>
              </button>
              {liveParticipants.filter((p) => p.userId !== host.id).map((p) => (
                <button
                  key={p.userId}
                  onClick={() => setGiftRecipient(p)}
                  className="flex items-center gap-2 p-3 bg-bg-surface2 hover:bg-bg-surface3 rounded-xl transition-colors"
                >
                  <img src={p.avatarUrl ?? undefined} alt="" className="w-8 h-8 rounded-full" />
                  <span className="text-xs font-medium text-text">{p.displayName}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <GiftPanel tiers={DONATION_TIERS} onSelect={handleGiftSelect} />
        )}
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
        <Button variant="gradient" size="lg" onClick={() => router.push(`/battle/${room.id}`)}>
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
  const [participants, setParticipants] = useState<StreamParticipant[]>([]);
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
            // Extract participant details from API response
            const rawParticipants = (ls.participants as ApiParticipant[]) ?? [];
            const participantList: StreamParticipant[] = rawParticipants.map(toStreamParticipant);

            // Add host if not already in participants
            const hostData = ls.host as User;
            if (hostData && !participantList.some((p) => p.userId === (hostData.id ?? (ls.hostId as string)))) {
              participantList.unshift({
                userId: hostData.id ?? (ls.hostId as string),
                role: "host",
                displayName: hostData.displayName,
                username: hostData.username,
                avatarUrl: hostData.avatarUrl ?? null,
              });
            }
            setParticipants(participantList);

            const normalized: LiveRoom & { host: User; sessionState?: string } = {
              id: ls.id as string,
              hostId: ls.hostId as string,
              title: ls.title as string,
              tags: Array.isArray(ls.tags) ? ls.tags as string[] : [],
              viewerCount: (ls.viewerCount as number) ?? 0,
              isBattleRoom: (ls.isBattle as boolean) ?? false,
              mode: (ls.mode as string).toLowerCase() as LiveRoom["mode"],
              participants: rawParticipants.map((p) => ({
                userId: p.userId ?? p.user?.id ?? "",
                role: (p.role?.toLowerCase() ?? "guest") as "host" | "guest",
              })),
              startTime: (ls.startedAt as string) ?? (ls.createdAt as string) ?? "",
              roundTimeSec: (ls.roundTimeSec as number) ?? 0,
              hostCutPercent: (ls.hostCutPercent as number) ?? 70,
              host: ls.host as User,
              sessionState: ((streamRes as Record<string, unknown>).session as Record<string, unknown> | undefined)?.state as string | undefined,
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
        <p className="text-text-secondary mb-4">This live room doesn&apos;t exist or has ended.</p>
        <Button variant="primary" onClick={() => router.push("/live")}>Browse Live Rooms</Button>
      </div>
    );
  }

  if (room.isBattleRoom) {
    return <BattleRoomView room={room} />;
  }

  return <RegularLiveView room={room} host={room.host} initialMessages={chatMessages} participants={participants} />;
}
