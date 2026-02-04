"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Eye,
  Share2,
  Gift,
  LogOut,
  Crown,
  Shield,
  Users,
  Timer,
  Swords,
  Zap,
  ShoppingCart,
  Info,
  HelpCircle,
  Gavel,
  Disc,
  Target,
  Trophy,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useGameStore } from "@/stores/game-store";
import { SSEClient } from "@/lib/sse/sse-client";
import type { LiveRoom, User, DonationTier, TowerUnit } from "@/lib/types";
import type { GameState } from "@/lib/games/game-engine";
import ParticipantBox from "@/components/battle/ParticipantBox";
import LeaderboardPanel from "@/components/battle/LeaderboardPanel";
import ChatPanel from "@/components/live/ChatPanel";
import GiftPanel from "@/components/credits/GiftPanel";
import DonateButton from "@/components/credits/DonateButton";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Tabs from "@/components/ui/Tabs";
import Drawer from "@/components/ui/Drawer";
import Avatar from "@/components/ui/Avatar";
import Card from "@/components/ui/Card";
import { formatCurrency, cn } from "@/lib/utils";

/* ============================================================
   LOCAL CONSTANTS (game config, not DB data)
   ============================================================ */

const DONATION_TIERS: DonationTier[] = [
  { id: "d1", name: "Cheer", valueCents: 100, iconKey: "sparkle", rarityColor: "#60a5fa", animationType: "sparkle" as const, category: "basic" },
  { id: "d2", name: "Fire", valueCents: 500, iconKey: "fire", rarityColor: "#f97316", animationType: "sparkle" as const, category: "basic" },
  { id: "d3", name: "Bomb", valueCents: 1000, iconKey: "bomb", rarityColor: "#ef4444", animationType: "explosion" as const, category: "premium" },
  { id: "d4", name: "Crown", valueCents: 5000, iconKey: "crown", rarityColor: "#eab308", animationType: "explosion" as const, category: "premium" },
];

const TOWER_UNITS: TowerUnit[] = [
  {
    unitId: "tu1",
    name: "Swordsman",
    costCents: 5,
    type: "infantry",
    counters: ["tank"],
    hp: 50,
    damage: 15,
    speed: 3,
    iconKey: "swordsman",
    spawnAnimation: "march-in",
  },
  {
    unitId: "tu2",
    name: "Archer",
    costCents: 25,
    type: "infantry",
    counters: ["air"],
    hp: 35,
    damage: 25,
    speed: 2,
    iconKey: "archer",
    spawnAnimation: "march-in",
  },
  {
    unitId: "tu3",
    name: "Shield Bearer",
    costCents: 100,
    type: "infantry",
    counters: ["infantry"],
    hp: 150,
    damage: 8,
    speed: 1,
    iconKey: "shield-bearer",
    spawnAnimation: "shield-slam",
  },
  {
    unitId: "tu4",
    name: "Tank",
    costCents: 200,
    type: "tank",
    counters: ["infantry"],
    hp: 300,
    damage: 40,
    speed: 1,
    iconKey: "tank",
    spawnAnimation: "rumble-in",
  },
  {
    unitId: "tu5",
    name: "Rocket Launcher",
    costCents: 500,
    type: "anti_air",
    counters: ["air", "tank"],
    hp: 60,
    damage: 80,
    speed: 1,
    iconKey: "rocket-launcher",
    spawnAnimation: "drop-in",
  },
  {
    unitId: "tu6",
    name: "Helicopter",
    costCents: 1000,
    type: "air",
    counters: ["tank", "infantry"],
    hp: 120,
    damage: 55,
    speed: 5,
    iconKey: "helicopter",
    spawnAnimation: "fly-in",
  },
  {
    unitId: "tu7",
    name: "Fighter Jet",
    costCents: 5000,
    type: "air",
    counters: ["tank", "infantry", "support"],
    hp: 80,
    damage: 120,
    speed: 8,
    iconKey: "fighter-jet",
    spawnAnimation: "sonic-boom",
  },
  {
    unitId: "tu8",
    name: "Commander",
    costCents: 10000,
    type: "support",
    counters: ["infantry", "anti_air"],
    hp: 200,
    damage: 30,
    speed: 2,
    iconKey: "commander",
    spawnAnimation: "rally-cry",
  },
];

/* ============================================================
   HELPERS
   ============================================================ */

