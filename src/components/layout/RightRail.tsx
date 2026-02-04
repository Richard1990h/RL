"use client";

import Link from "next/link";
import { Radio, Play } from "lucide-react";
import type { LiveRoom, Series } from "@/lib/types";
import OnlineFriendsWidget from "@/components/friends/OnlineFriendsWidget";

interface RightRailProps {
  liveRooms?: LiveRoom[];
  series?: Series[];
}

export function RightRail({ liveRooms = [], series = [] }: RightRailProps) {
  return (
    <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-[300px] shrink-0 overflow-y-auto border-l border-border bg-bg-surface p-4 xl:block">
      {/* Online Friends */}
      <OnlineFriendsWidget />

      {/* Trending Live */}
      <section className="mb-6">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-text-secondary">
          <Radio size={14} className="text-danger" />
          Trending Live
        </h3>
        {liveRooms.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {liveRooms.slice(0, 3).map((room) => (
              <li key={room.id}>
                <Link
                  href={`/live/${room.id}`}
                  className="group flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-bg-surface2"
                >
                  <div className="relative flex h-14 w-20 shrink-0 items-center justify-center rounded-md bg-bg-surface2">
                    <Play size={16} className="text-text-muted" />
                    <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-danger/90 px-1 py-0.5 text-[10px] font-bold text-white">
                      <span className="h-1.5 w-1.5 animate-pulse-live rounded-full bg-white" />
                      LIVE
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text group-hover:text-primary-light">
                      {room.title}
                    </p>
                    <p className="text-xs text-text-muted">
                      {room.viewerCount.toLocaleString()} watching
                    </p>
                    {room.isBattleRoom && (
                      <span className="mt-1 inline-block rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary-light">
                        Battle
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-lg bg-bg-surface2 p-4 text-center">
            <Radio size={24} className="mx-auto mb-2 text-text-muted" />
            <p className="text-sm text-text-muted">No live rooms right now</p>
          </div>
        )}
      </section>

      {/* Recommended Series */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-secondary">
          Recommended Series
        </h3>
        {series.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {series.slice(0, 3).map((s) => (
              <li key={s.id}>
                <Link
                  href={`/series/${s.id}`}
                  className="group flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-bg-surface2"
                >
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-bg-surface2">
                    {s.coverUrl ? (
                      <img
                        src={s.coverUrl}
                        alt={s.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-text-muted">
                        <Play size={16} />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text group-hover:text-primary-light">
                      {s.title}
                    </p>
                    <p className="text-xs text-text-muted">
                      {s.totalEpisodes} episode{s.totalEpisodes !== 1 ? "s" : ""}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-lg bg-bg-surface2 p-4 text-center">
            <p className="text-sm text-text-muted">No series to show</p>
          </div>
        )}
      </section>
    </aside>
  );
}
