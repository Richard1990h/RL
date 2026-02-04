"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import {
  Crown,
  Users,
  Video,
  Coins,
  DollarSign,
  Terminal,
  Shield,
  AlertTriangle,
  Send,
  BadgeCheck,
  Ban,
  Radio,
  ChevronRight,
  Maximize2,
  Minimize2,
  Eye,
  Bot,
  Wrench,
  Brain,
  Bug,
  Check,
  X as XIcon,
  Clock,
  Monitor,
  Unplug,
  Smartphone,
  Fingerprint,
  Volume2,
  VolumeX,
  Search,
  Copy,
  ChevronDown,
  Gauge,
  Bell,
  MessageSquare,
  Heart,
  UserPlus,
  Zap,
  Gift,
  Trash2,
  EyeOff,
  Vault,
  Save,
  RotateCcw,
  Loader2,
  FlaskConical,
  CircleCheck,
  CircleX,
  Stethoscope,
  Sparkles,
  Megaphone,
  Play,
} from "lucide-react";

interface AdminStats {
  totalUsers: number;
  totalVideos: number;
  totalCredits: number;
  totalRevenue: number;
  bannedUsers: number;
  verifiedUsers: number;
  activeStreams: number;
  pendingFees: number;
  settledFees: number;
}

interface TreasuryData {
  creditsInCirculation: number;
  feesPending: number;
  feesSettled: number;
  treasuryBalance: number;
  recentWithdrawals: TreasuryWithdrawal[];
  feeConfig: { withdrawalFeePct: number; withdrawalFeeMinCents: number; purchaseFeePct: number };
}

interface TreasuryWithdrawal {
  id: string;
  user: { username: string; displayName: string; email: string };
  credits: number;
  fee: number;
  net: number;
  status: string;
  paypalEmail: string | null;
  createdAt: string;
}

interface AdminUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isCreator: boolean;
  verifiedBadge: boolean;
  isPremium: boolean;
  isOwner: boolean;
  isBanned: boolean;
  role: "OWNER" | "BUG_TESTER" | "END_USER";
  followerCount: number;
  followingCount: number;
  lastActiveAt: string | null;
  createdAt: string;
  wallet: {
    credits: number;
    totalEarned: number;
    totalSpent: number;
  } | null;
}

interface ClaudeQuestionOption {
  label: string;
  description?: string;
}

interface ClaudeQuestion {
  question: string;
  header?: string;
  options: ClaudeQuestionOption[];
  multiSelect?: boolean;
}

interface ClaudeMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  thinking?: string;
  timestamp: string;
  toolUses?: { name: string; status: string }[];
  isAdminNote?: boolean;
  adminFrom?: string;
  viaBridge?: boolean;
  pendingQuestions?: ClaudeQuestion[];
}

interface BugReport {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  title: string;
  description: string;
  page: string | null;
  status: "OPEN" | "INVESTIGATING" | "DIAGNOSED" | "FIXING" | "FIXED" | "TESTING" | "RESOLVED" | "FAILED" | "DISMISSED";
  diagnosis: string | null;
  upgradeRequest: string | null;
  fixPlan: string | null;
  fixResult: string | null;
  testResult: string | null;
  adminNotes: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

interface BridgeWindow {
  hwnd: string;
  pid: string;
  windowPid: string;
  title: string;
  procName: string;
  label: string;
  projectDir: string;
  commandLine: string;
}

interface BridgeLogEntry {
  time: string;
  from: string;
  text: string;
  status: string;
}

export default function AdminPage() {
  const { currentUser, isLoggedIn, isLoading } = useAuthStore();
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);

