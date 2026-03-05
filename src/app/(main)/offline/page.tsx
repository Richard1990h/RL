"use client";

import { WifiOff, Upload, MessageCircle, Pencil, CalendarClock, ListChecks, Radio } from "lucide-react";

export default function OfflinePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-200">
        <WifiOff size={20} className="text-red-400" />
        <div>
          <p className="text-sm font-semibold">You are offline</p>
          <p className="text-xs text-red-200/80">Rally Live is running in offline mode.</p>
        </div>
      </div>

      <h1 className="text-2xl font-bold text-text">Offline Mode</h1>
      <p className="mt-2 text-sm text-text-secondary">
        You can keep using most of Rally Live while disconnected. Actions are queued and synced when your connection returns.
      </p>

      <section className="mt-6 rounded-xl border border-border bg-bg-surface p-4">
        <h2 className="text-sm font-semibold text-text">What you can do now</h2>
        <ul className="mt-3 space-y-2 text-sm text-text-secondary">
          <li className="flex items-center gap-2"><Upload size={16} className="text-primary" />Queue video uploads for auto-sync later</li>
          <li className="flex items-center gap-2"><Pencil size={16} className="text-primary" />Edit video metadata (title, description, thumbnail)</li>
          <li className="flex items-center gap-2"><CalendarClock size={16} className="text-primary" />Schedule publish dates</li>
          <li className="flex items-center gap-2"><MessageCircle size={16} className="text-primary" />Write messages/comments/likes (queued)</li>
          <li className="flex items-center gap-2"><ListChecks size={16} className="text-primary" />Browse cached feed snapshots and cached videos</li>
        </ul>
      </section>

      <section className="mt-4 rounded-xl border border-border bg-bg-surface p-4">
        <h2 className="text-sm font-semibold text-text">What requires internet</h2>
        <ul className="mt-3 space-y-2 text-sm text-text-secondary">
          <li className="flex items-center gap-2"><Radio size={16} className="text-danger" />Live streams and real-time live chat</li>
          <li className="flex items-center gap-2"><Radio size={16} className="text-danger" />Loading brand-new uncached videos</li>
          <li className="flex items-center gap-2"><Radio size={16} className="text-danger" />Admin tools (secure online-only)</li>
        </ul>
      </section>
    </div>
  );
}
