"use client";

import { useEffect, useState } from "react";
import { subscribeNetwork, getNetworkState } from "@/lib/offline/connectivity";
import { offlineDb } from "@/lib/offline/db";

export function OfflineStatusBar() {
  const [mounted, setMounted] = useState(false);
  const [online, setOnline] = useState<boolean>(true);
  const [queueDepth, setQueueDepth] = useState(0);

  useEffect(() => {
    setMounted(true);
    setOnline(getNetworkState() === "online");
    const stop = subscribeNetwork((state) => {
      setOnline(state === "online");
    });

    const interval = window.setInterval(() => {
      offlineDb.getSyncState().then((state) => {
        setQueueDepth(state?.queueDepth ?? 0);
      }).catch(() => {});
    }, 3000);

    return () => {
      stop();
      window.clearInterval(interval);
    };
  }, []);

  if (!mounted || (online && queueDepth === 0)) return null;

  return (
    <div className={`px-4 py-2 text-xs font-medium ${online ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-200"}`}>
      {online
        ? `${queueDepth} offline action${queueDepth === 1 ? "" : "s"} syncing in background`
        : `Offline mode active. ${queueDepth} action${queueDepth === 1 ? "" : "s"} queued.`}
    </div>
  );
}
