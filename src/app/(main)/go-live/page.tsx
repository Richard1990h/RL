"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Radio,
  Camera,
  CameraOff,
  Mic,
  MicOff,
  Monitor,
  Settings,
  Swords,
  Timer,
  Shield,
  Users,
  Tag,
  X,
  Plus,
  Check,
  Eye,
  Crown,
  UserPlus,
  UserMinus,
  MessageCircle,
  Gift,
  Send,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  Layout,
  Image,
  Palette,
  Move,
  MoreVertical,
  Phone,
  PhoneOff,
  Volume2,
  VolumeX,
  Ban,
  Clock,
  Trash2,
  Star,
  Heart,
  Zap,
  ArrowRight,
  RefreshCw,
  Trophy,
  DollarSign,
  Layers,
  Tv,
  Link2Off,
  UserCheck,
  AlertTriangle,
  Lock,
  Upload,
  Circle,
  HelpCircle,
  Gavel,
  Target,
  Disc,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import Drawer from "@/components/ui/Drawer";
import Input from "@/components/ui/Input";
import Tabs from "@/components/ui/Tabs";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import SegmentedControl from "@/components/ui/SegmentedControl";
import MediaPreview from "@/components/live/MediaPreview";
import DeviceSelector from "@/components/live/DeviceSelector";
import VideoTile from "@/components/live/VideoTile";
import NetworkIndicator from "@/components/live/NetworkIndicator";
import RecordingIndicator from "@/components/live/RecordingIndicator";
import DonationAlert, { useDonationAlertQueue, type DonationAlertData } from "@/components/live/DonationAlert";
import BattleBar from "@/components/battle/BattleBar";
import SplitScreenBattle, { SplitScreenBattleCompact } from "@/components/battle/SplitScreenBattle";
import TeamBattleLayout, { TeamBattleCompact } from "@/components/battle/TeamBattleLayout";
import InviteBattleModal from "@/components/battle/InviteBattleModal";
import { useAuthStore } from "@/stores/auth-store";
import { useStreamStore } from "@/stores/stream-store";
import { useBroadcastStore } from "@/stores/broadcast-store";
import { useRecordingStore } from "@/stores/recording-store";
import { getUserMediaStream, stopStream, setTrackEnabled, getScreenStream } from "@/lib/media/device-manager";
import { MediaRecorderManager } from "@/lib/recording/media-recorder-manager";
import { ChunkUploader } from "@/lib/recording/chunk-uploader";
import { api } from "@/lib/api";
import { useStreamlabs } from "@/hooks/useStreamlabs";
import { cn, formatCurrency, formatCredits } from "@/lib/utils";
import type { User } from "@/lib/types";

// ─── Types ───────────────────────────────────────────────────────────────────

type StreamMode = "standard" | "timer_wars" | "tower_wars" | "rooms" | "trivia" | "auction" | "spin_wheel" | "last_standing";
type BattleState = "idle" | "queue_open" | "battling" | "result";
type SidePanelTab = "friends" | "chat" | "donations";
type SlowModeInterval = "off" | "5" | "10" | "30" | "60";
type LayoutPreset = "1x1" | "2x1" | "2x2" | "3x2" | "2x5";

interface ChatMessage {
  id: string;
  user: string;
  avatar: string;
  text: string;
  isDonation?: boolean;
  amount?: number;
}

