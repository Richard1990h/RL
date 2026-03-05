import { OFFLINE_KEYS } from "@/lib/offline/config";
import { initConnectivityWatch, subscribeNetwork } from "@/lib/offline/connectivity";
import { offlineDb } from "@/lib/offline/db";
import { runOfflineCacheEviction } from "@/lib/offline/cache-manager";
import { processOfflineQueue } from "@/lib/offline/queue";
import { recoverUploadJobs } from "@/lib/offline/upload-queue";

let initialized = false;

export function initOfflineEngine(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  initConnectivityWatch();

  subscribeNetwork((state) => {
    if (state === "online") {
      void processOfflineQueue();
    }
  });

  void runOfflineCacheEviction();
  void recoverUploadJobs();
  void checkWebVersionSupport();
  window.setInterval(() => {
    void runOfflineCacheEviction();
  }, 24 * 60 * 60 * 1000);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      const waiting = window.localStorage.getItem(OFFLINE_KEYS.pendingServiceWorker);
      if (waiting === "1" && navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage("ACTIVATE_PENDING");
      }
    }
    if (document.visibilityState === "visible") {
      void processOfflineQueue();
    }
  });
}

async function checkWebVersionSupport(): Promise<void> {
  try {
    const res = await fetch("/api/offline/version", { credentials: "include", cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json() as { currentWebVersion: string; minSupportedWebVersion: string };
    const state = await offlineDb.getSyncState();
    await offlineDb.putSyncState({
      id: "singleton",
      online: state?.online ?? navigator.onLine,
      inFlight: state?.inFlight ?? false,
      queueDepth: state?.queueDepth ?? 0,
      lastSyncAt: state?.lastSyncAt ?? 0,
      syncCursor: state?.syncCursor,
      currentWebVersion: data.currentWebVersion,
      minSupportedWebVersion: data.minSupportedWebVersion,
    });
    const isOutdated = compareVersions(data.currentWebVersion, data.minSupportedWebVersion) < 0;
    if (isOutdated) {
      window.localStorage.removeItem(OFFLINE_KEYS.pendingServiceWorker);
      window.location.reload();
    }
  } catch {
    // Ignore version check failures offline.
  }
}

function compareVersions(current: string, minimum: string): number {
  const normalize = (value: string) =>
    value.split(/[^\d]+/).filter(Boolean).map((part) => Number.parseInt(part, 10) || 0);

  const a = normalize(current);
  const b = normalize(minimum);
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left > right) return 1;
    if (left < right) return -1;
  }
  return 0;
}