function formatViewers(n: number): string {
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatTimer(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getUnitEmoji(type: string): string {
  const map: Record<string, string> = {
    infantry: "\u2694\uFE0F",
    tank: "\uD83D\uDEE1\uFE0F",
    anti_air: "\uD83D\uDE80",
    air: "\u2708\uFE0F",
    support: "\u2B50",
  };
  return map[type] || "\u2694\uFE0F";
}

const unitCategoryTabs = [
  { id: "all", label: "All" },
  { id: "infantry", label: "Infantry" },
  { id: "tank", label: "Armor" },
  { id: "air", label: "Air" },
  { id: "support", label: "Support" },
  { id: "anti_air", label: "Anti-Air" },
];

/* ============================================================
   SHARED STATE HOOK (local, mirrors battle-store shape)
   ============================================================ */

function useBattleState(room: LiveRoom, host: User) {
  const users = [host] as User[];
  const participantIds = useMemo(() => room.participants.map((p) => p.userId), [room]);

  // Scores: init random 0-500 for timer_wars, else 0
  const [scores, setScores] = useState<Record<string, number>>(() => {
    const s: Record<string, number> = {};
    participantIds.forEach((id) => {
      s[id] = room.mode === "timer_wars" ? Math.floor(Math.random() * 500) : 0;
    });
    return s;
  });

  const [round, setRound] = useState(1);
  const [eliminatedUsers, setEliminatedUsers] = useState<string[]>([]);
  const [timer, setTimer] = useState(room.roundTimeSec || 60);
  const [isTimerRunning, setIsTimerRunning] = useState(true);
  const [teamAHealth, setTeamAHealth] = useState(100);
  const [teamBHealth, setTeamBHealth] = useState(100);
  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [showSidePanel, setShowSidePanel] = useState(false);
  const [sideTab, setSideTab] = useState("gifts");
  const [banner, setBanner] = useState<string | null>(null);
  const [winner, setWinner] = useState<string | null>(null);

  const [chatMessages, setChatMessages] = useState<
    { id: string; userId: string; text: string; timestamp: number }[]
  >([]);

  // Timer countdown
  useEffect(() => {
    if (!isTimerRunning || timer <= 0) return;
    const interval = setInterval(() => setTimer((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [isTimerRunning, timer]);

  const addScore = useCallback((userId: string, points: number) => {
    setScores((prev) => ({ ...prev, [userId]: (prev[userId] ?? 0) + points }));
  }, []);

  const addChat = useCallback((userId: string, text: string) => {
    setChatMessages((prev) => [
      ...prev,
      { id: `msg-${Date.now()}-${Math.random()}`, userId, text, timestamp: Date.now() },
    ]);
  }, []);

  const showBanner = useCallback((text: string, durationMs = 3000) => {
    setBanner(text);
    setTimeout(() => setBanner(null), durationMs);
  }, []);

  // Build a userMap from host + participant data
  const userMap = useMemo(() => {
    const map = new Map<string, User>();
    map.set(host.id, host);
    return map;
  }, [host]);

  return {
    userMap,
    users,
    participantIds,
    scores,
    setScores,
    round,
    setRound,
    eliminatedUsers,
    setEliminatedUsers,
    timer,
    setTimer,
    isTimerRunning,
    setIsTimerRunning,
    teamAHealth,
    setTeamAHealth,
    teamBHealth,
    setTeamBHealth,
    showGiftPanel,
    setShowGiftPanel,
    showSidePanel,
    setShowSidePanel,
    sideTab,
    setSideTab,
    chatMessages,
    setChatMessages,
    banner,
    setBanner,
    winner,
    setWinner,
    addScore,
    addChat,
    showBanner,
  };
}

/* ============================================================
   STANDARD BATTLE MODE
   ============================================================ */

function StandardBattle({ room, host }: { room: LiveRoom; host: User }) {
  const router = useRouter();
  const state = useBattleState(room, host);
  const {
    userMap, users, participantIds, scores, round, eliminatedUsers,
    timer, showGiftPanel, setShowGiftPanel, showSidePanel, setShowSidePanel,
    sideTab, setSideTab, chatMessages, addScore, addChat,
  } = state;

  const activeParticipants = room.participants.filter(
    (p) => !eliminatedUsers.includes(p.userId)
  );

  const gridCols = useMemo(() => {
    const count = activeParticipants.length;
    if (count <= 2) return "grid-cols-1 sm:grid-cols-2";
    if (count <= 4) return "grid-cols-2";
    if (count <= 6) return "grid-cols-2 lg:grid-cols-3";
    return "grid-cols-2 lg:grid-cols-4";
  }, [activeParticipants.length]);

  const handleGiftSelect = useCallback(
    (tier: DonationTier) => {
      const active = activeParticipants.filter((p) => !eliminatedUsers.includes(p.userId));
      if (active.length === 0) return;
      const target = active[Math.floor(Math.random() * active.length)];
      const user = userMap.get(target.userId);
      addScore(target.userId, tier.valueCents);
      addChat("system", `sent a ${tier.name} to ${user?.displayName || "someone"}!`);
      setShowGiftPanel(false);
    },
    [activeParticipants, eliminatedUsers, userMap, addScore, addChat, setShowGiftPanel]
  );

  const handleSendChat = useCallback(
    (text: string) => addChat("system", text),
    [addChat]
  );

  const handleShare = useCallback(() => {
    if (navigator.share) {
      navigator.share({ title: room.title, url: window.location.href });
    } else {
      navigator.clipboard.writeText(window.location.href);
    }
  }, [room.title]);

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-bg-surface border-b border-border shrink-0">
        <h1 className="text-sm font-semibold text-text truncate max-w-[40%]">
          {room.title}
        </h1>
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <Eye size={14} />
          {formatViewers(room.viewerCount)}
        </div>
        <div className="flex items-center gap-2">
          {room.roundTimeSec > 0 && (
            <span className="text-sm font-mono font-semibold text-text">
              {formatTimer(timer)}
            </span>
          )}
          <Button
            variant="danger"
            size="sm"
            icon={<LogOut size={14} />}
            onClick={() => router.push("/live")}
          >
            Leave
          </Button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Center: participant grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className={`grid ${gridCols} gap-4`}>
            {activeParticipants.map((p) => {
              const user = userMap.get(p.userId);
              if (!user) return null;
              return (
                <ParticipantBox
                  key={p.userId}
                  participant={p}
                  user={user}
                  score={scores[p.userId] ?? 0}
                  isEliminated={eliminatedUsers.includes(p.userId)}
                />
              );
            })}
          </div>
        </div>

        {/* Desktop right panel */}
        <div className="hidden lg:flex flex-col w-80 border-l border-border bg-bg-surface shrink-0">
          <Tabs
            tabs={[
              { id: "gifts", label: "Gifts" },
              { id: "leaderboard", label: "Leaderboard" },
              { id: "chat", label: "Chat" },
            ]}
            activeTab={sideTab}
            onChange={setSideTab}
          />
          <div className="flex-1 overflow-y-auto p-3">
            {sideTab === "gifts" && (
              <GiftPanel tiers={DONATION_TIERS} onSelect={handleGiftSelect} />
            )}
            {sideTab === "leaderboard" && (
              <LeaderboardPanel scores={scores} users={users} />
            )}
            {sideTab === "chat" && (
              <div className="h-full">
                <ChatPanel messages={chatMessages} onSend={handleSendChat} users={users} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-bg-surface border-t border-border shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="lg:hidden"
          onClick={() => {
            setSideTab("chat");
            setShowSidePanel(true);
          }}
        >
          Chat
        </Button>
        <DonateButton onClick={() => setShowGiftPanel(true)} />
        <Button variant="ghost" size="sm" icon={<Share2 size={14} />} onClick={handleShare}>
          Share
        </Button>
      </div>

      {/* Mobile gift drawer */}
      <Drawer
        isOpen={showGiftPanel}
        onClose={() => setShowGiftPanel(false)}
        title="Send a Gift"
        side="bottom"
      >
        <GiftPanel tiers={DONATION_TIERS} onSelect={handleGiftSelect} />
      </Drawer>

      {/* Mobile side panel drawer */}
      <Drawer
        isOpen={showSidePanel}
        onClose={() => setShowSidePanel(false)}
        title={sideTab === "chat" ? "Chat" : sideTab === "leaderboard" ? "Leaderboard" : "Gifts"}
        side="bottom"
      >
        <div className="mb-3">
          <Tabs
            tabs={[
              { id: "gifts", label: "Gifts" },
              { id: "leaderboard", label: "Leaderboard" },
              { id: "chat", label: "Chat" },
            ]}
            activeTab={sideTab}
            onChange={setSideTab}
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {sideTab === "gifts" && (
            <GiftPanel tiers={DONATION_TIERS} onSelect={handleGiftSelect} />
          )}
          {sideTab === "leaderboard" && (
            <LeaderboardPanel scores={scores} users={users} />
          )}
          {sideTab === "chat" && (
            <div className="h-80">
              <ChatPanel messages={chatMessages} onSend={handleSendChat} users={users} />
            </div>
          )}
        </div>
      </Drawer>
    </div>
  );
}

/* ============================================================
   TIMER WARS BATTLE MODE
   ============================================================ */

function TimerWarsBattle({ room, host }: { room: LiveRoom; host: User }) {
  const router = useRouter();
  const state = useBattleState(room, host);
  const {
    userMap, users, participantIds, scores, setScores, round, setRound,
    eliminatedUsers, setEliminatedUsers, timer, setTimer, isTimerRunning, setIsTimerRunning,
    showGiftPanel, setShowGiftPanel, showSidePanel, setShowSidePanel,
    sideTab, setSideTab, chatMessages, addScore, addChat, banner, showBanner, winner, setWinner,
  } = state;

  const hostId = room.hostId;

  const activeParticipants = useMemo(
    () => room.participants.filter((p) => !eliminatedUsers.includes(p.userId)),
    [room.participants, eliminatedUsers]
  );

  const nonHostActive = useMemo(
    () => activeParticipants.filter((p) => p.userId !== hostId),
    [activeParticipants, hostId]
  );

  const gridCols = useMemo(() => {
    const count = activeParticipants.length;
    if (count <= 2) return "grid-cols-1 sm:grid-cols-2";
    if (count <= 4) return "grid-cols-2";
    if (count <= 6) return "grid-cols-2 lg:grid-cols-3";
    return "grid-cols-2 lg:grid-cols-4";
  }, [activeParticipants.length]);

  // Timer color
  const timerColor = timer > 30 ? "text-success" : timer > 10 ? "text-warning" : "text-danger";

  // Handle round end when timer hits 0
  const roundEndHandled = useRef(false);

  useEffect(() => {
    if (timer > 0 || roundEndHandled.current || winner) return;
    roundEndHandled.current = true;

    // Find lowest scorer among non-host active
    const candidates = nonHostActive.map((p) => ({
      userId: p.userId,
      score: scores[p.userId] ?? 0,
    }));

    if (candidates.length === 0) return;

    candidates.sort((a, b) => a.score - b.score);
    const lowestScore = candidates[0].score;
    const tied = candidates.filter((c) => c.score === lowestScore);

    if (tied.length > 1 && candidates.length > 1) {
      // Sudden death
      showBanner("SUDDEN DEATH - 30 SECONDS", 4000);
      setTimer(30);
      setIsTimerRunning(true);
      roundEndHandled.current = false;
      return;
    }

    const eliminatedId = candidates[0].userId;
    const eliminatedUser = userMap.get(eliminatedId);

    setEliminatedUsers((prev) => [...prev, eliminatedId]);
    showBanner(`ELIMINATED: ${eliminatedUser?.displayName || eliminatedId}`, 3000);
    addChat("system", `${eliminatedUser?.displayName || eliminatedId} has been eliminated!`);

    // Check remaining
    const remainingNonHost = nonHostActive.filter((p) => p.userId !== eliminatedId);

    if (remainingNonHost.length <= 1) {
      // Winner
      const winnerId = remainingNonHost.length === 1 ? remainingNonHost[0].userId : hostId;
      const winUser = userMap.get(winnerId);
      setTimeout(() => {
        setWinner(winnerId);
        showBanner(`WINNER: ${winUser?.displayName || winnerId}!`, 10000);
      }, 3500);
    } else if (remainingNonHost.length === 2) {
      setTimeout(() => {
        showBanner("FINAL ROUND", 3000);
        setRound((r) => r + 1);
        setTimer(room.roundTimeSec || 60);
        setIsTimerRunning(true);
        roundEndHandled.current = false;
      }, 3500);
    } else {
      setTimeout(() => {
        setRound((r) => r + 1);
        setTimer(room.roundTimeSec || 60);
        setIsTimerRunning(true);
        roundEndHandled.current = false;
      }, 3500);
    }
  }, [
    timer, nonHostActive, scores, winner, userMap, hostId,
    showBanner, setTimer, setIsTimerRunning, setEliminatedUsers, setRound, addChat, setWinner, room.roundTimeSec,
  ]);

  const handleGiftSelect = useCallback(
    (tier: DonationTier) => {
      const active = activeParticipants.filter((p) => !eliminatedUsers.includes(p.userId));
      if (active.length === 0) return;
      const target = active[Math.floor(Math.random() * active.length)];
      const user = userMap.get(target.userId);
      addScore(target.userId, tier.valueCents);
      addChat("system", `sent a ${tier.name} to ${user?.displayName || "someone"}!`);
      setShowGiftPanel(false);
    },
    [activeParticipants, eliminatedUsers, userMap, addScore, addChat, setShowGiftPanel]
  );

  const handleSendChat = useCallback(
    (text: string) => addChat("system", text),
    [addChat]
  );

  const handleShare = useCallback(() => {
    if (navigator.share) {
      navigator.share({ title: room.title, url: window.location.href });
    } else {
      navigator.clipboard.writeText(window.location.href);
    }
  }, [room.title]);

  // Max score for progress bars
  const maxScore = useMemo(() => Math.max(1, ...Object.values(scores)), [scores]);

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-bg-surface border-b border-border shrink-0">
        <h1 className="text-sm font-semibold text-text truncate max-w-[30%]">
          {room.title}
        </h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <Eye size={14} />
            {formatViewers(room.viewerCount)}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <Users size={14} />
            {nonHostActive.length + 1} remaining
          </div>
        </div>
        <Button
          variant="danger"
          size="sm"
          icon={<LogOut size={14} />}
          onClick={() => router.push("/live")}
        >
          Leave
        </Button>
      </div>

      {/* Round banner */}
      <div className="bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 border-b border-border py-2 text-center shrink-0">
        <span className="text-xs uppercase font-bold tracking-widest text-text-secondary">
          {winner ? "BATTLE COMPLETE" : nonHostActive.length <= 2 ? "FINAL ROUND" : `ROUND ${round}`}
        </span>
      </div>

      {/* Timer */}
      {!winner && (
        <div className="flex justify-center py-4 shrink-0">
          <div className="flex flex-col items-center">
            <Timer size={20} className={cn(timerColor, "mb-1")} />
            <span className={cn("text-4xl sm:text-5xl font-mono font-bold tracking-wider", timerColor)}>
              {formatTimer(timer)}
            </span>
          </div>
        </div>
      )}

      {/* Banner overlay */}
      {banner && (
        <div className="fixed inset-x-0 top-1/3 z-50 flex justify-center pointer-events-none">
          <div
            className={cn(
              "px-8 py-4 rounded-2xl text-white text-xl sm:text-2xl font-black tracking-wider uppercase",
              "animate-pulse",
              banner.includes("WINNER")
                ? "bg-gradient-to-r from-warning to-success shadow-lg shadow-success/40"
                : banner.includes("ELIMINATED")
                  ? "bg-danger/90 shadow-lg shadow-danger/40"
                  : banner.includes("SUDDEN")
                    ? "bg-warning/90 shadow-lg shadow-warning/40"
                    : "bg-gradient-to-r from-primary to-accent shadow-lg shadow-primary/40"
            )}
          >
            {banner}
          </div>
        </div>
      )}

      {/* Winner celebration */}
      {winner && (
        <div className="flex flex-col items-center py-8 shrink-0">
          <Crown size={48} className="text-warning mb-3" />
          <span className="text-2xl font-black text-text">
            {userMap.get(winner)?.displayName || winner}
          </span>
          <span className="text-sm text-text-secondary mt-1">Champion!</span>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Participant grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className={`grid ${gridCols} gap-4`}>
            {room.participants.map((p) => {
              const user = userMap.get(p.userId);
              if (!user) return null;
              const isHost = p.userId === hostId;
              const isElim = eliminatedUsers.includes(p.userId);
              const score = scores[p.userId] ?? 0;

              return (
                <div key={p.userId} className="relative">
                  <ParticipantBox
                    participant={p}
                    user={user}
                    score={score}
                    isEliminated={isElim}
                  />
                  {/* Host crown overlay */}
                  {isHost && (
                    <div className="absolute top-2 left-2 z-10 flex items-center gap-1">
                      <Crown size={16} className="text-warning" />
                      <Badge variant="premium">Host</Badge>
                    </div>
                  )}
                  {/* Score progress bar overlaid at bottom of video area */}
                  {!isElim && (
                    <div className="absolute bottom-[68px] left-0 right-0 px-3">
                      <div className="w-full h-2 bg-bg-surface2/80 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all duration-700"
                          style={{ width: `${Math.min(100, (score / maxScore) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Desktop right panel */}
        <div className="hidden lg:flex flex-col w-80 border-l border-border bg-bg-surface shrink-0">
          <Tabs
            tabs={[
              { id: "gifts", label: "Gifts" },
              { id: "leaderboard", label: "Leaderboard" },
              { id: "chat", label: "Chat" },
            ]}
            activeTab={sideTab}
            onChange={setSideTab}
          />
          <div className="flex-1 overflow-y-auto p-3">
            {sideTab === "gifts" && (
              <GiftPanel tiers={DONATION_TIERS} onSelect={handleGiftSelect} />
            )}
            {sideTab === "leaderboard" && (
              <LeaderboardPanel scores={scores} users={users} />
            )}
            {sideTab === "chat" && (
              <div className="h-full">
                <ChatPanel messages={chatMessages} onSend={handleSendChat} users={users} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-bg-surface border-t border-border shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="lg:hidden"
          onClick={() => {
            setSideTab("chat");
            setShowSidePanel(true);
          }}
        >
          Chat
        </Button>
        <DonateButton onClick={() => setShowGiftPanel(true)} />
        <Button variant="ghost" size="sm" icon={<Share2 size={14} />} onClick={handleShare}>
          Share
        </Button>
      </div>

      {/* Mobile drawers */}
      <Drawer
        isOpen={showGiftPanel}
        onClose={() => setShowGiftPanel(false)}
        title="Send a Gift"
        side="bottom"
      >
        <GiftPanel tiers={DONATION_TIERS} onSelect={handleGiftSelect} />
      </Drawer>

      <Drawer
        isOpen={showSidePanel}
        onClose={() => setShowSidePanel(false)}
        title={sideTab === "chat" ? "Chat" : sideTab === "leaderboard" ? "Leaderboard" : "Gifts"}
        side="bottom"
      >
        <div className="mb-3">
          <Tabs
            tabs={[
              { id: "gifts", label: "Gifts" },
              { id: "leaderboard", label: "Leaderboard" },
              { id: "chat", label: "Chat" },
            ]}
            activeTab={sideTab}
            onChange={setSideTab}
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {sideTab === "gifts" && (
            <GiftPanel tiers={DONATION_TIERS} onSelect={handleGiftSelect} />
          )}
          {sideTab === "leaderboard" && (
            <LeaderboardPanel scores={scores} users={users} />
          )}
          {sideTab === "chat" && (
            <div className="h-80">
              <ChatPanel messages={chatMessages} onSend={handleSendChat} users={users} />
            </div>
          )}
        </div>
      </Drawer>
    </div>
  );
}

/* ============================================================
   BATTLEFIELD CANVAS (DOM-based)
   ============================================================ */

interface SpawnedUnit {
  id: string;
  team: "A" | "B";
  unit: TowerUnit;
  position: number;
}

function BattlefieldCanvas({
  unitsA,
  unitsB,
  teamAHp,
  teamBHp,
}: {
  unitsA: SpawnedUnit[];
  unitsB: SpawnedUnit[];
  teamAHp: number;
  teamBHp: number;
}) {
  return (
    <div className="relative h-48 bg-bg-surface rounded-xl overflow-hidden border border-border">
      {/* Lane lines */}
      <div className="absolute inset-x-20 top-1/2 h-px bg-border/30" />
      <div className="absolute inset-x-20 top-[35%] h-px bg-border/10" />
      <div className="absolute inset-x-20 top-[65%] h-px bg-border/10" />

      {/* Team A Base */}
      <div className="absolute left-2 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 z-10">
        <div className="w-12 h-16 bg-primary/30 rounded border-2 border-primary flex items-center justify-center">
          <Shield className="w-6 h-6 text-primary" />
        </div>
        <div className="w-16 h-2 bg-bg-surface2 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${teamAHp}%` }}
          />
        </div>
        <span className="text-[10px] font-bold text-primary">{teamAHp}%</span>
      </div>

      {/* Marching units */}
      <div className="absolute inset-x-20 top-0 bottom-0">
        {unitsA.map((u) => (
          <div
            key={u.id}
            className="absolute transition-all duration-1000 ease-linear"
            style={{ left: `${u.position}%`, top: "35%" }}
          >
            <span className="text-2xl drop-shadow-lg">{getUnitEmoji(u.unit.type)}</span>
          </div>
        ))}
        {unitsB.map((u) => (
          <div
            key={u.id}
            className="absolute transition-all duration-1000 ease-linear"
            style={{ right: `${u.position}%`, top: "55%" }}
          >
            <span className="text-2xl drop-shadow-lg">{getUnitEmoji(u.unit.type)}</span>
          </div>
        ))}
      </div>

      {/* Team B Base */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 z-10">
        <div className="w-12 h-16 bg-accent/30 rounded border-2 border-accent flex items-center justify-center">
          <Shield className="w-6 h-6 text-accent" />
        </div>
        <div className="w-16 h-2 bg-bg-surface2 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-500"
            style={{ width: `${teamBHp}%` }}
          />
        </div>
        <span className="text-[10px] font-bold text-accent">{teamBHp}%</span>
      </div>

      {/* Labels */}
      <div className="absolute top-1 left-2 text-[10px] font-semibold text-primary uppercase tracking-wider">
        Team A
      </div>
      <div className="absolute top-1 right-2 text-[10px] font-semibold text-accent uppercase tracking-wider">
        Team B
      </div>
    </div>
  );
}

/* ============================================================
   UNIT SHOP CARD
   ============================================================ */

function UnitShopCard({
  unit,
  onBuy,
}: {
  unit: TowerUnit;
  onBuy: (unit: TowerUnit) => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => onBuy(unit)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="
          w-full flex flex-col items-center gap-1.5 p-3
          bg-bg-surface2 rounded-xl border border-transparent
          hover:border-primary hover:bg-bg-surface3
          transition-all duration-200 active:scale-95
        "
      >
        <span className="text-3xl">{getUnitEmoji(unit.type)}</span>
        <span className="text-xs font-medium text-text truncate w-full text-center">
          {unit.name}
        </span>
        <span className="text-[10px] font-semibold text-accent">
          {formatCurrency(unit.costCents)}
        </span>
        <div className="flex gap-1 text-[9px] text-text-muted">
          <span>HP:{unit.hp}</span>
          <span>DMG:{unit.damage}</span>
        </div>
      </button>
      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-44 p-2 bg-bg-surface3 border border-border rounded-lg shadow-lg text-xs">
          <p className="font-semibold text-text mb-1">{unit.name}</p>
          <p className="text-text-muted mb-1">
            Type: <span className="text-text-secondary capitalize">{unit.type.replace("_", " ")}</span>
          </p>
          <p className="text-text-muted mb-1">
            Speed: {unit.speed} | HP: {unit.hp} | DMG: {unit.damage}
          </p>
          {unit.counters.length > 0 && (
            <p className="text-success">
              Counters: {unit.counters.map((c) => c.replace("_", " ")).join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   TOWER WARS BATTLE MODE
   ============================================================ */

function TowerWarsBattle({ room, host }: { room: LiveRoom; host: User }) {
  const router = useRouter();
  const users = [host] as User[];
  const userMap = useMemo(() => {
    const map = new Map<string, User>();
    map.set(host.id, host);
    return map;
  }, [host]);

  const [teamAHealth, setTeamAHealth] = useState(100);
  const [teamBHealth, setTeamBHealth] = useState(100);
  const [spawnedUnits, setSpawnedUnits] = useState<SpawnedUnit[]>([]);
  const [showShopDrawer, setShowShopDrawer] = useState(false);
  const [shopCategory, setShopCategory] = useState("all");
  const [winner, setWinner] = useState<"A" | "B" | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [chatMessages, setChatMessages] = useState<
    { id: string; userId: string; text: string; timestamp: number }[]
  >([
    { id: "tw-1", userId: "system", text: "Tower Wars begin!", timestamp: Date.now() - 5000 },
  ]);
  const [sideTab, setSideTab] = useState("shop");
  const unitIdCounter = useRef(0);

  // Determine teams
  const teamA = useMemo(
    () => room.participants.filter((p) => p.userId === room.hostId),
    [room]
  );
  const teamB = useMemo(
    () => room.participants.filter((p) => p.userId !== room.hostId),
    [room]
  );

  const unitsA = useMemo(
    () => spawnedUnits.filter((u) => u.team === "A"),
    [spawnedUnits]
  );
  const unitsB = useMemo(
    () => spawnedUnits.filter((u) => u.team === "B"),
    [spawnedUnits]
  );

  // Filtered shop units
  const filteredUnits = useMemo(
    () =>
      shopCategory === "all"
        ? TOWER_UNITS
        : TOWER_UNITS.filter((u) => u.type === shopCategory),
    [shopCategory]
  );

  const addChat = useCallback((userId: string, text: string) => {
    setChatMessages((prev) => [
      ...prev,
      { id: `msg-${Date.now()}-${Math.random()}`, userId, text, timestamp: Date.now() },
    ]);
  }, []);

  // Spawn a unit
  const spawnUnit = useCallback(
    (team: "A" | "B", unit: TowerUnit) => {
      const id = `unit-${++unitIdCounter.current}`;
      setSpawnedUnits((prev) => [...prev, { id, team, unit, position: 0 }]);
      addChat("system", `Team ${team} spawned a ${unit.name}!`);
    },
    [addChat]
  );

  const handleBuyUnit = useCallback(
    (unit: TowerUnit) => {
      // Alternate: user purchases for Team A (simulated)
      spawnUnit("A", unit);
      setShowShopDrawer(false);
    },
    [spawnUnit, setShowShopDrawer]
  );

  // Auto-simulate: move units, check collisions, damage bases
  useEffect(() => {
    if (winner) return;

    const interval = setInterval(() => {
      setSpawnedUnits((prev) => {
        let updated = prev.map((u) => ({
          ...u,
          position: u.position + u.unit.speed * 2,
        }));

        // Check A units reaching B base (position > 90)
        const aReached = updated.filter((u) => u.team === "A" && u.position >= 90);
        const bReached = updated.filter((u) => u.team === "B" && u.position >= 90);

        if (aReached.length > 0) {
          const totalDmg = aReached.reduce((sum, u) => sum + u.unit.damage / 10, 0);
          setTeamBHealth((hp) => Math.max(0, Math.round(hp - totalDmg)));
        }
        if (bReached.length > 0) {
          const totalDmg = bReached.reduce((sum, u) => sum + u.unit.damage / 10, 0);
          setTeamAHealth((hp) => Math.max(0, Math.round(hp - totalDmg)));
        }

        // Remove units that passed through
        updated = updated.filter((u) => u.position < 95);

        // Simple collision: if A unit and B unit overlap (positions sum > 85), check counter
        const aUnits = updated.filter((u) => u.team === "A");
        const bUnits = updated.filter((u) => u.team === "B");
        const toRemove = new Set<string>();

        for (const a of aUnits) {
          for (const b of bUnits) {
            if (a.position + b.position > 80 && !toRemove.has(a.id) && !toRemove.has(b.id)) {
              // Check if A counters B
              if (a.unit.counters.includes(b.unit.type)) {
                toRemove.add(b.id);
              } else if (b.unit.counters.includes(a.unit.type)) {
                toRemove.add(a.id);
              } else {
                // Both destroyed on collision
                toRemove.add(a.id);
                toRemove.add(b.id);
              }
            }
          }
        }

        return updated.filter((u) => !toRemove.has(u.id));
      });
    }, 500);

    return () => clearInterval(interval);
  }, [winner]);

  // Check win condition
  useEffect(() => {
    if (teamAHealth <= 0 && !winner) {
      setWinner("B");
    } else if (teamBHealth <= 0 && !winner) {
      setWinner("A");
    }
  }, [teamAHealth, teamBHealth, winner]);

  const handleShare = useCallback(() => {
    if (navigator.share) {
      navigator.share({ title: room.title, url: window.location.href });
    } else {
      navigator.clipboard.writeText(window.location.href);
    }
  }, [room.title]);

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Top scoreboard */}
      <div className="flex items-center justify-between px-4 py-3 bg-bg-surface border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-primary" />
          <span className="text-sm font-bold text-primary">TEAM A</span>
          <span className="text-lg font-mono font-bold text-text">{teamAHealth}%</span>
        </div>
        <div className="flex items-center gap-2">
          <Swords size={18} className="text-text-muted" />
          <span className="text-xs text-text-muted uppercase font-bold tracking-wider">VS</span>
          <Swords size={18} className="text-text-muted" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-mono font-bold text-text">{teamBHealth}%</span>
          <span className="text-sm font-bold text-accent">TEAM B</span>
          <div className="w-3 h-3 rounded-full bg-accent" />
        </div>
      </div>

      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-bg-surface border-b border-border shrink-0">
        <h1 className="text-xs font-semibold text-text truncate max-w-[40%]">{room.title}</h1>
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <Eye size={12} />
          {formatViewers(room.viewerCount)}
        </div>
        <Button
          variant="danger"
          size="sm"
          icon={<LogOut size={14} />}
          onClick={() => router.push("/live")}
        >
          Leave
        </Button>
      </div>

      {/* Winner banner */}
      {winner && (
        <div className="bg-gradient-to-r from-warning/20 to-success/20 py-4 text-center shrink-0">
          <Crown size={32} className="text-warning mx-auto mb-2" />
          <span className="text-xl font-black text-text">
            TEAM {winner} WINS!
          </span>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-y-auto p-4 gap-4">
          {/* Participants */}
          <div className="grid grid-cols-2 gap-4">
            {/* Team A */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-primary" />
                <span className="text-xs font-bold text-primary uppercase">Team A</span>
              </div>
              {teamA.map((p) => {
                const user = userMap.get(p.userId);
                if (!user) return null;
                return (
                  <ParticipantBox
                    key={p.userId}
                    participant={p}
                    user={user}
                    score={scores[p.userId] ?? 0}
                  />
                );
              })}
            </div>
            {/* Team B */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-accent" />
                <span className="text-xs font-bold text-accent uppercase">Team B</span>
              </div>
              {teamB.map((p) => {
                const user = userMap.get(p.userId);
                if (!user) return null;
                return (
                  <ParticipantBox
                    key={p.userId}
                    participant={p}
                    user={user}
                    score={scores[p.userId] ?? 0}
                  />
                );
              })}
            </div>
          </div>

          {/* Battlefield */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Swords size={14} className="text-text-muted" />
              <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                Battlefield
              </span>
            </div>
            <BattlefieldCanvas
              unitsA={unitsA}
              unitsB={unitsB}
              teamAHp={teamAHealth}
              teamBHp={teamBHealth}
            />
          </div>
        </div>

        {/* Desktop right panel: unit shop + chat */}
        <div className="hidden lg:flex flex-col w-80 border-l border-border bg-bg-surface shrink-0">
          <Tabs
            tabs={[
              { id: "shop", label: "Unit Shop" },
              { id: "chat", label: "Chat" },
            ]}
            activeTab={sideTab}
            onChange={setSideTab}
          />
          {sideTab === "shop" ? (
            <div className="flex-1 overflow-y-auto">
              {/* Category filter */}
              <div className="flex gap-1 px-3 py-2 overflow-x-auto no-scrollbar">
                {unitCategoryTabs.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setShopCategory(cat.id)}
                    className={cn(
                      "px-2.5 py-1 text-[10px] font-semibold rounded-full whitespace-nowrap transition-colors",
                      shopCategory === cat.id
                        ? "bg-primary text-white"
                        : "bg-bg-surface2 text-text-muted hover:text-text-secondary"
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
              {/* Unit grid */}
              <div className="grid grid-cols-2 gap-2 p-3">
                {filteredUnits.map((unit) => (
                  <UnitShopCard key={unit.unitId} unit={unit} onBuy={handleBuyUnit} />
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden">
              <ChatPanel
                messages={chatMessages}
                onSend={(text) => addChat("system", text)}
                users={users}
              />
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-bg-surface border-t border-border shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="lg:hidden"
          icon={<ShoppingCart size={14} />}
          onClick={() => setShowShopDrawer(true)}
        >
          Shop
        </Button>
        <DonateButton onClick={() => setShowShopDrawer(true)} />
        <Button variant="ghost" size="sm" icon={<Share2 size={14} />} onClick={handleShare}>
          Share
        </Button>
      </div>

      {/* Mobile shop drawer */}
      <Drawer
        isOpen={showShopDrawer}
        onClose={() => setShowShopDrawer(false)}
        title="Unit Shop"
        side="bottom"
      >
        <div className="flex gap-1.5 mb-3 overflow-x-auto no-scrollbar">
          {unitCategoryTabs.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setShopCategory(cat.id)}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap transition-colors",
                shopCategory === cat.id
                  ? "bg-primary text-white"
                  : "bg-bg-surface2 text-text-muted hover:text-text-secondary"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {filteredUnits.map((unit) => (
            <UnitShopCard key={unit.unitId} unit={unit} onBuy={handleBuyUnit} />
          ))}
        </div>
      </Drawer>
    </div>
  );
}

/* ============================================================
   NOT FOUND
   ============================================================ */

function NotFound() {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-64px)] bg-bg">
      <Swords size={48} className="text-text-muted mb-4" />
      <h1 className="text-xl font-bold text-text mb-2">Battle room not found</h1>
      <p className="text-text-secondary mb-4">This battle doesn&apos;t exist or has ended.</p>
      <Button variant="primary" onClick={() => router.push("/live")}>
        Browse Live Rooms
      </Button>
    </div>
  );
}

/* ============================================================
   LOADING STATE
   ============================================================ */

function LoadingState() {
  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      <div className="flex items-center justify-between px-4 py-3 bg-bg-surface border-b border-border shrink-0">
        <div className="h-4 w-32 bg-bg-surface2 rounded animate-pulse" />
        <div className="h-4 w-16 bg-bg-surface2 rounded animate-pulse" />
        <div className="h-8 w-20 bg-bg-surface2 rounded animate-pulse" />
      </div>
      <div className="flex-1 p-4">
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="aspect-video bg-bg-surface2 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   MAIN PAGE EXPORT
   ============================================================ */

export default function BattleRoomPage() {
  const params = useParams();
  const roomId = params.id as string;

  const [room, setRoom] = useState<(LiveRoom & { host: User }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await api.live.get(roomId) as { stream: LiveRoom & { host: User } };
        if (!cancelled) {
          if (!res.stream) {
            setNotFound(true);
          } else {
            setRoom(res.stream);
          }
        }
      } catch (err) {
        console.error("Failed to load battle room:", err);
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [roomId]);

  if (loading) return <LoadingState />;
  if (notFound || !room) return <NotFound />;

  switch (room.mode) {
    case "standard":
      return <StandardBattle room={room} host={room.host} />;
    case "timer_wars":
      return <TimerWarsBattle room={room} host={room.host} />;
    case "tower_wars":
      return <TowerWarsBattle room={room} host={room.host} />;
    case "trivia":
      return <TriviaBattle room={room} host={room.host} />;
    case "auction":
      return <AuctionBattle room={room} host={room.host} />;
    case "spin_wheel":
      return <SpinWheelBattle room={room} host={room.host} />;
    case "last_standing":
      return <LastStandingBattle room={room} host={room.host} />;
    default:
      return <StandardBattle room={room} host={room.host} />;
  }
}

/* ============================================================
   NEW GAME MODE COMPONENTS
   ============================================================ */

function TriviaBattle({ room, host }: { room: LiveRoom & { host: User }; host: User }) {
  const { gameState, setGameState, setConnected } = useGameStore();
  const { currentUser } = useAuthStore();
  const { scores, round, timer, chatMessages, users } = useBattleState(room, host);
  const sseRef = useRef<SSEClient | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    const sse = new SSEClient({
      url: `/api/live/${room.id}/game/state?userId=${currentUser.id}`,
      onMessage: (event, data) => {
        if (event === "game-state") setGameState(data as GameState);
      },
      onOpen: () => setConnected(true),
      onClose: () => setConnected(false),
    });
    sse.connect();
    sseRef.current = sse;
    return () => sse.disconnect();
  }, [room.id, currentUser?.id]);

  const question = gameState?.data?.questions
    ? (gameState.data.questions as Array<{ text: string; options: string[] }>)[(gameState.data.questionIndex as number) || 0]
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-bg-base">
      <div className="p-4 bg-bg-surface border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HelpCircle size={20} className="text-primary" />
          <h1 className="text-lg font-bold text-text">{room.title}</h1>
          <Badge variant="live">TRIVIA</Badge>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-text-secondary">Round {gameState?.round || round}/{gameState?.maxRounds || 5}</span>
          <span className="text-sm font-bold text-danger">{formatTimer(Math.ceil(gameState?.timeRemaining ?? timer))}</span>
        </div>
      </div>

      <div className="flex-1 p-4 space-y-4">
        {question && (
          <Card padding="lg" className="text-center">
            <h2 className="text-xl font-bold text-text mb-6">{question.text}</h2>
            <div className="grid grid-cols-2 gap-3">
              {question.options.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    if (!currentUser) return;
                    fetch(`/api/live/${room.id}/game/action`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      credentials: "include",
                      body: JSON.stringify({ action: "answer", payload: { answerIndex: idx } }),
                    });
                  }}
                  className="p-4 rounded-xl border border-border bg-bg-surface2 hover:border-primary hover:bg-primary/10 transition-colors text-left"
                >
                  <span className="text-sm font-medium text-primary mr-2">{String.fromCharCode(65 + idx)}.</span>
                  <span className="text-sm text-text">{option}</span>
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* Leaderboard */}
        <Card padding="md">
          <h3 className="text-sm font-semibold text-text mb-3 flex items-center gap-2">
            <Trophy size={14} className="text-warning" /> Leaderboard
          </h3>
          <div className="space-y-2">
            {Object.values(gameState?.players || {})
              .sort((a, b) => b.score - a.score)
              .map((player, idx) => (
                <div key={player.userId} className="flex items-center justify-between p-2 bg-bg-surface2 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-text-muted w-5">{idx + 1}</span>
                    <span className="text-sm font-medium text-text">{player.displayName}</span>
                  </div>
                  <span className="text-sm font-bold text-primary">{player.score} pts</span>
                </div>
              ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function AuctionBattle({ room, host }: { room: LiveRoom & { host: User }; host: User }) {
  const { gameState, setGameState, setConnected } = useGameStore();
  const { currentUser } = useAuthStore();
  const { timer, chatMessages, users } = useBattleState(room, host);
  const sseRef = useRef<SSEClient | null>(null);
  const [bidAmount, setBidAmount] = useState("");

  useEffect(() => {
    if (!currentUser) return;
    const sse = new SSEClient({
      url: `/api/live/${room.id}/game/state?userId=${currentUser.id}`,
      onMessage: (event, data) => {
        if (event === "game-state") setGameState(data as GameState);
      },
      onOpen: () => setConnected(true),
      onClose: () => setConnected(false),
    });
    sse.connect();
    sseRef.current = sse;
    return () => sse.disconnect();
  }, [room.id, currentUser?.id]);

  const currentItem = gameState?.data?.items
    ? (gameState.data.items as Array<{ name: string; description: string }>)[(gameState.data.itemIndex as number) || 0]
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-bg-base">
      <div className="p-4 bg-bg-surface border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Gavel size={20} className="text-warning" />
          <h1 className="text-lg font-bold text-text">{room.title}</h1>
          <Badge variant="live">AUCTION</Badge>
        </div>
        <span className="text-sm font-bold text-danger">{formatTimer(Math.ceil(gameState?.timeRemaining ?? timer))}</span>
      </div>

      <div className="flex-1 p-4 space-y-4">
        {currentItem && (
          <Card padding="lg" className="text-center">
            <h2 className="text-xl font-bold text-text mb-2">{currentItem.name}</h2>
            <p className="text-sm text-text-secondary mb-4">{currentItem.description}</p>
            <div className="text-3xl font-bold text-success mb-4">
              {(gameState?.data?.highBid as number) || 0} credits
            </div>
            <p className="text-xs text-text-muted mb-4">
              {gameState?.data?.highBidder
                ? `Highest bidder: ${gameState.players[(gameState.data.highBidder as string)]?.displayName || "Unknown"}`
                : "No bids yet"}
            </p>
            <div className="flex gap-2 max-w-sm mx-auto">
              <input
                type="number"
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                placeholder="Your bid..."
                className="flex-1 bg-bg-surface2 text-text text-sm rounded-lg px-3 py-2 border border-border focus:outline-none focus:border-primary"
              />
              <Button
                variant="gradient"
                size="sm"
                onClick={() => {
                  const amount = parseInt(bidAmount);
                  if (!amount || !currentUser) return;
                  fetch(`/api/live/${room.id}/game/action`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ action: "bid", payload: { amount } }),
                  });
                  setBidAmount("");
                }}
              >
                Bid
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function SpinWheelBattle({ room, host }: { room: LiveRoom & { host: User }; host: User }) {
  const { gameState, setGameState, setConnected } = useGameStore();
  const { currentUser } = useAuthStore();
  const { timer } = useBattleState(room, host);
  const sseRef = useRef<SSEClient | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!currentUser) return;
    const sse = new SSEClient({
      url: `/api/live/${room.id}/game/state?userId=${currentUser.id}`,
      onMessage: (event, data) => {
        if (event === "game-state") setGameState(data as GameState);
      },
      onOpen: () => setConnected(true),
      onClose: () => setConnected(false),
    });
    sse.connect();
    sseRef.current = sse;
    return () => sse.disconnect();
  }, [room.id, currentUser?.id]);

  // Draw wheel
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const segments = (gameState?.data?.segments as Array<{ label: string; color: string }>) || [
      { label: "2x", color: "#8B5CF6" },
      { label: "Bankrupt", color: "#EF4444" },
      { label: "5x", color: "#10B981" },
      { label: "1x", color: "#06B6D4" },
      { label: "3x", color: "#F59E0B" },
      { label: "10x!", color: "#EC4899" },
      { label: "1x", color: "#3B82F6" },
      { label: "2x", color: "#8B5CF6" },
    ];

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = Math.min(cx, cy) - 10;
    const angle = ((gameState?.data?.currentAngle as number) || 0) * (Math.PI / 180);
    const segAngle = (2 * Math.PI) / segments.length;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    segments.forEach((seg, i) => {
      const startAngle = angle + i * segAngle;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, startAngle, startAngle + segAngle);
      ctx.fillStyle = seg.color;
      ctx.fill();
      ctx.strokeStyle = "#1A1A24";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(startAngle + segAngle / 2);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(seg.label, radius * 0.6, 5);
      ctx.restore();
    });

    // Center circle
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, 2 * Math.PI);
    ctx.fillStyle = "#1A1A24";
    ctx.fill();

    // Pointer (triangle at top)
    ctx.beginPath();
    ctx.moveTo(cx - 10, 5);
    ctx.lineTo(cx + 10, 5);
    ctx.lineTo(cx, 25);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
  }, [gameState?.data?.currentAngle, gameState?.data?.segments]);

  const isSpinning = gameState?.data?.isSpinning as boolean;
  const landedSegment = gameState?.data?.landedSegment as { label: string } | null;

  return (
    <div className="min-h-screen flex flex-col bg-bg-base">
      <div className="p-4 bg-bg-surface border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Disc size={20} className="text-primary" />
          <h1 className="text-lg font-bold text-text">{room.title}</h1>
          <Badge variant="live">SPIN WHEEL</Badge>
        </div>
        <span className="text-sm font-bold text-danger">{formatTimer(Math.ceil(gameState?.timeRemaining ?? timer))}</span>
      </div>

      <div className="flex-1 p-4 flex flex-col items-center justify-center space-y-6">
        <canvas ref={canvasRef} width={300} height={300} className="rounded-full" />

        {landedSegment && (
          <div className="text-center animate-bounce">
            <p className="text-2xl font-bold text-success">{landedSegment.label}</p>
            {(gameState?.data?.lastWinAmount as number) > 0 && (
              <p className="text-sm text-text-secondary">Won {String(gameState?.data?.lastWinAmount)} credits!</p>
            )}
          </div>
        )}

        {!isSpinning && (
          <Button
            variant="gradient"
            size="lg"
            onClick={() => {
              if (!currentUser) return;
              fetch(`/api/live/${room.id}/game/action`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ action: "spin", payload: { amount: 10 } }),
              });
            }}
          >
            Spin! (10 credits)
          </Button>
        )}
      </div>
    </div>
  );
}

function LastStandingBattle({ room, host }: { room: LiveRoom & { host: User }; host: User }) {
  const { gameState, setGameState, setConnected } = useGameStore();
  const { currentUser } = useAuthStore();
  const { timer } = useBattleState(room, host);
  const sseRef = useRef<SSEClient | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    const sse = new SSEClient({
      url: `/api/live/${room.id}/game/state?userId=${currentUser.id}`,
      onMessage: (event, data) => {
        if (event === "game-state") setGameState(data as GameState);
      },
      onOpen: () => setConnected(true),
      onClose: () => setConnected(false),
    });
    sse.connect();
    sseRef.current = sse;
    return () => sse.disconnect();
  }, [room.id, currentUser?.id]);

  const players = Object.values(gameState?.players || {});
  const activePlayers = players.filter((p) => !p.isEliminated);
  const eliminatedPlayers = players.filter((p) => p.isEliminated);
  const pot = (gameState?.data?.pot as number) || 0;
  const eliminationTimer = (gameState?.data?.eliminationTimer as number) || 30;
  const eliminationWarning = gameState?.data?.eliminationWarning as boolean;
  const immunePlayers = (gameState?.data?.immunePlayers as string[]) || [];
  const isImmuneCurrentUser = currentUser ? immunePlayers.includes(currentUser.id) : false;

  return (
    <div className="min-h-screen flex flex-col bg-bg-base">
      <div className={cn(
        "p-4 bg-bg-surface border-b border-border flex items-center justify-between transition-colors",
        eliminationWarning && "bg-danger/20"
      )}>
        <div className="flex items-center gap-3">
          <Target size={20} className="text-danger" />
          <h1 className="text-lg font-bold text-text">{room.title}</h1>
          <Badge variant="live">LAST STANDING</Badge>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-success font-bold">Pot: {pot} credits</span>
          <span className={cn("text-sm font-bold", eliminationWarning ? "text-danger animate-pulse" : "text-text-secondary")}>
            Elimination in: {Math.ceil(eliminationTimer)}s
          </span>
        </div>
      </div>

      <div className="flex-1 p-4 space-y-4">
        {/* Active players */}
        <div>
          <h3 className="text-sm font-semibold text-text mb-3">
            Survivors ({activePlayers.length})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {activePlayers.map((player) => (
              <Card key={player.userId} padding="sm" className={cn(
                immunePlayers.includes(player.userId) && "!border-success/50 !bg-success/5"
              )}>
                <div className="text-center">
                  <p className="text-sm font-medium text-text truncate">{player.displayName}</p>
                  <p className="text-xs text-primary">{player.score} credits</p>
                  {immunePlayers.includes(player.userId) && (
                    <span className="text-[10px] text-success font-medium">IMMUNE</span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Buy immunity */}
        {currentUser && !isImmuneCurrentUser && activePlayers.some((p) => p.userId === currentUser.id) && (
          <div className="text-center">
            <Button
              variant="gradient"
              size="sm"
              icon={<Shield size={14} />}
              onClick={() => {
                fetch(`/api/live/${room.id}/game/action`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({ action: "buy_immunity", payload: { cost: 50 } }),
                });
              }}
            >
              Buy Immunity (50 credits)
            </Button>
          </div>
        )}

        {/* Eliminated */}
        {eliminatedPlayers.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-text-muted mb-2">
              Eliminated ({eliminatedPlayers.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {eliminatedPlayers.map((player) => (
                <span key={player.userId} className="px-3 py-1 bg-bg-surface2 text-text-muted text-xs rounded-full line-through">
                  {player.displayName}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Winner */}
        {gameState?.phase === "finished" && gameState.winner && (
          <Card padding="lg" className="!bg-success/10 !border-success/30 text-center">
            <Trophy size={48} className="text-success mx-auto mb-3" />
            <p className="text-xl font-bold text-text">
              {gameState.players[gameState.winner]?.displayName} Wins!
            </p>
            <p className="text-sm text-success mt-1">Won {pot} credits!</p>
          </Card>
        )}
      </div>
    </div>
  );
}
