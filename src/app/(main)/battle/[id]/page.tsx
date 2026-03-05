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
import { DONATION_TIERS as REAL_DONATION_TIERS, TOWER_WARS_STATS } from "@/lib/donation-tiers";
import type { GameState } from "@/lib/games/game-engine";
import ParticipantBox from "@/components/battle/ParticipantBox";
import LeaderboardPanel from "@/components/battle/LeaderboardPanel";
import BattleBar from "@/components/battle/BattleBar";
import SplitScreenBattle from "@/components/battle/SplitScreenBattle";
import PowerUpPanel from "@/components/battle/PowerUpPanel";
import VictoryLap from "@/components/battle/VictoryLap";
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
   TIMER WARS BATTLE MODE (Server-driven via SSE)
   ============================================================ */

function TimerWarsBattle({ room, host }: { room: LiveRoom; host: User }) {
  const router = useRouter();
  const { gameState, setGameState, setConnected } = useGameStore();
  const { currentUser } = useAuthStore();
  const sseRef = useRef<SSEClient | null>(null);

  // Local UI state
  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [showSidePanel, setShowSidePanel] = useState(false);
  const [sideTab, setSideTab] = useState("gifts");
  const [banner, setBanner] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState<DonationTier | null>(null);
  const [showPlayerSelect, setShowPlayerSelect] = useState(false);
  const [giftLoading, setGiftLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<
    { id: string; userId: string; text: string; timestamp: number }[]
  >([]);
  const [activePowerUps, setActivePowerUps] = useState<
    { type: string; targetId: string; expiresAt: number }[]
  >([]);
  const prevEliminatedRef = useRef<Set<string>>(new Set());
  const prevWinnerRef = useRef<string | null>(null);

  const hostId = room.hostId;

  // SSE connection
  useEffect(() => {
    if (!currentUser) return;
    const sse = new SSEClient({
      url: `/api/live/${room.id}/game/state?userId=${currentUser.id}`,
      onMessage: (event, data) => {
        if (event === "game-state") setGameState(data as GameState);
        if (event === "game-event") {
          const evt = data as { event: string; data: Record<string, unknown> };
          if (evt.event === "gift") {
            const d = evt.data;
            setChatMessages((prev) => [
              ...prev,
              {
                id: `gift-${Date.now()}-${Math.random()}`,
                userId: "system",
                text: `${d.senderName} sent ${d.amount} credits to ${d.targetName}!`,
                timestamp: Date.now(),
              },
            ]);
          }
        }
      },
      onOpen: () => setConnected(true),
      onClose: () => setConnected(false),
    });
    sse.connect();
    sseRef.current = sse;
    return () => sse.disconnect();
  }, [room.id, currentUser?.id, setGameState, setConnected]);

  // Derive state from gameState
  const players = gameState?.players || {};
  const activePlayers = useMemo(
    () => Object.values(players).filter((p) => !p.isEliminated),
    [players]
  );
  const round = gameState?.round || 1;
  const maxRounds = gameState?.maxRounds || 5;
  const timeRemaining = gameState?.timeRemaining ?? 60;
  const timer = Math.ceil(timeRemaining);
  const winner = gameState?.winner || null;
  const phase = gameState?.phase || "waiting";

  // Show banners for eliminations / winner
  useEffect(() => {
    if (!gameState) return;
    const currentEliminated = new Set(
      Object.keys(players).filter((id) => players[id].isEliminated)
    );
    // Check for new eliminations
    for (const id of currentEliminated) {
      if (!prevEliminatedRef.current.has(id)) {
        const name = players[id]?.displayName || id;
        showBannerMsg(`ELIMINATED: ${name}`, 3000);
        setChatMessages((prev) => [
          ...prev,
          { id: `elim-${Date.now()}`, userId: "system", text: `${name} has been eliminated!`, timestamp: Date.now() },
        ]);
      }
    }
    prevEliminatedRef.current = currentEliminated;

    // Check for winner
    if (winner && winner !== prevWinnerRef.current) {
      const winnerName = players[winner]?.displayName || winner;
      showBannerMsg(`WINNER: ${winnerName}!`, 10000);
    }
    prevWinnerRef.current = winner;
  }, [gameState, players, winner]);

  const showBannerMsg = useCallback((text: string, durationMs = 3000) => {
    setBanner(text);
    setTimeout(() => setBanner(null), durationMs);
  }, []);

  const timerColor = timer > 30 ? "text-success" : timer > 10 ? "text-warning" : "text-danger";

  const gridCols = useMemo(() => {
    const count = Object.keys(players).length;
    if (count <= 2) return "grid-cols-1 sm:grid-cols-2";
    if (count <= 4) return "grid-cols-2";
    if (count <= 6) return "grid-cols-2 lg:grid-cols-3";
    return "grid-cols-2 lg:grid-cols-4";
  }, [Object.keys(players).length]);

  const maxScore = useMemo(
    () => Math.max(1, ...Object.values(players).map((p) => p.score)),
    [players]
  );

  // Is current user eliminated?
  const isCurrentUserEliminated = currentUser ? players[currentUser.id]?.isEliminated === true : false;
  const isHostEliminated = players[hostId]?.isEliminated === true;

  // Two-step gift flow: pick tier → pick target player
  const handleGiftTierSelect = useCallback((tier: DonationTier) => {
    setSelectedTier(tier);
    setShowGiftPanel(false);
    setShowPlayerSelect(true);
  }, []);

  const handleGiftToPlayer = useCallback(async (targetUserId: string) => {
    if (!selectedTier || giftLoading) return;
    setGiftLoading(true);
    try {
      const res = await fetch(`/api/live/${room.id}/game/gift`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          targetUserId,
          amount: selectedTier.valueCents,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        showBannerMsg(data.error || "Gift failed", 2000);
      }
    } catch {
      showBannerMsg("Gift failed", 2000);
    } finally {
      setGiftLoading(false);
      setShowPlayerSelect(false);
      setSelectedTier(null);
    }
  }, [selectedTier, giftLoading, room.id, showBannerMsg]);

  const handleRejoinQueue = useCallback(async () => {
    await fetch(`/api/live/${room.id}/game/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "rejoin_queue" }),
    });
    showBannerMsg("Added to rejoin queue!", 2000);
  }, [room.id, showBannerMsg]);

  const handleSendChat = useCallback(
    (text: string) => {
      setChatMessages((prev) => [
        ...prev,
        { id: `msg-${Date.now()}-${Math.random()}`, userId: currentUser?.id || "anon", text, timestamp: Date.now() },
      ]);
    },
    [currentUser?.id]
  );

  const handleShare = useCallback(() => {
    if (navigator.share) {
      navigator.share({ title: room.title, url: window.location.href });
    } else {
      navigator.clipboard.writeText(window.location.href);
    }
  }, [room.title]);

  // Power-up purchase handler
  const handlePurchasePowerUp = useCallback(async (type: string, targetId?: string) => {
    try {
      const res = await fetch(`/api/live/${room.id}/game/power-up`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type, targetId }),
      });
      const data = await res.json();
      if (!res.ok) {
        showBannerMsg(data.error || "Failed to purchase power-up", 2000);
        return;
      }
      // Add to local active power-ups for UI
      if (data.powerUp) {
        setActivePowerUps((prev) => [
          ...prev,
          { type: data.powerUp.type, targetId: targetId || "", expiresAt: new Date(data.powerUp.expiresAt).getTime() },
        ]);
      }
      showBannerMsg(`${type.replace("_", " ")} activated!`, 2000);
    } catch {
      showBannerMsg("Failed to purchase power-up", 2000);
    }
  }, [room.id, showBannerMsg]);

  // Clean up expired power-ups
  useEffect(() => {
    const interval = setInterval(() => {
      setActivePowerUps((prev) => prev.filter((p) => p.expiresAt > Date.now()));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Sorted players for leaderboard
  const sortedPlayers = useMemo(
    () => Object.values(players).sort((a, b) => (a.data.rank as number || 999) - (b.data.rank as number || 999)),
    [players]
  );

  // Rank 1 player (for main spot when host eliminated)
  const rank1Player = activePlayers.find((p) => p.data.rank === 1);

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
            {activePlayers.length} remaining
          </div>
          {phase === "waiting" && (
            <Badge variant="secondary">Waiting...</Badge>
          )}
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
          {winner
            ? "BATTLE COMPLETE"
            : phase === "waiting"
              ? "NEXT ROUND STARTING SOON"
              : activePlayers.length <= 2
                ? "FINAL ROUND"
                : `ROUND ${round}/${maxRounds}`}
        </span>
      </div>

      {/* Timer */}
      {!winner && phase === "active" && (
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

      {/* Winner celebration - Victory Lap */}
      {winner && players[winner] && (
        <VictoryLap
          winner={{
            user: {
              id: players[winner].userId,
              username: players[winner].displayName,
              displayName: players[winner].displayName,
              email: "",
              followerCount: 0,
              followingCount: 0,
              isCreator: false,
              verifiedBadge: false,
            },
            score: players[winner].score,
          }}
          loser={{
            user: {
              id: sortedPlayers[1]?.userId || "",
              username: sortedPlayers[1]?.displayName || "Unknown",
              displayName: sortedPlayers[1]?.displayName || "Unknown",
              email: "",
              followerCount: 0,
              followingCount: 0,
              isCreator: false,
              verifiedBadge: false,
            },
            score: sortedPlayers[1]?.score || 0,
          }}
          topGifters={(gameState?.data?.topGifters as { userId: string; total: number }[] || []).map((g) => ({
            userId: g.userId,
            displayName: players[g.userId]?.displayName || g.userId,
            total: g.total,
          }))}
          timeRemaining={gameState?.data?.victoryLapEndsAt ? Math.max(0, Math.ceil((gameState.data.victoryLapEndsAt as number - Date.now()) / 1000)) : 180}
          onGiftWinner={() => {
            setSelectedTier(DONATION_TIERS[DONATION_TIERS.length - 1]); // Select highest tier
            setShowPlayerSelect(true);
          }}
        />
      )}

      {/* Rejoin queue button for eliminated players */}
      {isCurrentUserEliminated && !winner && (
        <div className="flex justify-center py-2 shrink-0">
          <Button variant="primary" size="sm" onClick={handleRejoinQueue}>
            Rejoin Queue
          </Button>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Participant grid or Split-screen for 1v1 */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Use SplitScreenBattle for final 1v1 */}
          {activePlayers.length === 2 && !winner ? (
            <SplitScreenBattle
              leftPlayer={{
                user: {
                  id: activePlayers[0].userId,
                  username: activePlayers[0].displayName,
                  displayName: activePlayers[0].displayName,
                  email: "",
                  followerCount: 0,
                  followingCount: 0,
                  isCreator: false,
                  verifiedBadge: false,
                },
                score: activePlayers[0].score,
              }}
              rightPlayer={{
                user: {
                  id: activePlayers[1].userId,
                  username: activePlayers[1].displayName,
                  displayName: activePlayers[1].displayName,
                  email: "",
                  followerCount: 0,
                  followingCount: 0,
                  isCreator: false,
                  verifiedBadge: false,
                },
                score: activePlayers[1].score,
              }}
              timer={timer}
              activePowerUps={activePowerUps}
              onGiftLeft={() => {
                setSelectedTier(DONATION_TIERS[0]);
                handleGiftToPlayer(activePlayers[0].userId);
              }}
              onGiftRight={() => {
                setSelectedTier(DONATION_TIERS[0]);
                handleGiftToPlayer(activePlayers[1].userId);
              }}
              showGiftButtons={false}
            />
          ) : (
            <div className={`grid ${gridCols} gap-4`}>
              {Object.values(players).map((p) => {
                const isHost = p.userId === hostId;
                const isElim = p.isEliminated;
                const score = p.score;
                const rank = p.data.rank as number | undefined;

                // Build a minimal user object from player state
                const playerUser: User = {
                  id: p.userId,
                  username: p.displayName,
                  displayName: p.displayName,
                  email: "",
                  followerCount: 0,
                  followingCount: 0,
                  isCreator: false,
                  verifiedBadge: false,
                };
                const participant = { userId: p.userId, role: isHost ? "host" as const : "guest" as const };

                return (
                  <div key={p.userId} className={cn("relative", isElim && "opacity-50 grayscale")}>
                    <ParticipantBox
                      participant={participant}
                      user={playerUser}
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
                    {/* Rank badge */}
                    {!isElim && rank && (
                      <div className="absolute top-2 right-2 z-10">
                        <Badge variant={rank === 1 ? "premium" : rank <= 3 ? "success" : "secondary"}>
                          {rank === 1 ? "1st" : rank === 2 ? "2nd" : rank === 3 ? "3rd" : `${rank}th`}
                        </Badge>
                      </div>
                    )}
                    {/* Eliminated overlay */}
                    {isElim && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl">
                        <span className="text-sm font-bold text-danger uppercase">Eliminated</span>
                      </div>
                    )}
                    {/* Score progress bar */}
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
          )}
        </div>

        {/* Desktop right panel */}
        <div className="hidden lg:flex flex-col w-80 border-l border-border bg-bg-surface shrink-0">
          <Tabs
            tabs={[
              { id: "gifts", label: "Gifts" },
              { id: "powerups", label: "Power-Ups" },
              { id: "leaderboard", label: "Rankings" },
              { id: "chat", label: "Chat" },
            ]}
            activeTab={sideTab}
            onChange={setSideTab}
          />
          <div className="flex-1 overflow-y-auto p-3">
            {sideTab === "gifts" && (
              <GiftPanel tiers={DONATION_TIERS} onSelect={handleGiftTierSelect} />
            )}
            {sideTab === "powerups" && (
              <PowerUpPanel
                userCredits={0} // TODO: Get from user state
                activePowerUps={activePowerUps.map((p, i) => ({
                  id: `power-${i}`,
                  type: p.type as "BOOSTING_GLOVE" | "MAGIC_MIST" | "STUN_HAMMER" | "TIME_MAKER",
                  userId: currentUser?.id || "",
                  targetId: p.targetId,
                  activatedAt: Date.now(),
                  expiresAt: p.expiresAt,
                }))}
                selectableTargets={activePlayers
                  .filter((p) => p.userId !== currentUser?.id)
                  .map((p) => ({
                    userId: p.userId,
                    displayName: p.displayName,
                  }))}
                currentUserId={currentUser?.id}
                onPurchase={async (type, targetId) => handlePurchasePowerUp(type, targetId)}
              />
            )}
            {sideTab === "leaderboard" && (
              <div className="space-y-2">
                {sortedPlayers.map((p) => {
                  const rank = p.data.rank as number | undefined;
                  return (
                    <div key={p.userId} className={cn(
                      "flex items-center justify-between p-2 rounded-lg",
                      p.isEliminated ? "bg-danger/10 opacity-60" : "bg-bg-surface2"
                    )}>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-text-muted w-5">
                          {p.isEliminated ? "X" : rank || "-"}
                        </span>
                        <span className="text-sm font-medium text-text">
                          {p.displayName}
                          {p.userId === hostId && " (Host)"}
                        </span>
                      </div>
                      <span className={cn("text-sm font-bold", p.isEliminated ? "text-danger" : "text-primary")}>
                        {p.score} pts
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            {sideTab === "chat" && (
              <div className="h-full">
                <ChatPanel messages={chatMessages} onSend={handleSendChat} users={[host]} />
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

      {/* Gift tier picker drawer */}
      <Drawer
        isOpen={showGiftPanel}
        onClose={() => setShowGiftPanel(false)}
        title="Pick a Gift"
        side="bottom"
      >
        <GiftPanel tiers={DONATION_TIERS} onSelect={handleGiftTierSelect} />
      </Drawer>

      {/* Player select drawer (step 2 of gift flow) */}
      <Drawer
        isOpen={showPlayerSelect}
        onClose={() => { setShowPlayerSelect(false); setSelectedTier(null); }}
        title={selectedTier ? `Send ${selectedTier.name} to...` : "Choose Player"}
        side="bottom"
      >
        <div className="space-y-2 p-2">
          {activePlayers
            .filter((p) => p.userId !== currentUser?.id)
            .map((p) => (
              <button
                key={p.userId}
                disabled={giftLoading}
                onClick={() => handleGiftToPlayer(p.userId)}
                className={cn(
                  "w-full flex items-center justify-between p-3 rounded-xl border border-border bg-bg-surface2 hover:bg-bg-surface3 transition-colors",
                  giftLoading && "opacity-50 cursor-not-allowed"
                )}
              >
                <div className="flex items-center gap-3">
                  <Avatar name={p.displayName} size="sm" />
                  <div className="text-left">
                    <span className="text-sm font-medium text-text">{p.displayName}</span>
                    <span className="text-xs text-text-secondary ml-2">{p.score} pts</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-primary">
                    {p.data.rank === 1 ? "1st" : p.data.rank === 2 ? "2nd" : p.data.rank === 3 ? "3rd" : `#${p.data.rank || "-"}`}
                  </span>
                </div>
              </button>
            ))}
          {activePlayers.filter((p) => p.userId !== currentUser?.id).length === 0 && (
            <p className="text-sm text-text-secondary text-center py-4">No active players to gift</p>
          )}
        </div>
      </Drawer>

      {/* Mobile side panel drawer */}
      <Drawer
        isOpen={showSidePanel}
        onClose={() => setShowSidePanel(false)}
        title={sideTab === "chat" ? "Chat" : sideTab === "leaderboard" ? "Rankings" : sideTab === "powerups" ? "Power-Ups" : "Gifts"}
        side="bottom"
      >
        <div className="mb-3">
          <Tabs
            tabs={[
              { id: "gifts", label: "Gifts" },
              { id: "powerups", label: "Power-Ups" },
              { id: "leaderboard", label: "Rankings" },
              { id: "chat", label: "Chat" },
            ]}
            activeTab={sideTab}
            onChange={setSideTab}
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {sideTab === "gifts" && (
            <GiftPanel tiers={DONATION_TIERS} onSelect={handleGiftTierSelect} />
          )}
          {sideTab === "powerups" && (
            <PowerUpPanel
              userCredits={0} // TODO: Get from user state
              activePowerUps={activePowerUps.map((p, i) => ({
                id: `power-${i}`,
                type: p.type as "BOOSTING_GLOVE" | "MAGIC_MIST" | "STUN_HAMMER" | "TIME_MAKER",
                userId: currentUser?.id || "",
                targetId: p.targetId,
                activatedAt: Date.now(),
                expiresAt: p.expiresAt,
              }))}
              selectableTargets={activePlayers
                .filter((p) => p.userId !== currentUser?.id)
                .map((p) => ({
                  userId: p.userId,
                  displayName: p.displayName,
                }))}
              currentUserId={currentUser?.id}
              onPurchase={async (type, targetId) => handlePurchasePowerUp(type, targetId)}
            />
          )}
          {sideTab === "leaderboard" && (
            <div className="space-y-2">
              {sortedPlayers.map((p) => {
                const rank = p.data.rank as number | undefined;
                return (
                  <div key={p.userId} className={cn(
                    "flex items-center justify-between p-2 rounded-lg",
                    p.isEliminated ? "bg-danger/10 opacity-60" : "bg-bg-surface2"
                  )}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-text-muted w-5">
                        {p.isEliminated ? "X" : rank || "-"}
                      </span>
                      <span className="text-sm font-medium text-text">{p.displayName}</span>
                    </div>
                    <span className={cn("text-sm font-bold", p.isEliminated ? "text-danger" : "text-primary")}>
                      {p.score} pts
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {sideTab === "chat" && (
            <div className="h-80">
              <ChatPanel messages={chatMessages} onSend={handleSendChat} users={[host]} />
            </div>
          )}
        </div>
      </Drawer>
    </div>
  );
}

/* ============================================================
   TOWER WARS BATTLE MODE (Server-driven FFA via SSE)
   ============================================================ */

interface TWUnit {
  id: number;
  tierId: string;
  iconKey: string;
  senderId: string;
  supportingId: string;
  targetId: string;
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  position: number;
}

function StarArena({
  players,
  units,
  baseHp,
  maxBaseHp,
  supportingId,
  attackingId,
}: {
  players: Record<string, { userId: string; displayName: string; isEliminated: boolean; score: number }>;
  units: TWUnit[];
  baseHp: Record<string, number>;
  maxBaseHp: number;
  supportingId: string | null;
  attackingId: string | null;
}) {
  const playerIds = Object.keys(players);
  const count = playerIds.length;

  const getPos = (index: number) => {
    const angle = (index / count) * 2 * Math.PI - Math.PI / 2;
    return {
      x: 50 + 40 * Math.cos(angle),
      y: 50 + 40 * Math.sin(angle),
    };
  };

  // Map unit position (0-100) to screen coordinates between source and target via center
  const getUnitXY = (unit: TWUnit) => {
    const srcIdx = playerIds.indexOf(unit.supportingId);
    const tgtIdx = playerIds.indexOf(unit.targetId);
    if (srcIdx < 0 || tgtIdx < 0) return { x: 50, y: 50 };

    const src = getPos(srcIdx);
    const tgt = getPos(tgtIdx);
    const center = { x: 50, y: 50 };
    const pos = unit.position / 100;

    if (pos <= 0.5) {
      // Source -> Center (0 to 0.5 mapped to src->center)
      const t = pos * 2;
      return { x: src.x + (center.x - src.x) * t, y: src.y + (center.y - src.y) * t };
    } else {
      // Center -> Target (0.5 to 1.0 mapped to center->target)
      const t = (pos - 0.5) * 2;
      return { x: center.x + (tgt.x - center.x) * t, y: center.y + (tgt.y - center.y) * t };
    }
  };

  return (
    <div className="relative w-full h-56 sm:h-64 bg-bg-surface rounded-xl overflow-hidden border border-border">
      {/* Center ring */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border-2 border-border/40 bg-bg-surface2/30" />

      {/* Connection lines from each base to center */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
        {playerIds.map((id, i) => {
          const pos = getPos(i);
          return (
            <line
              key={id}
              x1={pos.x}
              y1={pos.y}
              x2={50}
              y2={50}
              stroke="currentColor"
              className="text-border/20"
              strokeWidth="0.3"
            />
          );
        })}
      </svg>

      {/* Player bases */}
      {playerIds.map((id, i) => {
        const pos = getPos(i);
        const player = players[id];
        const hp = baseHp[id] ?? 0;
        const hpPct = maxBaseHp > 0 ? Math.max(0, (hp / maxBaseHp) * 100) : 0;
        const hpColor = hpPct > 60 ? "bg-success" : hpPct > 30 ? "bg-warning" : "bg-danger";
        const isSupport = id === supportingId;
        const isAttack = id === attackingId;

        return (
          <div
            key={id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
          >
            <div
              className={cn(
                "flex flex-col items-center gap-0.5 p-1 rounded-lg border transition-all",
                player.isEliminated
                  ? "opacity-40 grayscale border-border"
                  : isSupport
                    ? "border-success bg-success/10 shadow-sm shadow-success/20"
                    : isAttack
                      ? "border-danger bg-danger/10 shadow-sm shadow-danger/20"
                      : "border-border/50 bg-bg-surface2/60"
              )}
            >
              <span className="text-[10px] font-semibold text-text truncate max-w-[60px]">
                {player.displayName}
              </span>
              {!player.isEliminated && (
                <div className="w-12 h-1.5 bg-bg-surface2 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all duration-300", hpColor)}
                    style={{ width: `${hpPct}%` }}
                  />
                </div>
              )}
              {player.isEliminated && (
                <span className="text-[8px] font-bold text-danger uppercase">OUT</span>
              )}
            </div>
          </div>
        );
      })}

      {/* Units traveling */}
      {units.map((unit) => {
        const xy = getUnitXY(unit);
        const inCombatZone = unit.position >= 40 && unit.position <= 60;
        return (
          <div
            key={unit.id}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-200 ease-linear",
              inCombatZone && "animate-pulse"
            )}
            style={{ left: `${xy.x}%`, top: `${xy.y}%` }}
          >
            <span className="text-lg drop-shadow-md">{unit.iconKey}</span>
          </div>
        );
      })}

      {/* Center label */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <Swords size={14} className="text-text-muted/40" />
      </div>
    </div>
  );
}

function TowerWarsBattle({ room, host }: { room: LiveRoom; host: User }) {
  const router = useRouter();
  const { gameState, setGameState, setConnected } = useGameStore();
  const { currentUser } = useAuthStore();
  const sseRef = useRef<SSEClient | null>(null);

  // Persistent targeting
  const [supportingId, setSupportingId] = useState<string | null>(null);
  const [attackingId, setAttackingId] = useState<string | null>(null);
  const [showSupportPicker, setShowSupportPicker] = useState(false);
  const [showAttackPicker, setShowAttackPicker] = useState(false);
  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [giftLoading, setGiftLoading] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [sideTab, setSideTab] = useState("gifts");
  const [showSidePanel, setShowSidePanel] = useState(false);
  const [chatMessages, setChatMessages] = useState<
    { id: string; userId: string; text: string; timestamp: number }[]
  >([]);
  const prevEliminatedRef = useRef<Set<string>>(new Set());
  const prevWinnerRef = useRef<string | null>(null);

  // SSE connection
  useEffect(() => {
    if (!currentUser) return;
    const sse = new SSEClient({
      url: `/api/live/${room.id}/game/state?userId=${currentUser.id}`,
      onMessage: (event, data) => {
        if (event === "game-state") setGameState(data as GameState);
        if (event === "game-event") {
          const evt = data as { event: string; data: Record<string, unknown> };
          if (evt.event === "gift") {
            const d = evt.data;
            const unitType = d.unitType as string;
            const msg = unitType === "heal"
              ? `${d.senderName} healed with ${d.tierIcon} ${d.tierName}!`
              : `${d.senderName} sent ${d.tierIcon} ${d.tierName} to attack!`;
            setChatMessages((prev) => [
              ...prev,
              { id: `gift-${Date.now()}-${Math.random()}`, userId: "system", text: msg, timestamp: Date.now() },
            ]);
          }
        }
      },
      onOpen: () => setConnected(true),
      onClose: () => setConnected(false),
    });
    sse.connect();
    sseRef.current = sse;
    return () => sse.disconnect();
  }, [room.id, currentUser?.id, setGameState, setConnected]);

  // Derive state from gameState
  const players = gameState?.players || {};
  const activePlayers = useMemo(
    () => Object.values(players).filter((p) => !p.isEliminated),
    [players]
  );
  const units = (gameState?.data?.units as TWUnit[]) || [];
  const baseHp = (gameState?.data?.baseHp as Record<string, number>) || {};
  const maxBaseHp = (gameState?.data?.maxBaseHp as number) || 1000;
  const winner = gameState?.winner || null;
  const phase = gameState?.phase || "waiting";

  const showBannerMsg = useCallback((text: string, durationMs = 3000) => {
    setBanner(text);
    setTimeout(() => setBanner(null), durationMs);
  }, []);

  // Show banners for eliminations / winner
  useEffect(() => {
    if (!gameState) return;
    const currentEliminated = new Set(
      Object.keys(players).filter((id) => players[id].isEliminated)
    );
    for (const id of currentEliminated) {
      if (!prevEliminatedRef.current.has(id)) {
        const name = players[id]?.displayName || id;
        showBannerMsg(`ELIMINATED: ${name}`, 3000);
        setChatMessages((prev) => [
          ...prev,
          { id: `elim-${Date.now()}`, userId: "system", text: `${name} has been eliminated!`, timestamp: Date.now() },
        ]);
      }
    }
    prevEliminatedRef.current = currentEliminated;

    if (winner && winner !== prevWinnerRef.current) {
      const winnerName = players[winner]?.displayName || winner;
      showBannerMsg(`WINNER: ${winnerName}!`, 10000);
    }
    prevWinnerRef.current = winner;
  }, [gameState, players, winner, showBannerMsg]);

  // Auto-select targets: default support to self if player, attack to first other player
  useEffect(() => {
    if (!currentUser || Object.keys(players).length === 0) return;
    if (!supportingId && players[currentUser.id]) {
      setSupportingId(currentUser.id);
    }
    if (!attackingId) {
      const firstOther = activePlayers.find((p) => p.userId !== (supportingId || currentUser.id));
      if (firstOther) setAttackingId(firstOther.userId);
    }
  }, [currentUser, players, activePlayers, supportingId, attackingId]);

  // Clear targets if targeted player gets eliminated
  useEffect(() => {
    if (supportingId && players[supportingId]?.isEliminated) {
      setSupportingId(null);
    }
    if (attackingId && players[attackingId]?.isEliminated) {
      setAttackingId(null);
    }
  }, [players, supportingId, attackingId]);

  const gridCols = useMemo(() => {
    const count = Object.keys(players).length;
    if (count <= 2) return "grid-cols-2";
    if (count <= 4) return "grid-cols-2 sm:grid-cols-4";
    if (count <= 6) return "grid-cols-3 sm:grid-cols-3 lg:grid-cols-6";
    return "grid-cols-4 lg:grid-cols-4";
  }, [Object.keys(players).length]);

  // Gift handler — send a donation tier
  const handleGiftSelect = useCallback(async (tier: DonationTier) => {
    if (giftLoading || !supportingId || !attackingId) return;
    if (phase !== "active") {
      showBannerMsg("Game not active", 2000);
      return;
    }

    const stats = TOWER_WARS_STATS[tier.id];
    if (!stats) return;

    // For heal tiers: target is the supported player
    const targetUserId = stats.type === "heal" ? supportingId : attackingId;

    setGiftLoading(true);
    try {
      const res = await fetch(`/api/live/${room.id}/game/gift`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          targetUserId,
          supportingId,
          tierId: tier.id,
          amount: tier.valueCents,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        showBannerMsg(data.error || "Gift failed", 2000);
      }
    } catch {
      showBannerMsg("Gift failed", 2000);
    } finally {
      setGiftLoading(false);
    }
  }, [giftLoading, supportingId, attackingId, phase, room.id, showBannerMsg]);

  const handleSendChat = useCallback(
    (text: string) => {
      setChatMessages((prev) => [
        ...prev,
        { id: `msg-${Date.now()}-${Math.random()}`, userId: currentUser?.id || "anon", text, timestamp: Date.now() },
      ]);
    },
    [currentUser?.id]
  );

  const handleShare = useCallback(() => {
    if (navigator.share) {
      navigator.share({ title: room.title, url: window.location.href });
    } else {
      navigator.clipboard.writeText(window.location.href);
    }
  }, [room.title]);

  // Gift tiers with heal badges
  const giftTiers = useMemo(() => REAL_DONATION_TIERS, []);

  const supportPlayer = supportingId ? players[supportingId] : null;
  const attackPlayer = attackingId ? players[attackingId] : null;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-bg-surface border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Swords size={16} className="text-primary" />
          <h1 className="text-sm font-semibold text-text truncate max-w-[30%]">{room.title}</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <Eye size={14} />
            {formatViewers(room.viewerCount)}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <Users size={14} />
            {activePlayers.length} alive
          </div>
          {phase === "waiting" && <Badge variant="secondary">Waiting...</Badge>}
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

      {/* Banner overlay */}
      {banner && (
        <div className="fixed inset-x-0 top-1/3 z-50 flex justify-center pointer-events-none">
          <div
            className={cn(
              "px-8 py-4 rounded-2xl text-white text-xl sm:text-2xl font-black tracking-wider uppercase animate-pulse",
              banner.includes("WINNER")
                ? "bg-gradient-to-r from-warning to-success shadow-lg shadow-success/40"
                : banner.includes("ELIMINATED")
                  ? "bg-danger/90 shadow-lg shadow-danger/40"
                  : "bg-gradient-to-r from-primary to-accent shadow-lg shadow-primary/40"
            )}
          >
            {banner}
          </div>
        </div>
      )}

      {/* Winner celebration */}
      {winner && (
        <div className="flex flex-col items-center py-6 shrink-0">
          <Crown size={48} className="text-warning mb-3" />
          <span className="text-2xl font-black text-text">
            {players[winner]?.displayName || winner}
          </span>
          <span className="text-sm text-text-secondary mt-1">Tower Wars Champion!</span>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-y-auto p-4 gap-4">
          {/* Player HP grid */}
          <div className={cn("grid gap-3", gridCols)}>
            {Object.values(players).map((p) => {
              const hp = baseHp[p.userId] ?? 0;
              const hpPct = maxBaseHp > 0 ? Math.max(0, (hp / maxBaseHp) * 100) : 0;
              const hpColor = hpPct > 60 ? "bg-success" : hpPct > 30 ? "bg-warning" : "bg-danger";
              const isSupport = p.userId === supportingId;
              const isAttack = p.userId === attackingId;

              return (
                <div
                  key={p.userId}
                  className={cn(
                    "relative p-3 rounded-xl border transition-all",
                    p.isEliminated
                      ? "opacity-40 grayscale border-border bg-bg-surface"
                      : isSupport
                        ? "border-success bg-success/5"
                        : isAttack
                          ? "border-danger bg-danger/5"
                          : "border-border bg-bg-surface"
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Avatar name={p.displayName} size="sm" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold text-text truncate block">{p.displayName}</span>
                      <span className="text-[10px] text-text-muted">{p.score} pts</span>
                    </div>
                    {isSupport && <Badge variant="success">ALLY</Badge>}
                    {isAttack && <Badge variant="danger">TARGET</Badge>}
                  </div>
                  {!p.isEliminated && (
                    <div>
                      <div className="flex justify-between text-[10px] mb-0.5">
                        <span className="text-text-muted">HP</span>
                        <span className="font-mono font-bold text-text">{Math.ceil(hp)}/{maxBaseHp}</span>
                      </div>
                      <div className="w-full h-2.5 bg-bg-surface2 rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all duration-300", hpColor)}
                          style={{ width: `${hpPct}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {p.isEliminated && (
                    <div className="text-center py-1">
                      <span className="text-xs font-bold text-danger uppercase">Eliminated</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Star Arena */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Target size={14} className="text-text-muted" />
              <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                Arena
              </span>
              <span className="text-[10px] text-text-muted">
                {units.length} unit{units.length !== 1 ? "s" : ""} active
              </span>
            </div>
            <StarArena
              players={players}
              units={units}
              baseHp={baseHp}
              maxBaseHp={maxBaseHp}
              supportingId={supportingId}
              attackingId={attackingId}
            />
          </div>
        </div>

        {/* Desktop right panel */}
        <div className="hidden lg:flex flex-col w-80 border-l border-border bg-bg-surface shrink-0">
          <Tabs
            tabs={[
              { id: "gifts", label: "Gifts" },
              { id: "chat", label: "Chat" },
            ]}
            activeTab={sideTab}
            onChange={setSideTab}
          />
          <div className="flex-1 overflow-y-auto p-3">
            {sideTab === "gifts" && (
              <div>
                <GiftPanel tiers={giftTiers} onSelect={handleGiftSelect} />
                {/* Heal badge overlay info */}
                <div className="mt-2 p-2 rounded-lg bg-bg-surface2 text-[10px] text-text-muted">
                  Star, Bolt, Diamond = instant heal. Others = attack units.
                </div>
              </div>
            )}
            {sideTab === "chat" && (
              <div className="h-full">
                <ChatPanel messages={chatMessages} onSend={handleSendChat} users={[host]} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Target selection bar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-bg-surface2 border-t border-border shrink-0">
        <button
          onClick={() => setShowSupportPicker(true)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors",
            supportPlayer
              ? "border-success bg-success/10 text-success"
              : "border-border bg-bg-surface text-text-muted"
          )}
        >
          <Shield size={12} />
          {supportPlayer ? supportPlayer.displayName : "Pick Ally"}
        </button>
        <Swords size={14} className="text-text-muted shrink-0" />
        <button
          onClick={() => setShowAttackPicker(true)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors",
            attackPlayer
              ? "border-danger bg-danger/10 text-danger"
              : "border-border bg-bg-surface text-text-muted"
          )}
        >
          <Target size={12} />
          {attackPlayer ? attackPlayer.displayName : "Pick Target"}
        </button>
        <div className="flex-1" />
        {supportingId && attackingId && phase === "active" && (
          <Badge variant="success">Ready</Badge>
        )}
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

      {/* Gift tier picker drawer */}
      <Drawer
        isOpen={showGiftPanel}
        onClose={() => setShowGiftPanel(false)}
        title={
          supportingId && attackingId
            ? `Send Gift (${supportPlayer?.displayName} vs ${attackPlayer?.displayName})`
            : "Pick targets first"
        }
        side="bottom"
      >
        {supportingId && attackingId ? (
          <GiftPanel tiers={giftTiers} onSelect={handleGiftSelect} />
        ) : (
          <p className="text-sm text-text-secondary text-center py-4">
            Select an ally and a target before sending gifts.
          </p>
        )}
      </Drawer>

      {/* Support player picker */}
      <Drawer
        isOpen={showSupportPicker}
        onClose={() => setShowSupportPicker(false)}
        title="Support Who?"
        side="bottom"
      >
        <div className="space-y-2 p-2">
          {activePlayers.map((p) => (
            <button
              key={p.userId}
              onClick={() => {
                setSupportingId(p.userId);
                // If attacking same player, clear attack target
                if (attackingId === p.userId) setAttackingId(null);
                setShowSupportPicker(false);
              }}
              className={cn(
                "w-full flex items-center justify-between p-3 rounded-xl border transition-colors",
                p.userId === supportingId
                  ? "border-success bg-success/10"
                  : "border-border bg-bg-surface2 hover:bg-bg-surface3"
              )}
            >
              <div className="flex items-center gap-3">
                <Avatar name={p.displayName} size="sm" />
                <span className="text-sm font-medium text-text">{p.displayName}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">
                  {Math.ceil(baseHp[p.userId] ?? 0)} HP
                </span>
                {p.userId === supportingId && <Badge variant="success">Current</Badge>}
              </div>
            </button>
          ))}
        </div>
      </Drawer>

      {/* Attack target picker */}
      <Drawer
        isOpen={showAttackPicker}
        onClose={() => setShowAttackPicker(false)}
        title="Attack Who?"
        side="bottom"
      >
        <div className="space-y-2 p-2">
          {activePlayers
            .filter((p) => p.userId !== supportingId)
            .map((p) => (
              <button
                key={p.userId}
                onClick={() => {
                  setAttackingId(p.userId);
                  setShowAttackPicker(false);
                }}
                className={cn(
                  "w-full flex items-center justify-between p-3 rounded-xl border transition-colors",
                  p.userId === attackingId
                    ? "border-danger bg-danger/10"
                    : "border-border bg-bg-surface2 hover:bg-bg-surface3"
                )}
              >
                <div className="flex items-center gap-3">
                  <Avatar name={p.displayName} size="sm" />
                  <span className="text-sm font-medium text-text">{p.displayName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">
                    {Math.ceil(baseHp[p.userId] ?? 0)} HP
                  </span>
                  {p.userId === attackingId && <Badge variant="danger">Current</Badge>}
                </div>
              </button>
            ))}
          {activePlayers.filter((p) => p.userId !== supportingId).length === 0 && (
            <p className="text-sm text-text-secondary text-center py-4">No targets available</p>
          )}
        </div>
      </Drawer>

      {/* Mobile side panel drawer */}
      <Drawer
        isOpen={showSidePanel}
        onClose={() => setShowSidePanel(false)}
        title={sideTab === "chat" ? "Chat" : "Gifts"}
        side="bottom"
      >
        <div className="mb-3">
          <Tabs
            tabs={[
              { id: "gifts", label: "Gifts" },
              { id: "chat", label: "Chat" },
            ]}
            activeTab={sideTab}
            onChange={setSideTab}
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {sideTab === "gifts" && (
            <GiftPanel tiers={giftTiers} onSelect={handleGiftSelect} />
          )}
          {sideTab === "chat" && (
            <div className="h-80">
              <ChatPanel messages={chatMessages} onSend={handleSendChat} users={[host]} />
            </div>
          )}
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