  // Enhanced alerts state
  const [alertFilter, setAlertFilter] = useState<"all" | "system" | "messages" | "social" | "streams">("all");
  const [alertReadFilter, setAlertReadFilter] = useState<"all" | "unread" | "read">("all");
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsData, setAlertsData] = useState<any[]>([]);
  const [alertsTotalCount, setAlertsTotalCount] = useState(0);
  const [alertsUnreadCount, setAlertsUnreadCount] = useState(0);
  const [alertsFraudCount, setAlertsFraudCount] = useState(0);
  const [alertsHasMore, setAlertsHasMore] = useState(false);
  const [unreadAlertCount, setUnreadAlertCount] = useState(0);
  const [unreadFraudAlertCount, setUnreadFraudAlertCount] = useState(0);
  const [clearAllConfirm, setClearAllConfirm] = useState(false);

  // Claude session state
  const [claudeMessages, setClaudeMessages] = useState<ClaudeMessage[]>([]);
  const [claudeSessionFile, setClaudeSessionFile] = useState("");
  const [claudeTotalLines, setClaudeTotalLines] = useState(0);
  const [claudeNoteInput, setClaudeNoteInput] = useState("");
  const [isSendingNote, setIsSendingNote] = useState(false);
  const [claudeCopiedToast, setClaudeCopiedToast] = useState(false);
  const [questionSelections, setQuestionSelections] = useState<Record<number, Set<string>>>({});
  const [sendingQuestionAnswer, setSendingQuestionAnswer] = useState(false);
  const [answeredQuestionIds, setAnsweredQuestionIds] = useState<Set<string>>(new Set());
  const claudeEndRef = useRef<HTMLDivElement>(null);
  const claudeScrollRef = useRef<HTMLDivElement>(null);
  const claudeAutoScrollRef = useRef(true);
  const claudeScrollingRef = useRef(false); // true while programmatic scroll is happening
  const [showJumpButton, setShowJumpButton] = useState(false);

  // Bug reports state
  const [bugReports, setBugReports] = useState<BugReport[]>([]);
  const [bugFilter, setBugFilter] = useState<"ALL" | "OPEN" | "INVESTIGATING" | "DIAGNOSED" | "FIXING" | "FIXED" | "TESTING" | "RESOLVED" | "FAILED" | "DISMISSED">("OPEN");
  const [acceptingBugId, setAcceptingBugId] = useState<string | null>(null);
  const [expandedBugId, setExpandedBugId] = useState<string | null>(null);
  const processedBugResponses = useRef<Set<string>>(new Set());

  // Audit viewer state
  const [auditUserEmail, setAuditUserEmail] = useState<string | null>(null);
  const [auditData, setAuditData] = useState<Record<string, any[]> | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditType, setAuditType] = useState<string>("all");

  const loadAudit = useCallback(async (email: string) => {
    setAuditUserEmail(email);
    setAuditLoading(true);
    setAuditData(null);
    try {
      const res = await fetch(`/api/admin/audit?email=${encodeURIComponent(email)}&type=all`);
      if (res.ok) {
        const data = await res.json();
        setAuditData(data.entries || {});
      }
    } catch {} finally {
      setAuditLoading(false);
    }
  }, []);

  // Bridge state
  const [bridgeWindows, setBridgeWindows] = useState<BridgeWindow[]>([]);
  const [bridgeThumbnails, setBridgeThumbnails] = useState<Record<string, string>>({});
  const [bridgeSelectedHwnd, setBridgeSelectedHwnd] = useState<string | null>(null);
  const [bridgeSelectedLabel, setBridgeSelectedLabel] = useState<string>("");
  const [bridgeSelectedProjectDir, setBridgeSelectedProjectDir] = useState<string>("");
  const [bridgeLog, setBridgeLog] = useState<BridgeLogEntry[]>([]);
  const [bridgeStatus, setBridgeStatus] = useState<"waiting" | "active" | "error" | "offline">("waiting");
  const [bridgeSendText, setBridgeSendText] = useState("");
  const [bridgeSending, setBridgeSending] = useState(false);
  const [bridgeSendResult, setBridgeSendResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Treasury state
  const [treasuryData, setTreasuryData] = useState<TreasuryData | null>(null);
  const [treasuryLoading, setTreasuryLoading] = useState(false);
  const [treasuryFeePct, setTreasuryFeePct] = useState(2);
  const [treasuryFeeMin, setTreasuryFeeMin] = useState(25);
  const [treasuryPurchaseFeePct, setTreasuryPurchaseFeePct] = useState(5);
  const [treasurySaving, setTreasurySaving] = useState(false);

  // Custom ads state
  const [customAds, setCustomAds] = useState<any[]>([]);
  const [customAdsLoading, setCustomAdsLoading] = useState(false);
  const [customAdPrice, setCustomAdPrice] = useState(5000);
  const [customAdCostPerImpression, setCustomAdCostPerImpression] = useState(1);
  const [customAdMinBalance, setCustomAdMinBalance] = useState(100);
  const [customAdMixPercent, setCustomAdMixPercent] = useState(50);
  const [customAdPriceSaving, setCustomAdPriceSaving] = useState(false);
  const [customAdStats, setCustomAdStats] = useState<{ totalAds: number; activeCount: number; pendingCount: number; totalImpressions: number; totalCreditsRemaining: number } | null>(null);
  const [customAdFilter, setCustomAdFilter] = useState<"all" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "PAUSED">("all");
  const [rejectModalAdId, setRejectModalAdId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectWithRefund, setRejectWithRefund] = useState(true);
  const [previewAdUrl, setPreviewAdUrl] = useState<string | null>(null);

  // Ad payouts state
  const [adPayouts, setAdPayouts] = useState<any[]>([]);
  const [adPayoutsLoading, setAdPayoutsLoading] = useState(false);
  const [adPayoutHistory, setAdPayoutHistory] = useState<any[]>([]);
  const [adPayoutDay, setAdPayoutDay] = useState(0);
  const [adPayoutDaySaving, setAdPayoutDaySaving] = useState(false);
  const [payingCreatorId, setPayingCreatorId] = useState<string | null>(null);

  // Device auth state
  const [deviceInfo, setDeviceInfo] = useState<{ hasToken: boolean; fullToken: string | null; tokenPreview: string | null; isAllowed: boolean; pendingRequests?: any[] } | null>(null);
  const [deviceChecked, setDeviceChecked] = useState(false);
  const [deviceBlocked, setDeviceBlocked] = useState(false);
  const [deviceRegistering, setDeviceRegistering] = useState(false);
  const [deviceNewToken, setDeviceNewToken] = useState<string | null>(null);
  const [deviceRequestId, setDeviceRequestId] = useState<string | null>(null);
  const [deviceRequestStatus, setDeviceRequestStatus] = useState<"idle" | "pending" | "approved" | "denied">("idle");

  // Text-to-speech state
  const [ttsPlayingId, setTtsPlayingId] = useState<string | null>(null);
  const [ttsSpeed, setTtsSpeed] = useState(1);
  const [ttsAutoRead, setTtsAutoRead] = useState(false);
  const [ttsVoiceName, setTtsVoiceName] = useState<string>("");
  const [ttsAvailableVoices, setTtsAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const ttsUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const ttsAutoReadLastIdRef = useRef<string | null>(null);
  const ttsCurrentTextRef = useRef<{ msgId: string; text: string } | null>(null);

  // Session panel enhancements
  const [claudeSearch, setClaudeSearch] = useState("");
  const [sessionExpanded, setSessionExpanded] = useState(false);
  const [collapsedThinking, setCollapsedThinking] = useState<Set<string>>(new Set());
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  // Load available voices and pick the best natural-sounding one
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) return;
      setTtsAvailableVoices(voices);

      // Pick the best voice: prefer Neural/Natural, then Online, then standard English
      const english = voices.filter((v) => v.lang.startsWith("en"));
      const natural = english.find((v) => /natural/i.test(v.name));
      const neural = english.find((v) => /neural/i.test(v.name));
      const online = english.find((v) => /online/i.test(v.name));
      const jenny = english.find((v) => /jenny/i.test(v.name));
      const aria = english.find((v) => /aria/i.test(v.name));
      const guy = english.find((v) => /\bguy\b/i.test(v.name));
      const samantha = english.find((v) => /samantha/i.test(v.name));
      const zira = english.find((v) => /zira/i.test(v.name));
      const best = natural || neural || jenny || aria || online || guy || samantha || zira || english[0] || voices[0];
      if (best && !ttsVoiceName) {
        setTtsVoiceName(best.name);
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, [ttsVoiceName]);

  // Get the selected voice object
  const getSelectedVoice = useCallback((): SpeechSynthesisVoice | null => {
    if (!ttsVoiceName) return null;
    return ttsAvailableVoices.find((v) => v.name === ttsVoiceName) || null;
  }, [ttsVoiceName, ttsAvailableVoices]);

  const ttsSpeak = useCallback((msgId: string, text: string) => {
    // Detach old utterance callbacks so cancel() doesn't clear new state
    if (ttsUtteranceRef.current) {
      ttsUtteranceRef.current.onend = null;
      ttsUtteranceRef.current.onerror = null;
    }
    window.speechSynthesis.cancel();
    if (ttsPlayingId === msgId) {
      setTtsPlayingId(null);
      ttsCurrentTextRef.current = null;
      ttsUtteranceRef.current = null;
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = ttsSpeed;
    utterance.pitch = 1;
    const voice = getSelectedVoice();
    if (voice) utterance.voice = voice;
    utterance.onend = () => { if (ttsUtteranceRef.current === utterance) { setTtsPlayingId(null); ttsCurrentTextRef.current = null; } };
    utterance.onerror = () => { if (ttsUtteranceRef.current === utterance) { setTtsPlayingId(null); ttsCurrentTextRef.current = null; } };
    ttsUtteranceRef.current = utterance;
    ttsCurrentTextRef.current = { msgId, text };
    setTtsPlayingId(msgId);
    window.speechSynthesis.speak(utterance);
  }, [ttsPlayingId, ttsSpeed, getSelectedVoice]);

  const ttsStop = useCallback(() => {
    if (ttsUtteranceRef.current) {
      ttsUtteranceRef.current.onend = null;
      ttsUtteranceRef.current.onerror = null;
    }
    window.speechSynthesis.cancel();
    setTtsPlayingId(null);
    ttsCurrentTextRef.current = null;
    ttsUtteranceRef.current = null;
  }, []);

  // When speed or voice changes mid-playback, restart with new settings
  const ttsRestartRef = useRef(false);
  useEffect(() => {
    if (ttsCurrentTextRef.current && ttsPlayingId) {
      if (ttsRestartRef.current) return; // prevent infinite loop
      ttsRestartRef.current = true;
      const { text } = ttsCurrentTextRef.current;
      // Detach old utterance callbacks before cancel
      if (ttsUtteranceRef.current) {
        ttsUtteranceRef.current.onend = null;
        ttsUtteranceRef.current.onerror = null;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = ttsSpeed;
      utterance.pitch = 1;
      const voice = getSelectedVoice();
      if (voice) utterance.voice = voice;
      utterance.onend = () => { if (ttsUtteranceRef.current === utterance) { setTtsPlayingId(null); ttsCurrentTextRef.current = null; } };
      utterance.onerror = () => { if (ttsUtteranceRef.current === utterance) { setTtsPlayingId(null); ttsCurrentTextRef.current = null; } };
      ttsUtteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
      setTimeout(() => { ttsRestartRef.current = false; }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttsSpeed, ttsVoiceName]);

  // Relative time helper
  const relativeTime = useCallback((timestamp: string) => {
    if (!timestamp) return "";
    const diff = Date.now() - new Date(timestamp).getTime();
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return "just now";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
  }, []);

  // Copy message to clipboard
  const copyMessage = useCallback((msgId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  }, []);

  // Toggle thinking block collapse
  const toggleThinking = useCallback((msgId: string) => {
    setCollapsedThinking((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  }, []);

  type AdminTab = "overview" | "users" | "alerts" | "session" | "bugs" | "bridge" | "treasury" | "ads";
  const validTabs: AdminTab[] = ["overview", "users", "alerts", "session", "bugs", "bridge", "treasury", "ads"];
  const [activeTab, setActiveTabRaw] = useState<AdminTab>(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("admin-active-tab") as AdminTab | null;
      if (saved && validTabs.includes(saved)) return saved;
    }
    return "overview";
  });
  const setActiveTab = useCallback((tab: AdminTab) => {
    setActiveTabRaw(tab);
    try { sessionStorage.setItem("admin-active-tab", tab); } catch {}
  }, []);
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin");
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
        setAlerts(data.recentAlerts || []);
        if (data.unreadAlertCount !== undefined) setUnreadAlertCount(data.unreadAlertCount);
        if (data.unreadFraudCount !== undefined) setUnreadFraudAlertCount(data.unreadFraudCount);
      }
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
  }, []);

  const fetchAlerts = useCallback(async (append = false, beforeCursor?: string) => {
    setAlertsLoading(true);
    try {
      const params = new URLSearchParams();
      if (alertFilter !== "all") params.set("type", alertFilter);
      if (alertReadFilter !== "all") params.set("read", alertReadFilter);
      params.set("limit", "50");
      if (beforeCursor) params.set("before", beforeCursor);

      const res = await fetch(`/api/admin/alerts?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (append) {
          setAlertsData((prev) => [...prev, ...data.alerts]);
        } else {
          setAlertsData(data.alerts || []);
        }
        setAlertsTotalCount(data.totalCount);
        setAlertsUnreadCount(data.unreadCount);
        setAlertsFraudCount(data.fraudCount);
        setAlertsHasMore(data.hasMore);
      }
    } catch (err) {
      console.error("Failed to fetch alerts:", err);
    }
    setAlertsLoading(false);
  }, [alertFilter, alertReadFilter]);

  const markAlertRead = useCallback(async (ids: string[]) => {
    try {
      await fetch("/api/admin/alerts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      setAlertsData((prev) => prev.map((a) => ids.includes(a.id) ? { ...a, read: true } : a));
      setAlertsUnreadCount((prev) => Math.max(0, prev - ids.length));
      setUnreadAlertCount((prev) => Math.max(0, prev - ids.length));
    } catch {}
  }, []);

  const markAllAlertsRead = useCallback(async () => {
    try {
      await fetch("/api/admin/alerts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      setAlertsData((prev) => prev.map((a) => ({ ...a, read: true })));
      setAlertsUnreadCount(0);
      setUnreadAlertCount(0);
      setUnreadFraudAlertCount(0);
    } catch {}
  }, []);

  const dismissAlert = useCallback(async (ids: string[]) => {
    try {
      await fetch("/api/admin/alerts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      setAlertsData((prev) => prev.filter((a) => !ids.includes(a.id)));
      setAlertsTotalCount((prev) => Math.max(0, prev - ids.length));
    } catch {}
  }, []);

  const clearAllAlerts = useCallback(async () => {
    try {
      await fetch("/api/admin/alerts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      setAlertsData([]);
      setAlertsTotalCount(0);
      setAlertsUnreadCount(0);
      setAlertsFraudCount(0);
      setUnreadAlertCount(0);
      setUnreadFraudAlertCount(0);
      setClearAllConfirm(false);
    } catch {}
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users?limit=100");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (err) {
      console.error("Failed to fetch users:", err);
    }
  }, []);

  const changeUserRole = useCallback(async (userId: string, role: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role: role as AdminUser["role"] } : u))
        );
      }
    } catch (err) {
      console.error("Failed to change role:", err);
    }
  }, []);

  const fetchClaudeSession = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (bridgeSelectedProjectDir) params.set("projectDir", bridgeSelectedProjectDir);
      const res = await fetch(`/api/admin/claude-session${params.toString() ? `?${params}` : ""}`);
      if (res.ok) {
        const data = await res.json();
        if (data.messages) setClaudeMessages(data.messages);
        if (data.sessionFile) setClaudeSessionFile(data.sessionFile);
        if (data.totalLines) setClaudeTotalLines(data.totalLines);
      }
    } catch {
      // Silently fail - session might not be active
    }
  }, [bridgeSelectedProjectDir]);

  const fetchBugs = useCallback(async () => {
    try {
      const res = await fetch("/api/bugs");
      if (res.ok) {
        const data = await res.json();
        if (data.bugs) setBugReports(data.bugs);
      }
    } catch {}
  }, []);

  // Bridge functions
  const fetchBridgeWindows = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/bridge/windows");
      if (!res.ok) {
        if (res.status === 502) setBridgeStatus("offline");
        return;
      }
      const data = await res.json();
      setBridgeWindows(data);
      // Fetch thumbnails for all windows
      if (data.length > 0) {
        const thumbRes = await fetch("/api/admin/bridge/thumbnails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hwnds: data.map((w: BridgeWindow) => w.hwnd) }),
        });
        if (thumbRes.ok) {
          const thumbData = await thumbRes.json();
          if (thumbData.thumbnails) {
            setBridgeThumbnails((prev) => ({ ...prev, ...thumbData.thumbnails }));
          }
        }
      }
    } catch {
      setBridgeStatus("offline");
    }
  }, []);

  const fetchBridgeLog = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/bridge/log");
      if (!res.ok) {
        if (res.status === 502) setBridgeStatus("offline");
        return;
      }
      const data = await res.json();
      setBridgeLog(data.log || []);
      if (data.selectedHwnd) {
        setBridgeSelectedHwnd(data.selectedHwnd);
        setBridgeSelectedLabel(data.selectedLabel || data.selectedTitle || "");
        if (data.selectedProjectDir) setBridgeSelectedProjectDir(data.selectedProjectDir);
        setBridgeStatus(data.status === "error" ? "error" : "active");
      } else {
        if (bridgeStatus !== "offline") setBridgeStatus("waiting");
        setBridgeSelectedHwnd(null);
      }
    } catch {
      setBridgeStatus("offline");
    }
  }, [bridgeStatus]);

  const bridgeSelectWindow = async (w: BridgeWindow) => {
    try {
      const res = await fetch("/api/admin/bridge/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hwnd: w.hwnd, pid: w.pid, title: w.title, label: w.label, projectDir: w.projectDir }),
      });
      if (res.ok) {
        setBridgeSelectedHwnd(w.hwnd);
        setBridgeSelectedLabel(w.label);
        setBridgeSelectedProjectDir(w.projectDir || "");
        setBridgeStatus("active");
        // Clear old session data and refresh for the new target
        setClaudeMessages([]);
        setClaudeSessionFile("");
        setClaudeTotalLines(0);
      }
    } catch {}
  };

  const bridgeDisconnect = async () => {
    try {
      await fetch("/api/admin/bridge/disconnect", { method: "POST" });
      setBridgeSelectedHwnd(null);
      setBridgeSelectedLabel("");
      setBridgeSelectedProjectDir("");
      setBridgeStatus("waiting");
    } catch {}
  };

  const bridgeSendMessage = async () => {
    const text = bridgeSendText.trim();
    if (!text || bridgeSending) return;
    setBridgeSending(true);
    setBridgeSendResult(null);
    try {
      const res = await fetch("/api/admin/bridge/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data.ok) {
        setBridgeSendResult({ ok: true, message: "Sent!" });
        setBridgeSendText("");
        fetchBridgeLog();
      } else {
        setBridgeSendResult({ ok: false, message: data.error || data.status || "Failed" });
      }
    } catch {
      setBridgeSendResult({ ok: false, message: "Network error" });
    }
    setBridgeSending(false);
    setTimeout(() => setBridgeSendResult(null), 4000);
  };

  const fetchDeviceInfo = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/device");
      if (res.ok) {
        const data = await res.json();
        setDeviceInfo(data);
        // Only block if the server explicitly says not allowed
        // isAllowed=true means either allowed or no allowlist configured
        if (data.isAllowed === false) {
          setDeviceBlocked(true);
        } else {
          setDeviceBlocked(false);
        }
      }
    } catch {
      // If the API call fails, don't block — fail open so you're not locked out
    }
    setDeviceChecked(true);
  }, []);

  const [deviceCopied, setDeviceCopied] = useState(false);

  const registerDevice = async () => {
    setDeviceRegistering(true);
    try {
      const res = await fetch("/api/admin/device", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setDeviceRequestId(data.requestId);
        setDeviceRequestStatus("pending");
      }
    } catch {}
    setDeviceRegistering(false);
  };

  // Poll for device request approval
  useEffect(() => {
    if (!deviceRequestId || deviceRequestStatus !== "pending") return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/admin/device?requestId=${deviceRequestId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === "approved") {
            setDeviceRequestStatus("approved");
            setDeviceNewToken(data.token);
            try {
              await navigator.clipboard.writeText(data.token);
              setDeviceCopied(true);
              setTimeout(() => setDeviceCopied(false), 5000);
            } catch {}
            fetchDeviceInfo();
          } else if (data.status === "denied") {
            setDeviceRequestStatus("denied");
          }
        }
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [deviceRequestId, deviceRequestStatus, fetchDeviceInfo]);

  const [launchDir, setLaunchDir] = useState("C:\\Users\\Richard\\Desktop\\Rally Live");
  const [showLaunchInput, setShowLaunchInput] = useState(false);

  const launchClaude = async (workDir?: string) => {
    try {
      await fetch("/api/admin/bridge/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "launch", workDir: workDir || launchDir }),
      });
      // Wait a moment then refresh windows
      setTimeout(fetchBridgeWindows, 3000);
    } catch {}
  };

  const killClaudeProcess = async (pid: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Don't trigger card select
    try {
      await fetch("/api/admin/bridge/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "kill", pid }),
      });
      setTimeout(fetchBridgeWindows, 1000);
    } catch {}
  };

  const handleDeviceApproval = async (requestId: string, action: "approve" | "deny") => {
    try {
      await fetch("/api/admin/device/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      });
      fetchDeviceInfo();
    } catch {}
  };

  const updateBugStatus = async (bugId: string, status: string) => {
    setAcceptingBugId(bugId);
    try {
      const res = await fetch(`/api/bugs/${bugId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        fetchBugs();
        if (status === "INVESTIGATING" || status === "FIXING" || status === "TESTING") {
          setClaudeCopiedToast(true);
          setTimeout(() => setClaudeCopiedToast(false), 3000);
        }
      }
    } catch {}
    setAcceptingBugId(null);
  };

  const [bugNoteInputId, setBugNoteInputId] = useState<string | null>(null);
  const [bugNoteText, setBugNoteText] = useState("");
  const [savingBugNote, setSavingBugNote] = useState(false);

  const addBugNote = async (bugId: string) => {
    if (!bugNoteText.trim()) return;
    setSavingBugNote(true);
    try {
      const bug = bugReports.find((b) => b.id === bugId);
      const existing = bug?.adminNotes || "";
      const timestamp = new Date().toLocaleString();
      const newNotes = existing
        ? `${existing}\n\n[${timestamp}] ${bugNoteText.trim()}`
        : `[${timestamp}] ${bugNoteText.trim()}`;

      const res = await fetch(`/api/bugs/${bugId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ adminNotes: newNotes }),
      });
      if (res.ok) {
        setBugNoteText("");
        setBugNoteInputId(null);
        fetchBugs();
      }
    } catch {}
    setSavingBugNote(false);
  };

  const sendQuestionAnswer = async (msgId: string, questions: ClaudeQuestion[]) => {
    setSendingQuestionAnswer(true);
    try {
      // Build answer text from selections
      const answerParts: string[] = [];
      for (let qi = 0; qi < questions.length; qi++) {
        const selected = questionSelections[qi];
        if (!selected || selected.size === 0) continue;
        const labels = Array.from(selected);
        if (questions.length > 1) {
          answerParts.push(`${questions[qi].header || `Q${qi + 1}`}: ${labels.join(", ")}`);
        } else {
          answerParts.push(labels.join(", "));
        }
      }

      const answerText = answerParts.join(" | ") || "Other";

      await fetch("/api/admin/claude-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          message: answerText,
          projectDir: bridgeSelectedProjectDir,
          viaBridge: !!bridgeSelectedHwnd,
        }),
      });

      setAnsweredQuestionIds((prev) => new Set([...prev, msgId]));
      setQuestionSelections({});
      fetchClaudeSession();
      setClaudeCopiedToast(true);
      setTimeout(() => setClaudeCopiedToast(false), 5000);
    } catch {}
    setSendingQuestionAnswer(false);
  };

  // Parse Claude session messages for bug report responses — matches on [BUG-RESPONSE:id]
  const parseBugResponses = useCallback(async (messages: ClaudeMessage[]) => {
    // Find bugs that are waiting for Claude responses
    const waitingBugs = bugReports.filter(
      (b) => b.status === "INVESTIGATING" || b.status === "FIXING" || b.status === "TESTING"
    );
    if (waitingBugs.length === 0) return;

    // Build a lookup map of waiting bug IDs for fast matching
    const waitingById = new Map(waitingBugs.map((b) => [b.id, b]));

    for (const msg of messages) {
      if (msg.role !== "assistant" || !msg.content) continue;
      const cacheKey = msg.id;
      if (processedBugResponses.current.has(cacheKey)) continue;

      const content = msg.content;

      // Look for [BUG-RESPONSE:uuid] tag in the response
      const tagMatch = content.match(/\[BUG-RESPONSE:([a-f0-9-]+)\]/);
      if (!tagMatch) continue;

      const bugId = tagMatch[1];
      const bug = waitingById.get(bugId);
      if (!bug) continue;

      // Determine response type based on bug status and content
      let type: string | null = null;
      let responseContent = "";

      if (bug.status === "INVESTIGATING" && (content.includes("CATEGORY:") || content.includes("DIAGNOSIS:") || content.includes("Root Cause"))) {
        type = "diagnosis";
        // Support both new CATEGORY: format and legacy DIAGNOSIS: / Root Cause formats
        const match = content.match(/CATEGORY:\s*([\s\S]*?)$/) || content.match(/DIAGNOSIS:\s*([\s\S]*?)$/) || content.match(/Root Cause[\s\S]*$/);
        responseContent = match ? match[0] : content;
      } else if (bug.status === "FIXING" && content.includes("FIX APPLIED:")) {
        type = "fix";
        const match = content.match(/FIX APPLIED:\s*([\s\S]*?)$/);
        responseContent = match ? match[0] : content;
      } else if (bug.status === "TESTING" && content.includes("VERIFICATION:")) {
        type = "verification";
        const match = content.match(/VERIFICATION:\s*([\s\S]*?)$/);
        responseContent = match ? match[0] : content;
      }

      if (!type) continue;

      processedBugResponses.current.add(cacheKey);
      try {
        await fetch(`/api/bugs/${bugId}/claude-response`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ type, content: responseContent }),
        });
        fetchBugs();
      } catch {}
    }
  }, [bugReports, fetchBugs]);

  // Poll Claude session every 2 seconds
  useEffect(() => {
    if (!isLoggedIn || !currentUser?.isOwner) return;
    fetchClaudeSession();
    const interval = setInterval(fetchClaudeSession, 2000);
    return () => clearInterval(interval);
  }, [isLoggedIn, currentUser?.isOwner, fetchClaudeSession]);

  // Parse Claude responses for bug report pipeline
  useEffect(() => {
    if (claudeMessages.length > 0) {
      parseBugResponses(claudeMessages);
    }
  }, [claudeMessages, parseBugResponses]);

  // Auto-read new assistant messages
  useEffect(() => {
    if (!ttsAutoRead || claudeMessages.length === 0) return;
    const lastMsg = claudeMessages[claudeMessages.length - 1];
    if (lastMsg.role === "assistant" && lastMsg.content && lastMsg.id !== ttsAutoReadLastIdRef.current) {
      ttsAutoReadLastIdRef.current = lastMsg.id;
      // Small delay to let UI settle
      setTimeout(() => ttsSpeak(lastMsg.id, lastMsg.content), 300);
    }
  }, [claudeMessages, ttsAutoRead, ttsSpeak]);

  // Track the previous message count to detect genuinely new messages
  const prevMsgCountRef = useRef(0);

  // Auto-scroll Claude session view — only when user hasn't scrolled up AND new messages arrived
  useEffect(() => {
    const newCount = claudeMessages.length;
    const hadNewMessages = newCount > prevMsgCountRef.current;
    prevMsgCountRef.current = newCount;

    // Only auto-scroll if there are actually new messages AND user is at bottom
    if (hadNewMessages && claudeAutoScrollRef.current && claudeEndRef.current) {
      claudeScrollingRef.current = true;
      claudeEndRef.current.scrollIntoView({ behavior: "instant" });
      // Allow onScroll events from this programmatic scroll to settle — longer on mobile
      setTimeout(() => { claudeScrollingRef.current = false; }, 300);
    }
  }, [claudeMessages]);

  // Detect if user scrolled away from bottom — ignore programmatic scrolls
  const handleClaudeScroll = useCallback(() => {
    if (claudeScrollingRef.current) return;
    const el = claudeScrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    claudeAutoScrollRef.current = atBottom;
    setShowJumpButton(!atBottom);
  }, []);

  // User manually touched / started scrolling — immediately disable auto-scroll
  const handleClaudeTouchStart = useCallback(() => {
    claudeAutoScrollRef.current = false;
    setShowJumpButton(true);
  }, []);

  const scrollToBottom = useCallback(() => {
    if (claudeEndRef.current) {
      claudeScrollingRef.current = true;
      claudeEndRef.current.scrollIntoView({ behavior: "smooth" });
      claudeAutoScrollRef.current = true;
      setShowJumpButton(false);
      setTimeout(() => { claudeScrollingRef.current = false; }, 500);
    }
  }, []);

  useEffect(() => {
    if (!isLoading && (!isLoggedIn || !currentUser?.isOwner)) {
      router.push("/home");
      return;
    }
    if (isLoggedIn && currentUser?.isOwner) {
      fetchStats();
      fetchUsers();
      fetchBugs();
    }
  }, [isLoading, isLoggedIn, currentUser, router, fetchStats, fetchUsers, fetchBugs]);

  // Auto-refresh stats, users, and alerts every 2 seconds
  useEffect(() => {
    if (!isLoggedIn || !currentUser?.isOwner) return;
    const interval = setInterval(() => {
      fetchStats();
      fetchUsers();
      fetchBugs();
    }, 5000);
    return () => clearInterval(interval);
  }, [isLoggedIn, currentUser?.isOwner, fetchStats, fetchUsers, fetchBugs]);

  // Bridge polling — full polling on bridge tab, log-only on session tab (for bridge indicator)
  useEffect(() => {
    if (!isLoggedIn || !currentUser?.isOwner) return;
    if (activeTab === "bridge") {
      fetchBridgeWindows();
      fetchBridgeLog();
      fetchDeviceInfo();
      const windowsInterval = setInterval(fetchBridgeWindows, 15000);
      const logInterval = setInterval(fetchBridgeLog, 3000);
      const deviceInterval = setInterval(fetchDeviceInfo, 5000);
      return () => { clearInterval(windowsInterval); clearInterval(logInterval); clearInterval(deviceInterval); };
    }
    if (activeTab === "session") {
      fetchBridgeLog(); // Check bridge status once on tab switch
      const logInterval = setInterval(fetchBridgeLog, 5000);
      return () => clearInterval(logInterval);
    }
  }, [isLoggedIn, currentUser?.isOwner, activeTab, fetchBridgeWindows, fetchBridgeLog]);

  // Fetch device info on mount
  useEffect(() => {
    if (isLoggedIn && currentUser?.isOwner) fetchDeviceInfo();
  }, [isLoggedIn, currentUser?.isOwner, fetchDeviceInfo]);

  // Fetch alerts when tab is active or filters change
  useEffect(() => {
    if (!isLoggedIn || !currentUser?.isOwner) return;
    if (activeTab === "alerts") {
      fetchAlerts();
      const interval = setInterval(() => fetchAlerts(), 10000);
      return () => clearInterval(interval);
    }
  }, [isLoggedIn, currentUser?.isOwner, activeTab, fetchAlerts]);

  // Fetch treasury data when tab is active
  const fetchTreasury = useCallback(async () => {
    setTreasuryLoading(true);
    try {
      const res = await fetch("/api/admin/treasury");
      if (res.ok) {
        const data: TreasuryData = await res.json();
        setTreasuryData(data);
        setTreasuryFeePct(data.feeConfig.withdrawalFeePct);
        setTreasuryFeeMin(data.feeConfig.withdrawalFeeMinCents);
        setTreasuryPurchaseFeePct(data.feeConfig.purchaseFeePct);
      }
    } catch (e) {
      console.error("Failed to fetch treasury data:", e);
    } finally {
      setTreasuryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn || !currentUser?.isOwner) return;
    if (activeTab === "treasury") {
      fetchTreasury();
    }
  }, [isLoggedIn, currentUser?.isOwner, activeTab, fetchTreasury]);

  const saveFeeConfig = useCallback(async () => {
    setTreasurySaving(true);
    try {
      const res = await fetch("/api/admin/treasury/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          withdrawalFeePct: treasuryFeePct,
          withdrawalFeeMinCents: treasuryFeeMin,
          purchaseFeePct: treasuryPurchaseFeePct,
        }),
      });
      if (res.ok) {
        fetchTreasury();
      }
    } catch (e) {
      console.error("Failed to save fee config:", e);
    } finally {
      setTreasurySaving(false);
    }
  }, [treasuryFeePct, treasuryFeeMin, treasuryPurchaseFeePct, fetchTreasury]);

  // Custom ads fetch
  const fetchCustomAds = useCallback(async () => {
    setCustomAdsLoading(true);
    try {
      const params = customAdFilter !== "all" ? `?status=${customAdFilter}` : "";
      const res = await fetch(`/api/ads/custom/admin${params}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCustomAds(data.ads || []);
        if (data.settings) {
          setCustomAdPrice(data.settings.customAdPriceCredits ?? 5000);
          setCustomAdCostPerImpression(data.settings.customAdCostPerImpression ?? 1);
          setCustomAdMinBalance(data.settings.customAdMinBalance ?? 100);
          setCustomAdMixPercent(data.settings.customAdMixPercent ?? 50);
        }
        if (data.stats) {
          setCustomAdStats(data.stats);
        }
      }
    } catch (e) {
      console.error("Failed to fetch custom ads:", e);
    } finally {
      setCustomAdsLoading(false);
    }
  }, [customAdFilter]);

  useEffect(() => {
    if (!isLoggedIn || !currentUser?.isOwner) return;
    if (activeTab === "ads") {
      fetchCustomAds();
    }
  }, [isLoggedIn, currentUser?.isOwner, activeTab, fetchCustomAds]);

  const handleAdAction = useCallback(async (adId: string, action: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/ads/custom/${adId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(action),
      });
      if (res.ok) {
        fetchCustomAds();
      }
    } catch (e) {
      console.error("Failed to update ad:", e);
    }
  }, [fetchCustomAds]);

  const handleDeleteAd = useCallback(async (adId: string) => {
    try {
      await fetch(`/api/ads/custom/${adId}`, { method: "DELETE", credentials: "include" });
      fetchCustomAds();
    } catch (e) {
      console.error("Failed to delete ad:", e);
    }
  }, [fetchCustomAds]);

  const saveAdSettings = useCallback(async () => {
    setCustomAdPriceSaving(true);
    try {
      const res = await fetch("/api/ads/custom/admin", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          customAdPriceCredits: customAdPrice,
          customAdCostPerImpression: customAdCostPerImpression,
          customAdMinBalance: customAdMinBalance,
          customAdMixPercent: customAdMixPercent,
        }),
      });
      if (res.ok) {
        fetchCustomAds();
      }
    } catch (e) {
      console.error("Failed to save ad settings:", e);
    } finally {
      setCustomAdPriceSaving(false);
    }
  }, [customAdPrice, customAdCostPerImpression, customAdMinBalance, customAdMixPercent, fetchCustomAds]);

  // Ad payouts fetch
  const fetchAdPayouts = useCallback(async () => {
    setAdPayoutsLoading(true);
    try {
      const res = await fetch("/api/ads/custom/payouts", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setAdPayouts(data.pendingPayouts || []);
        setAdPayoutHistory(data.recentPayouts || []);
        setAdPayoutDay(data.adPayoutDay ?? 0);
      }
    } catch (e) {
      console.error("Failed to fetch ad payouts:", e);
    } finally {
      setAdPayoutsLoading(false);
    }
  }, []);

  const payCreator = useCallback(async (creatorId: string) => {
    setPayingCreatorId(creatorId);
    try {
      const res = await fetch("/api/ads/custom/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ creatorId }),
      });
      if (res.ok) {
        fetchAdPayouts();
      }
    } catch (e) {
      console.error("Failed to pay creator:", e);
    } finally {
      setPayingCreatorId(null);
    }
  }, [fetchAdPayouts]);

  const payAllCreators = useCallback(async () => {
    for (const payout of adPayouts) {
      if (payout.totalCredits > 0) {
        await payCreator(payout.creator.id);
      }
    }
  }, [adPayouts, payCreator]);

  const saveAdPayoutDay = useCallback(async () => {
    setAdPayoutDaySaving(true);
    try {
      await fetch("/api/ads/custom/payouts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ adPayoutDay }),
      });
    } catch (e) {
      console.error("Failed to save payout day:", e);
    } finally {
      setAdPayoutDaySaving(false);
    }
  }, [adPayoutDay]);

  // Fetch payouts when switching to ads tab
  useEffect(() => {
    if (!isLoggedIn || !currentUser?.isOwner) return;
    if (activeTab === "ads") {
      fetchAdPayouts();
    }
  }, [isLoggedIn, currentUser?.isOwner, activeTab, fetchAdPayouts]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!currentUser?.isOwner) {
    return null;
  }

  // Device security gate — block entire admin if device not allowed
  if (deviceBlocked) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="max-w-sm text-center space-y-5 p-8">
          {/* Big shield icon */}
          <div className="flex justify-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20">
              <Shield size={40} className="text-red-500" />
            </div>
          </div>

          <h2 className="text-xl font-bold text-white">Access Restricted</h2>

          <div className="space-y-2 text-sm text-gray-400">
            <p>This area is protected by enterprise-grade device authentication.</p>
            <p className="text-xs text-gray-600">
              Only pre-authorized devices can access admin controls. All access attempts are logged and monitored.
            </p>
          </div>

          <div className="rounded-xl border border-[#222] bg-[#0a0a0a] px-4 py-3 text-left space-y-1">
            <div className="flex items-center gap-2 text-[10px] text-gray-600">
              <div className="h-1.5 w-1.5 rounded-full bg-red-500" />
              <span>Hardware fingerprint — not recognized</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-gray-600">
              <div className="h-1.5 w-1.5 rounded-full bg-red-500" />
              <span>Device trust level — unverified</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-gray-600">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
              <span>Account identity — owner confirmed</span>
            </div>
          </div>

          {/* Idle — show request button */}
          {deviceRequestStatus === "idle" && (
            <div className="space-y-2">
              <button
                onClick={registerDevice}
                disabled={deviceRegistering}
                className="w-full rounded-xl bg-purple-600 px-4 py-3 text-sm font-semibold text-white hover:bg-purple-500 transition-colors disabled:opacity-50"
              >
                {deviceRegistering ? "Submitting..." : "Request Device Authorization"}
              </button>
              <p className="text-[10px] text-gray-600">Requires approval from an authorized device</p>
            </div>
          )}

          {/* Waiting for approval */}
          {deviceRequestStatus === "pending" && (
            <div className="space-y-3">
              <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 px-4 py-4">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
                  <span className="text-sm text-purple-400 font-semibold">Awaiting Authorization</span>
                </div>
                <p className="text-xs text-gray-500">
                  Your request has been sent. An administrator must approve this device from an already-authorized device.
                </p>
              </div>
            </div>
          )}

          {/* Request denied */}
          {deviceRequestStatus === "denied" && (
            <div className="space-y-3">
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-4">
                <p className="text-sm text-red-400 font-semibold">Authorization Denied</p>
                <p className="text-xs text-gray-500 mt-1">Your request was rejected by the administrator.</p>
              </div>
              <button
                onClick={() => { setDeviceRequestStatus("idle"); setDeviceRequestId(null); }}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Request again
              </button>
            </div>
          )}

          {/* Approved — show token */}
          {deviceRequestStatus === "approved" && deviceNewToken && (
            <div className="space-y-2 text-left">
              <div className="rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <BadgeCheck size={16} className="text-green-400" />
                  <p className="text-sm text-green-400 font-semibold">
                    {deviceCopied ? "Copied to clipboard!" : "Device Authorized"}
                  </p>
                </div>
                <code className="block text-[10px] text-green-400 font-mono break-all bg-[#0a0a0a] rounded-lg border border-[#1a1a1a] p-2.5 select-all">{deviceNewToken}</code>
                <p className="text-[10px] text-gray-500 mt-2">Send this token to your admin to complete setup.</p>
                <button
                  onClick={async () => {
                    try { await navigator.clipboard.writeText(deviceNewToken); setDeviceCopied(true); setTimeout(() => setDeviceCopied(false), 3000); } catch {}
                  }}
                  className="mt-2 w-full rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2 text-xs font-semibold text-green-400 hover:bg-green-500/20 transition-colors"
                >
                  {deviceCopied ? "Copied!" : "Copy Token"}
                </button>
              </div>
            </div>
          )}

          <button
            onClick={() => router.push("/home")}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            Return Home
          </button>
        </div>
      </div>
    );
  }

  const openBugCount = bugReports.filter((b) => !["RESOLVED", "DISMISSED"].includes(b.status)).length;

  const tabs = [
    { id: "session" as const, label: "Claude Session", icon: Eye },
    { id: "bridge" as const, label: "Bridge", icon: Monitor },
    { id: "bugs" as const, label: "Bugs", icon: Bug, badge: openBugCount },
    { id: "overview" as const, label: "Overview", icon: Crown },
    { id: "users" as const, label: "Users", icon: Users },
    { id: "alerts" as const, label: "Alerts", icon: AlertTriangle, badge: unreadAlertCount },
    { id: "treasury" as const, label: "Treasury", icon: Vault },
    { id: "ads" as const, label: "Ads", icon: Megaphone },
  ];

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8 flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-yellow-500 to-amber-600">
          <Crown size={24} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-text">Admin Panel</h1>
          <p className="text-sm text-text-muted">Rally Live Platform Management</p>
        </div>
        <div className="ml-auto flex items-center gap-2 rounded-lg bg-yellow-500/10 px-3 py-1.5">
          <Shield size={14} className="text-yellow-500" />
          <span className="text-xs font-medium text-yellow-500">OWNER ACCESS</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl bg-bg-surface p-1 border border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? "bg-bg-surface2 text-text shadow-sm"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
            {"badge" in tab && (tab as any).badge > 0 && (
              <span className={`ml-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${
                tab.id === "alerts" && unreadFraudAlertCount > 0 ? "bg-red-600 animate-pulse" : "bg-red-500"
              }`}>
                {(tab as any).badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Claude Session Tab */}
      {activeTab === "session" && (
        <div className="rounded-xl border border-border bg-[#111114] overflow-hidden flex flex-col" style={{ maxHeight: sessionExpanded ? "90vh" : "65vh" }}>
          {/* Session header */}
          <div className="border-b border-[#2a2a30] bg-[#18181c] px-4 py-2 shrink-0 space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <span className="h-3 w-3 rounded-full bg-[#28c840]" />
                <span className="h-3 w-3 rounded-full bg-[#28c840]" />
                <span className="h-3 w-3 rounded-full bg-[#28c840]" />
              </div>
              <div className="flex-1 text-center">
                <span className="text-xs text-gray-300 font-mono">
                  {bridgeSelectedLabel
                    ? `Session — ${bridgeSelectedLabel}`
                    : `Session — ${claudeSessionFile || "searching..."}`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {bridgeSelectedHwnd ? (
                  <span className="flex items-center gap-1 text-[10px] text-green-400">
                    <Monitor size={10} />
                    BRIDGE
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] text-yellow-500">
                    <Monitor size={10} />
                    NO BRIDGE
                  </span>
                )}
                <span className="flex items-center gap-1 text-[10px] text-green-400">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
                  LIVE
                </span>
                <span className="text-[10px] text-gray-400">{claudeTotalLines} entries</span>
                <button
                  onClick={() => setSessionExpanded((p) => !p)}
                  className="rounded p-1 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                  title={sessionExpanded ? "Collapse panel" : "Expand panel"}
                >
                  {sessionExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
                <button
                  onClick={async () => {
                    try {
                      const params = new URLSearchParams();
                      if (bridgeSelectedProjectDir) params.set("projectDir", bridgeSelectedProjectDir);
                      await fetch(`/api/admin/claude-session${params.toString() ? `?${params}` : ""}`, { method: "DELETE", credentials: "include" });
                      setClaudeMessages([]);
                    } catch {}
                  }}
                  className="rounded px-2 py-0.5 text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                >
                  Clear
                </button>
                <button
                  onClick={() => { fetchClaudeSession(); fetchBridgeWindows(); }}
                  className="rounded px-2 py-0.5 text-[10px] text-purple-400 bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 transition-colors"
                >
                  Refresh
                </button>
              </div>
            </div>

            {/* Controls row: search, auto-read, speed */}
            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative flex-1 max-w-xs">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  value={claudeSearch}
                  onChange={(e) => setClaudeSearch(e.target.value)}
                  placeholder="Search messages..."
                  className="w-full bg-[#111114] border border-[#333] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-gray-500 font-mono focus:outline-none focus:border-purple-500/50"
                />
                {claudeSearch && (
                  <button onClick={() => setClaudeSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                    <XIcon size={12} />
                  </button>
                )}
              </div>

              {/* Auto-read toggle */}
              <button
                onClick={() => { setTtsAutoRead((p) => !p); if (ttsAutoRead) ttsStop(); }}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors border ${
                  ttsAutoRead
                    ? "text-green-300 bg-green-600/20 border-green-500/40 hover:bg-green-600/30"
                    : "text-gray-400 bg-white/5 border-white/10 hover:bg-white/10"
                }`}
                title="Automatically read new Claude messages aloud"
              >
                <Volume2 size={13} />
                Auto-Read {ttsAutoRead ? "ON" : "OFF"}
              </button>

              {/* TTS Speed */}
              <div className="flex items-center gap-1">
                <Gauge size={13} className="text-gray-500" />
                {[0.75, 1, 1.25, 1.5, 2].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => setTtsSpeed(speed)}
                    className={`rounded px-1.5 py-1 text-[10px] font-bold transition-colors ${
                      ttsSpeed === speed
                        ? "text-white bg-purple-600 border border-purple-500"
                        : "text-gray-400 bg-white/5 border border-white/10 hover:bg-white/10"
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>

              {/* Voice selector */}
              {ttsAvailableVoices.length > 0 && (
                <select
                  value={ttsVoiceName}
                  onChange={(e) => setTtsVoiceName(e.target.value)}
                  className="bg-white text-black border border-gray-300 rounded-lg px-2 py-1.5 text-[11px] font-medium focus:outline-none focus:border-purple-500 max-w-[200px] cursor-pointer"
                  title="Select voice"
                  style={{ colorScheme: "light" }}
                >
                  {/* Natural/premium voices first */}
                  {ttsAvailableVoices
                    .filter((v) => v.lang.startsWith("en") && /natural|online|neural/i.test(v.name))
                    .map((v) => (
                      <option key={v.name} value={v.name}>
                        ★ {v.name.replace(/Microsoft\s*/i, "").replace(/\s*-\s*English.*$/i, "").replace(/\s*Online.*$/i, "")}
                      </option>
                    ))}
                  {/* Standard English voices */}
                  {ttsAvailableVoices
                    .filter((v) => v.lang.startsWith("en") && !/natural|online|neural/i.test(v.name))
                    .map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name.replace(/Microsoft\s*/i, "").replace(/\s*-\s*English.*$/i, "")}
                      </option>
                    ))}
                </select>
              )}
            </div>
          </div>

          {/* Messages */}
          <div ref={claudeScrollRef} onScroll={handleClaudeScroll} onTouchStart={handleClaudeTouchStart} className="relative overflow-y-auto p-4 space-y-3 font-mono text-sm flex-1 overscroll-contain" style={{ minHeight: "200px" }}>
            {claudeMessages.length === 0 && (
              <div className="text-center text-gray-400 py-8">
                {bridgeSelectedHwnd ? (
                  <>
                    <Monitor size={32} className="mx-auto mb-2 text-gray-500" />
                    <p className="text-gray-300">Connected to: <span className="text-purple-400 font-semibold">{bridgeSelectedLabel}</span></p>
                    <p className="text-xs mt-1 text-gray-400">
                      {bridgeSelectedProjectDir
                        ? "No Claude session file found for this project"
                        : "This window doesn't have an associated Claude session"}
                    </p>
                  </>
                ) : (
                  <>
                    <Bot size={32} className="mx-auto mb-2 text-gray-500" />
                    <p className="text-gray-300">No active Claude session found</p>
                    <p className="text-xs mt-1 text-gray-400">Select a terminal in the Bridge tab, or start Claude Code in a project directory</p>
                  </>
                )}
              </div>
            )}

            {(() => {
              const searchLower = claudeSearch.toLowerCase();
              const filtered = claudeSearch
                ? claudeMessages.filter((m) =>
                    m.content?.toLowerCase().includes(searchLower) ||
                    m.thinking?.toLowerCase().includes(searchLower) ||
                    m.adminFrom?.toLowerCase().includes(searchLower)
                  )
                : claudeMessages;

              if (claudeSearch && filtered.length === 0) {
                return (
                  <div className="text-center text-gray-400 py-6">
                    <Search size={24} className="mx-auto mb-2 text-gray-500" />
                    <p className="text-sm">No messages matching &quot;{claudeSearch}&quot;</p>
                  </div>
                );
              }

              return filtered.map((msg, msgIdx) => {
              const isLastAssistant = msg.role === "assistant" && msgIdx === filtered.length - 1;
              const hasToolsRunning = isLastAssistant && msg.toolUses && msg.toolUses.length > 0 && !msg.content;
              const isDone = msg.role === "assistant" && msg.content && !hasToolsRunning;

              // Admin note styling
              if (msg.isAdminNote) {
                return (
                  <div key={msg.id} className="rounded-lg px-4 py-3 bg-amber-500/15 border border-amber-500/30">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Crown size={14} className="text-amber-400" />
                      <span className="text-xs font-bold text-amber-400">
                        {msg.adminFrom || "Admin"}
                      </span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider font-medium ${
                        msg.viaBridge
                          ? "bg-green-500/20 text-green-400"
                          : "bg-amber-500/20 text-amber-400"
                      }`}>
                        {msg.viaBridge ? "Bridge" : "Web"}
                      </span>
                      {msg.timestamp && (
                        <span className="text-[10px] text-gray-400 ml-auto" title={new Date(msg.timestamp).toLocaleString()}>
                          {relativeTime(msg.timestamp)}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-white whitespace-pre-wrap break-words">
                      {msg.content}
                    </div>
                    <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-amber-500/20">
                      <button
                        onClick={() => ttsPlayingId === msg.id ? ttsStop() : ttsSpeak(msg.id, msg.content)}
                        className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${ttsPlayingId === msg.id ? "text-white bg-red-600 hover:bg-red-500 border border-red-500" : "text-white bg-green-600 hover:bg-green-500 border border-green-500"}`}
                      >
                        {ttsPlayingId === msg.id ? <><VolumeX size={16} /> Stop Reading</> : <><Volume2 size={16} /> Read Aloud</>}
                      </button>
                      <button
                        onClick={() => copyMessage(msg.id, msg.content)}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-gray-300 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                      >
                        {copiedMsgId === msg.id ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div key={msg.id} className={`rounded-lg px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-blue-500/15 border border-blue-500/30"
                    : "bg-[#1c1c22] border border-[#2a2a32]"
                }`}>
                  {/* Message header */}
                  <div className="flex items-center gap-2 mb-1.5">
                    {msg.role === "user" ? (
                      <Crown size={14} className="text-yellow-400" />
                    ) : (
                      <Bot size={14} className="text-purple-400" />
                    )}
                    <span className={`text-xs font-bold ${
                      msg.role === "user" ? "text-yellow-400" : "text-purple-400"
                    }`}>
                      {msg.role === "user" ? "You" : "Claude"}
                    </span>

                    {/* Status indicator for assistant messages */}
                    {msg.role === "assistant" && (
                      <span className="flex items-center gap-1 ml-1">
                        {hasToolsRunning ? (
                          <span className="flex items-center gap-1 text-[10px] text-amber-400">
                            <span className="inline-block h-2 w-2 animate-spin rounded-full border border-amber-400 border-t-transparent" />
                            Working
                          </span>
                        ) : isDone ? (
                          <span className="flex items-center gap-1 text-[10px] text-green-400">
                            <BadgeCheck size={12} />
                            Done
                          </span>
                        ) : null}
                      </span>
                    )}

                    {msg.timestamp && (
                      <span className="text-[10px] text-gray-400 ml-auto" title={new Date(msg.timestamp).toLocaleString()}>
                        {relativeTime(msg.timestamp)}
                      </span>
                    )}
                  </div>

                  {/* Thinking (collapsible) */}
                  {msg.thinking && (
                    <div className="mb-2 rounded bg-purple-500/10 border border-purple-500/20 overflow-hidden">
                      <button
                        onClick={() => toggleThinking(msg.id)}
                        className="flex items-center gap-1.5 w-full px-3 py-1.5 hover:bg-purple-500/10 transition-colors"
                      >
                        <Brain size={12} className="text-purple-400/80" />
                        <span className="text-[10px] text-purple-400/80 uppercase tracking-wider">Thinking</span>
                        <ChevronDown size={12} className={`text-purple-400/60 ml-auto transition-transform ${collapsedThinking.has(msg.id) ? "" : "rotate-180"}`} />
                      </button>
                      {!collapsedThinking.has(msg.id) && (
                        <p className="text-xs text-gray-300 whitespace-pre-wrap px-3 pb-2">{msg.thinking}</p>
                      )}
                    </div>
                  )}

                  {/* Content */}
                  {msg.content && (
                    <div className={`text-sm whitespace-pre-wrap break-words ${
                      msg.role === "user" ? "text-white" : "text-gray-100"
                    }`}>
                      {msg.content}
                    </div>
                  )}

                  {/* Tool uses */}
                  {msg.toolUses && msg.toolUses.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {msg.toolUses.map((tool, i) => (
                        <span key={i} className="inline-flex items-center gap-1 rounded bg-[#22222a] px-2 py-0.5 text-[10px] text-cyan-300 border border-cyan-500/20">
                          <Wrench size={10} />
                          {tool.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Pending Questions Card */}
                  {msg.pendingQuestions && msg.pendingQuestions.length > 0 && !answeredQuestionIds.has(msg.id) && (
                    <div className="mt-3 rounded-xl bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/30 p-4 space-y-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                        <span className="text-xs font-bold text-purple-300 uppercase tracking-wider">Claude is asking a question</span>
                      </div>
                      {msg.pendingQuestions.map((q, qi) => (
                        <div key={qi} className="space-y-2">
                          {q.header && (
                            <span className="inline-block px-2 py-0.5 text-[10px] font-bold text-purple-300 bg-purple-500/20 rounded">{q.header}</span>
                          )}
                          <p className="text-sm text-white font-medium">{q.question}</p>
                          <div className="flex flex-wrap gap-2">
                            {q.options.map((opt, oi) => {
                              const isSelected = questionSelections[qi]?.has(opt.label);
                              return (
                                <button
                                  key={oi}
                                  onClick={() => {
                                    setQuestionSelections((prev) => {
                                      const updated = { ...prev };
                                      if (q.multiSelect) {
                                        const set = new Set(prev[qi] || []);
                                        if (set.has(opt.label)) set.delete(opt.label);
                                        else set.add(opt.label);
                                        updated[qi] = set;
                                      } else {
                                        updated[qi] = new Set([opt.label]);
                                      }
                                      return updated;
                                    });
                                  }}
                                  className={`flex flex-col items-start rounded-lg px-3 py-2 text-left transition-all border ${
                                    isSelected
                                      ? "bg-purple-500/25 border-purple-400 text-white shadow-[0_0_10px_rgba(168,85,247,0.2)]"
                                      : "bg-[#1a1a22] border-[#2a2a35] text-gray-300 hover:border-purple-500/40 hover:bg-purple-500/10"
                                  }`}
                                >
                                  <span className="text-xs font-semibold">{opt.label}</span>
                                  {opt.description && (
                                    <span className="text-[10px] text-gray-400 mt-0.5">{opt.description}</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center gap-2 pt-2 border-t border-purple-500/20">
                        <button
                          onClick={() => sendQuestionAnswer(msg.id, msg.pendingQuestions!)}
                          disabled={sendingQuestionAnswer || Object.values(questionSelections).every((s) => !s || s.size === 0)}
                          className="flex items-center gap-1.5 rounded-lg bg-purple-500/20 border border-purple-500/30 px-4 py-2 text-xs font-bold text-purple-300 hover:bg-purple-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {sendingQuestionAnswer ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                          Send Answer
                        </button>
                        <span className="text-[10px] text-gray-500">
                          {bridgeSelectedHwnd ? "Will be typed into terminal" : "Will be sent as web message"}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Play / Stop TTS + Copy buttons */}
                  {msg.content && (
                    <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-white/10">
                      <button
                        onClick={() => ttsPlayingId === msg.id ? ttsStop() : ttsSpeak(msg.id, msg.content)}
                        className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                          ttsPlayingId === msg.id
                            ? "text-white bg-red-600 hover:bg-red-500 border border-red-500"
                            : "text-white bg-green-600 hover:bg-green-500 border border-green-500"
                        }`}
                      >
                        {ttsPlayingId === msg.id ? <><VolumeX size={16} /> Stop Reading</> : <><Volume2 size={16} /> Read Aloud</>}
                      </button>
                      <button
                        onClick={() => copyMessage(msg.id, msg.content)}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-gray-300 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                      >
                        {copiedMsgId === msg.id ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
                      </button>
                    </div>
                  )}
                </div>
              );
            });
            })()}

            <div ref={claudeEndRef} />

            {/* Jump to bottom button */}
            {showJumpButton && (
              <button
                onClick={scrollToBottom}
                className="sticky bottom-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 rounded-full bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-lg hover:bg-purple-500 transition-colors"
              >
                <ChevronRight size={14} className="rotate-90" />
                Jump to latest
              </button>
            )}
          </div>

          {/* Message input */}
          <div className="border-t border-[#2a2a30] bg-[#18181c] px-4 py-3 shrink-0">
            {/* Sent toast */}
            {/* Bridge connection indicator */}
            {bridgeSelectedHwnd && (
              <div className="mb-2 flex items-center gap-2 rounded-lg bg-green-500/5 border border-green-500/20 px-3 py-2">
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse shrink-0" />
                <span className="text-xs text-green-400 font-medium">
                  Bridge: {bridgeSelectedLabel}
                </span>
                <span className="text-[10px] text-gray-400">Messages will be typed into this terminal</span>
              </div>
            )}
            {!bridgeSelectedHwnd && (
              <div className="mb-2 flex items-center gap-2 rounded-lg bg-yellow-500/5 border border-yellow-500/20 px-3 py-2">
                <div className="h-2 w-2 rounded-full bg-yellow-500 shrink-0" />
                <span className="text-xs text-yellow-400 font-medium">No bridge target</span>
                <button onClick={() => setActiveTab("bridge")} className="text-[10px] text-purple-300 hover:text-purple-200 ml-auto">
                  Connect in Bridge tab
                </button>
              </div>
            )}
            {claudeCopiedToast && (
              <div className="mb-2 flex items-center gap-2 rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2 animate-[fadeIn_200ms_ease-out]">
                <BadgeCheck size={14} className="text-green-400 shrink-0" />
                <span className="text-xs text-green-400 font-medium">
                  {bridgeSelectedHwnd ? "Message sent via Bridge!" : "Message sent to Claude!"}
                </span>
              </div>
            )}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const text = claudeNoteInput.trim();
                if (!text || isSendingNote) return;
                setIsSendingNote(true);
                try {
                  // Save note + write to message queue (bridge poll loop will type it)
                  await fetch("/api/admin/claude-session", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ message: text, projectDir: bridgeSelectedProjectDir, viaBridge: !!bridgeSelectedHwnd }),
                  });

                  setClaudeNoteInput("");
                  fetchClaudeSession();

                  setClaudeCopiedToast(true);
                  setTimeout(() => setClaudeCopiedToast(false), 5000);
                } catch {
                  // Network error — don't show success toast
                }
                setIsSendingNote(false);
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={claudeNoteInput}
                onChange={(e) => setClaudeNoteInput(e.target.value)}
                placeholder={bridgeSelectedHwnd ? "Type a message (will be typed into terminal)..." : "Type a message for Claude..."}
                className="flex-1 bg-[#111114] border border-[#333] rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 font-mono focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20"
              />
              <button
                type="submit"
                disabled={!claudeNoteInput.trim() || isSendingNote}
                className="flex items-center justify-center w-9 h-9 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Copy and send"
              >
                <Send size={16} />
              </button>
            </form>
            <p className="text-[10px] text-gray-400 mt-1.5">
              {bridgeSelectedHwnd
                ? "Messages are typed into the connected terminal via Bridge and logged in the session view."
                : "Connect a terminal in the Bridge tab to enable direct input. Messages are saved to session log."}
            </p>
          </div>
        </div>
      )}

      {/* Bridge Tab */}
      {activeTab === "bridge" && (
        <div className="space-y-4">
          {/* Status bar */}
          <div className={`flex items-center gap-3 rounded-xl border px-5 py-4 ${
            bridgeStatus === "active" ? "bg-green-500/5 border-green-500/20" :
            bridgeStatus === "error" ? "bg-red-500/5 border-red-500/20" :
            bridgeStatus === "offline" ? "bg-gray-500/5 border-gray-500/20" :
            "bg-yellow-500/5 border-yellow-500/20"
          }`}>
            <div className={`h-3 w-3 rounded-full shrink-0 ${
              bridgeStatus === "active" ? "bg-green-500 animate-pulse" :
              bridgeStatus === "error" ? "bg-red-500" :
              bridgeStatus === "offline" ? "bg-gray-500" :
              "bg-yellow-500"
            }`} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white">
                {bridgeStatus === "active" ? `Connected: ${bridgeSelectedLabel}` :
                 bridgeStatus === "error" ? "Connection Error" :
                 bridgeStatus === "offline" ? "Bridge Offline" :
                 "No target selected"}
              </div>
              <div className="text-xs text-gray-500">
                {bridgeStatus === "active" ? `HWND: ${bridgeSelectedHwnd}` :
                 bridgeStatus === "offline" ? "Bridge process not running on port 9876" :
                 "Select a Claude Code terminal below"}
              </div>
            </div>
            {bridgeSelectedHwnd && (
              <button onClick={bridgeDisconnect} className="flex items-center gap-1.5 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors">
                <Unplug size={12} />
                Disconnect
              </button>
            )}
          </div>

          {/* Device security info */}
          <div className="flex items-center gap-3 rounded-xl border border-border bg-[#111] px-5 py-3">
            <Fingerprint size={16} className="text-gray-500 shrink-0" />
            <div className="flex-1 min-w-0 text-xs text-gray-500">
              {deviceInfo ? (
                deviceInfo.hasToken ? (
                  <span>Device: <span className="text-gray-400 font-mono">{deviceInfo.tokenPreview}</span> — {deviceInfo.isAllowed ? <span className="text-green-400">Allowed</span> : <span className="text-red-400">Not in allowlist</span>}</span>
                ) : (
                  <span>No device token registered</span>
                )
              ) : (
                <span>Loading device info...</span>
              )}
            </div>
          </div>

          {/* Pending device requests — only visible on authorized devices */}
          {deviceInfo?.pendingRequests && deviceInfo.pendingRequests.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-5 py-4">
              <div className="flex items-center gap-2 mb-3">
                <Smartphone size={14} className="text-amber-400" />
                <span className="text-sm font-semibold text-amber-400">
                  Pending Device Requests ({deviceInfo.pendingRequests.length})
                </span>
              </div>
              <div className="space-y-2">
                {deviceInfo.pendingRequests.map((req: any) => {
                  // Parse user agent for a friendly device name
                  const ua = req.userAgent || "Unknown device";
                  const isAndroid = ua.includes("Android");
                  const isiPhone = ua.includes("iPhone");
                  const isWindows = ua.includes("Windows");
                  const isMac = ua.includes("Mac");
                  const deviceLabel = isAndroid ? "Android Phone" : isiPhone ? "iPhone" : isWindows ? "Windows PC" : isMac ? "Mac" : "Unknown Device";
                  const timeAgo = Math.round((Date.now() - new Date(req.timestamp).getTime()) / 60000);

                  return (
                    <div key={req.id} className="flex items-center gap-3 rounded-lg bg-[#0a0a0a] border border-[#222] px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white">{deviceLabel}</div>
                        <div className="text-[10px] text-gray-600 truncate">{ua.substring(0, 80)}</div>
                        <div className="text-[10px] text-gray-600">IP: {req.ip} &middot; {timeAgo < 1 ? "Just now" : `${timeAgo}m ago`}</div>
                      </div>
                      <button
                        onClick={() => handleDeviceApproval(req.id, "approve")}
                        className="flex items-center gap-1 rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-1.5 text-xs font-semibold text-green-400 hover:bg-green-500/20 transition-colors"
                      >
                        <Check size={12} />
                        Approve
                      </button>
                      <button
                        onClick={() => handleDeviceApproval(req.id, "deny")}
                        className="flex items-center gap-1 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition-colors"
                      >
                        <XIcon size={12} />
                        Deny
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Window grid */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold text-gray-300">Claude Code Terminals</span>
              <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold text-purple-400">{bridgeWindows.length}</span>
              <div className="ml-auto flex items-center gap-2">
                <button onClick={() => setShowLaunchInput(!showLaunchInput)} className="rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-500/20 transition-colors">
                  + Launch Claude
                </button>
                <button onClick={fetchBridgeWindows} className="rounded-lg bg-[#1a1a1a] border border-[#333] px-3 py-1.5 text-xs font-medium text-purple-400 hover:border-purple-500/30 transition-colors">
                  Refresh
                </button>
              </div>
            </div>
            {showLaunchInput && (
              <div className="flex items-center gap-2 mb-3 rounded-lg bg-[#0a0a0a] border border-[#222] p-3">
                <input
                  type="text"
                  value={launchDir}
                  onChange={(e) => setLaunchDir(e.target.value)}
                  placeholder="Working directory..."
                  className="flex-1 bg-transparent border border-[#333] rounded-lg px-3 py-1.5 text-xs text-gray-200 font-mono focus:outline-none focus:border-purple-500/50"
                />
                <button
                  onClick={() => { launchClaude(); setShowLaunchInput(false); }}
                  className="rounded-lg bg-green-500/10 border border-green-500/20 px-4 py-1.5 text-xs font-semibold text-green-400 hover:bg-green-500/20 transition-colors"
                >
                  Launch
                </button>
              </div>
            )}

            {bridgeWindows.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[#2a2a3a] bg-[#111] py-12 text-gray-500">
                <Monitor size={32} className="text-gray-700" />
                <p className="text-sm font-medium text-gray-400">
                  {bridgeStatus === "offline" ? "Bridge process not running" : "No Claude Code terminals detected"}
                </p>
                <p className="text-xs text-gray-600">
                  {bridgeStatus === "offline"
                    ? "Start the bridge with: node claude-bridge/claude-bridge.js"
                    : "Start a Claude Code session in a terminal, then click Refresh"}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {bridgeWindows.map((w) => {
                  const isSelected = w.hwnd === bridgeSelectedHwnd;
                  const thumb = bridgeThumbnails[w.hwnd];
                  return (
                    <div
                      key={w.hwnd}
                      onClick={() => bridgeSelectWindow(w)}
                      className={`group relative cursor-pointer rounded-xl border-2 overflow-hidden transition-all hover:-translate-y-0.5 ${
                        isSelected
                          ? "border-green-500 bg-green-500/5"
                          : "border-[#222] bg-[#111] hover:border-purple-500/50"
                      }`}
                    >
                      {/* Thumbnail */}
                      <div className="relative h-44 bg-[#080810] flex items-center justify-center overflow-hidden">
                        {thumb ? (
                          <img src={`data:image/png;base64,${thumb}`} alt={w.label} className="w-full h-full object-contain" />
                        ) : (
                          <div className="text-gray-600 text-xs flex flex-col items-center gap-2">
                            <Terminal size={24} className="text-gray-700" />
                            Loading preview...
                          </div>
                        )}
                        {/* Hover overlay */}
                        {!isSelected && (
                          <div className="absolute inset-0 bg-purple-500/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="rounded-lg bg-purple-600 px-5 py-2 text-sm font-bold text-white">Select</span>
                          </div>
                        )}
                        {/* Active badge */}
                        {isSelected && (
                          <div className="absolute top-2 right-2 rounded-full bg-green-500 px-3 py-1 text-[10px] font-bold text-green-950 uppercase tracking-wider">
                            Active
                          </div>
                        )}
                      </div>
                      {/* Info */}
                      <div className="px-4 py-3 flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-purple-400 truncate">{w.label}</div>
                          {w.projectDir && (
                            <div className="text-[10px] text-gray-600 font-mono truncate mt-0.5">{w.projectDir}</div>
                          )}
                          <div className="text-xs text-gray-500 truncate mt-0.5">{w.title}</div>
                          <div className="text-[10px] text-gray-600 font-mono mt-1">
                            HWND: {w.hwnd} &middot; PID: {w.pid || w.windowPid}
                            {w.procName && <span> &middot; {w.procName}</span>}
                          </div>
                        </div>
                        <button
                          onClick={(e) => killClaudeProcess(w.windowPid || w.pid, e)}
                          className="shrink-0 rounded-lg p-1.5 text-gray-600 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                          title="Kill process"
                        >
                          <XIcon size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Delivery log */}
          <div>
            <div className="text-sm font-semibold text-gray-300 mb-3">Delivery Log</div>
            <div className="rounded-xl border border-border bg-[#0d0d14] p-4 max-h-72 overflow-y-auto font-mono text-xs">
              {bridgeLog.length === 0 ? (
                <div className="text-center text-gray-600 py-6">No messages yet</div>
              ) : (
                bridgeLog.slice(-50).reverse().map((entry, i) => (
                  <div key={i} className="flex items-start gap-2 py-1.5 border-b border-[#1a1a1a] last:border-0">
                    <span className="text-gray-600 shrink-0">[{entry.time}]</span>
                    <span className="text-purple-400 shrink-0">{entry.from}:</span>
                    <span className="text-gray-400 truncate flex-1">
                      &ldquo;{entry.text.substring(0, 80)}{entry.text.length > 80 ? "..." : ""}&rdquo;
                    </span>
                    <span className={`shrink-0 font-semibold ${
                      entry.status === "ok" ? "text-green-400" :
                      entry.status === "dead" ? "text-red-400" :
                      "text-red-400"
                    }`}>
                      {entry.status === "ok" ? "Delivered" : entry.status === "dead" ? "Dead window" : "Failed"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bugs Tab */}
      {activeTab === "bugs" && (
        <div className="space-y-4">
          {/* Filter bar */}
          <div className="flex items-center gap-2 flex-wrap">
            {(["OPEN", "INVESTIGATING", "DIAGNOSED", "FIXING", "FIXED", "TESTING", "RESOLVED", "FAILED", "DISMISSED", "ALL"] as const).map((f) => {
              const count = f === "ALL" ? bugReports.length : bugReports.filter((b) => b.status === f).length;
              if (count === 0 && f !== "OPEN" && f !== "ALL") return null;
              const icons: Record<string, typeof Clock> = {
                OPEN: Clock, INVESTIGATING: Stethoscope, DIAGNOSED: Brain, FIXING: Wrench,
                FIXED: Check, TESTING: FlaskConical, RESOLVED: CircleCheck, FAILED: CircleX,
                DISMISSED: XIcon, ALL: Bug,
              };
              const Icon = icons[f] || Bug;
              const activeColors: Record<string, string> = {
                OPEN: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
                INVESTIGATING: "bg-blue-500/20 text-blue-400 border-blue-500/30",
                DIAGNOSED: "bg-purple-500/20 text-purple-400 border-purple-500/30",
                FIXING: "bg-amber-500/20 text-amber-400 border-amber-500/30",
                FIXED: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
                TESTING: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
                RESOLVED: "bg-green-500/20 text-green-400 border-green-500/30",
                FAILED: "bg-red-500/20 text-red-400 border-red-500/30",
                DISMISSED: "bg-gray-500/20 text-gray-400 border-gray-500/30",
                ALL: "bg-red-500/20 text-red-400 border-red-500/30",
              };
              return (
                <button
                  key={f}
                  onClick={() => setBugFilter(f)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors border ${
                    bugFilter === f
                      ? activeColors[f]
                      : "bg-[#111] text-gray-400 border-[#222] hover:border-[#333]"
                  }`}
                >
                  <Icon size={12} />
                  {f} ({count})
                </button>
              );
            })}
          </div>

          {/* Send All open bugs button */}
          {bugReports.filter((b) => b.status === "OPEN").length > 0 && (
            <button
              onClick={async () => {
                const openBugs = bugReports.filter((b) => b.status === "OPEN");
                for (const bug of openBugs) {
                  await updateBugStatus(bug.id, "INVESTIGATING");
                }
              }}
              disabled={!!acceptingBugId}
              className="flex items-center gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 px-4 py-2 text-sm font-medium text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
            >
              <Send size={14} />
              Send All {bugReports.filter((b) => b.status === "OPEN").length} Open Bugs to Claude
            </button>
          )}

          {/* Bug list */}
          {(() => {
            const filtered = bugFilter === "ALL" ? bugReports : bugReports.filter((b) => b.status === bugFilter);
            if (filtered.length === 0) {
              return (
                <Card>
                  <div className="flex flex-col items-center gap-3 py-12 text-gray-500">
                    <Bug size={40} className="text-gray-700" />
                    <p className="text-base font-medium">No {bugFilter.toLowerCase()} bugs</p>
                    <p className="text-xs text-gray-600">
                      {bugFilter === "OPEN" ? "Users haven't reported any bugs yet" : `No bugs with status "${bugFilter}"`}
                    </p>
                  </div>
                </Card>
              );
            }

            return filtered.map((bug) => {
              const isExpanded = expandedBugId === bug.id;
              const statusColors: Record<string, string> = {
                OPEN: "bg-yellow-500/20 text-yellow-400",
                INVESTIGATING: "bg-blue-500/20 text-blue-400",
                DIAGNOSED: "bg-purple-500/20 text-purple-400",
                FIXING: "bg-amber-500/20 text-amber-400",
                FIXED: "bg-cyan-500/20 text-cyan-400",
                TESTING: "bg-indigo-500/20 text-indigo-400",
                RESOLVED: "bg-green-500/20 text-green-400",
                FAILED: "bg-red-500/20 text-red-400",
                DISMISSED: "bg-gray-500/20 text-gray-400",
              };
              const isWaiting = ["INVESTIGATING", "FIXING", "TESTING"].includes(bug.status);
              const cardBorder =
                bug.status === "RESOLVED" ? "border-green-500/30" :
                bug.status === "FAILED" ? "border-red-500/30" :
                isWaiting ? "border-blue-500/20" : "";

              return (
                <Card key={bug.id} hoverable className={cardBorder}>
                  <div className="flex gap-4">
                    {/* Bug info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 mb-1">
                        <span className={`shrink-0 mt-0.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${statusColors[bug.status] || "bg-gray-500/20 text-gray-400"}`}>
                          {isWaiting && <Loader2 size={10} className="animate-spin" />}
                          {bug.status}
                        </span>
                        <h3 className="text-sm font-semibold text-white leading-tight">{bug.title}</h3>
                      </div>

                      <p className="text-xs text-gray-400 whitespace-pre-wrap break-words mb-2 max-h-32 overflow-y-auto">
                        {bug.description}
                      </p>

                      {/* Waiting indicators */}
                      {bug.status === "INVESTIGATING" && (
                        <div className="flex items-center gap-2 text-xs text-blue-400 mb-2">
                          <Loader2 size={14} className="animate-spin" />
                          Awaiting Claude&apos;s diagnosis...
                        </div>
                      )}
                      {bug.status === "FIXING" && (
                        <div className="flex items-center gap-2 text-xs text-amber-400 mb-2">
                          <Loader2 size={14} className="animate-spin" />
                          Claude is applying the fix...
                        </div>
                      )}
                      {bug.status === "TESTING" && (
                        <div className="flex items-center gap-2 text-xs text-indigo-400 mb-2">
                          <Loader2 size={14} className="animate-spin" />
                          Claude is verifying...
                        </div>
                      )}

                      {/* Diagnosis section */}
                      {bug.diagnosis && (
                        <div className="mt-2">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setExpandedBugId(isExpanded ? null : bug.id)}
                              className="flex items-center gap-1 text-[11px] text-purple-400 hover:text-purple-300 transition-colors"
                            >
                              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                              Bug Diagnosis
                            </button>
                            <button
                              onClick={() => ttsPlayingId === `bug-diag-${bug.id}` ? ttsStop() : ttsSpeak(`bug-diag-${bug.id}`, bug.diagnosis!)}
                              className={`flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5 transition-colors ${
                                ttsPlayingId === `bug-diag-${bug.id}` ? "bg-red-500/20 text-red-400" : "bg-[#1a1a1a] text-gray-500 hover:text-gray-300"
                              }`}
                            >
                              {ttsPlayingId === `bug-diag-${bug.id}` ? <><VolumeX size={10} /> Stop</> : <><Volume2 size={10} /> Read</>}
                            </button>
                          </div>
                          {isExpanded && (
                            <pre className="mt-1 text-[11px] text-gray-400 bg-[#0a0a0a] rounded-lg p-3 whitespace-pre-wrap break-words max-h-48 overflow-y-auto border border-[#1a1a1a]">
                              {bug.diagnosis}
                            </pre>
                          )}
                        </div>
                      )}

                      {/* Upgrade Request section */}
                      {bug.upgradeRequest && (
                        <div className="mt-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-2.5">
                          <div className="flex items-center gap-2">
                            <Sparkles size={14} className="text-yellow-400" />
                            <span className="text-[11px] font-semibold text-yellow-400 uppercase tracking-wide">Upgrade Request</span>
                            <button
                              onClick={() => ttsPlayingId === `bug-upgrade-${bug.id}` ? ttsStop() : ttsSpeak(`bug-upgrade-${bug.id}`, bug.upgradeRequest!)}
                              className={`flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5 ml-auto transition-colors ${
                                ttsPlayingId === `bug-upgrade-${bug.id}` ? "bg-red-500/20 text-red-400" : "bg-[#1a1a1a] text-gray-500 hover:text-gray-300"
                              }`}
                            >
                              {ttsPlayingId === `bug-upgrade-${bug.id}` ? <><VolumeX size={10} /> Stop</> : <><Volume2 size={10} /> Read</>}
                            </button>
                          </div>
                          <pre className="mt-1.5 text-[11px] text-yellow-200/80 whitespace-pre-wrap break-words">
                            {bug.upgradeRequest}
                          </pre>
                        </div>
                      )}

                      {/* Fix result section */}
                      {bug.fixResult && (
                        <div className="mt-2">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setExpandedBugId(isExpanded && expandedBugId === bug.id ? null : bug.id + "-fix")}
                              className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors"
                            >
                              {expandedBugId === bug.id + "-fix" ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                              Fix Applied
                            </button>
                            <button
                              onClick={() => ttsPlayingId === `bug-fix-${bug.id}` ? ttsStop() : ttsSpeak(`bug-fix-${bug.id}`, bug.fixResult!)}
                              className={`flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5 transition-colors ${
                                ttsPlayingId === `bug-fix-${bug.id}` ? "bg-red-500/20 text-red-400" : "bg-[#1a1a1a] text-gray-500 hover:text-gray-300"
                              }`}
                            >
                              {ttsPlayingId === `bug-fix-${bug.id}` ? <><VolumeX size={10} /> Stop</> : <><Volume2 size={10} /> Read</>}
                            </button>
                          </div>
                          {expandedBugId === bug.id + "-fix" && (
                            <pre className="mt-1 text-[11px] text-gray-400 bg-[#0a0a0a] rounded-lg p-3 whitespace-pre-wrap break-words max-h-48 overflow-y-auto border border-[#1a1a1a]">
                              {bug.fixResult}
                            </pre>
                          )}
                        </div>
                      )}

                      {/* Test result section */}
                      {bug.testResult && (
                        <div className="mt-2">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setExpandedBugId(expandedBugId === bug.id + "-test" ? null : bug.id + "-test")}
                              className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
                            >
                              {expandedBugId === bug.id + "-test" ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                              Verification Result
                            </button>
                            <button
                              onClick={() => ttsPlayingId === `bug-test-${bug.id}` ? ttsStop() : ttsSpeak(`bug-test-${bug.id}`, bug.testResult!)}
                              className={`flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5 transition-colors ${
                                ttsPlayingId === `bug-test-${bug.id}` ? "bg-red-500/20 text-red-400" : "bg-[#1a1a1a] text-gray-500 hover:text-gray-300"
                              }`}
                            >
                              {ttsPlayingId === `bug-test-${bug.id}` ? <><VolumeX size={10} /> Stop</> : <><Volume2 size={10} /> Read</>}
                            </button>
                          </div>
                          {expandedBugId === bug.id + "-test" && (
                            <pre className={`mt-1 text-[11px] bg-[#0a0a0a] rounded-lg p-3 whitespace-pre-wrap break-words max-h-48 overflow-y-auto border ${
                              bug.status === "RESOLVED" ? "text-green-400 border-green-500/20" :
                              bug.status === "FAILED" ? "text-red-400 border-red-500/20" :
                              "text-gray-400 border-[#1a1a1a]"
                            }`}>
                              {bug.testResult}
                            </pre>
                          )}
                        </div>
                      )}

                      {/* RESOLVED timeline */}
                      {bug.status === "RESOLVED" && (
                        <div className="flex items-center gap-2 mt-2 text-[10px] text-green-500">
                          <CircleCheck size={12} />
                          Verified and resolved {bug.resolvedAt && `on ${new Date(bug.resolvedAt).toLocaleString()}`}
                        </div>
                      )}

                      {/* FAILED notice */}
                      {bug.status === "FAILED" && (
                        <div className="flex items-center gap-2 mt-2 text-[10px] text-red-400">
                          <CircleX size={12} />
                          Verification failed — fix needs revision
                        </div>
                      )}

                      <div className="flex items-center gap-3 text-[10px] text-gray-600 mt-2">
                        <span>@{bug.username}</span>
                        {bug.page && <span>Page: {bug.page}</span>}
                        <span>{new Date(bug.createdAt).toLocaleString()}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1.5 shrink-0">
                      {/* OPEN: Send to Claude + Dismiss */}
                      {bug.status === "OPEN" && (
                        <>
                          <button
                            onClick={() => updateBugStatus(bug.id, "INVESTIGATING")}
                            disabled={acceptingBugId === bug.id}
                            className="flex items-center gap-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                            title="Send to Claude for investigation"
                          >
                            {acceptingBugId === bug.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Send size={12} />
                            )}
                            Send to Claude
                          </button>
                          <button
                            onClick={() => updateBugStatus(bug.id, "DISMISSED")}
                            disabled={acceptingBugId === bug.id}
                            className="flex items-center gap-1.5 rounded-lg bg-[#1a1a1a] border border-[#222] px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-300 hover:border-[#333] transition-colors disabled:opacity-50"
                          >
                            <XIcon size={12} />
                            Dismiss
                          </button>
                        </>
                      )}

                      {/* DIAGNOSED: Approve Fix / Approve Upgrade + Dismiss */}
                      {bug.status === "DIAGNOSED" && (
                        <>
                          {bug.diagnosis && (
                            <button
                              onClick={() => updateBugStatus(bug.id, "FIXING")}
                              disabled={acceptingBugId === bug.id}
                              className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                            >
                              {acceptingBugId === bug.id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Wrench size={12} />
                              )}
                              {bug.upgradeRequest ? "Approve Fix + Upgrade" : "Approve Fix"}
                            </button>
                          )}
                          {bug.upgradeRequest && !bug.diagnosis && (
                            <button
                              onClick={() => updateBugStatus(bug.id, "FIXING")}
                              disabled={acceptingBugId === bug.id}
                              className="flex items-center gap-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-1.5 text-xs font-medium text-yellow-400 hover:bg-yellow-500/20 transition-colors disabled:opacity-50"
                            >
                              {acceptingBugId === bug.id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Sparkles size={12} />
                              )}
                              Approve Upgrade
                            </button>
                          )}
                          <button
                            onClick={() => updateBugStatus(bug.id, "DISMISSED")}
                            disabled={acceptingBugId === bug.id}
                            className="flex items-center gap-1.5 rounded-lg bg-[#1a1a1a] border border-[#222] px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-300 hover:border-[#333] transition-colors disabled:opacity-50"
                          >
                            <XIcon size={12} />
                            Dismiss
                          </button>
                        </>
                      )}

                      {/* FIXED: Test button */}
                      {bug.status === "FIXED" && (
                        <button
                          onClick={() => updateBugStatus(bug.id, "TESTING")}
                          disabled={acceptingBugId === bug.id}
                          className="flex items-center gap-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 text-xs font-medium text-indigo-400 hover:bg-indigo-500/20 transition-colors disabled:opacity-50"
                        >
                          {acceptingBugId === bug.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <FlaskConical size={12} />
                          )}
                          Test
                        </button>
                      )}

                      {/* FAILED: Re-approve Fix */}
                      {bug.status === "FAILED" && (
                        <button
                          onClick={() => updateBugStatus(bug.id, "FIXING")}
                          disabled={acceptingBugId === bug.id}
                          className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                        >
                          {acceptingBugId === bug.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <RotateCcw size={12} />
                          )}
                          Re-approve Fix
                        </button>
                      )}

                      {/* Cancel: Reset back to OPEN (any non-terminal, non-OPEN status) */}
                      {["INVESTIGATING", "DIAGNOSED", "FIXING", "FIXED", "TESTING", "FAILED"].includes(bug.status) && (
                        <button
                          onClick={() => updateBugStatus(bug.id, "OPEN")}
                          disabled={acceptingBugId === bug.id}
                          className="flex items-center gap-1.5 rounded-lg bg-[#1a1a1a] border border-orange-500/20 px-3 py-1.5 text-xs font-medium text-orange-400 hover:bg-orange-500/10 transition-colors disabled:opacity-50"
                        >
                          {acceptingBugId === bug.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <RotateCcw size={12} />
                          )}
                          Cancel
                        </button>
                      )}

                      {/* Add Note button */}
                      <button
                        onClick={() => {
                          setBugNoteInputId(bugNoteInputId === bug.id ? null : bug.id);
                          setBugNoteText("");
                        }}
                        className="flex items-center gap-1.5 rounded-lg bg-[#1a1a1a] border border-[#222] px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-200 hover:border-[#333] transition-colors"
                      >
                        <MessageSquare size={12} />
                        Add Note
                      </button>
                    </div>
                  </div>

                  {/* Admin notes display */}
                  {bug.adminNotes && (
                    <div className="mt-2 border-t border-[#1a1a1a] pt-2">
                      <div className="flex items-center gap-1 text-[11px] text-purple-400 mb-1">
                        <MessageSquare size={10} />
                        Admin Notes
                      </div>
                      <pre className="text-[11px] text-purple-200/70 whitespace-pre-wrap break-words bg-purple-500/5 rounded-lg p-2 border border-purple-500/10">
                        {bug.adminNotes}
                      </pre>
                    </div>
                  )}

                  {/* Add note input */}
                  {bugNoteInputId === bug.id && (
                    <div className="mt-2 border-t border-[#1a1a1a] pt-2 flex gap-2">
                      <input
                        type="text"
                        value={bugNoteText}
                        onChange={(e) => setBugNoteText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && bugNoteText.trim()) addBugNote(bug.id); }}
                        placeholder="Add a note or extra details..."
                        className="flex-1 bg-[#0a0a0a] border border-[#222] rounded-lg px-3 py-1.5 text-xs text-text placeholder:text-gray-600 focus:outline-none focus:border-purple-500/40"
                        autoFocus
                      />
                      <button
                        onClick={() => addBugNote(bug.id)}
                        disabled={savingBugNote || !bugNoteText.trim()}
                        className="flex items-center gap-1 rounded-lg bg-purple-500/10 border border-purple-500/20 px-3 py-1.5 text-xs font-medium text-purple-400 hover:bg-purple-500/20 transition-colors disabled:opacity-50"
                      >
                        {savingBugNote ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                        Save
                      </button>
                    </div>
                  )}
                </Card>
              );
            });
          })()}
        </div>
      )}

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                  <Users size={20} className="text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-text">{stats?.totalUsers ?? "..."}</p>
                  <p className="text-xs text-text-muted">Total Users</p>
                </div>
              </div>
            </Card>
            <Card>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                  <Video size={20} className="text-purple-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-text">{stats?.totalVideos ?? "..."}</p>
                  <p className="text-xs text-text-muted">Total Videos</p>
                </div>
              </div>
            </Card>
            <Card>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-500/10">
                  <Coins size={20} className="text-yellow-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-text">
                    {stats ? stats.totalCredits.toLocaleString() : "..."}
                  </p>
                  <p className="text-xs text-text-muted">Credits in Circulation</p>
                </div>
              </div>
            </Card>
            <Card>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                  <DollarSign size={20} className="text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-text">
                    {stats ? `$${(stats.totalRevenue / 100).toLocaleString()}` : "..."}
                  </p>
                  <p className="text-xs text-text-muted">Total Revenue</p>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Card>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10">
                  <Ban size={20} className="text-red-500" />
                </div>
                <div>
                  <p className="text-xl font-bold text-text">{stats?.bannedUsers ?? 0}</p>
                  <p className="text-xs text-text-muted">Banned Users</p>
                </div>
              </div>
            </Card>
            <Card>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10">
                  <BadgeCheck size={20} className="text-cyan-500" />
                </div>
                <div>
                  <p className="text-xl font-bold text-text">{stats?.verifiedUsers ?? 0}</p>
                  <p className="text-xs text-text-muted">Verified Users</p>
                </div>
              </div>
            </Card>
            <Card>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-pink-500/10">
                  <Radio size={20} className="text-pink-500" />
                </div>
                <div>
                  <p className="text-xl font-bold text-text">{stats?.activeStreams ?? 0}</p>
                  <p className="text-xs text-text-muted">Active Streams</p>
                </div>
              </div>
            </Card>
          </div>

          <Card>
            <h3 className="mb-4 text-lg font-semibold text-text">Quick Actions</h3>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setActiveTab("users")}>
                View Users
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setActiveTab("alerts")}>
                Check Alerts
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setActiveTab("session")}>
                Claude Session
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setActiveTab("bridge")}>
                Bridge
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Users Tab */}
      {activeTab === "users" && (() => {
        const formatTimeAgo = (date: string | null) => {
          if (!date) return "Never";
          const ms = Date.now() - new Date(date).getTime();
          const sec = Math.floor(ms / 1000);
          if (sec < 60) return "Just now";
          const min = Math.floor(sec / 60);
          if (min < 60) return `${min}m ago`;
          const hr = Math.floor(min / 60);
          if (hr < 24) return `${hr}h ago`;
          const days = Math.floor(hr / 24);
          if (days < 30) return `${days}d ago`;
          const months = Math.floor(days / 30);
          if (months < 12) return `${months}mo ago`;
          return `${Math.floor(months / 12)}y ago`;
        };
        const formatMemberSince = (date: string) => {
          const d = new Date(date);
          return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        };
        const isOnlineNow = (date: string | null) => {
          if (!date) return false;
          return Date.now() - new Date(date).getTime() < 5 * 60 * 1000;
        };
        return (<>
        <Card padding="sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 font-medium text-text-muted">User</th>
                  <th className="px-4 py-3 font-medium text-text-muted">Email</th>
                  <th className="px-4 py-3 font-medium text-text-muted">Role</th>
                  <th className="px-4 py-3 font-medium text-text-muted">Status</th>
                  <th className="px-4 py-3 font-medium text-text-muted">Activity</th>
                  <th className="px-4 py-3 font-medium text-text-muted">Social</th>
                  <th className="px-4 py-3 font-medium text-text-muted">Credits</th>
                  <th className="px-4 py-3 font-medium text-text-muted">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className={`border-b border-border/50 transition-colors hover:bg-bg-surface2/30 ${u.isBanned ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <img src={u.avatarUrl || "/uploads/avatars/default.jpg"} alt={u.displayName} className="h-8 w-8 rounded-full object-cover" />
                          {isOnlineNow(u.lastActiveAt) && (
                            <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-bg-surface bg-green-500" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-text">{u.displayName}</span>
                            {u.verifiedBadge && <BadgeCheck size={14} className="text-primary" />}
                            {u.isOwner && <Crown size={14} className="text-yellow-500" />}
                          </div>
                          <span className="text-xs text-text-muted">@{u.username}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-text-secondary">{u.email}</span>
                    </td>
                    <td className="px-4 py-3">
                      {u.isOwner ? (
                        <select
                          value={u.role}
                          onChange={(e) => changeUserRole(u.id, e.target.value)}
                          className="rounded border border-yellow-500/30 bg-yellow-500/10 px-2 py-1 text-xs font-bold text-yellow-400 outline-none focus:border-yellow-500"
                        >
                          <option value="OWNER">Owner</option>
                          <option value="BUG_TESTER">Bug Tester</option>
                        </select>
                      ) : (
                        <select
                          value={u.role}
                          onChange={(e) => changeUserRole(u.id, e.target.value)}
                          className="rounded border border-border bg-bg-surface2 px-2 py-1 text-xs text-text outline-none focus:border-primary"
                        >
                          <option value="END_USER">End User</option>
                          <option value="BUG_TESTER">Bug Tester</option>
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {u.isBanned && <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-400">BANNED</span>}
                        {u.isCreator && <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-bold text-purple-400">CREATOR</span>}
                        {u.isPremium && <span className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-[10px] font-bold text-yellow-400">PREMIUM</span>}
                        {isOnlineNow(u.lastActiveAt) && <span className="rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] font-bold text-green-400">ONLINE</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-text">Last active: {formatTimeAgo(u.lastActiveAt)}</span>
                        <span className="text-[10px] text-text-muted">Joined: {formatMemberSince(u.createdAt)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-text">{u.followerCount.toLocaleString()} followers</span>
                        <span className="text-[10px] text-text-muted">{u.followingCount.toLocaleString()} following</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-text">{(u.wallet?.credits ?? 0).toLocaleString()}</span>
                        <span className="text-[10px] text-text-muted">${((u.wallet?.credits ?? 0) / 100).toFixed(2)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {!u.isOwner && (
                          <>
                            <button
                              className="rounded px-2 py-1 text-xs font-medium text-text-secondary hover:bg-bg-surface2 transition-colors"
                              onClick={async () => { const cmd = u.isBanned ? `unban user:${u.username}` : `ban user:${u.username}`; await fetch("/api/admin/command", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: cmd }) }); fetchStats(); fetchUsers(); }}
                            >
                              {u.isBanned ? "Unban" : "Ban"}
                            </button>
                            <button
                              className="rounded px-2 py-1 text-xs font-medium text-text-secondary hover:bg-bg-surface2 transition-colors"
                              onClick={async () => { const cmd = u.verifiedBadge ? `unverify user:${u.username}` : `verify user:${u.username}`; await fetch("/api/admin/command", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: cmd }) }); fetchStats(); fetchUsers(); }}
                            >
                              {u.verifiedBadge ? "Unverify" : "Verify"}
                            </button>
                          </>
                        )}
                        <button
                          className="rounded px-2 py-1 text-xs font-medium text-text-secondary hover:bg-bg-surface2 transition-colors"
                          onClick={() => loadAudit(u.email)}
                          title="View credit details in audit"
                        >
                          Credits
                        </button>
                        <button
                          className="rounded px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                          onClick={() => loadAudit(u.email)}
                        >
                          Audit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Audit Viewer Panel */}
        {auditUserEmail && (
          <Card padding="sm" className="mt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-text">
                Audit Trail — {auditUserEmail}
              </h3>
              <button
                onClick={() => { setAuditUserEmail(null); setAuditData(null); }}
                className="text-text-muted hover:text-text text-xs"
              >
                Close
              </button>
            </div>

            {auditLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin text-primary" />
              </div>
            )}

            {!auditLoading && auditData && (
              <>
                <div className="flex gap-1 mb-3 flex-wrap">
                  {["all", "emails", "usernames", "displaynames", "credits", "login_attempts", "age"].map((t) => (
                    <button
                      key={t}
                      onClick={() => setAuditType(t)}
                      className={`px-2 py-1 text-xs rounded-lg transition-colors ${
                        auditType === t
                          ? "bg-primary text-white"
                          : "bg-bg-surface2 text-text-secondary hover:bg-bg-surface3"
                      }`}
                    >
                      {t === "all" ? "All" : t.replace("_", " ")}
                    </button>
                  ))}
                </div>

                <div className="max-h-[400px] overflow-y-auto space-y-1">
                  {Object.entries(auditData)
                    .filter(([key]) => auditType === "all" || key === auditType)
                    .map(([type, entries]) =>
                      (entries as any[]).map((entry: any, idx: number) => (
                        <div
                          key={`${type}-${idx}`}
                          className="flex items-start gap-2 px-3 py-2 bg-bg-surface2/50 rounded-lg text-xs"
                        >
                          <span className="shrink-0 px-1.5 py-0.5 bg-primary/10 text-primary rounded font-medium">
                            {type}
                          </span>
                          <span className="text-text-muted shrink-0">
                            {new Date(entry.timestamp).toLocaleString()}
                          </span>
                          <span className="text-text flex-1 break-all font-mono">
                            {JSON.stringify(entry.data)}
                          </span>
                        </div>
                      ))
                    )}

                  {Object.keys(auditData).length === 0 && (
                    <p className="text-text-muted text-xs text-center py-4">No audit entries found for this user.</p>
                  )}
                </div>
              </>
            )}
          </Card>
        )}

      </>
        );
      })()}

      {/* Alerts Tab */}
      {activeTab === "alerts" && (() => {
        const getAlertStyle = (alert: any) => {
          const msg = (alert.message || "").toUpperCase();
          const type = alert.type as string;
          const isFraud = type === "SYSTEM" && (msg.includes("FRAUD") || msg.includes("MISMATCH"));
          if (isFraud) return { icon: AlertTriangle, color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20", badge: "FRAUD ALERT", badgeBg: "bg-red-500/20 text-red-400" };
          if (type === "SYSTEM") return { icon: AlertTriangle, color: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/20", badge: "SYSTEM", badgeBg: "bg-yellow-500/20 text-yellow-400" };
          if (type === "DONATION") return { icon: Gift, color: "text-green-500", bg: "bg-green-500/10", border: "border-green-500/20", badge: "DONATION", badgeBg: "bg-green-500/20 text-green-400" };
          if (type === "MESSAGE" || type === "PRIVATE_MESSAGE") return { icon: MessageSquare, color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/20", badge: type === "PRIVATE_MESSAGE" ? "DM" : "MESSAGE", badgeBg: "bg-blue-500/20 text-blue-400" };
          if (type === "FRIEND_REQUEST" || type === "FRIEND_ACCEPT") return { icon: UserPlus, color: "text-purple-500", bg: "bg-purple-500/10", border: "border-purple-500/20", badge: type === "FRIEND_REQUEST" ? "FRIEND REQ" : "FRIEND", badgeBg: "bg-purple-500/20 text-purple-400" };
          if (type === "FOLLOW" || type === "LIKE" || type === "COMMENT") return { icon: Heart, color: "text-gray-400", bg: "bg-gray-500/10", border: "border-gray-500/20", badge: type, badgeBg: "bg-gray-500/20 text-gray-400" };
          if (type === "LIVE_START") return { icon: Radio, color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20", badge: "LIVE", badgeBg: "bg-red-500/20 text-red-400" };
          if (type === "SUBSCRIPTION") return { icon: Zap, color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20", badge: "SUB", badgeBg: "bg-amber-500/20 text-amber-400" };
          if (type === "SERVICE_ORDER") return { icon: Wrench, color: "text-cyan-500", bg: "bg-cyan-500/10", border: "border-cyan-500/20", badge: "ORDER", badgeBg: "bg-cyan-500/20 text-cyan-400" };
          if (type === "STREAK_BONUS") return { icon: Zap, color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/20", badge: "STREAK", badgeBg: "bg-orange-500/20 text-orange-400" };
          return { icon: Bell, color: "text-gray-400", bg: "bg-gray-500/10", border: "border-gray-500/20", badge: type, badgeBg: "bg-gray-500/20 text-gray-400" };
        };

        const filterChips = [
          { id: "all" as const, label: "All" },
          { id: "system" as const, label: "Fraud/System" },
          { id: "messages" as const, label: "Messages" },
          { id: "social" as const, label: "Social" },
          { id: "streams" as const, label: "Streams" },
        ];

        const readChips = [
          { id: "all" as const, label: "All" },
          { id: "unread" as const, label: "Unread" },
          { id: "read" as const, label: "Read" },
        ];

        const emptyLabels: Record<string, string> = {
          all: "No alerts",
          system: "No fraud/system alerts",
          messages: "No message alerts",
          social: "No social alerts",
          streams: "No stream alerts",
        };

        const emptyReadLabel = alertReadFilter === "unread" ? " (unread)" : alertReadFilter === "read" ? " (read)" : "";

        const mostRecent = alertsData.length > 0 ? alertsData[0].createdAt : null;

        return (
          <div className="space-y-4">
            {/* Stats summary bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-xl border border-border bg-bg-surface p-3">
                <p className="text-xs text-text-muted">Total Alerts</p>
                <p className="text-xl font-bold text-text">{alertsTotalCount}</p>
              </div>
              <div className="rounded-xl border border-border bg-bg-surface p-3">
                <p className="text-xs text-text-muted">Unread</p>
                <div className="flex items-center gap-2">
                  <p className="text-xl font-bold text-text">{alertsUnreadCount}</p>
                  {alertsUnreadCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{alertsUnreadCount}</span>}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-bg-surface p-3">
                <p className="text-xs text-text-muted">Fraud Alerts</p>
                <p className={`text-xl font-bold ${alertsFraudCount > 0 ? "text-red-500" : "text-text"}`}>{alertsFraudCount}</p>
              </div>
              <div className="rounded-xl border border-border bg-bg-surface p-3">
                <p className="text-xs text-text-muted">Most Recent</p>
                <p className="text-sm font-medium text-text">{mostRecent ? relativeTime(mostRecent) : "—"}</p>
              </div>
            </div>

            {/* Filter bar */}
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              {/* Type filter chips */}
              <div className="flex gap-1 flex-wrap">
                {filterChips.map((chip) => (
                  <button
                    key={chip.id}
                    onClick={() => setAlertFilter(chip.id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                      alertFilter === chip.id
                        ? "bg-primary text-white"
                        : "bg-bg-surface text-text-muted hover:text-text border border-border"
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              {/* Read filter */}
              <div className="flex gap-1">
                {readChips.map((chip) => (
                  <button
                    key={chip.id}
                    onClick={() => setAlertReadFilter(chip.id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                      alertReadFilter === chip.id
                        ? "bg-bg-surface2 text-text"
                        : "text-text-muted hover:text-text-secondary"
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              {/* Bulk actions */}
              <div className="flex gap-2 md:ml-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={markAllAlertsRead}
                  disabled={alertsUnreadCount === 0}
                  className="text-xs"
                >
                  <Eye size={14} className="mr-1" />
                  Mark All Read
                </Button>
                {!clearAllConfirm ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setClearAllConfirm(true)}
                    disabled={alertsTotalCount === 0}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    <Trash2 size={14} className="mr-1" />
                    Clear All
                  </Button>
                ) : (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearAllAlerts}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Confirm
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setClearAllConfirm(false)}
                      className="text-xs"
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Alert cards */}
            {alertsLoading && alertsData.length === 0 ? (
              <Card>
                <div className="flex items-center justify-center gap-2 py-8 text-text-muted">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <span className="text-sm">Loading alerts...</span>
                </div>
              </Card>
            ) : alertsData.length === 0 ? (
              <Card>
                <div className="flex flex-col items-center gap-3 py-8 text-text-muted">
                  <AlertTriangle size={32} />
                  <p>{emptyLabels[alertFilter] || "No alerts"}{emptyReadLabel}</p>
                </div>
              </Card>
            ) : (
              <div className="space-y-2">
                {alertsData.map((alert: any) => {
                  const style = getAlertStyle(alert);
                  const IconComponent = style.icon;
                  const isFraud = alert.type === "SYSTEM" && ((alert.message || "").toUpperCase().includes("FRAUD") || (alert.message || "").toUpperCase().includes("MISMATCH"));
                  return (
                    <div
                      key={alert.id}
                      className={`rounded-xl border ${style.border} ${alert.read ? "bg-bg-surface/50 opacity-60" : "bg-bg-surface"} p-3 transition-all hover:bg-bg-surface2 ${
                        isFraud && alert.relatedId ? "cursor-pointer" : ""
                      }`}
                      onClick={() => {
                        if (isFraud && alert.relatedId) {
                          setActiveTab("users");
                        }
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${style.bg}`}>
                          <IconComponent size={16} className={style.color} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${style.badgeBg}`}>
                              {style.badge}
                            </span>
                            {!alert.read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                          </div>
                          <p className="text-sm text-text">{alert.message}</p>
                          <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
                            <span>@{alert.user?.username || "system"}</span>
                            <ChevronRight size={10} />
                            <span>{relativeTime(alert.createdAt)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {!alert.read && (
                            <button
                              onClick={(e) => { e.stopPropagation(); markAlertRead([alert.id]); }}
                              className="rounded-lg p-1.5 text-text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                              title="Mark as read"
                            >
                              <Eye size={14} />
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); dismissAlert([alert.id]); }}
                            className="rounded-lg p-1.5 text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title="Dismiss"
                          >
                            <XIcon size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Load more */}
                {alertsHasMore && (
                  <div className="flex justify-center pt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const last = alertsData[alertsData.length - 1];
                        if (last) fetchAlerts(true, last.createdAt);
                      }}
                      disabled={alertsLoading}
                      className="text-xs"
                    >
                      {alertsLoading ? "Loading..." : "Load More"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {activeTab === "treasury" && (
        <div className="space-y-6">
          {treasuryLoading && !treasuryData ? (
            <div className="flex items-center justify-center py-12 text-text-muted">Loading treasury data...</div>
          ) : treasuryData ? (
            <>
              {/* Stats cards */}
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Card>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-500/10">
                      <Coins size={20} className="text-yellow-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-text">{treasuryData.creditsInCirculation.toLocaleString()}</p>
                      <p className="text-xs text-text-muted">Credits in Circulation</p>
                    </div>
                  </div>
                </Card>
                <Card>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                      <DollarSign size={20} className="text-green-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-text">{treasuryData.treasuryBalance.toLocaleString()}</p>
                      <p className="text-xs text-text-muted">Treasury Balance</p>
                    </div>
                  </div>
                </Card>
                <Card>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10">
                      <Clock size={20} className="text-orange-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-text">{treasuryData.feesPending.toLocaleString()}</p>
                      <p className="text-xs text-text-muted">Fees Pending</p>
                    </div>
                  </div>
                </Card>
                <Card>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                      <Check size={20} className="text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-text">{treasuryData.feesSettled}</p>
                      <p className="text-xs text-text-muted">Fees Settled</p>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Fee Configuration */}
              <Card>
                <h3 className="mb-4 text-lg font-semibold text-text">Fee Configuration</h3>
                <div className="space-y-4">
                  {/* Withdrawal Fees */}
                  <div>
                    <p className="mb-2 text-sm font-medium text-text-muted">Withdrawal Fees</p>
                    <div className="flex flex-wrap items-end gap-4">
                      <div>
                        <label className="mb-1 block text-xs text-text-muted">Fee %</label>
                        <input
                          type="number"
                          min={0}
                          max={50}
                          value={treasuryFeePct}
                          onChange={(e) => setTreasuryFeePct(Math.max(0, Math.min(50, parseInt(e.target.value) || 0)))}
                          className="w-24 rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm text-text"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-text-muted">Min Fee (cents)</label>
                        <input
                          type="number"
                          min={0}
                          max={10000}
                          value={treasuryFeeMin}
                          onChange={(e) => setTreasuryFeeMin(Math.max(0, Math.min(10000, parseInt(e.target.value) || 0)))}
                          className="w-28 rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm text-text"
                        />
                      </div>
                      <span className="text-xs text-text-muted">
                        Current: {treasuryData.feeConfig.withdrawalFeePct}% / min ${(treasuryData.feeConfig.withdrawalFeeMinCents / 100).toFixed(2)}
                      </span>
                    </div>
                  </div>
                  {/* Purchase Fees */}
                  <div>
                    <p className="mb-2 text-sm font-medium text-text-muted">Purchase Platform Fee</p>
                    <div className="flex flex-wrap items-end gap-4">
                      <div>
                        <label className="mb-1 block text-xs text-text-muted">Fee %</label>
                        <input
                          type="number"
                          min={0}
                          max={50}
                          value={treasuryPurchaseFeePct}
                          onChange={(e) => setTreasuryPurchaseFeePct(Math.max(0, Math.min(50, parseInt(e.target.value) || 0)))}
                          className="w-24 rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm text-text"
                        />
                      </div>
                      <span className="text-xs text-text-muted">
                        Current: {treasuryData.feeConfig.purchaseFeePct}% (+ PayPal processing: 3.49% + $0.49)
                      </span>
                    </div>
                  </div>
                  {/* Save button */}
                  <Button
                    size="sm"
                    onClick={saveFeeConfig}
                    disabled={treasurySaving}
                  >
                    <Save size={14} className="mr-1" />
                    {treasurySaving ? "Saving..." : "Save Fees"}
                  </Button>
                </div>
              </Card>

              {/* Recent Withdrawals */}
              <Card>
                <h3 className="mb-4 text-lg font-semibold text-text">Recent Withdrawals</h3>
                {treasuryData.recentWithdrawals.length === 0 ? (
                  <p className="text-sm text-text-muted">No withdrawals yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs text-text-muted">
                          <th className="pb-2 pr-4">User</th>
                          <th className="pb-2 pr-4">Credits</th>
                          <th className="pb-2 pr-4">Fee</th>
                          <th className="pb-2 pr-4">Net</th>
                          <th className="pb-2 pr-4">Status</th>
                          <th className="pb-2">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {treasuryData.recentWithdrawals.map((w) => {
                          const statusStyles: Record<string, string> = {
                            PENDING: "bg-yellow-500/20 text-yellow-400",
                            COMPLETED: "bg-green-500/20 text-green-400",
                            FAILED: "bg-red-500/20 text-red-400",
                            REFUNDED: "bg-orange-500/20 text-orange-400",
                          };
                          return (
                            <tr key={w.id} className="border-b border-border/50">
                              <td className="py-2 pr-4">
                                <span className="font-medium text-text">{w.user.displayName}</span>
                                <span className="ml-1 text-xs text-text-muted">@{w.user.username}</span>
                              </td>
                              <td className="py-2 pr-4 text-text">{w.credits.toLocaleString()}</td>
                              <td className="py-2 pr-4 text-text">{w.fee.toLocaleString()}</td>
                              <td className="py-2 pr-4 text-text">{w.net.toLocaleString()}</td>
                              <td className="py-2 pr-4">
                                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[w.status] ?? "bg-gray-500/20 text-gray-400"}`}>
                                  {w.status}
                                </span>
                              </td>
                              <td className="py-2 text-xs text-text-muted">
                                {new Date(w.createdAt).toLocaleDateString()} {new Date(w.createdAt).toLocaleTimeString()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          ) : (
            <div className="text-center text-text-muted py-12">Failed to load treasury data.</div>
          )}
        </div>
      )}

      {/* ──────── Ads Tab ──────── */}
      {activeTab === "ads" && (
        <div className="space-y-6">
          {/* Stats Overview */}
          {customAdStats && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: "Total Ads", value: customAdStats.totalAds, color: "text-text" },
                { label: "Active", value: customAdStats.activeCount, color: "text-success" },
                { label: "Pending", value: customAdStats.pendingCount, color: "text-warning" },
                { label: "Impressions", value: customAdStats.totalImpressions.toLocaleString(), color: "text-primary" },
                { label: "Credits Pool", value: customAdStats.totalCreditsRemaining.toLocaleString(), color: "text-warning" },
              ].map((s) => (
                <Card key={s.label} padding="sm">
                  <p className="text-[11px] text-text-muted uppercase tracking-wide">{s.label}</p>
                  <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                </Card>
              ))}
            </div>
          )}

          {/* Ad Settings Panel */}
          <Card padding="md">
            <h3 className="text-base font-semibold text-text mb-4 flex items-center gap-2">
              <Coins size={16} className="text-warning" />
              Ad Marketplace Settings
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Submission Price */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Submission Fee</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={customAdPrice}
                    onChange={(e) => setCustomAdPrice(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-28 bg-bg-surface2 text-text border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  />
                  <span className="text-xs text-text-muted">credits</span>
                </div>
                <p className="text-[11px] text-text-muted">One-time fee to submit an ad for review</p>
              </div>

              {/* Cost Per Impression */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Cost Per Impression</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={customAdCostPerImpression}
                    onChange={(e) => setCustomAdCostPerImpression(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-28 bg-bg-surface2 text-text border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  />
                  <span className="text-xs text-text-muted">credits/view</span>
                </div>
                <p className="text-[11px] text-text-muted">Credits deducted from ad balance each time it's shown</p>
              </div>

              {/* Minimum Balance */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Minimum Balance</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={customAdMinBalance}
                    onChange={(e) => setCustomAdMinBalance(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-28 bg-bg-surface2 text-text border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  />
                  <span className="text-xs text-text-muted">credits</span>
                </div>
                <p className="text-[11px] text-text-muted">Ad stops serving when balance drops below this</p>
              </div>

              {/* Mix Percent */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">Custom Ad Mix Rate</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={customAdMixPercent}
                    onChange={(e) => setCustomAdMixPercent(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                    className="w-28 bg-bg-surface2 text-text border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  />
                  <span className="text-xs text-text-muted">%</span>
                </div>
                <p className="text-[11px] text-text-muted">Chance a custom ad plays instead of Google (0 = disabled, 100 = always)</p>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-border flex items-center justify-between">
              <p className="text-xs text-text-muted">
                Changes apply immediately to new impressions
              </p>
              <Button
                variant="gradient"
                size="sm"
                onClick={saveAdSettings}
                disabled={customAdPriceSaving}
                icon={customAdPriceSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              >
                {customAdPriceSaving ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </Card>

          {/* Filter */}
          <div className="flex items-center gap-2 flex-wrap">
            {(["all", "PENDING_REVIEW", "APPROVED", "REJECTED", "PAUSED"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setCustomAdFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                  customAdFilter === f
                    ? "bg-primary text-white border-primary"
                    : "bg-bg-surface2 text-text-secondary border-border hover:border-primary"
                }`}
              >
                {f === "all" ? "All" : f === "PENDING_REVIEW" ? "Pending" : f.charAt(0) + f.slice(1).toLowerCase()}
              </button>
            ))}
            {customAdsLoading && <Loader2 size={14} className="animate-spin text-primary ml-2" />}
          </div>

          {/* Ads List */}
          {customAds.length === 0 ? (
            <Card padding="lg">
              <div className="text-center text-text-muted py-12">
                {customAdsLoading ? "Loading..." : "No custom ads found."}
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {customAds.map((ad: any) => {
                const statusColors: Record<string, string> = {
                  PENDING_REVIEW: "text-warning",
                  APPROVED: "text-success",
                  REJECTED: "text-danger",
                  PAUSED: "text-text-muted",
                  EXPIRED: "text-text-muted",
                };
                const statusLabels: Record<string, string> = {
                  PENDING_REVIEW: "Pending Review",
                  APPROVED: "Active",
                  REJECTED: "Rejected",
                  PAUSED: "Paused",
                  EXPIRED: "Expired",
                };
                return (
                  <Card key={ad.id} padding="md">
                    <div className="flex gap-4">
                      {/* Video preview */}
                      <div
                        className="w-44 h-28 bg-bg-surface2 rounded-lg overflow-hidden shrink-0 relative group cursor-pointer"
                        onClick={() => setPreviewAdUrl(previewAdUrl === ad.videoUrl ? null : ad.videoUrl)}
                      >
                        <video
                          src={ad.videoUrl}
                          className="w-full h-full object-cover"
                          muted
                          preload="metadata"
                          onMouseEnter={(e) => (e.target as HTMLVideoElement).play().catch(() => {})}
                          onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                        />
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Play size={24} className="text-white" />
                        </div>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div>
                            <h4 className="text-sm font-semibold text-text">{ad.title}</h4>
                            <p className="text-xs text-text-muted">
                              by @{ad.user?.username || "unknown"} ({ad.user?.displayName || ""})
                            </p>
                          </div>
                          <span className={`text-xs font-medium shrink-0 ${statusColors[ad.status] || "text-text-muted"}`}>
                            {statusLabels[ad.status] || ad.status}
                          </span>
                        </div>

                        {/* Stats row */}
                        <div className="flex items-center gap-4 mt-2 flex-wrap text-xs text-text-secondary">
                          <span>Duration: {ad.durationSec}s</span>
                          <span>Impressions: {(ad.impressions ?? 0).toLocaleString()}</span>
                          <span>Credits: {(ad.creditsPaid ?? 0).toLocaleString()}</span>
                          <span>Submitted: {new Date(ad.createdAt).toLocaleDateString()}</span>
                        </div>

                        {ad.rejectionReason && (
                          <p className="text-xs text-danger mt-1">Reason: {ad.rejectionReason}</p>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2 mt-3">
                          {ad.status === "PENDING_REVIEW" && (
                            <>
                              <button
                                onClick={() => handleAdAction(ad.id, { status: "APPROVED" })}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-success/10 text-success text-xs font-medium hover:bg-success/20 transition-colors"
                              >
                                <Check size={12} />
                                Approve
                              </button>
                              <button
                                onClick={() => { setRejectModalAdId(ad.id); setRejectReason(""); setRejectWithRefund(true); }}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-danger/10 text-danger text-xs font-medium hover:bg-danger/20 transition-colors"
                              >
                                <XIcon size={12} />
                                Reject
                              </button>
                            </>
                          )}
                          {ad.status === "APPROVED" && (
                            <button
                              onClick={() => handleAdAction(ad.id, { status: "PAUSED" })}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-bg-surface2 text-text-secondary text-xs font-medium hover:bg-bg-surface3 transition-colors"
                            >
                              Pause
                            </button>
                          )}
                          {ad.status === "PAUSED" && (
                            <button
                              onClick={() => handleAdAction(ad.id, { status: "APPROVED" })}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-success/10 text-success text-xs font-medium hover:bg-success/20 transition-colors"
                            >
                              Resume
                            </button>
                          )}
                          <button
                            onClick={() => { if (confirm(`Delete ad "${ad.title}"?`)) handleDeleteAd(ad.id); }}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-bg-surface2 text-text-secondary text-xs font-medium hover:bg-danger/10 hover:text-danger transition-colors ml-auto"
                          >
                            <Trash2 size={12} />
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded video preview */}
                    {previewAdUrl === ad.videoUrl && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <video
                          src={ad.videoUrl}
                          controls
                          autoPlay
                          className="w-full max-h-[300px] rounded-lg bg-black"
                        />
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {/* Creator Ad Revenue Payouts */}
          <Card padding="lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-text flex items-center gap-2">
                <DollarSign size={16} className="text-success" />
                Creator Ad Revenue Payouts
              </h3>
              <div className="flex items-center gap-2">
                {adPayoutsLoading && <Loader2 size={14} className="animate-spin text-primary" />}
                {adPayouts.length > 0 && (
                  <button
                    onClick={payAllCreators}
                    disabled={payingCreatorId !== null}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-success text-white hover:bg-success/80 transition-colors disabled:opacity-50"
                  >
                    Pay All Creators
                  </button>
                )}
              </div>
            </div>

            {/* Payout Day Setting */}
            <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-bg-surface2/50">
              <label className="text-xs text-text-secondary whitespace-nowrap">Auto-pay day:</label>
              <select
                value={adPayoutDay}
                onChange={(e) => setAdPayoutDay(Number(e.target.value))}
                className="bg-bg-surface2 text-text text-xs rounded-lg px-2 py-1.5 border border-border focus:outline-none focus:border-primary"
              >
                <option value={0}>Manual Only</option>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>Day {d} of each month</option>
                ))}
              </select>
              <button
                onClick={saveAdPayoutDay}
                disabled={adPayoutDaySaving}
                className="px-2 py-1 text-xs rounded-lg bg-primary text-white hover:bg-primary/80 transition-colors disabled:opacity-50"
              >
                {adPayoutDaySaving ? "..." : "Save"}
              </button>
            </div>

            {adPayouts.length === 0 ? (
              <p className="text-xs text-text-muted text-center py-6">No pending creator payouts.</p>
            ) : (
              <div className="space-y-3">
                {adPayouts.map((payout: any) => (
                  <div key={payout.creator.id} className="p-3 rounded-lg bg-bg-surface2/50 border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {payout.creator.avatarUrl ? (
                          <img src={payout.creator.avatarUrl} alt="" className="w-6 h-6 rounded-full" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-bg-surface3 flex items-center justify-center">
                            <Users size={12} className="text-text-muted" />
                          </div>
                        )}
                        <span className="text-sm font-medium text-text">
                          {payout.creator.displayName || payout.creator.username}
                        </span>
                        <span className="text-xs text-text-muted">@{payout.creator.username}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-bg-surface3 text-text-muted">
                          {payout.sharePct}% share
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-sm font-semibold text-success">{payout.totalCredits.toLocaleString()} credits</div>
                          <div className="text-xs text-text-muted">{payout.totalImpressions.toLocaleString()} impressions</div>
                        </div>
                        <button
                          onClick={() => payCreator(payout.creator.id)}
                          disabled={payingCreatorId === payout.creator.id}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-success text-white hover:bg-success/80 transition-colors disabled:opacity-50 flex items-center gap-1"
                        >
                          {payingCreatorId === payout.creator.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Coins size={12} />
                          )}
                          Pay
                        </button>
                      </div>
                    </div>
                    {/* Video breakdown */}
                    {payout.videos.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {payout.videos.map((v: any) => (
                          <div key={v.videoId} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-bg-surface3/50">
                            <span className="text-text-secondary truncate max-w-[200px]">{v.videoTitle}</span>
                            <span className="text-text-muted">{v.impressions} impr / {v.credits} credits</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Recent payout history */}
            {adPayoutHistory.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border">
                <h4 className="text-xs font-medium text-text-muted mb-2">Recent Payouts</h4>
                <div className="space-y-1">
                  {adPayoutHistory.map((entry: any) => (
                    <div key={entry.id} className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-bg-surface2/30">
                      <span className="text-text-secondary">
                        {entry.user?.displayName || entry.user?.username || "Unknown"}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-success">+{entry.deltaCredits.toLocaleString()}</span>
                        <span className="text-text-muted">{new Date(entry.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Reject Modal (inline) */}
          {rejectModalAdId && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setRejectModalAdId(null)}>
              <div className="bg-bg-surface rounded-xl border border-border p-6 max-w-md w-full space-y-4" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-base font-semibold text-text">Reject Ad</h3>
                <div className="space-y-1.5">
                  <label className="text-sm text-text-secondary">Reason (optional)</label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="w-full bg-bg-surface2 text-text text-sm rounded-lg px-3 py-2 border border-border focus:outline-none focus:border-primary min-h-[80px] resize-y"
                    placeholder="Why is this ad being rejected?"
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rejectWithRefund}
                    onChange={(e) => setRejectWithRefund(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span className="text-sm text-text-secondary">Refund credits to user</span>
                </label>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setRejectModalAdId(null)}
                    className="flex-1 px-4 py-2 rounded-lg bg-bg-surface2 text-text-secondary text-sm font-medium hover:bg-bg-surface3 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      handleAdAction(rejectModalAdId, {
                        status: "REJECTED",
                        rejectionReason: rejectReason || undefined,
                        refund: rejectWithRefund,
                      });
                      setRejectModalAdId(null);
                    }}
                    className="flex-1 px-4 py-2 rounded-lg bg-danger text-white text-sm font-medium hover:bg-danger/80 transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
