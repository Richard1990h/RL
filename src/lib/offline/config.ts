export const OFFLINE_DEFAULTS = {
  maxOfflineVideos: 18,
  maxOfflineBytes: 800 * 1024 * 1024,
  expiresDays: 3,
  wifiOnlyPrefetch: true,
  cacheQualities: ["144p", "240p"] as const,
  signedUrlTtlSeconds: 60,
};

export const OFFLINE_KEYS = {
  settings: "rally_offline_settings_v1",
  appVersion: "rally_web_app_version",
  pendingServiceWorker: "rally_sw_pending_activate",
};

export type OfflineSettings = {
  maxOfflineVideos: number;
  maxOfflineBytes: number;
  expiresDays: number;
  wifiOnlyPrefetch: boolean;
};

export function getOfflineSettings(): OfflineSettings {
  if (typeof window === "undefined") return OFFLINE_DEFAULTS;
  try {
    const raw = window.localStorage.getItem(OFFLINE_KEYS.settings);
    if (!raw) return OFFLINE_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<OfflineSettings>;
    return {
      maxOfflineVideos: parsed.maxOfflineVideos ?? OFFLINE_DEFAULTS.maxOfflineVideos,
      maxOfflineBytes: parsed.maxOfflineBytes ?? OFFLINE_DEFAULTS.maxOfflineBytes,
      expiresDays: parsed.expiresDays ?? OFFLINE_DEFAULTS.expiresDays,
      wifiOnlyPrefetch: parsed.wifiOnlyPrefetch ?? OFFLINE_DEFAULTS.wifiOnlyPrefetch,
    };
  } catch {
    return OFFLINE_DEFAULTS;
  }
}

export function saveOfflineSettings(settings: Partial<OfflineSettings>): OfflineSettings {
  const merged = { ...getOfflineSettings(), ...settings };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(OFFLINE_KEYS.settings, JSON.stringify(merged));
  }
  return merged;
}