interface Donation {
  id: string;
  from: string;
  to: string;
  amount: number;
  timestamp: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const HOST_CUT_PERCENT = 10;

const DEFAULT_CHAT_MESSAGES: ChatMessage[] = [];

const DONATION_MESSAGES: string[] = [];

const PRESET_COLORS = ["#8B5CF6", "#06B6D4", "#EF4444", "#10B981", "#F59E0B", "#EC4899"];

const PRESET_GRADIENTS = [
  "linear-gradient(135deg, #8B5CF6, #06B6D4)",
  "linear-gradient(135deg, #EC4899, #F59E0B)",
  "linear-gradient(135deg, #10B981, #3B82F6)",
  "linear-gradient(135deg, #EF4444, #8B5CF6)",
];

const LAYOUT_OPTIONS: { id: LayoutPreset; label: string; cols: number; rows: number }[] = [
  { id: "1x1", label: "Solo", cols: 1, rows: 1 },
  { id: "2x1", label: "Side by Side", cols: 2, rows: 1 },
  { id: "2x2", label: "Grid 4", cols: 2, rows: 2 },
  { id: "3x2", label: "Grid 6", cols: 3, rows: 2 },
  { id: "2x5", label: "Grid 10", cols: 2, rows: 5 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * Draw a donation alert overlay onto the frame canvas so all viewers see it.
 * Renders: glowing border, tier icon placeholder, sender name, tier name, amount.
 */
function drawDonationOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  alert: { from: string; tierName: string; amount: number; rarityColor: string; tierIcon: string; category: string }
) {
  const isPremium = alert.category === "premium";

  // Glowing border
  ctx.save();
  ctx.strokeStyle = alert.rarityColor;
  ctx.lineWidth = isPremium ? 6 : 4;
  ctx.shadowColor = alert.rarityColor;
  ctx.shadowBlur = isPremium ? 30 : 15;
  ctx.strokeRect(2, 2, w - 4, h - 4);
  ctx.restore();

  // Semi-transparent card background — centered
  const cardW = Math.min(320, w * 0.6);
  const cardH = isPremium ? 140 : 110;
  const cardX = (w - cardW) / 2;
  const cardY = (h - cardH) / 2;

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
  ctx.shadowColor = alert.rarityColor;
  ctx.shadowBlur = 25;
  // Rounded rect
  const r = 16;
  ctx.beginPath();
  ctx.moveTo(cardX + r, cardY);
  ctx.lineTo(cardX + cardW - r, cardY);
  ctx.quadraticCurveTo(cardX + cardW, cardY, cardX + cardW, cardY + r);
  ctx.lineTo(cardX + cardW, cardY + cardH - r);
  ctx.quadraticCurveTo(cardX + cardW, cardY + cardH, cardX + cardW - r, cardY + cardH);
  ctx.lineTo(cardX + r, cardY + cardH);
  ctx.quadraticCurveTo(cardX, cardY + cardH, cardX, cardY + cardH - r);
  ctx.lineTo(cardX, cardY + r);
  ctx.quadraticCurveTo(cardX, cardY, cardX + r, cardY);
  ctx.closePath();
  ctx.fill();

  // Card border
  ctx.strokeStyle = alert.rarityColor + "cc";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // Tier icon symbol (text fallback since we can't draw SVG)
  const iconMap: Record<string, string> = { sparkle: "✨", fire: "🔥", bomb: "💣", crown: "👑" };
  const icon = iconMap[alert.tierIcon] || "🎁";
  ctx.save();
  ctx.font = `${isPremium ? 40 : 32}px serif`;
  ctx.textAlign = "center";
  ctx.fillText(icon, w / 2, cardY + (isPremium ? 45 : 38));
  ctx.restore();

  // Sender name
  ctx.save();
  ctx.font = "bold 14px sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.fillText(alert.from, w / 2, cardY + (isPremium ? 65 : 55));
  ctx.restore();

  // "sent a" text
  ctx.save();
  ctx.font = "11px sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.textAlign = "center";
  ctx.fillText("sent a", w / 2, cardY + (isPremium ? 80 : 68));
  ctx.restore();

  // Tier name (big, colored)
  ctx.save();
  ctx.font = `bold ${isPremium ? 28 : 22}px sans-serif`;
  ctx.fillStyle = alert.rarityColor;
  ctx.textAlign = "center";
  ctx.shadowColor = alert.rarityColor;
  ctx.shadowBlur = 15;
  ctx.fillText(alert.tierName, w / 2, cardY + (isPremium ? 110 : 92));
  ctx.restore();

  // Credits amount
  ctx.save();
  ctx.font = "bold 13px sans-serif";
  ctx.fillStyle = alert.rarityColor;
  ctx.textAlign = "center";
  ctx.fillText(`${alert.amount.toLocaleString()} credits`, w / 2, cardY + (isPremium ? 130 : 108));
  ctx.restore();
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function LiveBadge() {
  return (
    <span className="flex items-center gap-2 px-3 py-1.5 bg-danger/20 text-danger rounded-full text-sm font-bold">
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-danger" />
      </span>
      LIVE
    </span>
  );
}

function ParticipantBox({
  user,
  isHost,
  donationTotal,
  micActive,
  cameraActive,
  isSmall,
  onDonate,
  onKick,
  background,
  showWinner,
  score,
  stream,
  speaking,
}: {
  user: User;
  isHost?: boolean;
  donationTotal: number;
  micActive?: boolean;
  cameraActive?: boolean;
  isSmall?: boolean;
  onDonate?: () => void;
  onKick?: () => void;
  background?: string;
  showWinner?: boolean;
  score?: number;
  stream?: MediaStream | null;
  speaking?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (stream && cameraActive) {
      video.srcObject = stream;
    } else {
      video.srcObject = null;
    }
  }, [stream, cameraActive]);

  return (
    <div className={cn("flex flex-col gap-1.5 group/tile", isSmall && "w-28")}>
      <div
        className={cn(
          "relative rounded-2xl overflow-hidden flex items-center justify-center",
          "bg-gradient-to-br from-bg-surface2 to-bg-surface3",
          "transition-all duration-200 hover:shadow-lg hover:shadow-primary/5",
          isSmall ? "h-20" : "aspect-video",
          speaking
            ? "border-2 border-success shadow-lg shadow-success/30"
            : "border border-border/60 hover:border-primary/40"
        )}
        style={{ background: background || undefined }}
      >
        {/* Video stream when available and camera is on */}
        {stream && cameraActive ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
        ) : (
          /* Avatar fallback */
          <img
            src={user.avatarUrl ?? undefined}
            alt={user.displayName}
            className={cn(
              "rounded-full border-2 transition-transform duration-200 group-hover/tile:scale-105",
              isHost ? "border-warning/60" : "border-primary/30",
              isSmall ? "w-10 h-10" : "w-16 h-16"
            )}
          />
        )}

        {/* Host badge */}
        {isHost && (
          <span className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 bg-warning/90 text-black text-[10px] font-bold rounded-full shadow-sm">
            <Crown size={10} /> Host
          </span>
        )}

        {/* Status icons (mic + camera) */}
        <div className="absolute bottom-2 right-2 flex items-center gap-1">
          {cameraActive !== undefined && (
            <span className={cn(
              "w-5 h-5 rounded-full flex items-center justify-center backdrop-blur-sm",
              cameraActive ? "bg-success/70" : "bg-danger/70"
            )}>
              {cameraActive ? <Camera size={10} className="text-white" /> : <CameraOff size={10} className="text-white" />}
            </span>
          )}
          {micActive !== undefined && (
            <span className={cn(
              "w-5 h-5 rounded-full flex items-center justify-center backdrop-blur-sm",
              micActive ? "bg-success/70" : "bg-danger/70"
            )}>
              {micActive ? <Mic size={10} className="text-white" /> : <MicOff size={10} className="text-white" />}
            </span>
          )}
        </div>

        {showWinner && (
          <div className="absolute inset-0 bg-success/20 flex items-center justify-center">
            <span className="px-3 py-1 bg-success text-white text-sm font-bold rounded-full flex items-center gap-1">
              <Trophy size={14} /> WINNER
            </span>
          </div>
        )}
        {score !== undefined && (
          <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/70 text-text text-xs font-bold rounded-full backdrop-blur-sm">
            {score} pts
          </div>
        )}

        {/* Kick button on hover (non-host only) */}
        {onKick && !isHost && (
          <div className="absolute top-2 right-2 opacity-0 group-hover/tile:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); onKick(); }}
              className="p-1.5 bg-danger/80 text-white rounded-full hover:bg-danger transition-colors"
              title="Kick from Room"
            >
              <UserMinus size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Name + donation row */}
      <div className="flex items-center justify-between px-1">
        <span className={cn("font-medium truncate", isSmall ? "text-[10px] text-text-secondary" : "text-xs text-text")}>
          {user.displayName}
        </span>
        <span className="text-[10px] text-success font-medium">{formatCredits(donationTotal)}</span>
      </div>

      {/* Send Credits button */}
      {onDonate && !isSmall && (
        <button
          onClick={onDonate}
          className="w-full py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium rounded-xl transition-colors flex items-center justify-center gap-1 border border-primary/20 hover:border-primary/40"
        >
          <Gift size={12} /> Send Credits
        </button>
      )}
    </div>
  );
}

function RevenueSplitCard({ mode, totalDonations }: { mode: StreamMode; totalDonations: number }) {
  return (
    <Card padding="sm" className="!bg-bg-surface2">
      <div className="flex items-center gap-2 mb-2">
        <DollarSign size={14} className="text-success" />
        <span className="text-xs font-semibold text-text">Stream Earnings</span>
      </div>
      <div className="space-y-1.5 text-[11px]">
        <div className="flex justify-between text-text-secondary">
          <span>Total credits received</span>
          <span className="text-success font-medium">{formatCredits(totalDonations)}</span>
        </div>
        <div className="border-t border-border pt-1.5 text-text-muted">
          All donations go directly to your wallet via secure double-entry ledger
        </div>
      </div>
    </Card>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function GoLivePage(): JSX.Element {
  const router = useRouter();
  const { currentUser } = useAuthStore();
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Users fetched from API (used for simulation: chat, battles, rooms, friends)
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [eligibility, setEligibility] = useState<{ videos: number; views: number; likes: number; eligible: boolean; requiredVideos: number; requiredViews: number; requiredLikes: number } | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(true);

  // Check go-live eligibility
  useEffect(() => {
    fetch("/api/live/eligibility", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.eligible !== undefined) setEligibility(data);
      })
      .catch(() => {})
      .finally(() => setEligibilityLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.users.list({ limit: "100" })
      .then((res: unknown) => {
        if (cancelled) return;
        const data = res as { users?: User[] };
        setAllUsers(data.users ?? []);
      })
      .catch(() => {
        // Fallback: just use currentUser if available
        if (!cancelled && currentUser) setAllUsers([currentUser]);
      })
      .finally(() => { if (!cancelled) setUsersLoading(false); });
    return () => { cancelled = true; };
  }, [currentUser]);

  // Stream & broadcast stores
  const {
    localStream,
    setLocalStream,
    setScreenStream,
    screenStream,
    deviceState,
    setDeviceState,
    reset: resetStream,
  } = useStreamStore();
  const { stage, setStage, streamId: broadcastStreamId, setStreamId: setBroadcastStreamId, goLiveConfirmOpen, setGoLiveConfirmOpen, reset: resetBroadcast } = useBroadcastStore();
  const recordingStore = useRecordingStore();
  const recorderRef = useRef<MediaRecorderManager | null>(null);
  const uploaderRef = useRef<ChunkUploader | null>(null);

  // Video refs for live camera and screen share display
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);

  // Mic volume analyser
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micVolumeRafRef = useRef<number>(0);
  const [micVolume, setMicVolume] = useState(0);

  // Toggle sound refs
  const toggleOnSoundRef = useRef<HTMLAudioElement | null>(null);
  const toggleOffSoundRef = useRef<HTMLAudioElement | null>(null);

  // Initialize toggle sounds
  useEffect(() => {
    // Create simple toggle sounds using AudioContext
    const createToggleSound = (frequency: number, duration: number): HTMLAudioElement => {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.frequency.value = frequency;
      oscillator.type = "sine";
      gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      // We can't use HTMLAudioElement directly from oscillator, so we'll handle inline
      const audio = new Audio();
      // Store the context for later use
      (audio as unknown as { _ctx: AudioContext; _freq: number; _dur: number })._ctx = audioCtx;
      (audio as unknown as { _ctx: AudioContext; _freq: number; _dur: number })._freq = frequency;
      (audio as unknown as { _ctx: AudioContext; _freq: number; _dur: number })._dur = duration;
      audioCtx.close();
      return audio;
    };
    // We'll use a simpler approach - just play tones inline
    toggleOnSoundRef.current = createToggleSound(880, 0.15);
    toggleOffSoundRef.current = createToggleSound(440, 0.2);
  }, []);

  const playToggleSound = useCallback((on: boolean) => {
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.frequency.value = on ? 880 : 440;
      oscillator.type = "sine";
      gainNode.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + (on ? 0.12 : 0.18));
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + (on ? 0.12 : 0.18));
      oscillator.onended = () => audioCtx.close();
    } catch {
      // Audio not supported
    }
  }, []);

  // Pre-live state
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [mode, setMode] = useState<StreamMode>("standard");
  const [guestLimit, setGuestLimit] = useState(4);
  const [roundLength, setRoundLength] = useState(60);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);

  // Live state
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [streamDuration, setStreamDuration] = useState(0);
  const [screenSharing, setScreenSharing] = useState(false);

  // Battle state
  const [battleState, setBattleState] = useState<BattleState>("idle");
  const [battleQueue, setBattleQueue] = useState<User[]>([]);
  const [currentBattlers, setCurrentBattlers] = useState<[User[][0], User[][0]] | null>(null);
  const [battleTimer, setBattleTimer] = useState(60);
  const [scores, setScores] = useState<[number, number]>([0, 0]);
  const [battleWinner, setBattleWinner] = useState<0 | 1 | null>(null);

  // Rooms state
  const [roomParticipants, setRoomParticipants] = useState<User[]>([]);

  // Chat, donations, side panel
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([...DEFAULT_CHAT_MESSAGES]);
  const [chatInput, setChatInput] = useState("");
  const [donations, setDonations] = useState<Donation[]>([]);
  const [totalDonations, setTotalDonations] = useState(0);
  const [hostCut, setHostCut] = useState(0);
  const [sidePanelTab, setSidePanelTab] = useState<SidePanelTab>("chat");
  const [sidePanelOpen, setSidePanelOpen] = useState(false);

  // Per-user donation tracking
  const [userDonations, setUserDonations] = useState<Record<string, number>>({});

  // Layout & background
  const [layoutModalOpen, setLayoutModalOpen] = useState(false);
  const [bgModalOpen, setBgModalOpen] = useState(false);
  const [selectedLayout, setSelectedLayout] = useState<LayoutPreset>("2x2");
  const [selectedBg, setSelectedBg] = useState<string>("");
  const [customBgUploaded, setCustomBgUploaded] = useState(false);

  // Settings drawer
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Ad settings
  const [adFrequency, setAdFrequency] = useState<string>("every_30");
  const [donationSkipEnabled, setDonationSkipEnabled] = useState(true);
  const [donationSkipAmount, setDonationSkipAmount] = useState("200 credits");

  // Custom overlay images
  const [cameraOffImage, setCameraOffImage] = useState<string>("");
  const [muteImage, setMuteImage] = useState<string>("");

  // Moderation state
  const [bannedUsers, setBannedUsers] = useState<{ user: string; type: "ban" | "timeout"; expiresAt?: number }[]>([]);
  const [hoveredChatId, setHoveredChatId] = useState<string | null>(null);
  const [minCreditsToChat, setMinCreditsToChat] = useState("0");
  const [minCreditsToJoin, setMinCreditsToJoin] = useState("0");
  const [customCreditsToChat, setCustomCreditsToChat] = useState("");
  const [customCreditsToJoin, setCustomCreditsToJoin] = useState("");
  const [streamSettingsOpen, setStreamSettingsOpen] = useState(false);

  // Enhanced moderation state
  const [moderators, setModerators] = useState<string[]>([]);
  const [blockLinks, setBlockLinks] = useState(false);
  const [slowMode, setSlowMode] = useState<SlowModeInterval>("off");
  const [followersOnly, setFollowersOnly] = useState(false);
  const [subscriberOnly, setSubscriberOnly] = useState(false);
  const [bannedWordsInput, setBannedWordsInput] = useState("");
  const [bannedWords, setBannedWords] = useState<string[]>([]);

  // Disconnect grace period (seconds) — stream stays alive this long after navigating away
  const [disconnectTimeout, setDisconnectTimeout] = useState(60);
  const [disconnectCountdown, setDisconnectCountdown] = useState<number | null>(null);
  const disconnectTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Battle queue settings
  const [queueCreditCost, setQueueCreditCost] = useState(0);
  const [battleWhitelist, setBattleWhitelist] = useState<string[]>([]);
  const [showBattleTypeModal, setShowBattleTypeModal] = useState(false);
  const [selectedBattleType, setSelectedBattleType] = useState<StreamMode>("timer_wars");

  // Team battle & invite modal
  const [teamMode, setTeamMode] = useState(false);
  const [teamSize, setTeamSize] = useState(2); // 2v2, 3v3, etc.
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [activePowerUps, setActivePowerUps] = useState<{ type: string; targetId: string; expiresAt: number }[]>([]);

  // Join requests state
  const [joinRequests, setJoinRequests] = useState<{ id: string; userId: string; displayName: string; avatarUrl: string }[]>([]);

  // Load whitelist from API on mount
  useEffect(() => {
    fetch("/api/creator/whitelist", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.whitelist) {
          setBattleWhitelist(data.whitelist.map((w: { id: string }) => w.id));
        }
      })
      .catch(() => {});
  }, []);

  // Whitelist add/remove with API persistence
  const handleAddToWhitelist = useCallback((userId: string) => {
    if (!userId || battleWhitelist.includes(userId)) return;
    setBattleWhitelist((prev) => [...prev, userId]);
    fetch("/api/creator/whitelist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ whitelistedId: userId }),
    }).catch(() => {});
  }, [battleWhitelist]);

  const handleRemoveFromWhitelist = useCallback((userId: string) => {
    setBattleWhitelist((prev) => prev.filter((id) => id !== userId));
    fetch("/api/creator/whitelist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ whitelistedId: userId }),
    }).catch(() => {});
  }, []);

  // Donation alert queue
  const { current: currentDonationAlert, enqueue: enqueueDonationAlert, handleComplete: handleDonationAlertComplete } = useDonationAlertQueue();
  const [donationBorderFlash, setDonationBorderFlash] = useState(false);

  // Streamlabs integration — connect when live, pipe events into donation alerts
  const enqueueDonationAlertRef = useRef(enqueueDonationAlert);
  enqueueDonationAlertRef.current = enqueueDonationAlert;

  const { connected: streamlabsConnected } = useStreamlabs({
    enabled: isLive,
    onEvent: useCallback((evt) => {
      if (evt.type === "donation" && evt.amount && evt.amount > 0) {
        // Convert dollar amount to credits (1 dollar = 100 credits)
        const creditAmount = Math.round(evt.amount * 100);
        const tier = (() => {
          if (creditAmount >= 5000) return { name: "Crown", iconKey: "crown", rarityColor: "#eab308", animationType: "explosion" as const, category: "premium" as const };
          if (creditAmount >= 1000) return { name: "Bomb", iconKey: "bomb", rarityColor: "#ef4444", animationType: "explosion" as const, category: "premium" as const };
          if (creditAmount >= 500) return { name: "Fire", iconKey: "fire", rarityColor: "#f97316", animationType: "sparkle" as const, category: "basic" as const };
          return { name: "Cheer", iconKey: "sparkle", rarityColor: "#60a5fa", animationType: "sparkle" as const, category: "basic" as const };
        })();
        enqueueDonationAlertRef.current({
          id: `sl-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          from: evt.from,
          avatar: "",
          tierName: tier.name,
          tierIcon: tier.iconKey,
          amount: creditAmount,
          rarityColor: tier.rarityColor,
          animationType: tier.animationType,
          category: tier.category,
        });
        setDonationBorderFlash(true);
        setTimeout(() => setDonationBorderFlash(false), 2000);
        setTotalDonations((t) => t + creditAmount);
      }
    }, []),
  });

  // Friends online status (derived from fetched users)
  const [friendsOnline, setFriendsOnline] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const map: Record<string, boolean> = {};
    allUsers.forEach((u) => {
      const lastActive = (u as unknown as Record<string, unknown>).lastActiveAt ? new Date((u as unknown as Record<string, unknown>).lastActiveAt as string).getTime() : 0;
      map[u.id] = Date.now() - lastActive < 5 * 60 * 1000; // online if active in last 5 min
    });
    setFriendsOnline(map);
  }, [allUsers]);

  // Load settings from API on mount (with localStorage as offline fallback)
  useEffect(() => {
    let cancelled = false;
    const loadSettings = async () => {
      try {
        const res = await fetch("/api/creator/live-settings", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          const s = data.liveSettings || {};
          if (!cancelled) {
            if (s.blockLinks !== undefined) setBlockLinks(s.blockLinks);
            if (s.slowMode) setSlowMode(s.slowMode);
            if (s.followersOnly !== undefined) setFollowersOnly(s.followersOnly);
            if (s.subscriberOnly !== undefined) setSubscriberOnly(s.subscriberOnly);
            if (s.bannedWords) { setBannedWords(s.bannedWords); setBannedWordsInput(s.bannedWords.join(", ")); }
            if (s.minCreditsToChat) setMinCreditsToChat(s.minCreditsToChat);
            if (s.minCreditsToJoin) setMinCreditsToJoin(s.minCreditsToJoin);
            if (s.adFrequency) setAdFrequency(s.adFrequency);
            if (s.donationSkipEnabled !== undefined) setDonationSkipEnabled(s.donationSkipEnabled);
            if (s.donationSkipAmount) setDonationSkipAmount(s.donationSkipAmount);
            if (s.cameraOffImage) setCameraOffImage(s.cameraOffImage);
            if (s.muteImage) setMuteImage(s.muteImage);
            if (s.queueCreditCost !== undefined) setQueueCreditCost(s.queueCreditCost);
            if (s.streamTitle) setTitle(s.streamTitle);
            if (s.tags) setTags(s.tags);
            if (s.mode) setMode(s.mode as StreamMode);
            if (s.guestLimit) setGuestLimit(s.guestLimit);
            if (s.roundLength) setRoundLength(s.roundLength);
            if (s.bgColor) setSelectedBg(s.bgColor);
            if (s.disconnectTimeout) setDisconnectTimeout(s.disconnectTimeout);
          }
          return;
        }
      } catch {}
      // Offline fallback: try localStorage
      if (cancelled) return;
      try {
        const saved = localStorage.getItem("rally_stream_settings");
        if (saved) {
          const s = JSON.parse(saved);
          if (s.blockLinks !== undefined) setBlockLinks(s.blockLinks);
          if (s.slowMode) setSlowMode(s.slowMode);
          if (s.followersOnly !== undefined) setFollowersOnly(s.followersOnly);
          if (s.subscriberOnly !== undefined) setSubscriberOnly(s.subscriberOnly);
          if (s.bannedWords) { setBannedWords(s.bannedWords); setBannedWordsInput(s.bannedWords.join(", ")); }
          if (s.minCreditsToChat) setMinCreditsToChat(s.minCreditsToChat);
          if (s.minCreditsToJoin) setMinCreditsToJoin(s.minCreditsToJoin);
          if (s.adFrequency) setAdFrequency(s.adFrequency);
          if (s.donationSkipEnabled !== undefined) setDonationSkipEnabled(s.donationSkipEnabled);
          if (s.donationSkipAmount) setDonationSkipAmount(s.donationSkipAmount);
          if (s.cameraOffImage) setCameraOffImage(s.cameraOffImage);
          if (s.muteImage) setMuteImage(s.muteImage);
          if (s.queueCreditCost !== undefined) setQueueCreditCost(s.queueCreditCost);
        }
      } catch {}
    };
    loadSettings();
    return () => { cancelled = true; };
  }, []);

  // Debounced save to API + localStorage fallback when settings change
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // Save to localStorage immediately as offline fallback
    try {
      localStorage.setItem("rally_stream_settings", JSON.stringify({
        blockLinks, slowMode, followersOnly, subscriberOnly, bannedWords,
        minCreditsToChat, minCreditsToJoin, adFrequency, donationSkipEnabled,
        donationSkipAmount, cameraOffImage, muteImage, queueCreditCost,
      }));
    } catch {}

    // Debounced API save (1 second delay)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      fetch("/api/creator/live-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          blockLinks, slowMode, followersOnly, subscriberOnly, bannedWords,
          minCreditsToChat, minCreditsToJoin, adFrequency, donationSkipEnabled,
          donationSkipAmount, cameraOffImage, muteImage, queueCreditCost,
          streamTitle: title, tags, mode, guestLimit, roundLength,
          bgColor: selectedBg, disconnectTimeout,
        }),
      }).catch(() => {});
    }, 1000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [blockLinks, slowMode, followersOnly, subscriberOnly, bannedWords, minCreditsToChat, minCreditsToJoin, adFrequency, donationSkipEnabled, donationSkipAmount, cameraOffImage, muteImage, queueCreditCost, title, tags, mode, guestLimit, roundLength, selectedBg, disconnectTimeout]);

  // ─── Effects ─────────────────────────────────────────────────────────────

  // Auto-select layout based on guest limit
  useEffect(() => {
    if (guestLimit <= 1) setSelectedLayout("1x1");
    else if (guestLimit <= 2) setSelectedLayout("2x1");
    else if (guestLimit <= 4) setSelectedLayout("2x2");
    else if (guestLimit <= 6) setSelectedLayout("3x2");
    else setSelectedLayout("2x5");
  }, [guestLimit]);

  // Acquire camera/mic when entering preview or setup with camera on
  useEffect(() => {
    if (!cameraOn && !micOn) {
      stopStream(localStream);
      setLocalStream(null);
      return;
    }

    let cancelled = false;
    getUserMediaStream({
      video: cameraOn,
      audio: micOn,
      cameraId: deviceState.selectedCameraId || undefined,
      micId: deviceState.selectedMicId || undefined,
    })
      .then((stream) => {
        if (cancelled) {
          stopStream(stream);
          return;
        }
        setLocalStream(stream);
      })
      .catch((err) => {
        console.error("Failed to get media:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [cameraOn, micOn, deviceState.selectedCameraId, deviceState.selectedMicId]);

  // Sync camera/mic toggles with stream tracks
  useEffect(() => {
    setTrackEnabled(localStream, "video", cameraOn);
  }, [cameraOn, localStream]);

  useEffect(() => {
    setTrackEnabled(localStream, "audio", micOn);
  }, [micOn, localStream]);

  // Wire localStream to video element - use callback ref for reliable binding
  const setLocalVideoRef = useCallback((el: HTMLVideoElement | null) => {
    localVideoRef.current = el;
    if (el && localStream) {
      el.srcObject = localStream;
    }
  }, [localStream]);

  // Also re-wire when localStream changes
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Wire screenStream to video element - use callback ref
  const setScreenVideoRef = useCallback((el: HTMLVideoElement | null) => {
    screenVideoRef.current = el;
    if (el && screenStream) {
      el.srcObject = screenStream;
    }
  }, [screenStream]);

  useEffect(() => {
    if (screenVideoRef.current && screenStream) {
      screenVideoRef.current.srcObject = screenStream;
    }
  }, [screenStream]);

  // Mic volume analyser
  useEffect(() => {
    if (!localStream || !micOn) {
      setMicVolume(0);
      if (micVolumeRafRef.current) cancelAnimationFrame(micVolumeRafRef.current);
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
        analyserRef.current = null;
      }
      return;
    }

    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length === 0) return;

    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      const source = audioCtx.createMediaStreamSource(localStream);
      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        // Normalize to 0-100
        setMicVolume(Math.min(100, Math.round((avg / 128) * 100)));
        micVolumeRafRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();
    } catch {
      // AudioContext not supported
    }

    return () => {
      if (micVolumeRafRef.current) cancelAnimationFrame(micVolumeRafRef.current);
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
        analyserRef.current = null;
      }
    };
  }, [localStream, micOn]);

  // End the stream via beacon/fetch when user leaves (tab close, navigation, disconnect)
  useEffect(() => {
    const endStreamOnLeave = () => {
      const sid = useBroadcastStore.getState().streamId;
      if (!sid) return;
      // Use keepalive fetch — survives page unload in modern browsers
      fetch(`/api/live/${sid}`, { method: "DELETE", keepalive: true }).catch(() => {});
    };

    const handleBeforeUnload = () => { endStreamOnLeave(); };
    const handleVisibilityChange = () => {
      // Only end if the page is being hidden AND we're actually live
      if (document.visibilityState === "hidden" && useBroadcastStore.getState().stage === "live") {
        // Don't end immediately on visibility change — user may just be switching tabs
        // Instead, let the stale stream reaper handle it after 2 min
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Cleanup on unmount — also end the stream in the database
  useEffect(() => {
    return () => {
      const sid = useBroadcastStore.getState().streamId;
      if (sid) {
        fetch(`/api/live/${sid}`, { method: "DELETE", keepalive: true }).catch(() => {});
      }
      stopStream(localStream);
      stopStream(screenStream);
      resetStream();
      resetBroadcast();
      if (micVolumeRafRef.current) cancelAnimationFrame(micVolumeRafRef.current);
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
    };
  }, []);

  // Stream duration timer
  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(() => setStreamDuration((d) => d + 1), 1000);
    return () => clearInterval(interval);
  }, [isLive]);

  // Disconnect grace period — keep stream alive when streamer navigates away
  useEffect(() => {
    if (!isLive) return;

    // Warn before closing tab/window
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Your stream is still live! Are you sure you want to leave?";
    };

    // Start/stop countdown when tab visibility changes
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab went hidden — start countdown
        let remaining = disconnectTimeout;
        setDisconnectCountdown(remaining);
        disconnectTimerRef.current = setInterval(() => {
          remaining -= 1;
          setDisconnectCountdown(remaining);
          if (remaining <= 0) {
            // Time's up — end the stream
            if (disconnectTimerRef.current) clearInterval(disconnectTimerRef.current);
            disconnectTimerRef.current = null;
            handleEndStream();
          }
        }, 1000);
      } else {
        // Tab came back — cancel countdown
        if (disconnectTimerRef.current) {
          clearInterval(disconnectTimerRef.current);
          disconnectTimerRef.current = null;
        }
        setDisconnectCountdown(null);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (disconnectTimerRef.current) {
        clearInterval(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }
      setDisconnectCountdown(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, disconnectTimeout]);

  // Capture and upload video frames + audio every 2 seconds for viewers
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const latestAudioChunkRef = useRef<string | null>(null);
  // Ref to current donation alert for compositing into frames
  const donationAlertRef = useRef<DonationAlertData | null>(null);
  useEffect(() => { donationAlertRef.current = currentDonationAlert; }, [currentDonationAlert]);

  // Audio recording: capture complete WebM audio chunks every 2 seconds
  // Uses stop/restart pattern so each chunk is an independently playable WebM file
  // Mixes mic (localStream) + desktop audio (screenStream) when screen sharing
  const audioIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioMixCtxRef = useRef<AudioContext | null>(null);
  useEffect(() => {
    const hasMic = micOn && localStream && localStream.getAudioTracks().length > 0;
    const hasScreenAudio = screenSharing && screenStream && screenStream.getAudioTracks().length > 0;

    if (!isLive || !broadcastStreamId || (!hasMic && !hasScreenAudio)) {
      if (audioRecorderRef.current && audioRecorderRef.current.state !== "inactive") {
        audioRecorderRef.current.stop();
      }
      audioRecorderRef.current = null;
      latestAudioChunkRef.current = null;
      if (audioIntervalRef.current) {
        clearInterval(audioIntervalRef.current);
        audioIntervalRef.current = null;
      }
      if (audioMixCtxRef.current) {
        audioMixCtxRef.current.close().catch(() => {});
        audioMixCtxRef.current = null;
      }
      return;
    }

    // Mix all available audio sources (mic + desktop) into a single stream
    let audioStream: MediaStream;
    if (hasMic && hasScreenAudio) {
      const ctx = new AudioContext();
      audioMixCtxRef.current = ctx;
      const dest = ctx.createMediaStreamDestination();
      localStream!.getAudioTracks().forEach((track) => {
        ctx.createMediaStreamSource(new MediaStream([track])).connect(dest);
      });
      screenStream!.getAudioTracks().forEach((track) => {
        ctx.createMediaStreamSource(new MediaStream([track])).connect(dest);
      });
      audioStream = dest.stream;
    } else if (hasScreenAudio) {
      audioStream = new MediaStream(screenStream!.getAudioTracks());
    } else {
      audioStream = new MediaStream(localStream!.getAudioTracks());
    }
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    let stopped = false;

    const startRecorder = () => {
      if (stopped) return;
      try {
        const recorder = new MediaRecorder(audioStream, { mimeType, audioBitsPerSecond: 32000 });
        audioRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = reader.result as string;
              const base64 = result.split(",")[1];
              if (base64) latestAudioChunkRef.current = base64;
            };
            reader.readAsDataURL(e.data);
          }
        };

        recorder.start(); // No timeslice — produces complete WebM on stop
      } catch {
        // MediaRecorder not supported
      }
    };

    // Start first recorder immediately
    startRecorder();

    // Every 1.5s: stop current (triggers ondataavailable with complete WebM), start new
    // Audio chunks need to be long enough for smooth playback — 500ms causes stuttering
    audioIntervalRef.current = setInterval(() => {
      if (audioRecorderRef.current && audioRecorderRef.current.state === "recording") {
        audioRecorderRef.current.stop();
      }
      startRecorder();
    }, 1500);

    return () => {
      stopped = true;
      if (audioIntervalRef.current) {
        clearInterval(audioIntervalRef.current);
        audioIntervalRef.current = null;
      }
      if (audioRecorderRef.current && audioRecorderRef.current.state !== "inactive") {
        audioRecorderRef.current.stop();
      }
      if (audioMixCtxRef.current) {
        audioMixCtxRef.current.close().catch(() => {});
        audioMixCtxRef.current = null;
      }
    };
  }, [isLive, broadcastStreamId, micOn, localStream, screenSharing, screenStream]);

  useEffect(() => {
    if (!isLive || !broadcastStreamId) return;

    // Create an offscreen canvas for frame capture
    if (!frameCanvasRef.current) {
      frameCanvasRef.current = document.createElement("canvas");
    }
    const canvas = frameCanvasRef.current;

    const captureAndUpload = async () => {
      const stream = screenSharing && screenStream ? screenStream : localStream;
      if (!stream) return;

      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack || !videoTrack.enabled) return;

      // Grab latest audio chunk (keep it in ref so it's not lost between cycles)
      const audioChunk = latestAudioChunkRef.current;

      try {
        // Use ImageCapture API if available, otherwise use video element
        if ("ImageCapture" in window) {
          const capture = new (window as unknown as { ImageCapture: new (track: MediaStreamTrack) => { grabFrame: () => Promise<ImageBitmap> } }).ImageCapture(videoTrack);
          const bitmap = await capture.grabFrame();
          canvas.width = Math.min(bitmap.width, 640);
          canvas.height = Math.round(bitmap.height * (canvas.width / bitmap.width));
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            // Composite donation alert overlay if active
            const activeAlert = donationAlertRef.current;
            if (activeAlert) {
              drawDonationOverlay(ctx, canvas.width, canvas.height, activeAlert);
            }
            const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
            const base64 = dataUrl.split(",")[1];
            fetch(`/api/live/${broadcastStreamId}/frame`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ frame: base64, audio: audioChunk }),
            }).catch(() => {});
          }
          bitmap.close();
        } else {
          // Fallback: create temporary video element
          const tempVideo = document.createElement("video");
          tempVideo.srcObject = stream;
          tempVideo.muted = true;
          await tempVideo.play();
          canvas.width = Math.min(tempVideo.videoWidth || 640, 640);
          canvas.height = Math.round((tempVideo.videoHeight || 360) * (canvas.width / (tempVideo.videoWidth || 640)));
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
            // Composite donation alert overlay if active
            const activeAlert = donationAlertRef.current;
            if (activeAlert) {
              drawDonationOverlay(ctx, canvas.width, canvas.height, activeAlert);
            }
            const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
            const base64 = dataUrl.split(",")[1];
            fetch(`/api/live/${broadcastStreamId}/frame`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ frame: base64, audio: audioChunk }),
            }).catch(() => {});
          }
          tempVideo.pause();
          tempVideo.srcObject = null;
        }
      } catch {
        // Frame capture failed - skip this frame
      }
    };

    // Capture first frame immediately, then every 500ms
    captureAndUpload();
    const interval = setInterval(captureAndUpload, 500);
    return () => clearInterval(interval);
  }, [isLive, broadcastStreamId, localStream, screenStream, screenSharing]);

  // Poll viewer count and join requests from API every 5 seconds when live
  useEffect(() => {
    if (!isLive || !broadcastStreamId) return;
    const fetchStreamData = async () => {
      try {
        const res = await api.live.get(broadcastStreamId) as { liveStream?: { viewerCount?: number } };
        if (res.liveStream?.viewerCount !== undefined) {
          setViewerCount(res.liveStream.viewerCount);
        }
      } catch {}
      // Fetch pending join requests
      try {
        const res = await fetch(`/api/live/${broadcastStreamId}/approve`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data.requests) {
            setJoinRequests(data.requests.map((r: { id: string; user: { id: string; displayName: string; avatarUrl: string | null } }) => ({
              id: r.id,
              userId: r.user.id,
              displayName: r.user.displayName,
              avatarUrl: r.user.avatarUrl || "",
            })));
          }
        }
      } catch {}
    };
    fetchStreamData();
    const interval = setInterval(fetchStreamData, 5000);
    return () => clearInterval(interval);
  }, [isLive, broadcastStreamId]);

  // Donation tier lookup helper
  const getDonationTier = useCallback((amount: number): { name: string; iconKey: string; rarityColor: string; animationType: "sparkle" | "explosion"; category: "basic" | "premium" } => {
    if (amount >= 5000) return { name: "Crown", iconKey: "crown", rarityColor: "#eab308", animationType: "explosion", category: "premium" };
    if (amount >= 1000) return { name: "Bomb", iconKey: "bomb", rarityColor: "#ef4444", animationType: "explosion", category: "premium" };
    if (amount >= 500) return { name: "Fire", iconKey: "fire", rarityColor: "#f97316", animationType: "sparkle", category: "basic" };
    return { name: "Cheer", iconKey: "sparkle", rarityColor: "#60a5fa", animationType: "sparkle", category: "basic" };
  }, []);

  // Poll chat messages from API every 3 seconds when live
  useEffect(() => {
    if (!isLive || !broadcastStreamId) return;
    const fetchChat = async () => {
      try {
        const res = await api.live.chat(broadcastStreamId) as { messages?: { id: string; userId: string; text: string; createdAt: string; isDonation?: boolean; creditAmount?: number }[] };
        if (res.messages && res.messages.length > 0) {
          setChatMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newMsgs = res.messages!
              .filter((m) => !existingIds.has(m.id))
              .map((m) => {
                const sender = allUsers.find((u) => u.id === m.userId);
                return {
                  id: m.id,
                  user: sender?.displayName || "Viewer",
                  avatar: sender?.avatarUrl || "",
                  text: m.text,
                  isDonation: m.isDonation,
                  amount: m.creditAmount,
                };
              });
            if (newMsgs.length === 0) return prev;

            // Trigger donation alerts for new donation messages
            newMsgs.forEach((msg) => {
              if (msg.isDonation && msg.amount && msg.amount > 0) {
                const tier = getDonationTier(msg.amount);
                enqueueDonationAlert({
                  id: msg.id,
                  from: msg.user,
                  avatar: msg.avatar,
                  tierName: tier.name,
                  tierIcon: tier.iconKey,
                  amount: msg.amount,
                  rarityColor: tier.rarityColor,
                  animationType: tier.animationType,
                  category: tier.category,
                });
                // Flash green border
                setDonationBorderFlash(true);
                setTimeout(() => setDonationBorderFlash(false), 2000);
                // Update totals (host receives full donation amount via ledger)
                setTotalDonations((t) => t + msg.amount!);
              }
            });

            return [...prev, ...newMsgs];
          });
        }
      } catch {}
    };
    fetchChat();
    const interval = setInterval(fetchChat, 3000);
    return () => clearInterval(interval);
  }, [isLive, broadcastStreamId, allUsers]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Battle timer countdown
  useEffect(() => {
    if (battleState !== "battling") return;
    if (battleTimer <= 0) {
      // Determine winner (higher score)
      const winner = scores[0] >= scores[1] ? 0 : 1;
      setBattleWinner(winner as 0 | 1);
      setBattleState("result");
      return;
    }
    const interval = setInterval(() => {
      setBattleTimer((t) => t - 1);
      // Random score increments
      setScores(([a, b]) => [
        a + Math.floor(Math.random() * 8),
        b + Math.floor(Math.random() * 8),
      ]);
    }, 1000);
    return () => clearInterval(interval);
  }, [battleState, battleTimer, scores]);

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim().toLowerCase())) {
        setTags([...tags, tagInput.trim().toLowerCase()]);
      }
      setTagInput("");
    }
  };

  const handleGoLive = async () => {
    if (!title.trim()) return;

    // Create stream via API
    const isBattle = mode !== "standard" && mode !== "rooms";
    try {
      const res = await api.live.create({
        title: title.trim(),
        tags,
        mode: mode.toUpperCase(),
        isBattle,
        guestLimit,
        roundTimeSec: mode === "rooms" ? undefined : roundLength,
        hostCutPercent: hostCut,
        cameraOn,
        micOn,
      });
      const data = res as { liveStream?: { id?: string } };
      if (data?.liveStream?.id) {
        setBroadcastStreamId(data.liveStream.id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message || "Failed to start stream. Please check your connection and try again.");
      setStage("setup");
      return;
    }

    setIsLive(true);
    setStage("live");
    setViewerCount(0);

    // Auto-start recording using camera/mic stream (no screen picker needed)
    if (localStream) {
      try {
        const uploadId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        recordingStore.setUploadId(uploadId);

        const uploader = new ChunkUploader({
          uploadId,
          onProgress: (uploaded, total) => recordingStore.setChunksProgress(uploaded, total),
          onError: (err) => recordingStore.setError(err),
        });
        uploaderRef.current = uploader;

        const recorder = new MediaRecorderManager({
          onChunk: (chunk) => uploader.enqueue(chunk),
          onStateChange: (state) => recordingStore.setState(state),
          onError: (err) => recordingStore.setError(err),
          onDurationUpdate: (seconds) => recordingStore.setDuration(seconds),
        });
        recorderRef.current = recorder;
        recorder.start(localStream);
      } catch {
        // Auto-recording failed — non-fatal, stream still works
      }
    }

    // Initialize queue / rooms
    const shuffled = shuffleArray(allUsers.filter((u) => u.id !== currentUser?.id));
    if (mode === "rooms") {
      setRoomParticipants([currentUser!, ...shuffled.slice(0, Math.min(guestLimit - 1, 9))]);
    } else {
      setBattleQueue(shuffled.slice(0, 8));
      setBattleState("idle");
    }
  };

  const handleEndStream = async () => {
    // Finalize recording if active (uploads remaining chunks, creates DB record, triggers processing)
    if (recorderRef.current?.state === "recording" || recorderRef.current?.state === "paused") {
      await handleStopRecording();
    }
    // Stop camera, mic, and screen share
    stopStream(localStream);
    setLocalStream(null);
    stopStream(screenStream);
    setScreenStream(null);
    setScreenSharing(false);
    setCameraOn(false);
    setMicOn(false);

    // End stream in database and wait for it to complete
    if (broadcastStreamId) {
      try {
        await api.live.end(broadcastStreamId);
      } catch {
        // Best effort
      }
    }

    setIsLive(false);
    setStage("setup");
    setViewerCount(0);
    setStreamDuration(0);
    setBattleState("idle");
    setCurrentBattlers(null);
    setBattleQueue([]);
    setRoomParticipants([]);
    setDonations([]);
    setTotalDonations(0);
    setHostCut(0);
    setUserDonations({});
    setChatMessages([...DEFAULT_CHAT_MESSAGES]);
    recordingStore.reset();
    resetBroadcast();

    // Navigate to creator studio so streamer can see their recording
    router.push("/creator-studio");
  };

  const handleToggleScreenShare = async () => {
    if (screenSharing) {
      stopStream(screenStream);
      setScreenStream(null);
      setScreenSharing(false);
    } else {
      try {
        const stream = await getScreenStream();
        setScreenStream(stream);
        setScreenSharing(true);
        // Stop sharing when track ends (user clicks "Stop sharing" in browser)
        stream.getVideoTracks()[0]?.addEventListener("ended", () => {
          setScreenStream(null);
          setScreenSharing(false);
        });
      } catch {
        // User cancelled or not supported
      }
    }
  };

  const handleStartRecording = async () => {
    const uploadId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    recordingStore.setUploadId(uploadId);

    const uploader = new ChunkUploader({
      uploadId,
      onProgress: (uploaded, total) => recordingStore.setChunksProgress(uploaded, total),
      onError: (err) => recordingStore.setError(err),
    });
    uploaderRef.current = uploader;

    const recorder = new MediaRecorderManager({
      onChunk: (chunk) => uploader.enqueue(chunk),
      onStateChange: (state) => recordingStore.setState(state),
      onError: (err) => recordingStore.setError(err),
      onDurationUpdate: (seconds) => recordingStore.setDuration(seconds),
    });
    recorderRef.current = recorder;

    try {
      // Capture entire screen/tab for full-screen recording
      const screenCapture = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser" } as MediaTrackConstraints,
        audio: true,
      });

      // Mix audio: local mic + screen audio
      const audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();
      let hasAudio = false;

      if (localStream) {
        localStream.getAudioTracks().forEach(track => {
          const source = audioCtx.createMediaStreamSource(new MediaStream([track]));
          source.connect(dest);
          hasAudio = true;
        });
      }
      screenCapture.getAudioTracks().forEach(track => {
        const source = audioCtx.createMediaStreamSource(new MediaStream([track]));
        source.connect(dest);
        hasAudio = true;
      });

      // Combine screen video + mixed audio
      const combined = new MediaStream([
        ...screenCapture.getVideoTracks(),
        ...(hasAudio ? dest.stream.getAudioTracks() : []),
      ]);

      // Stop recording when screen share ends
      screenCapture.getVideoTracks()[0]?.addEventListener("ended", () => {
        handleStopRecording();
      });

      recorder.start(combined);
    } catch {
      // User cancelled screen picker or not supported — fall back to camera stream
      if (localStream) {
        recorder.start(localStream);
      }
    }
  };

  const handleStopRecording = async () => {
    recorderRef.current?.stop();

    // Create the recording record immediately so we can track progress
    let recId: string | null = null;
    if (broadcastStreamId) {
      try {
        const res = await fetch("/api/recordings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            liveStreamId: broadcastStreamId,
            title: `${title} - Recording`,
            filePath: "",
          }),
        });
        if (res.ok) {
          const data = await res.json();
          recId = data.recording.id;
          recordingStore.setRecordingId(recId!);
        }
      } catch {}
    }

    // Update progress as chunks finalize
    const updateProgress = async (pct: number) => {
      if (!recId) return;
      try {
        await fetch(`/api/recordings/${recId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ progress: Math.round(pct) }),
        });
      } catch {}
    };

    // Report 10% — starting finalization
    await updateProgress(10);

    // Finalize upload (waits for all chunks)
    const result = await uploaderRef.current?.finalize(recordingStore.chunksUploaded + 1);

    if (result && recId) {
      // Report 60% — upload complete, now processing
      await updateProgress(60);

      // Update the file path on the recording
      try {
        await fetch(`/api/recordings/${recId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ progress: 70 }),
        });
      } catch {}

      // Trigger server-side processing (ffmpeg merge)
      try {
        await fetch(`/api/recordings/${recId}/process`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ filePath: result.path }),
        });
      } catch {}
    } else if (recId) {
      // Upload failed — mark as failed
      await fetch(`/api/recordings/${recId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "FAILED", progress: 0 }),
      }).catch(() => {});
    }
  };

  const handlePauseRecording = () => recorderRef.current?.pause();
  const handleResumeRecording = () => recorderRef.current?.resume();

  const handleOpenQueue = () => {
    // Switch to the selected battle mode so isBattleMode becomes true
    setMode(selectedBattleType);
    setBattleState("queue_open");
  };

  const handleStartBattle = () => {
    if (battleQueue.length < 2) return;
    const [first, second, ...rest] = battleQueue;
    setCurrentBattlers([first, second]);
    setBattleQueue(rest);
    setBattleTimer(roundLength);
    setScores([0, 0]);
    setBattleWinner(null);
    setBattleState("battling");
  };

  const handleNextBattle = () => {
    if (!currentBattlers || battleWinner === null) return;
    const winner = currentBattlers[battleWinner];
    if (battleQueue.length === 0) {
      setBattleState("queue_open");
      setCurrentBattlers(null);
      return;
    }
    const [next, ...rest] = battleQueue;
    setCurrentBattlers([winner, next]);
    setBattleQueue(rest);
    setBattleTimer(roundLength);
    setScores([0, 0]);
    setBattleWinner(null);
    setBattleState("battling");
  };

  const handleEndBattle = () => {
    setBattleState("idle");
    setCurrentBattlers(null);
    setBattleQueue([]);
    setBattleTimer(roundLength);
    setScores([0, 0]);
    setBattleWinner(null);
  };

  const handleSwitchMode = (newMode: StreamMode) => {
    handleEndBattle();
    setMode(newMode);

    if (newMode === "rooms") {
      setRoomParticipants([currentUser!]);
    }

    if (broadcastStreamId) {
      fetch(`/api/live/${broadcastStreamId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mode: newMode.toUpperCase() }),
      }).catch(() => {});
    }
  };

  const handleAcceptToQueue = (userId: string) => {
    const user = allUsers.find((u) => u.id === userId);
    if (user && !battleQueue.find((u) => u.id === userId)) {
      setBattleQueue((prev) => [...prev, user]);
    }
  };

  const handleRemoveFromQueue = (userId: string) => {
    setBattleQueue((prev) => prev.filter((u) => u.id !== userId));
  };

  const handleSendChat = async () => {
    if (!chatInput.trim()) return;
    const text = chatInput.trim();
    const msg: ChatMessage = {
      id: `cm${Date.now()}`,
      user: currentUser?.displayName || "You",
      avatar: currentUser?.avatarUrl || "",
      text,
    };
    setChatMessages((prev) => [...prev, msg]);
    setChatInput("");
    // Send to API if live
    if (isLive && broadcastStreamId) {
      try {
        await api.live.sendChat(broadcastStreamId, { text });
      } catch {
        // Will appear from next poll
      }
    }
  };

  const handleDonate = async (toUser: User[][0]) => {
    const amount = Math.floor(Math.random() * 500) + 2;
    const newDonation: Donation = {
      id: `d${Date.now()}`,
      from: "You",
      to: toUser.displayName,
      amount,
      timestamp: Date.now(),
    };
    setDonations((prev) => [newDonation, ...prev].slice(0, 50));
    setTotalDonations((t) => t + amount);
    setHostCut((h) => h + Math.floor(amount * HOST_CUT_PERCENT / 100));
    setUserDonations((prev) => ({
      ...prev,
      [toUser.id]: (prev[toUser.id] || 0) + amount,
    }));

    const msg: ChatMessage = {
      id: `cm${Date.now()}`,
      user: "You",
      avatar: currentUser?.avatarUrl || "",
      text: `Sent ${formatCredits(amount)} to ${toUser.displayName}!`,
      isDonation: true,
      amount,
    };
    setChatMessages((prev) => [...prev, msg]);

    // Send donation via API
    if (isLive && broadcastStreamId) {
      try {
        await api.live.sendChat(broadcastStreamId, {
          text: `Sent ${formatCredits(amount)} to ${toUser.displayName}!`,
          isDonation: true,
          creditAmount: amount,
        });
      } catch {}
    }
  };

  const handleBanUser = async (username: string) => {
    setBannedUsers((prev) => {
      if (prev.find((b) => b.user === username && b.type === "ban")) return prev;
      return [...prev.filter((b) => b.user !== username), { user: username, type: "ban" }];
    });
    // Find user ID from username and call API
    if (isLive && broadcastStreamId) {
      const target = allUsers.find((u) => u.displayName === username || u.username === username);
      if (target) {
        try {
          await api.live.moderate(broadcastStreamId, { action: "ban", targetUserId: target.id });
        } catch {}
      }
    }
  };

  const handleTimeoutUser = async (username: string, minutes: number) => {
    const expiresAt = Date.now() + minutes * 60 * 1000;
    setBannedUsers((prev) => {
      return [...prev.filter((b) => b.user !== username), { user: username, type: "timeout", expiresAt }];
    });
    if (isLive && broadcastStreamId) {
      const target = allUsers.find((u) => u.displayName === username || u.username === username);
      if (target) {
        try {
          await api.live.moderate(broadcastStreamId, { action: "timeout", targetUserId: target.id, timeoutMinutes: minutes });
        } catch {}
      }
    }
  };

  const handleUnbanUser = (username: string) => {
    setBannedUsers((prev) => prev.filter((b) => b.user !== username));
  };

  const handleKickFromRoom = async (userId: string) => {
    setRoomParticipants((prev) => prev.filter((u) => u.id !== userId));
    setBattleQueue((prev) => prev.filter((u) => u.id !== userId));
    if (broadcastStreamId) {
      try {
        await api.live.moderate(broadcastStreamId, { action: "kick", targetUserId: userId });
      } catch {}
    }
  };

  const handleApproveJoin = async (requestId: string, userId: string) => {
    setJoinRequests((prev) => prev.filter((r) => r.id !== requestId));
    const user = allUsers.find((u) => u.id === userId);
    if (user) {
      if (mode === "rooms") {
        setRoomParticipants((prev) => prev.find((u) => u.id === userId) ? prev : [...prev, user]);
      } else {
        setBattleQueue((prev) => prev.find((u) => u.id === userId) ? prev : [...prev, user]);
      }
    }
    if (broadcastStreamId) {
      try {
        await fetch(`/api/live/${broadcastStreamId}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ participantId: requestId, action: "approve" }),
        });
      } catch {}
    }
  };

  const handleRejectJoin = async (requestId: string) => {
    setJoinRequests((prev) => prev.filter((r) => r.id !== requestId));
    if (broadcastStreamId) {
      try {
        await fetch(`/api/live/${broadcastStreamId}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ participantId: requestId, action: "reject" }),
        });
      } catch {}
    }
  };

  const handleDeleteMessage = (messageId: string) => {
    setChatMessages((prev) => prev.filter((m) => m.id !== messageId));
  };

  const modeOptions = [
    { id: "standard", label: "Standard" },
    { id: "timer_wars", label: "Timer Wars" },
    { id: "tower_wars", label: "Tower Wars" },
    { id: "rooms", label: "Rooms" },
    { id: "trivia", label: "Trivia" },
    { id: "auction", label: "Auction" },
    { id: "spin_wheel", label: "Spin Wheel" },
    { id: "last_standing", label: "Last Standing" },
  ];

  const sidePanelTabs = [
    { id: "friends", label: "Friends" },
    { id: "chat", label: "Chat" },
    { id: "donations", label: "Credits" },
  ];

  // ─── Sorted friends list ─────────────────────────────────────────────────

  const sortedFriends = [...allUsers]
    .filter((u) => u.id !== currentUser?.id)
    .sort((a, b) => {
      const aOnline = friendsOnline[a.id] ? 1 : 0;
      const bOnline = friendsOnline[b.id] ? 1 : 0;
      return bOnline - aOnline;
    });

  // ─── Layout grid classes ──────────────────────────────────────────────────

  const handleLayoutChange = (layout: LayoutPreset) => {
    setSelectedLayout(layout);
    const layoutOption = LAYOUT_OPTIONS.find((l) => l.id === layout);
    if (layoutOption) {
      const newLimit = layoutOption.cols * layoutOption.rows;
      setGuestLimit(newLimit);
      if (broadcastStreamId) {
        fetch(`/api/live/${broadcastStreamId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ guestLimit: newLimit }),
        }).catch(() => {});
      }
    }
  };

  const layoutGridClass: Record<LayoutPreset, string> = {
    "1x1": "grid-cols-1",
    "2x1": "grid-cols-2",
    "2x2": "grid-cols-2",
    "3x2": "grid-cols-3",
    "2x5": "grid-cols-2",
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PRE-LIVE SETUP
  // ═══════════════════════════════════════════════════════════════════════════

  // Gate: non-creators cannot go live
  if (currentUser && !currentUser.isCreator) {
    return (
      <div className="min-h-screen p-4 md:p-6 lg:p-8">
        <div className="max-w-lg mx-auto mt-20">
          <Card padding="lg">
            <div className="flex flex-col items-center text-center gap-5 py-6">
              <div className="w-20 h-20 rounded-2xl bg-text-muted/10 flex items-center justify-center">
                <Lock size={36} className="text-text-muted" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-text mb-2">Creator Account Required</h1>
                <p className="text-text-secondary">
                  Only creators can start live streams. Apply for a creator account to unlock this feature.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // Show loading while checking eligibility
  if (eligibilityLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Gate: not eligible
  if (eligibility && !eligibility.eligible) {
    return (
      <div className="min-h-screen p-4 md:p-6 lg:p-8">
        <div className="max-w-lg mx-auto mt-20">
          <Card padding="lg">
            <div className="flex flex-col items-center text-center gap-5 py-6">
              <div className="w-20 h-20 rounded-2xl bg-text-muted/10 flex items-center justify-center">
                <Lock size={36} className="text-text-muted" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-text mb-2">Go Live is Locked</h1>
                <p className="text-text-secondary">
                  You need to upload more content before you can start streaming.
                </p>
              </div>

              <div className="w-full space-y-3 mt-2">
                {/* Videos progress */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">Videos uploaded</span>
                  <span className={`font-bold ${eligibility.videos >= eligibility.requiredVideos ? "text-success" : "text-text"}`}>
                    {eligibility.videos} / {eligibility.requiredVideos}
                  </span>
                </div>
                <div className="w-full bg-bg-surface3 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${eligibility.videos >= eligibility.requiredVideos ? "bg-success" : "bg-primary"}`}
                    style={{ width: `${Math.min((eligibility.videos / eligibility.requiredVideos) * 100, 100)}%` }}
                  />
                </div>

                {/* Impression views progress */}
                <div className="flex items-center justify-between text-sm mt-4">
                  <span className="text-text-secondary" title="The total number of ad impressions served across all your videos.">Total impression views</span>
                  <span className={`font-bold ${eligibility.views >= eligibility.requiredViews ? "text-success" : "text-text"}`}>
                    {eligibility.views} / {eligibility.requiredViews}
                  </span>
                </div>
                <div className="w-full bg-bg-surface3 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${eligibility.views >= eligibility.requiredViews ? "bg-success" : "bg-primary"}`}
                    style={{ width: `${Math.min((eligibility.views / eligibility.requiredViews) * 100, 100)}%` }}
                  />
                </div>

                {/* Likes progress */}
                <div className="flex items-center justify-between text-sm mt-4">
                  <span className="text-text-secondary">Total likes</span>
                  <span className={`font-bold ${(eligibility.likes ?? 0) >= (eligibility.requiredLikes ?? 50) ? "text-success" : "text-text"}`}>
                    {eligibility.likes ?? 0} / {eligibility.requiredLikes ?? 50}
                  </span>
                </div>
                <div className="w-full bg-bg-surface3 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${(eligibility.likes ?? 0) >= (eligibility.requiredLikes ?? 50) ? "bg-success" : "bg-primary"}`}
                    style={{ width: `${Math.min(((eligibility.likes ?? 0) / (eligibility.requiredLikes ?? 50)) * 100, 100)}%` }}
                  />
                </div>
              </div>

              <Button
                variant="gradient"
                size="lg"
                icon={<Upload size={18} />}
                onClick={() => router.push("/upload-stream")}
                className="mt-4"
              >
                Upload Videos
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (!isLive) {
    return (
      <div className="min-h-screen p-4 md:p-6 lg:p-8">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-text mb-2 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-danger/20 flex items-center justify-center">
                <Radio size={22} className="text-danger" />
              </div>
              Go Live
            </h1>
            <p className="text-text-secondary">
              Set up your stream and start broadcasting to your audience
            </p>
          </div>

          <Card padding="lg" className="space-y-6">
            {/* Camera / Mic preview with real stream */}
            <div className="aspect-video bg-bg-surface2 rounded-xl border border-border flex flex-col items-center justify-center relative overflow-hidden">
              <MediaPreview
                stream={localStream}
                cameraOn={cameraOn}
                mirrored
                muted
                fallbackAvatar={currentUser?.avatarUrl ?? undefined}
                fallbackName={currentUser?.displayName}
                className="absolute inset-0"
              />
              {/* Mic volume bar above preview */}
              {micOn && (
                <div className="absolute top-4 right-4 z-10 flex flex-col items-center gap-[2px] bg-black/40 rounded-full px-1.5 py-2">
                  {[4, 3, 2, 1, 0].map((i) => (
                    <div
                      key={i}
                      className={cn(
                        "w-[4px] h-[6px] rounded-full transition-all duration-75",
                        micVolume > i * 20 ? (i >= 4 ? "bg-danger" : i >= 3 ? "bg-warning" : "bg-success") : "bg-white/20"
                      )}
                    />
                  ))}
                </div>
              )}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 z-10">
                <button
                  onClick={() => { const ns = !cameraOn; playToggleSound(ns); setCameraOn(ns); }}
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                    cameraOn ? "bg-bg-surface3/80 text-text hover:bg-bg-surface3" : "bg-danger/80 text-white hover:bg-danger"
                  )}
                >
                  {cameraOn ? <Camera size={18} /> : <CameraOff size={18} />}
                </button>
                <button
                  onClick={() => { const ns = !micOn; playToggleSound(ns); setMicOn(ns); }}
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                    micOn ? "bg-bg-surface3/80 text-text hover:bg-bg-surface3" : "bg-danger/80 text-white hover:bg-danger"
                  )}
                >
                  {micOn ? <Mic size={18} /> : <MicOff size={18} />}
                </button>
              </div>
            </div>

            {/* Device selector */}
            <DeviceSelector
              selectedCameraId={deviceState.selectedCameraId}
              selectedMicId={deviceState.selectedMicId}
              onCameraChange={(id) => setDeviceState({ selectedCameraId: id })}
              onMicChange={(id) => setDeviceState({ selectedMicId: id })}
            />

            {/* Stream title */}
            <Input
              label="Stream Title *"
              placeholder="What are you streaming today?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            {/* Tags */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-secondary flex items-center gap-1.5">
                <Tag size={14} />
                Tags
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/15 text-primary text-xs font-medium rounded-full"
                  >
                    #{tag}
                    <button type="button" onClick={() => setTags(tags.filter((t) => t !== tag))}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <Input
                placeholder="Add tags (press Enter)"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                icon={<Tag size={16} />}
              />
            </div>

            {/* Stream Mode */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text-secondary flex items-center gap-1.5">
                <Swords size={14} />
                Stream Mode
              </label>
              <SegmentedControl
                options={modeOptions}
                value={mode}
                onChange={(id) => setMode(id as StreamMode)}
              />
              <p className="text-xs text-text-muted mt-1">
                {mode === "standard" && "Classic stream with optional 1v1 battles."}
                {mode === "timer_wars" && "Timed battles - lower score gets eliminated!"}
                {mode === "tower_wars" && "Team-based tower defense battles."}
                {mode === "rooms" && "Multi-person hangout room with up to 10 participants."}
                {mode === "trivia" && "Host asks questions, fastest correct answer wins points!"}
                {mode === "auction" && "Items presented for bidding, highest bidder wins!"}
                {mode === "spin_wheel" && "Donate to spin the wheel and multiply your credits!"}
                {mode === "last_standing" && "Random elimination every 30s. Donate for immunity!"}
              </p>
            </div>

            {/* Mode-specific settings */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-text-secondary flex items-center gap-1.5 mb-1.5">
                  <Users size={14} />
                  Guest Limit
                </label>
                <select
                  value={guestLimit}
                  onChange={(e) => setGuestLimit(Number(e.target.value))}
                  className="w-full bg-bg-surface2 text-text border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                >
                  {(mode === "rooms" ? [2, 4, 6, 8, 10] : [2, 4, 6, 8]).map((n) => (
                    <option key={n} value={n}>
                      {n} guests
                    </option>
                  ))}
                </select>
              </div>

              {(mode === "timer_wars" || mode === "standard" || mode === "tower_wars") && (
                <div>
                  <label className="text-sm font-medium text-text-secondary flex items-center gap-1.5 mb-1.5">
                    <Timer size={14} />
                    Round Length
                  </label>
                  <select
                    value={roundLength}
                    onChange={(e) => setRoundLength(Number(e.target.value))}
                    className="w-full bg-bg-surface2 text-text border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                  >
                    <option value={30}>30 seconds</option>
                    <option value={60}>60 seconds</option>
                    <option value={90}>90 seconds</option>
                    <option value={120}>2 minutes</option>
                  </select>
                </div>
              )}

              {(mode === "timer_wars") && (
                <div>
                  <label className="text-sm font-medium text-text-secondary flex items-center gap-1.5 mb-1.5">
                    <DollarSign size={14} />
                    Host Cut %
                  </label>
                  <select
                    value={hostCut}
                    onChange={(e) => setHostCut(Number(e.target.value))}
                    className="w-full bg-bg-surface2 text-text border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                  >
                    <option value={0}>0% (no cut)</option>
                    <option value={5}>5%</option>
                    <option value={10}>10%</option>
                    <option value={15}>15%</option>
                    <option value={20}>20%</option>
                    <option value={25}>25%</option>
                    <option value={50}>50%</option>
                  </select>
                </div>
              )}
            </div>

            {/* Ad Schedule Info */}
            <div className="pt-4 border-t border-border">
              <div className="flex items-center gap-2 mb-3">
                <Tv size={16} className="text-primary" />
                <h3 className="text-sm font-semibold text-text">Ad Schedule</h3>
              </div>

              {minCreditsToJoin !== "0" ? (
                <div className="flex items-start gap-2 p-3 bg-success/10 border border-success/20 rounded-lg">
                  <DollarSign size={14} className="text-success shrink-0 mt-0.5" />
                  <p className="text-xs text-text-secondary">
                    <span className="font-medium text-success">No ads (paid entry)</span> &mdash; Viewers who pay credits to join will not see ads during this stream.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-start gap-2 p-3 bg-bg-surface2 rounded-lg">
                    <Clock size={14} className="text-accent shrink-0 mt-0.5" />
                    <div className="text-xs text-text-secondary">
                      <span className="font-medium text-text">Ad frequency: </span>
                      {adFrequency === "start_only" && "One ad at the start only"}
                      {adFrequency === "every_15" && "Ads every 15 minutes"}
                      {adFrequency === "every_30" && "Ads every 30 minutes"}
                      {adFrequency === "every_60" && "Ads every hour"}
                    </div>
                  </div>

                  {donationSkipEnabled && (
                    <div className="flex items-start gap-2 p-3 bg-success/10 border border-success/20 rounded-lg">
                      <Gift size={14} className="text-success shrink-0 mt-0.5" />
                      <p className="text-xs text-text-secondary">
                        <span className="font-medium text-success">Credits skip enabled</span> &mdash; Viewers can send {donationSkipAmount} to skip ads
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Go Live with two-stage flow */}
            <div className="pt-4 border-t border-border space-y-3">
              {error && (
                <div className="rounded-lg bg-danger/10 border border-danger/20 px-4 py-3 text-sm text-danger">
                  {error}
                </div>
              )}
              {stage === "setup" && (
                <Button
                  variant="secondary"
                  size="lg"
                  fullWidth
                  onClick={() => {
                    if (!title.trim()) return;
                    setError(null);
                    setStage("preview");
                  }}
                  disabled={!title.trim()}
                  icon={<Eye size={20} />}
                >
                  Preview Stream
                </Button>
              )}
              <Button
                variant="gradient"
                size="lg"
                fullWidth
                onClick={() => setGoLiveConfirmOpen(true)}
                disabled={!title.trim()}
                icon={<Radio size={20} />}
              >
                GO LIVE
              </Button>
              {stage === "preview" && (
                <p className="text-xs text-text-muted text-center">
                  Your camera is active but you are not live yet. Click GO LIVE to start streaming.
                </p>
              )}
            </div>

            {/* Go Live confirmation modal */}
            <Modal isOpen={goLiveConfirmOpen} onClose={() => setGoLiveConfirmOpen(false)} title="Go Live?" size="sm">
              <div className="space-y-4">
                <p className="text-sm text-text-secondary">
                  You&apos;re about to start streaming <span className="font-bold text-text">&ldquo;{title}&rdquo;</span>.
                  This will create a live stream visible to viewers and open chat.
                </p>
                <div className="flex gap-3">
                  <Button variant="ghost" size="sm" fullWidth onClick={() => setGoLiveConfirmOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="gradient"
                    size="sm"
                    fullWidth
                    icon={<Radio size={16} />}
                    onClick={() => {
                      setGoLiveConfirmOpen(false);
                      handleGoLive();
                    }}
                  >
                    GO LIVE
                  </Button>
                </div>
              </div>
            </Modal>
          </Card>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIVE DASHBOARD
  // ═══════════════════════════════════════════════════════════════════════════

  const isBattleMode = mode !== "standard" && mode !== "rooms";
  const isRoomsMode = mode === "rooms";
  const isStandardMode = mode === "standard";

  // ─── Side Panel Content ───────────────────────────────────────────────────

  const renderSidePanelContent = (): JSX.Element => (
    <div className="flex flex-col h-full">
      <Tabs tabs={sidePanelTabs} activeTab={sidePanelTab} onChange={(id) => setSidePanelTab(id as SidePanelTab)} />

      <div className="flex-1 overflow-y-auto mt-3">
        {/* Friends Tab */}
        {sidePanelTab === "friends" && (
          <div className="space-y-1">
            {sortedFriends.map((friend) => {
              const isOnline = friendsOnline[friend.id];
              return (
                <div
                  key={friend.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-bg-surface2 transition-colors"
                >
                  <Avatar src={friend.avatarUrl} name={friend.displayName} size="sm" online={isOnline} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text truncate">{friend.displayName}</p>
                    <p className="text-[10px] text-text-muted">{isOnline ? "Online" : "Offline"}</p>
                  </div>
                  {isOnline && (
                    <button
                      onClick={() => handleAcceptToQueue(friend.id)}
                      className="shrink-0 px-2 py-1 bg-primary/20 hover:bg-primary/30 text-primary text-[11px] font-medium rounded-lg transition-colors flex items-center gap-1"
                    >
                      <UserPlus size={12} />
                      {isRoomsMode ? "Invite" : "Invite"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Chat Tab */}
        {sidePanelTab === "chat" && (
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto space-y-1 mb-3 max-h-[400px]">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn("group/chat relative flex gap-2 px-1 py-0.5 rounded-lg hover:bg-bg-surface2/50 transition-colors", msg.isDonation && "bg-success/5")}
                  onMouseEnter={() => setHoveredChatId(msg.id)}
                  onMouseLeave={() => setHoveredChatId(null)}
                >
                  <img src={msg.avatar} alt="" className="w-6 h-6 rounded-full shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <span className={cn("text-xs font-semibold", msg.isDonation ? "text-success" : "text-primary")}>
                      {msg.user}
                    </span>
                    {moderators.includes(msg.user) && (
                      <span className="ml-1 text-[10px] text-accent" title="Moderator">
                        <Shield size={10} className="inline" />
                      </span>
                    )}
                    {msg.isDonation && (
                      <span className="ml-1 text-[10px] text-success">
                        <Gift size={10} className="inline" />
                      </span>
                    )}
                    <p className="text-xs text-text-secondary break-words">{msg.text}</p>
                  </div>
                  {/* Moderation hover menu */}
                  {hoveredChatId === msg.id && isLive && msg.user !== (currentUser?.displayName || "You") && (
                    <div className="absolute right-1 top-0 flex items-center gap-0.5 bg-bg-surface border border-border rounded-lg shadow-lg p-0.5 z-10">
                      <button
                        onClick={() => handleBanUser(msg.user)}
                        className="p-1 rounded hover:bg-danger/20 text-text-muted hover:text-danger transition-colors"
                        title="Ban user"
                      >
                        <Ban size={12} />
                      </button>
                      <div className="relative group/timeout">
                        <button
                          className="p-1 rounded hover:bg-warning/20 text-text-muted hover:text-warning transition-colors"
                          title="Timeout user"
                        >
                          <Clock size={12} />
                        </button>
                        <div className="hidden group-hover/timeout:block absolute right-0 top-full mt-0.5 bg-bg-surface border border-border rounded-lg shadow-lg py-0.5 z-20 w-24">
                          {[1, 5, 10].map((mins) => (
                            <button
                              key={mins}
                              onClick={() => handleTimeoutUser(msg.user, mins)}
                              className="w-full text-left px-2 py-1 text-[10px] text-text-secondary hover:bg-bg-surface2 hover:text-text transition-colors"
                            >
                              {mins} min
                            </button>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteMessage(msg.id)}
                        className="p-1 rounded hover:bg-danger/20 text-text-muted hover:text-danger transition-colors"
                        title="Delete message"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="flex gap-2 mt-auto">
              <input
                className="flex-1 bg-bg-surface2 text-text text-sm rounded-lg px-3 py-2 border border-border focus:outline-none focus:border-primary"
                placeholder="Send a message..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
              />
              <Button variant="primary" size="sm" onClick={handleSendChat} icon={<Send size={14} />}>
                Send
              </Button>
            </div>
          </div>
        )}

        {/* Credits Tab */}
        {sidePanelTab === "donations" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 bg-bg-surface2 rounded-lg text-center">
                <p className="text-lg font-bold text-text">{formatCredits(totalDonations)}</p>
                <p className="text-[10px] text-text-muted">Total</p>
              </div>
              <div className="p-3 bg-bg-surface2 rounded-lg text-center">
                <p className="text-lg font-bold text-success">{formatCredits(totalDonations)}</p>
                <p className="text-[10px] text-text-muted">Your Earnings</p>
              </div>
            </div>

            <RevenueSplitCard mode={mode} totalDonations={totalDonations} />

            {/* Credits Rules */}
            <Card padding="sm" className="!bg-bg-surface2">
              <h4 className="text-xs font-semibold text-text mb-2 flex items-center gap-1.5">
                <DollarSign size={14} className="text-success" />
                Credits Rules
              </h4>
              <ul className="space-y-1 text-[11px] text-text-secondary">
                <li>Min chat: {minCreditsToChat === "0" ? "Free" : `${minCreditsToChat} credits`}</li>
                <li>Min join: {minCreditsToJoin === "0" ? "Free" : `${minCreditsToJoin} credits`}</li>
                <li>Host cut: {HOST_CUT_PERCENT}%</li>
                {queueCreditCost > 0 && <li>Queue cost: {queueCreditCost} credits</li>}
              </ul>
            </Card>

            {/* Stream Engine */}
            {isLive && (
              <Card padding="sm" className="!bg-bg-surface2">
                <h4 className="text-xs font-semibold text-text mb-2 flex items-center gap-1.5">
                  <Radio size={14} className="text-danger" />
                  Stream Engine
                </h4>
                <ul className="space-y-1 text-[11px] text-text-secondary">
                  <li>Mode: <span className="text-text font-medium">{mode.replace(/_/g, " ")}</span></li>
                  <li>Layout: <span className="text-text font-medium">{LAYOUT_OPTIONS.find(l => l.id === selectedLayout)?.label}</span></li>
                  <li>Guest limit: <span className="text-text font-medium">{guestLimit}</span></li>
                  <li>Viewers: <span className="text-text font-medium">{viewerCount}</span></li>
                  <li>Duration: <span className="text-text font-medium">{formatTimer(streamDuration)}</span></li>
                  {adFrequency !== "start_only" && <li>Ad freq: {adFrequency.replace("every_", "Every ")} min</li>}
                </ul>
              </Card>
            )}

            <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Recent</h4>
            <div className="space-y-1.5">
              {donations.length === 0 && (
                <p className="text-xs text-text-muted text-center py-4">No credits sent yet</p>
              )}
              {donations.slice(0, 20).map((d) => (
                <div key={d.id} className="flex items-center gap-2 p-2 bg-bg-surface2 rounded-lg">
                  <Gift size={14} className="text-success shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-text truncate">
                      <span className="font-medium">{d.from}</span>
                      <ArrowRight size={10} className="inline mx-1 text-text-muted" />
                      <span className="font-medium">{d.to}</span>
                    </p>
                  </div>
                  <span className="text-xs font-bold text-success">{formatCredits(d.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ─── Battle Panel ─────────────────────────────────────────────────────────

  const BATTLE_TYPES: { id: StreamMode; label: string; icon: React.ReactNode; description: string }[] = [
    { id: "timer_wars", label: "Timer Wars", icon: <Timer size={16} />, description: "Timed 1v1 — lower score gets eliminated" },
    { id: "tower_wars", label: "Tower Wars", icon: <Shield size={16} />, description: "Team-based tower defense battles" },
    { id: "trivia", label: "Trivia", icon: <HelpCircle size={16} />, description: "Host asks questions, fastest answer wins" },
    { id: "auction", label: "Auction", icon: <Gavel size={16} />, description: "Bid with credits, highest bidder wins" },
    { id: "spin_wheel", label: "Spin Wheel", icon: <Disc size={16} />, description: "Donate to spin and multiply credits" },
    { id: "last_standing", label: "Last Standing", icon: <Target size={16} />, description: "Random elimination — donate for immunity" },
  ];

  const renderBattlePanel = (): JSX.Element => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text flex items-center gap-2">
          <Swords size={16} className="text-primary" />
          Battle Arena
        </h3>
        <Badge variant={battleState === "battling" ? "live" : "default"}>
          {battleState === "idle" && "Idle"}
          {battleState === "queue_open" && "Queue Open"}
          {battleState === "battling" && "Fighting"}
          {battleState === "result" && "Result"}
        </Badge>
      </div>

      {/* Battle Actions */}
      {battleState === "idle" && (
        <div className="space-y-3">
          <Button variant="gradient" size="sm" fullWidth onClick={() => setShowBattleTypeModal(true)} icon={<Swords size={16} />}>
            Start a Battle
          </Button>

          {/* Battle Type Selection Modal (inline) */}
          {showBattleTypeModal && (
            <Card padding="sm" className="!bg-bg-surface2 !border-primary/30">
              <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Choose Battle Type</h4>
              <div className="space-y-1.5 mb-3">
                {BATTLE_TYPES.map((bt) => (
                  <button
                    key={bt.id}
                    onClick={() => setSelectedBattleType(bt.id)}
                    className={cn(
                      "w-full flex items-center gap-2.5 p-2.5 rounded-lg text-left transition-colors",
                      selectedBattleType === bt.id
                        ? "bg-primary/20 border border-primary/40"
                        : "bg-bg-surface3 hover:bg-bg-surface3/80 border border-transparent"
                    )}
                  >
                    <span className={selectedBattleType === bt.id ? "text-primary" : "text-text-muted"}>{bt.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-xs font-medium", selectedBattleType === bt.id ? "text-primary" : "text-text")}>{bt.label}</p>
                      <p className="text-[10px] text-text-muted">{bt.description}</p>
                    </div>
                    {selectedBattleType === bt.id && <Check size={14} className="text-primary shrink-0" />}
                  </button>
                ))}
              </div>

              {/* Queue Credit Cost */}
              <div className="mb-3">
                <label className="text-xs font-medium text-text-secondary mb-1 block">Credits to join queue</label>
                <div className="flex items-center gap-2">
                  <select
                    value={queueCreditCost}
                    onChange={(e) => setQueueCreditCost(Number(e.target.value))}
                    className="flex-1 bg-bg-surface3 text-text border border-border rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-primary"
                  >
                    <option value={0}>Free</option>
                    <option value={10}>10 credits</option>
                    <option value={25}>25 credits</option>
                    <option value={50}>50 credits</option>
                    <option value={100}>100 credits</option>
                    <option value={250}>250 credits</option>
                    <option value={500}>500 credits</option>
                    <option value={1000}>1,000 credits</option>
                  </select>
                  <DollarSign size={14} className="text-success shrink-0" />
                </div>
                {queueCreditCost > 0 && (
                  <p className="text-[10px] text-text-muted mt-1">Viewers pay {queueCreditCost} credits to join. Host gets {HOST_CUT_PERCENT}%.</p>
                )}
              </div>

              {/* Whitelist */}
              <div className="mb-3">
                <label className="text-xs font-medium text-text-secondary mb-1 block">Whitelist (free entry)</label>
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {battleWhitelist.map((uid) => {
                    const u = allUsers.find((au) => au.id === uid);
                    return (
                      <span key={uid} className="inline-flex items-center gap-1 px-2 py-0.5 bg-success/10 border border-success/20 text-success text-[10px] rounded-full">
                        {u?.displayName || uid}
                        <button onClick={() => handleRemoveFromWhitelist(uid)} className="hover:text-danger">
                          <X size={10} />
                        </button>
                      </span>
                    );
                  })}
                </div>
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      handleAddToWhitelist(e.target.value);
                    }
                    e.target.value = "";
                  }}
                  className="w-full bg-bg-surface3 text-text border border-border rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-primary"
                  defaultValue=""
                >
                  <option value="" disabled>Add user to whitelist...</option>
                  {allUsers.filter((u) => u.id !== currentUser?.id && !battleWhitelist.includes(u.id)).map((u) => (
                    <option key={u.id} value={u.id}>{u.displayName}</option>
                  ))}
                </select>
              </div>

              <Button
                variant="gradient"
                size="sm"
                fullWidth
                onClick={() => {
                  setShowBattleTypeModal(false);
                  handleOpenQueue();
                }}
                icon={<Zap size={16} />}
              >
                Open Queue — {BATTLE_TYPES.find((bt) => bt.id === selectedBattleType)?.label}
              </Button>
            </Card>
          )}
        </div>
      )}

      {battleState === "queue_open" && (
        <div className="space-y-2">
          <Button
            variant="gradient"
            size="sm"
            fullWidth
            onClick={handleStartBattle}
            disabled={battleQueue.length < 2}
            icon={<Zap size={16} />}
          >
            Start Battle ({battleQueue.length} in queue)
          </Button>
          {/* Host can add themselves to the queue for solo testing */}
          {currentUser && !battleQueue.find((u) => u.id === currentUser.id) && (
            <Button
              variant="secondary"
              size="sm"
              fullWidth
              onClick={() => handleAcceptToQueue(currentUser.id)}
              icon={<UserPlus size={16} />}
            >
              Join Queue (Test)
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            fullWidth
            onClick={() => setInviteModalOpen(true)}
            icon={<Send size={16} />}
          >
            Invite to Battle
          </Button>
          <Button variant="ghost" size="sm" fullWidth onClick={handleEndBattle} icon={<X size={16} />}>
            End Battle Mode
          </Button>
        </div>
      )}

      {battleState === "result" && (
        <div className="space-y-2">
          <Button variant="gradient" size="sm" fullWidth onClick={handleNextBattle} icon={<ArrowRight size={16} />}>
            {battleQueue.length > 0 ? "Next Challenger" : "Reopen Queue"}
          </Button>
          <Button variant="ghost" size="sm" fullWidth onClick={handleEndBattle} icon={<X size={16} />}>
            End Battle Mode
          </Button>
        </div>
      )}

      {/* Current Battle */}
      {battleState === "battling" && currentBattlers && (
        <Card padding="sm" className="!bg-bg-surface2">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-text-muted">Battle in progress</span>
            <span className="text-sm font-bold text-danger flex items-center gap-1">
              <Timer size={14} />
              {formatTimer(battleTimer)}
            </span>
          </div>
          {/* BattleBar with compact player info */}
          <BattleBar
            leftScore={scores[0]}
            rightScore={scores[1]}
            leftLabel={currentBattlers[0].displayName}
            rightLabel={currentBattlers[1].displayName}
            size="md"
          />
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="text-center">
              <img src={currentBattlers[0].avatarUrl ?? undefined} alt="" className="w-10 h-10 rounded-full mx-auto mb-1 border-2 border-primary" />
              <p className="text-[10px] font-medium text-text truncate">{currentBattlers[0].displayName}</p>
              <p className="text-xs font-bold text-primary">{scores[0]} pts</p>
            </div>
            <div className="text-center">
              <img src={currentBattlers[1].avatarUrl ?? undefined} alt="" className="w-10 h-10 rounded-full mx-auto mb-1 border-2 border-accent" />
              <p className="text-[10px] font-medium text-text truncate">{currentBattlers[1].displayName}</p>
              <p className="text-xs font-bold text-accent">{scores[1]} pts</p>
            </div>
          </div>
        </Card>
      )}

      {/* Battle Result */}
      {battleState === "result" && currentBattlers && battleWinner !== null && (
        <Card padding="sm" className="!bg-success/10 !border-success/30">
          <div className="text-center space-y-2">
            <Trophy size={24} className="text-success mx-auto" />
            <p className="text-sm font-bold text-text">{currentBattlers[battleWinner].displayName} Wins!</p>
            <p className="text-[11px] text-text-secondary">
              Won 10% of opponent&apos;s credits
            </p>
            <div className="flex justify-center gap-3 text-xs">
              <span className="text-primary">{currentBattlers[0].displayName}: {scores[0]} pts</span>
              <span className="text-text-muted">vs</span>
              <span className="text-accent">{currentBattlers[1].displayName}: {scores[1]} pts</span>
            </div>
          </div>
        </Card>
      )}

      {/* Queue Settings Summary */}
      {(queueCreditCost > 0 || battleWhitelist.length > 0) && (
        <Card padding="sm" className="!bg-bg-surface2">
          {queueCreditCost > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <DollarSign size={12} className="text-success" />
              <span className="text-text-secondary">Entry cost:</span>
              <span className="font-bold text-success">{queueCreditCost} credits</span>
            </div>
          )}
          {battleWhitelist.length > 0 && (
            <div className="flex items-center gap-2 text-xs mt-1.5">
              <UserCheck size={12} className="text-primary" />
              <span className="text-text-secondary">Whitelist:</span>
              <span className="font-medium text-text">{battleWhitelist.length} user{battleWhitelist.length !== 1 ? "s" : ""} (free entry)</span>
            </div>
          )}
        </Card>
      )}

      {/* Queue */}
      <div>
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
          Queue ({battleQueue.length})
        </h4>
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {battleQueue.map((user, idx) => (
            <div key={user.id} className="flex items-center gap-2 p-2 bg-bg-surface2 rounded-lg">
              <span className="text-[10px] text-text-muted w-4">{idx + 1}</span>
              <Avatar src={user.avatarUrl} name={user.displayName} size="sm" />
              <span className="text-xs font-medium text-text flex-1 truncate">{user.displayName}</span>
              {battleWhitelist.includes(user.id) && (
                <span className="text-[9px] text-success font-medium px-1.5 py-0.5 bg-success/10 rounded-full">FREE</span>
              )}
              <button
                onClick={() => handleRemoveFromQueue(user.id)}
                className="p-1 hover:bg-danger/20 rounded text-text-muted hover:text-danger transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          {battleQueue.length === 0 && (
            <p className="text-xs text-text-muted text-center py-3">Queue is empty — viewers can join from chat</p>
          )}
        </div>
      </div>

      {/* Join Requests */}
      {joinRequests.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
            Join Requests ({joinRequests.length})
          </h4>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {joinRequests.map((req) => (
              <div key={req.id} className="flex items-center gap-2 p-2 bg-bg-surface2 rounded-lg">
                <Avatar src={req.avatarUrl} name={req.displayName} size="sm" />
                <span className="text-xs font-medium text-text flex-1 truncate">{req.displayName}</span>
                <button
                  onClick={() => handleApproveJoin(req.id, req.userId)}
                  className="px-2 py-1 bg-success/20 hover:bg-success/30 text-success text-[10px] font-medium rounded-lg transition-colors"
                >
                  Accept
                </button>
                <button
                  onClick={() => handleRejectJoin(req.id)}
                  className="px-2 py-1 bg-danger/20 hover:bg-danger/30 text-danger text-[10px] font-medium rounded-lg transition-colors"
                >
                  Deny
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Host cut info */}
      <RevenueSplitCard mode={mode} totalDonations={totalDonations} />

      {/* Mode Switcher */}
      {battleState === "idle" && isLive && (
        <div className="space-y-2 mt-3 pt-3 border-t border-border">
          <p className="text-[10px] font-medium text-text-muted uppercase tracking-wider">Switch Mode</p>
          <div className="flex gap-2">
            {[
              { id: "standard" as StreamMode, label: "Standard", icon: <Radio size={14} /> },
              { id: "rooms" as StreamMode, label: "Rooms", icon: <Users size={14} /> },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => handleSwitchMode(m.id)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  mode === m.id
                    ? "bg-primary/20 text-primary border border-primary/40"
                    : "bg-bg-surface3 text-text-secondary hover:bg-bg-surface3/80"
                )}
              >
                {m.icon} {m.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // ─── Rooms Grid ───────────────────────────────────────────────────────────

  // Determine grid columns based on participant count
  const getRoomsGridClass = (count: number): string => {
    // Use selectedLayout if not default 2x2
    if (selectedLayout !== "2x2") {
      return layoutGridClass[selectedLayout];
    }
    // Auto-layout based on count
    if (count <= 1) return "grid-cols-1";
    if (count <= 2) return "grid-cols-2";
    if (count <= 4) return "grid-cols-2";
    if (count <= 6) return "grid-cols-3";
    if (count <= 8) return "grid-cols-4";
    return "grid-cols-5";
  };

  const renderRoomsGrid = (): JSX.Element => {
    const count = roomParticipants.length;
    const isFeaturedLayout = count === 10;

    return (
      <div className="space-y-4">
        {/* Participant count indicator */}
        <div className="flex items-center gap-2">
          <Users size={16} className="text-primary" />
          <span className="text-sm font-medium text-text">{count} participant{count !== 1 ? "s" : ""} in room</span>
        </div>

        {isFeaturedLayout ? (
          /* Featured host layout for 10 people */
          <div className="space-y-3">
            {/* Host featured large on top */}
            <div className="max-w-2xl mx-auto">
              <ParticipantBox
                user={roomParticipants[0]}
                isHost={roomParticipants[0].id === currentUser?.id}
                donationTotal={userDonations[roomParticipants[0].id] || 0}
                micActive={roomParticipants[0].id === currentUser?.id ? micOn : true}
                cameraActive={roomParticipants[0].id === currentUser?.id ? cameraOn : true}
                stream={roomParticipants[0].id === currentUser?.id ? localStream : null}
                speaking={roomParticipants[0].id === currentUser?.id ? micOn && micVolume > 10 : false}
                onDonate={() => handleDonate(roomParticipants[0])}
                background={selectedBg || undefined}
              />
            </div>
            {/* 3x3 grid of remaining participants */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {roomParticipants.slice(1).map((user) => {
                const isMe = user.id === currentUser?.id;
                return (
                  <ParticipantBox
                    key={user.id}
                    user={user}
                    isHost={isMe}
                    donationTotal={userDonations[user.id] || 0}
                    micActive={isMe ? micOn : true}
                    cameraActive={isMe ? cameraOn : true}
                    stream={isMe ? localStream : null}
                    speaking={isMe ? micOn && micVolume > 10 : false}
                    onDonate={() => handleDonate(user)}
                    onKick={!isMe ? () => handleKickFromRoom(user.id) : undefined}
                    background={selectedBg || undefined}
                  />
                );
              })}
            </div>
          </div>
        ) : (
          /* Adaptive grid for 1-9 participants */
          <div className={cn("grid gap-3 max-h-[calc(100vh-200px)] overflow-hidden", getRoomsGridClass(Math.max(count, guestLimit)))}>
            {roomParticipants.map((user) => {
              const isMe = user.id === currentUser?.id;
              return (
                <ParticipantBox
                  key={user.id}
                  user={user}
                  isHost={isMe}
                  donationTotal={userDonations[user.id] || 0}
                  micActive={isMe ? micOn : true}
                  cameraActive={isMe ? cameraOn : true}
                  stream={isMe ? localStream : null}
                  speaking={isMe ? micOn && micVolume > 10 : false}
                  onDonate={() => handleDonate(user)}
                  onKick={!isMe ? () => handleKickFromRoom(user.id) : undefined}
                  background={selectedBg || undefined}
                />
              );
            })}
            {/* Empty slots up to guest limit */}
            {Array.from({ length: Math.max(0, guestLimit - roomParticipants.length) }).map((_, i) => (
              <div key={`empty-${i}`} className="aspect-video rounded-2xl border-2 border-dashed border-border/40 flex items-center justify-center bg-bg-surface2/30">
                <UserPlus size={20} className="text-text-muted/30" />
              </div>
            ))}
          </div>
        )}

        {/* Donation rules */}
        <Card padding="sm" className="!bg-bg-surface2">
          <h4 className="text-xs font-semibold text-text mb-2 flex items-center gap-1.5">
            <DollarSign size={14} className="text-success" />
            Credits Rules
          </h4>
          <ul className="space-y-1 text-[11px] text-text-secondary">
            <li className="flex items-start gap-1.5">
              <Check size={12} className="text-success shrink-0 mt-0.5" />
              Minimum: 2 credits
            </li>
            <li className="flex items-start gap-1.5">
              <Check size={12} className="text-success shrink-0 mt-0.5" />
              Host receives {HOST_CUT_PERCENT}% of all credits
            </li>
            <li className="flex items-start gap-1.5">
              <Check size={12} className="text-success shrink-0 mt-0.5" />
              Example: 20 credits sent = host gets 2
            </li>
          </ul>
        </Card>

        <RevenueSplitCard mode={mode} totalDonations={totalDonations} />
      </div>
    );
  };

  // ─── Battle Mode Main Video Area ──────────────────────────────────────────

  const renderBattleMainArea = (): JSX.Element => {
    // Timer wars with queue open: show rooms-style grid of participants
    if (mode === "timer_wars" && (battleState === "queue_open" || battleState === "idle")) {
      const participants = currentUser ? [currentUser, ...battleQueue.slice(0, guestLimit - 1)] : battleQueue.slice(0, guestLimit);
      return (
        <div className="relative">
          <div className="space-y-3">
            <div className={cn("grid gap-3 max-h-[calc(100vh-200px)] overflow-hidden", getRoomsGridClass(Math.min(guestLimit, Math.max(participants.length, guestLimit))))}>
              {participants.map((user) => {
                const isMe = user.id === currentUser?.id;
                return (
                  <ParticipantBox
                    key={user.id}
                    user={user}
                    isHost={isMe}
                    donationTotal={userDonations[user.id] || 0}
                    micActive={isMe ? micOn : true}
                    cameraActive={isMe ? cameraOn : true}
                    stream={isMe ? localStream : null}
                    speaking={isMe ? micOn && micVolume > 10 : false}
                    onDonate={() => handleDonate(user)}
                    onKick={!isMe ? () => handleKickFromRoom(user.id) : undefined}
                    background={selectedBg || undefined}
                  />
                );
              })}
              {Array.from({ length: Math.max(0, guestLimit - participants.length) }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-video rounded-2xl border-2 border-dashed border-border/40 flex items-center justify-center bg-bg-surface2/30">
                  <span className="text-xs text-text-muted">Empty</span>
                </div>
              ))}
            </div>
          </div>
          {/* Mode badge */}
          <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-primary/90 text-white text-xs font-bold flex items-center gap-1 z-20">
            <Timer size={12} /> Timer Wars
          </span>
          {/* Tags */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span key={tag} className="px-2 py-0.5 bg-bg-surface2 text-text-muted text-xs rounded-full">#{tag}</span>
            ))}
          </div>
        </div>
      );
    }

    return (
    <div className="relative">
      {/* Main battle area — always aspect-video */}
      <div
        className="aspect-video bg-bg-surface2 rounded-xl border border-border relative overflow-hidden"
        style={{ background: selectedBg || undefined }}
      >
        {/* Battle game content (background) */}
        {battleState === "battling" && currentBattlers ? (
          <SplitScreenBattle
            leftPlayer={{
              user: currentBattlers[0],
              score: scores[0],
              stream: currentBattlers[0].id === currentUser?.id ? localStream : undefined,
            }}
            rightPlayer={{
              user: currentBattlers[1],
              score: scores[1],
              stream: currentBattlers[1].id === currentUser?.id ? localStream : undefined,
            }}
            timer={battleTimer}
            activePowerUps={activePowerUps}
            onGiftLeft={() => handleDonate(currentBattlers[0])}
            onGiftRight={() => handleDonate(currentBattlers[1])}
          />
        ) : battleState === "result" && currentBattlers && battleWinner !== null ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-success/10 to-transparent">
            <div className="text-center space-y-3">
              <Trophy size={48} className="text-success mx-auto" />
              <img
                src={currentBattlers[battleWinner].avatarUrl ?? undefined}
                alt=""
                className="w-24 h-24 rounded-full border-4 border-success mx-auto"
              />
              <p className="text-xl font-bold text-text">{currentBattlers[battleWinner].displayName}</p>
              <Badge variant="new">WINNER</Badge>
            </div>
          </div>
        ) : (
          /* Queue open / idle — show waiting state */
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/5 to-accent/5">
            <div className="text-center space-y-3">
              <Swords size={48} className="text-primary/40 mx-auto" />
              <p className="text-sm font-medium text-text">{battleState === "queue_open" ? "Queue is open — waiting for challengers" : "Battle Mode"}</p>
              <p className="text-xs text-text-muted">
                {battleQueue.length > 0 ? `${battleQueue.length} in queue` : "No challengers yet"}
              </p>
            </div>
          </div>
        )}

        {/* Host camera PiP overlay — always visible in bottom-left */}
        {cameraOn && localStream ? (
          <div className="absolute bottom-3 left-3 w-36 md:w-44 aspect-video rounded-lg overflow-hidden border-2 border-warning shadow-lg z-20 bg-black">
            <video
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: "scaleX(-1)" }}
              ref={(el) => { if (el) el.srcObject = localStream; }}
            />
            <span className="absolute top-1 left-1 flex items-center gap-0.5 px-1.5 py-0.5 bg-warning/90 text-black text-[9px] font-bold rounded-full">
              <Crown size={8} /> Host
            </span>
          </div>
        ) : cameraOn ? (
          <div className="absolute bottom-3 left-3 w-36 md:w-44 aspect-video rounded-lg overflow-hidden border-2 border-warning shadow-lg z-20 bg-bg-surface3 flex items-center justify-center">
            <img src={currentUser?.avatarUrl ?? undefined} alt="You" className="w-10 h-10 rounded-full border-2 border-warning/60" />
          </div>
        ) : null}

        {/* Mode badge */}
        <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-primary/90 text-white text-xs font-bold flex items-center gap-1 z-20">
          {mode === "timer_wars" ? <Timer size={12} /> : mode === "tower_wars" ? <Shield size={12} /> : <Swords size={12} />}
          {mode === "timer_wars" ? "Timer Wars" : mode === "tower_wars" ? "Tower Wars" : mode.replace("_", " ")}
        </span>
      </div>

      {/* Tags */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span key={tag} className="px-2 py-0.5 bg-bg-surface2 text-text-muted text-xs rounded-full">#{tag}</span>
        ))}
      </div>
    </div>
  );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // LIVE DASHBOARD RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* ── Top Bar ──────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-bg-surface border-b border-border">
        <div className="flex items-center gap-3 min-w-0">
          <LiveBadge />
          <h1 className="text-sm md:text-base font-bold text-text truncate">{title}</h1>
        </div>
        <div className="flex items-center gap-3 md:gap-5 shrink-0">
          {/* Recording indicator */}
          {(recordingStore.state === "recording" || recordingStore.state === "paused") && (
            <RecordingIndicator
              isRecording={recordingStore.state === "recording"}
              isPaused={recordingStore.state === "paused"}
              duration={recordingStore.duration}
              onPause={handlePauseRecording}
              onResume={handleResumeRecording}
              onStop={handleStopRecording}
            />
          )}
          {streamlabsConnected && (
            <span className="flex items-center gap-1 text-[11px] text-[#80f5d2] bg-[#80f5d2]/10 px-2 py-0.5 rounded-full border border-[#80f5d2]/20" title="Streamlabs connected">
              <span className="w-1.5 h-1.5 rounded-full bg-[#80f5d2] animate-pulse" />
              SL
            </span>
          )}
          <span className="flex items-center gap-1.5 text-xs md:text-sm text-text-secondary">
            <Eye size={14} />
            {viewerCount.toLocaleString()}
          </span>
          <span className="flex items-center gap-1.5 text-xs md:text-sm text-text-secondary">
            <Timer size={14} />
            {formatTimer(streamDuration)}
          </span>
          <Button variant="danger" size="sm" onClick={handleEndStream}>
            End Stream
          </Button>
        </div>
      </div>

      {/* ── Main Content ─────────────────────────────────────────────────── */}
      <div className={cn("flex-1 flex overflow-hidden min-h-0 relative transition-all duration-500", donationBorderFlash && "ring-4 ring-green-500/60")}>
        {/* Donation alert overlay */}
        {currentDonationAlert && (
          <DonationAlert alert={currentDonationAlert} onComplete={handleDonationAlertComplete} />
        )}

        {/* Disconnect countdown overlay — appears when streamer navigates away */}
        {disconnectCountdown !== null && (
          <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
            <div className="text-6xl font-bold text-danger tabular-nums">{disconnectCountdown}</div>
            <p className="text-lg text-white font-medium">Stream ending in {disconnectCountdown} second{disconnectCountdown !== 1 ? "s" : ""}...</p>
            <p className="text-sm text-text-muted">You navigated away from this tab. Come back to cancel.</p>
            <Button variant="danger" size="lg" onClick={handleEndStream}>End Stream Now</Button>
          </div>
        )}
        {/* Left / Center: main content area */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {(isBattleMode || battleState !== "idle") && renderBattleMainArea()}

          {isRoomsMode && battleState === "idle" ? renderRoomsGrid() : null}

          {/* Standard mode: show camera/screen share view (hide when battle active) */}
          {isStandardMode && battleState === "idle" && (
            <div
              className="aspect-video bg-bg-surface2 rounded-xl border border-border flex items-center justify-center relative overflow-hidden"
              style={{ background: selectedBg || undefined }}
            >
              {/* Screen share takes priority when active */}
              {screenSharing && screenStream ? (
                <video
                  ref={setScreenVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-contain"
                />
              ) : cameraOn && localStream ? (
                <video
                  ref={setLocalVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  style={{ transform: "scaleX(-1)" }}
                />
              ) : cameraOn ? (
                <div className="flex flex-col items-center">
                  <img
                    src={currentUser?.avatarUrl ?? undefined}
                    alt="You"
                    className="w-28 h-28 rounded-full border-4 border-primary/30"
                  />
                  <p className="text-sm font-medium text-text mt-2">{currentUser?.displayName}</p>
                </div>
              ) : cameraOffImage ? (
                <img src={cameraOffImage} alt="Camera off" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <CameraOff size={48} className="text-text-muted" />
                  <p className="text-xs text-text-muted">Camera off</p>
                </div>
              )}
              {/* Mute overlay image */}
              {!micOn && muteImage && (
                <div className="absolute bottom-3 left-3 w-10 h-10 rounded-full overflow-hidden border-2 border-danger">
                  <img src={muteImage} alt="Muted" className="w-full h-full object-cover" />
                </div>
              )}
              {/* Picture-in-picture: show camera when screen sharing */}
              {screenSharing && cameraOn && localStream && (
                <div className="absolute bottom-3 right-3 w-32 aspect-video rounded-lg overflow-hidden border-2 border-border shadow-lg">
                  <video
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                    style={{ transform: "scaleX(-1)" }}
                    ref={(el) => { if (el) el.srcObject = localStream; }}
                  />
                </div>
              )}
              <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-primary/90 text-white text-xs font-bold">
                Standard
              </span>
              {screenSharing && (
                <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-accent/90 text-white text-xs font-bold flex items-center gap-1">
                  <Monitor size={12} /> Screen Share
                </span>
              )}
            </div>
          )}

          {/* Battle panel inline on mobile */}
          <div className="lg:hidden">
            <Card padding="md">{renderBattlePanel()}</Card>
          </div>

          {/* Side panel content inline on mobile */}
          <div className="lg:hidden">
            <Card padding="sm">
              {renderSidePanelContent()}
            </Card>
          </div>
        </div>

        {/* Right sidebar: battle panel + side panel (desktop only) */}
        <div className="hidden lg:flex lg:flex-col lg:w-[360px] lg:border-l lg:border-border lg:bg-bg-surface overflow-hidden">
          <div className="border-b border-border p-3 overflow-y-auto max-h-[50%]">
            {renderBattlePanel()}
          </div>
          <div className="flex-1 p-3 overflow-hidden flex flex-col min-h-0">
            {renderSidePanelContent()}
          </div>
        </div>
      </div>

      {/* ── Bottom Controls Bar ──────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-center gap-2 md:gap-3 px-4 py-2 bg-bg-surface border-t border-border">
        <button
          onClick={() => {
            const newState = !cameraOn;
            playToggleSound(newState);
            setCameraOn(newState);
          }}
          className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
            cameraOn ? "bg-bg-surface2 text-text hover:bg-bg-surface3" : "bg-danger text-white"
          )}
          title={cameraOn ? "Turn camera off" : "Turn camera on"}
        >
          {cameraOn ? <Camera size={18} /> : <CameraOff size={18} />}
        </button>

        {/* Mic button with volume bar */}
        <div className="relative">
          <button
            onClick={() => {
              const newState = !micOn;
              playToggleSound(newState);
              setMicOn(newState);
            }}
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
              micOn ? "bg-bg-surface2 text-text hover:bg-bg-surface3" : "bg-danger text-white"
            )}
            title={micOn ? "Mute mic" : "Unmute mic"}
          >
            {micOn ? <Mic size={18} /> : <MicOff size={18} />}
          </button>
          {/* Mic volume indicator */}
          {micOn && (
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 flex items-end gap-[2px] h-5">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={cn(
                    "w-[3px] rounded-full transition-all duration-75",
                    micVolume > i * 20 ? "bg-success" : "bg-bg-surface3"
                  )}
                  style={{ height: `${8 + i * 3}px` }}
                />
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleToggleScreenShare}
          className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
            screenSharing ? "bg-primary text-white" : "bg-bg-surface2 text-text hover:bg-bg-surface3"
          )}
          title="Screen share"
        >
          <Monitor size={18} />
        </button>

        {/* Recording toggle */}
        <button
          onClick={() => {
            if (recordingStore.state === "recording" || recordingStore.state === "paused") {
              handleStopRecording();
            } else {
              handleStartRecording();
            }
          }}
          className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
            recordingStore.state === "recording"
              ? "bg-danger text-white animate-pulse"
              : recordingStore.state === "paused"
              ? "bg-warning text-black"
              : "bg-bg-surface2 text-text hover:bg-bg-surface3"
          )}
          title={recordingStore.state === "recording" ? "Stop recording" : "Start recording"}
        >
          <Circle size={18} />
        </button>

        <button
          onClick={() => setLayoutModalOpen(true)}
          className="w-10 h-10 rounded-full bg-bg-surface2 text-text hover:bg-bg-surface3 flex items-center justify-center transition-colors"
          title="Layout"
        >
          <Layout size={18} />
        </button>

        <button
          onClick={() => setBgModalOpen(true)}
          className="w-10 h-10 rounded-full bg-bg-surface2 text-text hover:bg-bg-surface3 flex items-center justify-center transition-colors"
          title="Background"
        >
          <Palette size={18} />
        </button>

        <button
          onClick={() => setSettingsOpen(true)}
          className="w-10 h-10 rounded-full bg-bg-surface2 text-text hover:bg-bg-surface3 flex items-center justify-center transition-colors"
          title="Settings"
        >
          <Settings size={18} />
        </button>

        <button
          onClick={() => setStreamSettingsOpen(true)}
          className="w-10 h-10 rounded-full bg-bg-surface2 text-text hover:bg-bg-surface3 flex items-center justify-center transition-colors"
          title="Stream Moderation"
        >
          <Shield size={18} />
        </button>

        <button
          onClick={handleEndStream}
          className="w-10 h-10 rounded-full bg-danger text-white flex items-center justify-center transition-colors hover:bg-danger/80"
          title="End stream"
        >
          <PhoneOff size={18} />
        </button>
      </div>

      {/* ============================================================
          TEST ONLY — Admin self-invite for testing. REMOVE before production.
          This is a test feature. It is an error if this ships to production.
          ============================================================ */}
      {!!(currentUser as unknown as Record<string, unknown>)?.isOwner && isLive && broadcastStreamId && (
        <div className="shrink-0 flex items-center justify-center px-4 py-1 bg-yellow-900/30 border-t border-yellow-600/30">
          <button
            className="px-3 py-1.5 text-xs bg-yellow-600 text-white rounded hover:bg-yellow-700 transition-colors"
            onClick={async () => {
              try {
                await api.live.join(broadcastStreamId, "guest");
                handleAcceptToQueue(currentUser!.id);
              } catch {}
            }}
          >
            [TEST] Join Own Stream
          </button>
        </div>
      )}

      {/* ── Layout Modal ─────────────────────────────────────────────────── */}
      <Modal isOpen={layoutModalOpen} onClose={() => setLayoutModalOpen(false)} title="Layout Customization" size="md">
        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-text mb-3">Grid Layouts</h3>
            <div className="grid grid-cols-5 gap-3">
              {LAYOUT_OPTIONS.map((layout) => (
                <button
                  key={layout.id}
                  onClick={() => handleLayoutChange(layout.id)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-colors",
                    selectedLayout === layout.id
                      ? "border-primary bg-primary/10"
                      : "border-border bg-bg-surface2 hover:border-border"
                  )}
                >
                  {/* Mini grid preview */}
                  <div className={cn("grid gap-0.5 w-10 h-10", `grid-cols-${layout.cols}`)}>
                    {Array.from({ length: layout.cols * layout.rows }).map((_, i) => (
                      <div
                        key={i}
                        className={cn(
                          "rounded-sm",
                          selectedLayout === layout.id ? "bg-primary/50" : "bg-bg-surface3"
                        )}
                      />
                    ))}
                  </div>
                  <span className="text-[10px] font-medium text-text-secondary">{layout.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-text mb-3">Presets</h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Side by Side", icon: <Layers size={16} />, layout: "2x1" as LayoutPreset },
                { label: "Picture in Picture", icon: <Minimize2 size={16} />, layout: "1x1" as LayoutPreset },
                { label: "Focus Mode", icon: <Maximize2 size={16} />, layout: "1x1" as LayoutPreset },
              ].map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handleLayoutChange(preset.layout)}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border border-border bg-bg-surface2 hover:border-primary transition-colors"
                >
                  <span className="text-text">{preset.icon}</span>
                  <span className="text-[10px] font-medium text-text-secondary">{preset.label}</span>
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-text-secondary mt-3">
            Current capacity: {guestLimit} participant{guestLimit !== 1 ? "s" : ""}
          </p>
        </div>
      </Modal>

      {/* ── Background Modal ─────────────────────────────────────────────── */}
      <Modal isOpen={bgModalOpen} onClose={() => setBgModalOpen(false)} title="Custom Background" size="md">
        <div className="space-y-5">
          {/* Preview */}
          <div
            className="aspect-video rounded-xl border border-border flex items-center justify-center overflow-hidden"
            style={{ background: selectedBg || "#1A1A24" }}
          >
            <img
              src={currentUser?.avatarUrl ?? undefined}
              alt="Preview"
              className="w-20 h-20 rounded-full border-4 border-primary/30"
            />
          </div>

          {/* No background */}
          <button
            onClick={() => setSelectedBg("")}
            className={cn(
              "w-full p-3 rounded-xl border text-sm font-medium text-left transition-colors flex items-center gap-2",
              !selectedBg ? "border-primary bg-primary/10 text-text" : "border-border bg-bg-surface2 text-text-secondary hover:border-primary"
            )}
          >
            <CameraOff size={16} />
            No background (show camera)
          </button>

          {/* Solid colors */}
          <div>
            <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Solid Colors</h4>
            <div className="flex gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedBg(color)}
                  className={cn(
                    "w-10 h-10 rounded-xl border-2 transition-transform hover:scale-110",
                    selectedBg === color ? "border-white scale-110" : "border-transparent"
                  )}
                  style={{ background: color }}
                />
              ))}
            </div>
          </div>

          {/* Gradients */}
          <div>
            <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Gradients</h4>
            <div className="grid grid-cols-4 gap-2">
              {PRESET_GRADIENTS.map((grad, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedBg(grad)}
                  className={cn(
                    "h-12 rounded-xl border-2 transition-transform hover:scale-105",
                    selectedBg === grad ? "border-white scale-105" : "border-transparent"
                  )}
                  style={{ background: grad }}
                />
              ))}
            </div>
          </div>

          {/* Upload custom */}
          <div>
            <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Custom</h4>
            <button
              onClick={() => {
                setCustomBgUploaded(true);
                setSelectedBg("linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)");
              }}
              className="w-full p-3 rounded-xl border border-dashed border-border bg-bg-surface2 hover:border-primary transition-colors flex items-center justify-center gap-2 text-sm text-text-secondary"
            >
              <Image size={16} />
              {customBgUploaded ? "Custom background applied" : "Upload Custom Background"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Settings Drawer ──────────────────────────────────────────────── */}
      <Drawer isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} title="Stream Settings">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-text-secondary">Stream Title</label>
            <input
              className="mt-1 w-full bg-bg-surface2 text-text text-sm rounded-lg px-3 py-2 border border-border focus:outline-none focus:border-primary"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-text-secondary">Guest Limit</label>
            <select
              value={guestLimit}
              onChange={(e) => setGuestLimit(Number(e.target.value))}
              className="mt-1 w-full bg-bg-surface2 text-text border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
            >
              {[2, 4, 6, 8, 10].map((n) => (
                <option key={n} value={n}>{n} guests</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-text-secondary">Round Length</label>
            <select
              value={roundLength}
              onChange={(e) => setRoundLength(Number(e.target.value))}
              className="mt-1 w-full bg-bg-surface2 text-text border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
            >
              <option value={30}>30 seconds</option>
              <option value={60}>60 seconds</option>
              <option value={90}>90 seconds</option>
              <option value={120}>2 minutes</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-text-secondary">Disconnect Timeout</label>
            <p className="text-[11px] text-text-muted mb-1">How long your stream stays alive if you navigate away</p>
            <select
              value={disconnectTimeout}
              onChange={(e) => setDisconnectTimeout(Number(e.target.value))}
              className="mt-1 w-full bg-bg-surface2 text-text border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
            >
              <option value={15}>15 seconds</option>
              <option value={30}>30 seconds</option>
              <option value={60}>1 minute</option>
              <option value={120}>2 minutes</option>
              <option value={180}>3 minutes</option>
              <option value={300}>5 minutes</option>
            </select>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-text">Camera</span>
              <button
                onClick={() => setCameraOn(!cameraOn)}
                className={cn(
                  "w-12 h-6 rounded-full transition-colors relative",
                  cameraOn ? "bg-primary" : "bg-bg-surface3"
                )}
              >
                <span className={cn(
                  "absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform",
                  cameraOn ? "left-6" : "left-0.5"
                )} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-text">Microphone</span>
              <button
                onClick={() => setMicOn(!micOn)}
                className={cn(
                  "w-12 h-6 rounded-full transition-colors relative",
                  micOn ? "bg-primary" : "bg-bg-surface3"
                )}
              >
                <span className={cn(
                  "absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform",
                  micOn ? "left-6" : "left-0.5"
                )} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-text">Screen Share</span>
              <button
                onClick={() => setScreenSharing(!screenSharing)}
                className={cn(
                  "w-12 h-6 rounded-full transition-colors relative",
                  screenSharing ? "bg-primary" : "bg-bg-surface3"
                )}
              >
                <span className={cn(
                  "absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform",
                  screenSharing ? "left-6" : "left-0.5"
                )} />
              </button>
            </div>
          </div>

          {/* Custom overlay images — file upload */}
          <div className="pt-2 border-t border-border space-y-3">
            <h4 className="text-sm font-medium text-text">Overlay Images</h4>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">Camera Off Image</label>
              {cameraOffImage && (
                <div className="mb-2 relative w-24 h-24 rounded-lg overflow-hidden border border-border">
                  <img src={cameraOffImage} alt="Camera off preview" className="w-full h-full object-cover" />
                  <button
                    onClick={() => setCameraOffImage("")}
                    className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center text-white hover:bg-danger transition-colors"
                  >
                    <X size={10} />
                  </button>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                className="w-full text-xs text-text-secondary file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20 file:cursor-pointer cursor-pointer"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const formData = new FormData();
                  formData.append("file", file);
                  formData.append("type", "camera");
                  try {
                    const res = await fetch("/api/upload/stream-gallery", { method: "POST", body: formData, credentials: "include" });
                    if (res.ok) {
                      const data = await res.json();
                      setCameraOffImage(data.url);
                    }
                  } catch {}
                  e.target.value = "";
                }}
              />
              <p className="text-[10px] text-text-muted mt-0.5">Shown when camera is off. Leave empty for default.</p>
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1 block">Mute Image</label>
              {muteImage && (
                <div className="mb-2 relative w-24 h-24 rounded-lg overflow-hidden border border-border">
                  <img src={muteImage} alt="Mute preview" className="w-full h-full object-cover" />
                  <button
                    onClick={() => setMuteImage("")}
                    className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center text-white hover:bg-danger transition-colors"
                  >
                    <X size={10} />
                  </button>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                className="w-full text-xs text-text-secondary file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20 file:cursor-pointer cursor-pointer"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const formData = new FormData();
                  formData.append("file", file);
                  formData.append("type", "microphone");
                  try {
                    const res = await fetch("/api/upload/stream-gallery", { method: "POST", body: formData, credentials: "include" });
                    if (res.ok) {
                      const data = await res.json();
                      setMuteImage(data.url);
                    }
                  } catch {}
                  e.target.value = "";
                }}
              />
              <p className="text-[10px] text-text-muted mt-0.5">Shown as overlay when mic is muted. Leave empty for none.</p>
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-bg-surface2 rounded-lg text-center">
                <p className="text-lg font-bold text-text">{viewerCount.toLocaleString()}</p>
                <p className="text-[10px] text-text-muted">Viewers</p>
              </div>
              <div className="p-3 bg-bg-surface2 rounded-lg text-center">
                <p className="text-lg font-bold text-success">{formatCredits(totalDonations)}</p>
                <p className="text-[10px] text-text-muted">Credits</p>
              </div>
              <div className="p-3 bg-bg-surface2 rounded-lg text-center">
                <p className="text-lg font-bold text-text">{formatTimer(streamDuration)}</p>
                <p className="text-[10px] text-text-muted">Duration</p>
              </div>
              <div className="p-3 bg-bg-surface2 rounded-lg text-center">
                <p className="text-lg font-bold text-success">{formatCredits(totalDonations)}</p>
                <p className="text-[10px] text-text-muted">Earned</p>
              </div>
            </div>
          </div>
        </div>
      </Drawer>

      {/* ── Stream Moderation Drawer ──────────────────────────────────── */}
      <Drawer isOpen={streamSettingsOpen} onClose={() => setStreamSettingsOpen(false)} title="Stream Moderation">
        <div className="space-y-6">
          {/* Moderators Section */}
          <div>
            <h4 className="text-sm font-medium text-text flex items-center gap-1.5 mb-3">
              <Shield size={14} className="text-accent" />
              Moderators ({moderators.length})
            </h4>
            {moderators.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {moderators.map((modName) => (
                  <div
                    key={modName}
                    className="flex items-center justify-between p-2.5 bg-bg-surface2 rounded-lg"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Shield size={12} className="text-accent shrink-0" />
                      <span className="text-xs font-medium text-text truncate">{modName}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-accent/20 text-accent">
                        Moderator
                      </span>
                    </div>
                    <button
                      onClick={() => setModerators((prev) => prev.filter((m) => m !== modName))}
                      className="shrink-0 px-2 py-1 text-[10px] font-medium text-danger bg-danger/10 hover:bg-danger/20 rounded-lg transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div>
              <label className="text-xs text-text-muted mb-1 block">Add moderator from online users</label>
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value && !moderators.includes(e.target.value)) {
                    setModerators((prev) => [...prev, e.target.value]);
                  }
                  e.target.value = "";
                }}
                className="w-full bg-bg-surface2 text-text border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
              >
                <option value="">Select a user...</option>
                {sortedFriends
                  .filter((f) => friendsOnline[f.id] && !moderators.includes(f.displayName))
                  .map((f) => (
                    <option key={f.id} value={f.displayName}>{f.displayName}</option>
                  ))}
              </select>
            </div>
          </div>

          {/* Auto-Moderation Toggles */}
          <div>
            <h4 className="text-sm font-medium text-text flex items-center gap-1.5 mb-3">
              <Settings size={14} className="text-primary" />
              Auto-Moderation
            </h4>
            <div className="space-y-4">
              {/* Block Links */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-text flex items-center gap-1.5">
                    <Link2Off size={12} /> Block Links in Chat
                  </p>
                  <p className="text-xs text-text-muted">Prevent users from posting links</p>
                </div>
                <button
                  onClick={() => setBlockLinks(!blockLinks)}
                  className={cn(
                    "relative w-11 h-6 rounded-full transition-colors shrink-0",
                    blockLinks ? "bg-primary" : "bg-bg-surface3"
                  )}
                >
                  <span className={cn(
                    "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                    blockLinks && "translate-x-5"
                  )} />
                </button>
              </div>

              {/* Slow Mode */}
              <div>
                <p className="text-sm font-medium text-text flex items-center gap-1.5 mb-1.5">
                  <Clock size={12} /> Slow Mode
                </p>
                <p className="text-xs text-text-muted mb-2">Limit how often users can send messages</p>
                <div className="flex flex-wrap gap-1.5">
                  {(["off", "5", "10", "30", "60"] as SlowModeInterval[]).map((val) => (
                    <button
                      key={val}
                      onClick={() => setSlowMode(val)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
                        slowMode === val
                          ? "bg-primary text-white border-primary"
                          : "bg-bg-surface2 text-text-secondary border-border hover:border-primary"
                      )}
                    >
                      {val === "off" ? "Off" : `${val}s`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Followers Only */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-text flex items-center gap-1.5">
                    <UserCheck size={12} /> Followers Only
                  </p>
                  <p className="text-xs text-text-muted">Only followers can chat</p>
                </div>
                <button
                  onClick={() => setFollowersOnly(!followersOnly)}
                  className={cn(
                    "relative w-11 h-6 rounded-full transition-colors shrink-0",
                    followersOnly ? "bg-primary" : "bg-bg-surface3"
                  )}
                >
                  <span className={cn(
                    "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                    followersOnly && "translate-x-5"
                  )} />
                </button>
              </div>

              {/* Subscriber Only */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-text flex items-center gap-1.5">
                    <Crown size={12} /> Subscriber Only
                  </p>
                  <p className="text-xs text-text-muted">Only premium subscribers can chat</p>
                </div>
                <button
                  onClick={() => setSubscriberOnly(!subscriberOnly)}
                  className={cn(
                    "relative w-11 h-6 rounded-full transition-colors shrink-0",
                    subscriberOnly ? "bg-primary" : "bg-bg-surface3"
                  )}
                >
                  <span className={cn(
                    "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                    subscriberOnly && "translate-x-5"
                  )} />
                </button>
              </div>
            </div>
          </div>

          {/* Word Filter */}
          <div>
            <h4 className="text-sm font-medium text-text flex items-center gap-1.5 mb-3">
              <AlertTriangle size={14} className="text-warning" />
              Word Filter
            </h4>
            <div className="flex gap-2 mb-3">
              <input
                className="flex-1 bg-bg-surface2 text-text text-sm rounded-lg px-3 py-2 border border-border focus:outline-none focus:border-primary"
                placeholder="Add banned words (comma-separated)"
                value={bannedWordsInput}
                onChange={(e) => setBannedWordsInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const words = bannedWordsInput.split(",").map((w) => w.trim().toLowerCase()).filter((w) => w && !bannedWords.includes(w));
                    if (words.length > 0) {
                      setBannedWords((prev) => [...prev, ...words]);
                      setBannedWordsInput("");
                    }
                  }
                }}
              />
              <button
                onClick={() => {
                  const words = bannedWordsInput.split(",").map((w) => w.trim().toLowerCase()).filter((w) => w && !bannedWords.includes(w));
                  if (words.length > 0) {
                    setBannedWords((prev) => [...prev, ...words]);
                    setBannedWordsInput("");
                  }
                }}
                className="px-3 py-2 bg-warning/20 hover:bg-warning/30 text-warning text-xs font-medium rounded-lg transition-colors"
              >
                Add
              </button>
            </div>
            {bannedWords.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {bannedWords.map((word) => (
                  <span
                    key={word}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-danger/10 text-danger text-xs font-medium rounded-full border border-danger/20"
                  >
                    {word}
                    <button onClick={() => setBannedWords((prev) => prev.filter((w) => w !== word))}>
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-muted text-center py-3 bg-bg-surface2 rounded-xl">
                No banned words
              </p>
            )}
          </div>

          {/* Minimum Credits to Chat */}
          <div>
            <label className="text-sm font-medium text-text-secondary flex items-center gap-1.5 mb-1.5">
              <MessageCircle size={14} />
              Minimum Credits to Chat
            </label>
            <select
              value={minCreditsToChat}
              onChange={(e) => setMinCreditsToChat(e.target.value)}
              className="w-full bg-bg-surface2 text-text border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
            >
              <option value="0">Free</option>
              <option value="1">1 credit</option>
              <option value="5">5 credits</option>
              <option value="10">10 credits</option>
              <option value="50">50 credits</option>
              <option value="100">100 credits</option>
              <option value="custom">Custom</option>
            </select>
            {minCreditsToChat === "custom" && (
              <input
                type="number"
                min={1}
                className="mt-2 w-full bg-bg-surface2 text-text text-sm rounded-lg px-3 py-2 border border-border focus:outline-none focus:border-primary"
                placeholder="Enter custom credit amount"
                value={customCreditsToChat}
                onChange={(e) => setCustomCreditsToChat(e.target.value)}
              />
            )}
            <p className="text-[11px] text-text-muted mt-1">
              Users must have at least this many credits to send chat messages.
            </p>
          </div>

          {/* Minimum Credits to Join */}
          <div>
            <label className="text-sm font-medium text-text-secondary flex items-center gap-1.5 mb-1.5">
              <DollarSign size={14} />
              Minimum Credits to Join
            </label>
            <select
              value={minCreditsToJoin}
              onChange={(e) => setMinCreditsToJoin(e.target.value)}
              className="w-full bg-bg-surface2 text-text border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
            >
              <option value="0">Free</option>
              <option value="1">1 credit</option>
              <option value="5">5 credits</option>
              <option value="10">10 credits</option>
              <option value="50">50 credits</option>
              <option value="100">100 credits</option>
              <option value="custom">Custom</option>
            </select>
            {minCreditsToJoin === "custom" && (
              <input
                type="number"
                min={1}
                className="mt-2 w-full bg-bg-surface2 text-text text-sm rounded-lg px-3 py-2 border border-border focus:outline-none focus:border-primary"
                placeholder="Enter custom credit amount"
                value={customCreditsToJoin}
                onChange={(e) => setCustomCreditsToJoin(e.target.value)}
              />
            )}
            <p className="text-[11px] text-text-muted mt-1">
              Viewers must spend this many credits to enter the stream (paywall).
            </p>
          </div>

          {/* Whitelist Management */}
          <div>
            <h4 className="text-sm font-medium text-text-secondary flex items-center gap-1.5 mb-2">
              <UserCheck size={14} />
              Whitelist ({battleWhitelist.length})
            </h4>
            <p className="text-[11px] text-text-muted mb-2">
              Whitelisted users can join battles for free and bypass credit requirements.
            </p>
            <select
              onChange={(e) => {
                if (e.target.value) {
                  handleAddToWhitelist(e.target.value);
                }
                e.target.value = "";
              }}
              className="w-full bg-bg-surface2 text-text border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary mb-2"
              defaultValue=""
            >
              <option value="" disabled>Add user to whitelist...</option>
              {allUsers.filter((u) => u.id !== currentUser?.id && !battleWhitelist.includes(u.id)).map((u) => (
                <option key={u.id} value={u.id}>{u.displayName} (@{u.username})</option>
              ))}
            </select>
            {battleWhitelist.length > 0 ? (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {battleWhitelist.map((uid) => {
                  const u = allUsers.find((au) => au.id === uid);
                  return (
                    <div key={uid} className="flex items-center justify-between p-2.5 bg-bg-surface2 rounded-lg">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-success shrink-0" />
                        <span className="text-xs font-medium text-text truncate">{u?.displayName || uid}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-success/20 text-success">Free</span>
                      </div>
                      <button
                        onClick={() => handleRemoveFromWhitelist(uid)}
                        className="shrink-0 px-2 py-1 text-[10px] font-medium text-danger bg-danger/10 hover:bg-danger/20 rounded-lg transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-text-muted text-center py-3 bg-bg-surface2 rounded-xl">No whitelisted users</p>
            )}
          </div>

          {/* Banned / Timed-out Users */}
          <div>
            <h4 className="text-sm font-medium text-text-secondary flex items-center gap-1.5 mb-2">
              <Ban size={14} />
              Banned / Timed-out Users ({bannedUsers.length})
            </h4>
            {bannedUsers.length === 0 ? (
              <p className="text-xs text-text-muted text-center py-4 bg-bg-surface2 rounded-xl">
                No banned or timed-out users
              </p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {bannedUsers.map((entry) => (
                  <div
                    key={entry.user}
                    className="flex items-center justify-between p-2.5 bg-bg-surface2 rounded-lg"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        entry.type === "ban" ? "bg-danger" : "bg-warning"
                      )} />
                      <span className="text-xs font-medium text-text truncate">{entry.user}</span>
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                        entry.type === "ban"
                          ? "bg-danger/20 text-danger"
                          : "bg-warning/20 text-warning"
                      )}>
                        {entry.type === "ban" ? "Banned" : "Timeout"}
                      </span>
                    </div>
                    <button
                      onClick={() => handleUnbanUser(entry.user)}
                      className="shrink-0 px-2 py-1 text-[10px] font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors"
                    >
                      Unban
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Drawer>

      {/* ── Invite to Battle Modal ──────────────────────────────────── */}
      <InviteBattleModal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        streamId={broadcastStreamId || ""}
        onInviteSent={() => {
          // Refresh battle queue or show notification
        }}
      />
    </div>
  );
}
