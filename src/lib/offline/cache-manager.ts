import { getOfflineSettings } from "@/lib/offline/config";
import { offlineDb } from "@/lib/offline/db";
import { removeEncryptedSegmentsForVideo } from "@/lib/offline/segment-storage";

const HARD_MIN_VIDEOS = 12;
const HARD_MAX_VIDEOS = 24;
const HARD_MAX_BYTES = 1024 * 1024 * 1024; // 1GB absolute ceiling

function rankForEviction(video: {
  lastAccessAt: number;
  watchedCompletedAt?: number;
  expiresAt: number;
  bytes: number;
}): number {
  const now = Date.now();
  const completedPenalty = video.watchedCompletedAt ? 10_000_000 : 0;
  const expiredPenalty = video.expiresAt <= now ? 20_000_000 : 0;
  const recencyPenalty = Math.max(0, now - video.lastAccessAt);
  const sizePenalty = video.bytes;
  return completedPenalty + expiredPenalty + recencyPenalty + sizePenalty;
}

function getEffectiveLimits() {
  const settings = getOfflineSettings();
  return {
    maxOfflineVideos: Math.max(HARD_MIN_VIDEOS, Math.min(HARD_MAX_VIDEOS, settings.maxOfflineVideos)),
    maxOfflineBytes: Math.min(HARD_MAX_BYTES, Math.max(100 * 1024 * 1024, settings.maxOfflineBytes)),
  };
}

export async function runOfflineCacheEviction(): Promise<void> {
  const limits = getEffectiveLimits();
  let videos = await offlineDb.listCachedVideos();
  if (videos.length === 0) return;

  while (videos.length > 0) {
    const totalBytes = videos.reduce((sum, item) => sum + item.bytes, 0);
    const candidate = [...videos].sort((a, b) => rankForEviction(b) - rankForEviction(a))[0];
    const mustEvictByCount = videos.length > limits.maxOfflineVideos;
    const mustEvictByBytes = totalBytes > limits.maxOfflineBytes;
    const mustEvictByState = candidate.expiresAt <= Date.now() || Boolean(candidate.watchedCompletedAt);

    if (!mustEvictByCount && !mustEvictByBytes && !mustEvictByState) {
      break;
    }

    await removeEncryptedSegmentsForVideo(candidate.id);
    await offlineDb.deleteCachedVideo(candidate.id);
    videos = await offlineDb.listCachedVideos();
  }
}

export async function markOfflineVideoWatchedComplete(videoId: string): Promise<void> {
  const cached = await offlineDb.getCachedVideo(videoId);
  if (!cached) return;
  await offlineDb.putCachedVideo({
    ...cached,
    watchedCompletedAt: Date.now(),
    lastAccessAt: Date.now(),
  });
  await runOfflineCacheEviction();
}
