# Rally Live Offline-First MVP

## Architecture summary
- Thin shell model: native shell only provides WebView/storage/network/background hooks.
- Web layer (Next.js) owns UI, offline queue, cache policy, and sync orchestration.
- Offline engine added under `src/lib/offline/*`.
- Sync API contracts added under `/api/sync/actions` and `/api/offline/*`.

## IndexedDB schema
- `queue_actions`: queued mutations with idempotency key, nonce, signature, retries, dependencies.
- `feed_snapshots`: last-known GET snapshots for feed/messages/live/session bootstrap.
- `cached_videos`: rolling metadata index for cached low-bitrate video assets.
- `sync_state`: online status, queue depth, sync cursor, version bounds.

## Cache scoring and eviction
```pseudo
score(video):
  completed_bonus = watchedComplete ? high : 0
  expired_bonus = expiresAt <= now ? very_high : 0
  recency = now - lastAccessAt
  size = bytes
  return completed_bonus + expired_bonus + recency + size

on eviction run:
  sort videos by descending score
  while count > maxOfflineVideos OR bytes > maxOfflineBytes OR expired/completed:
    evict next highest score
```

## Queue processor flow
```pseudo
enqueue(action):
  attach idempotencyKey + nonce + signature
  persist to IndexedDB

processQueue():
  if offline => stop
  load queued runnable actions (dependency + backoff aware)
  POST batch to /api/sync/actions
  accepted => delete from queue
  rejected => retry with backoff+jitter
  update sync_state cursor + queueDepth
```

## Backend API contracts
- `POST /api/sync/actions`: batch queued actions with idempotency + nonce + signature; per-item result.
- `GET /api/offline/prefetch-list`: followed-creators-only prefetch candidates + policy defaults.
- `GET /api/offline/signed-manifest?videoId=&quality=`: short-TTL signed manifest envelope.
- `GET /api/offline/version`: `currentWebVersion`, `minSupportedWebVersion`, update boundary hints.

## Implementation order (completed in this pass)
1. Offline core modules (`config`, `db`, `queue`, `connectivity`, `cache-manager`, `bootstrap`, signing).
2. API client wiring for snapshot reads/writes + offline mutation queueing.
3. Sync and offline backend routes.
4. Service worker staged updates and offline shell caching.
5. UI integration: offline/sync status bar + startup engine init.
6. Watch page safety for queued like responses.

## Remaining native shell work
- No true Capacitor native storage/security layer was wired in this pass (Keystore/Keychain-backed encryption + Filesystem segment persistence bridge).
- No Dexie package install happened (network-restricted install environment). Current implementation uses direct IndexedDB wrapper.
- Full encrypted segment pipeline and native opaque file-ID bridge still need native shell/plugin work.

## Admin data policy
- Admin pages and admin API routes are network-only and marked `Cache-Control: no-store`.
- Service worker bypasses offline caching for `/admin` routes.
- Offline snapshot/queue logic excludes `/api/admin` endpoints so admin actions always call back to the main server.

## Hardening updates applied
- Service worker shell caching and activation boundary were hardened for offline cold start and OTA-safe activation (`ACTIVATE_PENDING` only at safe boundary).
- Rolling eviction now enforces hard limits with absolute guardrails and post-watch eviction trigger (`markOfflineVideoWatchedComplete`).
- Upload queue now uses explicit dependency DAG: `upload/session -> upload/chunk-json[*] -> upload/complete`, with persisted upload jobs for crash-safe resume metadata.
- Encryption-at-rest hook added for cached segment payloads via AES-GCM with key retrieval path preferring native secure storage bridge and local fallback for web runtime.
