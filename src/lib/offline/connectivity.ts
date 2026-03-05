import { offlineDb } from "@/lib/offline/db";

export type NetworkState = "online" | "offline";

type Listener = (state: NetworkState) => void;

let listeners: Listener[] = [];
let initialized = false;

export function getNetworkState(): NetworkState {
  if (typeof navigator === "undefined") return "online";
  return navigator.onLine ? "online" : "offline";
}

function emit(state: NetworkState) {
  listeners.forEach((listener) => listener(state));
}

export function subscribeNetwork(listener: Listener): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export async function setSyncOnline(online: boolean): Promise<void> {
  const previous = await offlineDb.getSyncState();
  await offlineDb.putSyncState({
    id: "singleton",
    online,
    inFlight: previous?.inFlight ?? false,
    queueDepth: previous?.queueDepth ?? 0,
    lastSyncAt: previous?.lastSyncAt ?? 0,
    syncCursor: previous?.syncCursor,
    minSupportedWebVersion: previous?.minSupportedWebVersion,
    currentWebVersion: previous?.currentWebVersion,
  });
}

export function initConnectivityWatch(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  const handle = () => {
    const state = getNetworkState();
    void setSyncOnline(state === "online");
    emit(state);
  };

  window.addEventListener("online", handle);
  window.addEventListener("offline", handle);
  handle();
}
