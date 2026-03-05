export const PLATFORM_ROLLOUT_ORDER = [
  "youtube",
  "twitch",
  "tiktok",
  "kick",
  "facebook",
] as const;

export type RestreamPlatform = (typeof PLATFORM_ROLLOUT_ORDER)[number];

// Launch gate: production rollout is progressive, not all-at-once.
export const ENABLED_RESTREAM_PLATFORMS: readonly RestreamPlatform[] = ["youtube"];

const rolloutRank = new Map<RestreamPlatform, number>(
  PLATFORM_ROLLOUT_ORDER.map((p, idx) => [p, idx]),
);

export function isPlatformEnabled(platform: string): platform is RestreamPlatform {
  return ENABLED_RESTREAM_PLATFORMS.includes(platform as RestreamPlatform);
}

export function getRolloutPolicy() {
  return PLATFORM_ROLLOUT_ORDER.map((platform) => ({
    platform,
    enabled: ENABLED_RESTREAM_PLATFORMS.includes(platform),
    order: rolloutRank.get(platform) ?? 999,
  }));
}

export interface RestreamTargetInput {
  platform?: unknown;
  enabled?: unknown;
  ingestUrl?: unknown;
  streamKey?: unknown;
  oauthConnected?: unknown;
}

export interface RestreamTargetStored {
  platform: RestreamPlatform;
  enabled: boolean;
  ingestUrl: string;
  oauthConnected: boolean;
  streamKeyMasked: string | null;
  streamKeyCiphertext?: string | null;
}

export function maskStreamKey(key?: string | null): string | null {
  if (!key) return null;
  if (key.length <= 4) return "*".repeat(key.length);
  return `${"*".repeat(Math.max(4, key.length - 4))}${key.slice(-4)}`;
}

export function sanitizeRestreamTargets(raw: unknown): RestreamTargetStored[] {
  if (!Array.isArray(raw)) return [];
  const out: RestreamTargetStored[] = [];
  for (const item of raw as RestreamTargetInput[]) {
    const platform = String(item?.platform || "").toLowerCase();
    if (!PLATFORM_ROLLOUT_ORDER.includes(platform as RestreamPlatform)) continue;
    const enabledRequested = Boolean(item?.enabled);
    const enabled = enabledRequested && isPlatformEnabled(platform);
    const ingestUrl = String(item?.ingestUrl || "").slice(0, 300);
    const streamKey = typeof item?.streamKey === "string" ? item.streamKey : null;
    out.push({
      platform: platform as RestreamPlatform,
      enabled,
      ingestUrl,
      oauthConnected: Boolean(item?.oauthConnected),
      streamKeyMasked: maskStreamKey(streamKey),
      streamKeyCiphertext: streamKey ? `enc:${Buffer.from(streamKey).toString("base64")}` : null,
    });
  }
  return out;
}

