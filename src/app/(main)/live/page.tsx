"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Radio, Plus, Swords, Timer, Shield, Users, Zap, Gavel, Disc, Target } from "lucide-react";
import { api } from "@/lib/api";
import type { LiveRoom } from "@/lib/types";
import LiveCard from "@/components/live/LiveCard";

const filterChips = [
  { id: "all", label: "All", icon: null },
  { id: "standard", label: "Standard", icon: <Radio size={14} /> },
  { id: "battle", label: "Battle", icon: <Swords size={14} /> },
  { id: "rooms", label: "Rooms", icon: <Users size={14} /> },
  { id: "timer_wars", label: "Timer Wars", icon: <Timer size={14} /> },
  { id: "tower_wars", label: "Tower Wars", icon: <Shield size={14} /> },
  { id: "trivia", label: "Trivia", icon: <Zap size={14} /> },
  { id: "auction", label: "Auction", icon: <Gavel size={14} /> },
  { id: "spin_wheel", label: "Spin Wheel", icon: <Disc size={14} /> },
  { id: "last_standing", label: "Last Standing", icon: <Target size={14} /> },
] as const;

function matchFilter(room: LiveRoom & { isBattleRoom?: boolean }, filterId: string): boolean {
  switch (filterId) {
    case "all":
      return true;
    case "standard":
      return room.mode === "standard" && !room.isBattleRoom;
    case "battle":
      return !!room.isBattleRoom;
    case "rooms":
      return room.mode === "rooms";
    default:
      return room.mode === filterId;
  }
}

export default function LivePage() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState("all");
  const [streams, setStreams] = useState<(LiveRoom & { host: Record<string, unknown> })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await api.live.list() as { streams: (LiveRoom & { host: Record<string, unknown> })[] };
        if (!cancelled) setStreams(res.streams || []);
      } catch (err) {
        console.error("Failed to load live streams:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    // Poll every 15s for new/ended streams
    const interval = setInterval(load, 15_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const filteredRooms = useMemo(
    () => streams.filter((room) => matchFilter(room, activeFilter)),
    [activeFilter, streams]
  );

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Radio size={24} className="text-danger" />
          <h1 className="text-2xl font-bold text-text">Live Now</h1>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="aspect-video bg-bg-surface2 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <Radio size={24} className="text-danger" />
        <h1 className="text-2xl font-bold text-text">Live Now</h1>
        <span className="text-sm text-text-muted">
          {filteredRooms.length} stream{filteredRooms.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-4 no-scrollbar">
        {filterChips.map((chip) => {
          const isActive = chip.id === activeFilter;
          return (
            <button
              key={chip.id}
              onClick={() => setActiveFilter(chip.id)}
              className={`
                inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium
                whitespace-nowrap transition-all duration-200 shrink-0
                ${
                  isActive
                    ? "bg-primary text-white"
                    : "bg-bg-surface2 text-text-secondary hover:bg-bg-surface3 hover:text-text"
                }
              `}
            >
              {chip.icon}
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Live rooms grid */}
      {filteredRooms.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Radio size={48} className="text-text-muted mb-4" />
          <p className="text-text-secondary text-lg font-medium">No live streams found</p>
          <p className="text-text-muted text-sm mt-1">Try a different filter or check back later</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredRooms.map((room) => {
            const host = room.host as Record<string, unknown>;
            if (!host) return null;
            return <LiveCard key={room.id} room={room} host={host as never} />;
          })}
        </div>
      )}

      {/* Go Live FAB - mobile only */}
      <button
        onClick={() => router.push('/go-live')}
        className="
          fixed bottom-20 right-4 z-40 md:hidden
          w-14 h-14 rounded-full
          bg-gradient-to-r from-primary to-accent text-white
          flex items-center justify-center
          shadow-lg shadow-primary/30
          active:scale-95 transition-transform duration-200
        "
        aria-label="Go Live"
      >
        <Plus size={28} />
      </button>
    </div>
  );
}
