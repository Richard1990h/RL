// Rally Live API Client
// Used by frontend components to call backend API routes

import { offlineDb } from "@/lib/offline/db";
import { enqueueHttpAction, processOfflineQueue } from "@/lib/offline/queue";

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  queueOnOffline?: boolean;
  optimisticResponse?: unknown;
  snapshotKey?: string;
  allowOfflineSnapshot?: boolean;
};

export interface CustomAdResponse {
  id: string;
  userId: string;
  title: string;
  videoUrl: string;
  durationSec: number;
  status: string;
  creditsPaid: number;
  impressions: number;
  maxImpressions: number;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  user?: { username: string; displayName: string };
}

function isLikelyOfflineError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("failed to fetch") || message.includes("networkerror");
}

function shouldSnapshot(endpoint: string): boolean {
  return endpoint.startsWith("/api/videos")
    || endpoint.startsWith("/api/live")
    || endpoint.startsWith("/api/series")
    || endpoint.startsWith("/api/auth/me")
    || endpoint.startsWith("/api/messages");
}

function isSensitiveEndpoint(endpoint: string): boolean {
  return endpoint.startsWith("/api/admin");
}

function getSnapshotKey(method: string, endpoint: string, explicit?: string): string {
  return explicit ?? `${method.toUpperCase()}:${endpoint}`;
}

async function readSnapshot<T>(key: string): Promise<T | undefined> {
  if (typeof window === "undefined") return undefined;
  try {
    const snapshot = await offlineDb.getFeedSnapshot(key);
    return snapshot?.data as T | undefined;
  } catch {
    return undefined;
  }
}

async function writeSnapshot<T>(key: string, data: T): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await offlineDb.putFeedSnapshot({ key, data, updatedAt: Date.now() });
  } catch {
    // Best effort cache only.
  }
}

function isOfflineNow(): boolean {
  if (typeof navigator === "undefined") return false;
  return !navigator.onLine;
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const {
    method = "GET",
    body,
    headers = {},
    queueOnOffline = false,
    optimisticResponse,
    snapshotKey,
    allowOfflineSnapshot = true,
  } = options;
  const normalizedMethod = method.toUpperCase();
  const resolvedSnapshotKey = getSnapshotKey(normalizedMethod, endpoint, snapshotKey);

  const config: RequestInit = {
    method: normalizedMethod,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    credentials: "include",
  };

  if (body && normalizedMethod !== "GET") {
    config.body = JSON.stringify(body);
  }

  const sensitiveEndpoint = isSensitiveEndpoint(endpoint);
  const canUseOfflineSnapshot = allowOfflineSnapshot && !sensitiveEndpoint;
  const canQueueOffline = queueOnOffline && !sensitiveEndpoint;

  if (normalizedMethod === "GET" && isOfflineNow() && canUseOfflineSnapshot) {
    const snapshot = await readSnapshot<T>(resolvedSnapshotKey);
    if (snapshot !== undefined) return snapshot;
  }

  if (normalizedMethod !== "GET" && canQueueOffline && isOfflineNow()) {
    const queued = await enqueueHttpAction({
      endpoint,
      method: normalizedMethod,
      headers,
      body,
    });
    return ((optimisticResponse ?? { queued: true, queueId: queued.id }) as T);
  }

  try {
    const res = await fetch(endpoint, config);

    if (!res.ok) {
      if (normalizedMethod === "GET" && canUseOfflineSnapshot && res.status >= 500) {
        const snapshot = await readSnapshot<T>(resolvedSnapshotKey);
        if (snapshot !== undefined) return snapshot;
      }
      const error = await res.json().catch(() => ({ error: "Request failed" }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }

    const data = await res.json() as T;
    if (normalizedMethod === "GET" && !sensitiveEndpoint && shouldSnapshot(endpoint)) {
      await writeSnapshot(resolvedSnapshotKey, data);
    }
    if (normalizedMethod !== "GET" && typeof window !== "undefined" && navigator.onLine) {
      void processOfflineQueue();
    }
    return data;
  } catch (error) {
    if (normalizedMethod !== "GET" && canQueueOffline && isLikelyOfflineError(error)) {
      const queued = await enqueueHttpAction({
        endpoint,
        method: normalizedMethod,
        headers,
        body,
      });
      return ((optimisticResponse ?? { queued: true, queueId: queued.id }) as T);
    }
    if (normalizedMethod === "GET" && canUseOfflineSnapshot) {
      const snapshot = await readSnapshot<T>(resolvedSnapshotKey);
      if (snapshot !== undefined) return snapshot;
    }
    throw error;
  }
}

// ── Auth ──
export const api = {
  auth: {
    register: (data: { email: string; username: string; displayName: string; password: string; dateOfBirth: string; interests?: string[] }) =>
      request("/api/auth/register", { method: "POST", body: data }),
    login: (data: { email: string; password: string; rememberMe?: boolean }) =>
      request("/api/auth/login", { method: "POST", body: data }),
    logout: () =>
      request("/api/auth/logout", { method: "POST" }),
    me: () =>
      request<{ user: Record<string, unknown> } | null>("/api/auth/me"),
    checkUsername: (username: string) =>
      request<{ available: boolean; username: string }>(`/api/auth/check-username?username=${encodeURIComponent(username)}`),
  },

  // ── Platform ──
  platform: {
    stats: () =>
      request<{ activeCreators: number; totalViews: number; totalPaidToCreators: number }>("/api/platform/stats"),
  },

  // ── Analytics ──
  analytics: {
    get: () =>
      request<{
        totalViews: number;
        totalLikes: number;
        totalDislikes: number;
        totalVideos: number;
        followers: number;
        totalEarnedCents: number;
        viewsByMonth: number[];
        monthLabels: string[];
        topStreams: Array<{ title: string; date: string; peak: number; participants: number; chatMessages: number }>;
        liveStreamCount: number;
      }>("/api/analytics"),
  },

  // ── Users ──
  users: {
    list: (params?: Record<string, string>) => {
      const qs = params ? `?${new URLSearchParams(params)}` : "";
      return request(`/api/users${qs}`);
    },
    get: (id: string) =>
      request(`/api/users/${id}`),
    update: (id: string, data: Record<string, unknown>) =>
      request(`/api/users/${id}`, { method: "PUT", body: data, queueOnOffline: true }),
    delete: (id: string) =>
      request(`/api/users/${id}`, { method: "DELETE" }),
    follow: (id: string) =>
      request(`/api/users/${id}/follow`, { method: "POST", queueOnOffline: true, optimisticResponse: { queued: true } }),
    unfollow: (id: string) =>
      request(`/api/users/${id}/follow`, { method: "DELETE", queueOnOffline: true, optimisticResponse: { queued: true } }),
    block: (id: string) =>
      request(`/api/users/${id}/block`, { method: "POST", queueOnOffline: true }),
    unblock: (id: string) =>
      request(`/api/users/${id}/block`, { method: "DELETE", queueOnOffline: true }),
  },

  // ── Videos ──
  videos: {
    list: (params?: Record<string, string>) => {
      const query = params ? "?" + new URLSearchParams(params).toString() : "";
      return request(`/api/videos${query}`);
    },
    get: (id: string) =>
      request(`/api/videos/${id}`),
    create: (data: Record<string, unknown>) =>
      request("/api/videos", { method: "POST", body: data, queueOnOffline: true, optimisticResponse: { queued: true } }),
    update: (id: string, data: Record<string, unknown>) =>
      request(`/api/videos/${id}`, { method: "PUT", body: data, queueOnOffline: true, optimisticResponse: { queued: true } }),
    delete: (id: string) =>
      request(`/api/videos/${id}`, { method: "DELETE" }),
    like: (id: string, isLike: boolean) =>
      request(`/api/videos/${id}/like`, {
        method: "POST",
        body: { isLike },
        queueOnOffline: true,
        optimisticResponse: {
          action: isLike ? "liked" : "disliked",
          likes: 0,
          dislikes: 0,
          queued: true,
        },
      }),
    comments: (id: string, params?: Record<string, string>) => {
      const query = params ? "?" + new URLSearchParams(params).toString() : "";
      return request(`/api/videos/${id}/comments${query}`);
    },
    addComment: (id: string, text: string) =>
      request(`/api/videos/${id}/comments`, {
        method: "POST",
        body: { text },
        queueOnOffline: true,
        optimisticResponse: {
          queued: true,
          comment: {
            id: `temp_${Date.now()}`,
            userId: "me",
            videoId: id,
            text,
            likes: 0,
            createdAt: new Date().toISOString(),
            userLiked: false,
            user: {
              id: "me",
              username: "you",
              displayName: "You",
              avatarUrl: null,
              verifiedBadge: false,
            },
          },
        },
      }),
    likeComment: (videoId: string, commentId: string) =>
      request(`/api/videos/${videoId}/comments/${commentId}/like`, { method: "POST", queueOnOffline: true, optimisticResponse: { queued: true } }),
    donate: (id: string, credits: number) =>
      request(`/api/videos/${id}/donate`, { method: "POST", body: { credits } }),
  },

  // ── Series ──
  series: {
    list: (params?: Record<string, string>) => {
      const query = params ? "?" + new URLSearchParams(params).toString() : "";
      return request(`/api/series${query}`);
    },
    get: (id: string) =>
      request(`/api/series/${id}`),
    create: (data: Record<string, unknown>) =>
      request("/api/series", { method: "POST", body: data, queueOnOffline: true, optimisticResponse: { queued: true } }),
    update: (id: string, data: Record<string, unknown>) =>
      request(`/api/series/${id}`, { method: "PUT", body: data, queueOnOffline: true, optimisticResponse: { queued: true } }),
    delete: (id: string) =>
      request(`/api/series/${id}`, { method: "DELETE" }),
  },

  // ── Search ──
  search: (params: Record<string, string>) => {
    const query = new URLSearchParams(params).toString();
    return request(`/api/search?${query}`);
  },

  // ── Wallet ──
  wallet: {
    get: () =>
      request("/api/wallet"),
    deposit: (data: { amountCents: number; method: "stripe" | "paypal" }) =>
      request("/api/wallet/deposit", { method: "POST", body: data }),
    withdraw: (data: { credits: number }) =>
      request("/api/wallet/withdraw", { method: "POST", body: data }),
    buyCredits: (data: { amountCents: number; method: "stripe" | "paypal" }) =>
      request("/api/wallet/credits", { method: "POST", body: data }),
  },

  // ── Messages ──
  messages: {
    conversations: () =>
      request("/api/messages"),
    send: (data: { receiverId: string; text?: string; mediaUrl?: string; mediaType?: string; isPrivate: boolean; deleteAfter: string; viewTimerSec?: number }) =>
      request("/api/messages", {
        method: "POST",
        body: data,
        queueOnOffline: true,
        optimisticResponse: {
          queued: true,
          message: {
            id: `temp_${Date.now()}`,
            text: data.text ?? "",
            createdAt: new Date().toISOString(),
            pending: true,
          },
        },
      }),
    getConversation: (userId: string) =>
      request(`/api/messages/${userId}`),
    deleteConversation: (userId: string) =>
      request(`/api/messages/${userId}`, { method: "DELETE" }),
    openMessage: (userId: string, messageId: string) =>
      request(`/api/messages/${userId}/open`, { method: "POST", body: { messageId } }),
    streaks: () =>
      request("/api/messages/streak"),
  },

  // ── Live ──
  live: {
    list: (params?: Record<string, string>) => {
      const query = params ? "?" + new URLSearchParams(params).toString() : "";
      return request(`/api/live${query}`);
    },
    get: (id: string) =>
      request(`/api/live/${id}`),
    create: (data: Record<string, unknown>) =>
      request("/api/live", { method: "POST", body: data, queueOnOffline: true, optimisticResponse: { queued: true } }),
    update: (id: string, data: Record<string, unknown>) =>
      request(`/api/live/${id}`, { method: "PUT", body: data, queueOnOffline: true, optimisticResponse: { queued: true } }),
    end: (id: string) =>
      request(`/api/live/${id}`, { method: "DELETE" }),
    join: (id: string, role: "viewer" | "guest") =>
      request(`/api/live/${id}/join`, { method: "POST", body: { role } }),
    leave: (id: string) =>
      request(`/api/live/${id}/leave`, { method: "POST" }),
    chat: (id: string, params?: Record<string, string>) => {
      const query = params ? "?" + new URLSearchParams(params).toString() : "";
      return request(`/api/live/${id}/chat${query}`);
    },
    sendChat: (id: string, data: { text: string; isDonation?: boolean; creditAmount?: number }) =>
      request(`/api/live/${id}/chat`, { method: "POST", body: data, queueOnOffline: true, optimisticResponse: { queued: true } }),
    moderate: (id: string, data: { action: string; targetUserId: string; timeoutMinutes?: number }) =>
      request(`/api/live/${id}/moderate`, { method: "POST", body: data }),
  },

  // ── Recordings ──
  recordings: {
    list: () => request("/api/recordings"),
    get: (id: string) => request(`/api/recordings?id=${id}`),
    delete: (id: string) => request(`/api/recordings/${id}`, { method: "DELETE" }),
  },

  // ── Services ──
  services: {
    list: (params?: Record<string, string>) => {
      const query = params ? "?" + new URLSearchParams(params).toString() : "";
      return request(`/api/services${query}`);
    },
    get: (id: string) =>
      request(`/api/services/${id}`),
    create: (data: Record<string, unknown>) =>
      request("/api/services", { method: "POST", body: data }),
    update: (id: string, data: Record<string, unknown>) =>
      request(`/api/services/${id}`, { method: "PUT", body: data }),
    delete: (id: string) =>
      request(`/api/services/${id}`, { method: "DELETE" }),
    order: (id: string, notes?: string) =>
      request(`/api/services/${id}/order`, { method: "POST", body: { notes } }),
    orders: (params?: Record<string, string>) => {
      const query = params ? "?" + new URLSearchParams(params).toString() : "";
      return request(`/api/services/orders${query}`);
    },
    updateOrder: (orderId: string, data: { status: string }) =>
      request(`/api/services/orders/${orderId}`, { method: "PUT", body: data }),
  },

  // ── Friends ──
  friends: {
    list: (params?: Record<string, string>) => {
      const query = params ? "?" + new URLSearchParams(params).toString() : "";
      return request(`/api/friends${query}`);
    },
    requests: (direction: "incoming" | "outgoing" = "incoming") =>
      request(`/api/friends/requests?direction=${direction}`),
    sendRequest: (userId: string) =>
      request(`/api/users/${userId}/friend-request`, { method: "POST" }),
    cancelRequest: (userId: string) =>
      request(`/api/users/${userId}/friend-request`, { method: "DELETE" }),
    respondToRequest: (userId: string, action: "accept" | "decline") =>
      request(`/api/users/${userId}/friend-request/respond`, { method: "POST", body: { action } }),
    remove: (userId: string) =>
      request(`/api/users/${userId}/friend`, { method: "DELETE" }),
    setTimeout: (userId: string, duration: number) =>
      request(`/api/users/${userId}/friend/timeout`, { method: "POST", body: { duration } }),
    removeTimeout: (userId: string) =>
      request(`/api/users/${userId}/friend/timeout`, { method: "DELETE" }),
    heartbeat: () =>
      request("/api/heartbeat", { method: "POST" }),
  },

  // ── Notifications ──
  notifications: {
    list: (params?: Record<string, string>) => {
      const query = params ? "?" + new URLSearchParams(params).toString() : "";
      return request(`/api/notifications${query}`);
    },
    markRead: (data: { ids?: string[]; all?: boolean }) =>
      request("/api/notifications", { method: "PUT", body: data }),
  },

  // ── Reports ──
  reports: {
    create: (data: { reportedId: string; reason: string; type: string; contentId?: string }) =>
      request("/api/reports", { method: "POST", body: data }),
  },

  // ── Subscription ──
  subscription: {
    get: () =>
      request("/api/subscription"),
    subscribe: (method: "stripe" | "paypal") =>
      request("/api/subscription", { method: "POST", body: { method } }),
    cancel: () =>
      request("/api/subscription", { method: "DELETE" }),
  },

  // ── Creator Settings ──
  creator: {
    getLiveSettings: () =>
      request<{ liveSettings: Record<string, unknown> }>("/api/creator/live-settings"),
    updateLiveSettings: (data: Record<string, unknown>) =>
      request("/api/creator/live-settings", { method: "PUT", body: data }),
    getModerationSettings: () =>
      request<{ moderationSettings: Record<string, unknown> }>("/api/creator/moderation"),
    updateModerationSettings: (data: Record<string, unknown>) =>
      request("/api/creator/moderation", { method: "PUT", body: data }),
    getIntegrations: () =>
      request<{ integrations: Record<string, unknown> }>("/api/creator/integrations"),
    updateIntegrations: (data: Record<string, unknown>) =>
      request("/api/creator/integrations", { method: "PUT", body: data }),
    getIntegrationTokens: () =>
      request<{ streamlabsToken: string | null; obsHost: string | null; obsPort: number | null; obsPassword: string | null }>("/api/creator/integrations/token"),
    getStreamKey: () =>
      request<{ streamKey: string; rtmpUrl: string }>("/api/creator/stream-key"),
    regenerateStreamKey: () =>
      request<{ streamKey: string; rtmpUrl: string }>("/api/creator/stream-key", { method: "POST" }),
  },

  // ── Ads ──
  ads: {
    getSettings: () =>
      request<{ adSettings: Record<string, unknown> | null; eligible: boolean; followerCount: number; revenueSharePct: number }>("/api/ads/settings"),
    updateSettings: (data: Record<string, unknown>) =>
      request("/api/ads/settings", { method: "PUT", body: data }),
    // Custom ad marketplace
    customAds: () =>
      request<{ ads: CustomAdResponse[] }>("/api/ads/custom"),
    submitCustomAd: (data: { title: string; videoUrl: string; durationSec: number }) =>
      request<{ ad: CustomAdResponse; price: number }>("/api/ads/custom", { method: "POST", body: data }),
    updateCustomAd: (id: string, data: Record<string, unknown>) =>
      request<{ ad: CustomAdResponse }>(`/api/ads/custom/${id}`, { method: "PATCH", body: data }),
    deleteCustomAd: (id: string) =>
      request<{ success: boolean; refundedCredits: number }>(`/api/ads/custom/${id}`, { method: "DELETE" }),
    customAdPrice: () =>
      request<{ price: number; costPerImpression: number; minBalance: number; mixPercent: number }>("/api/ads/custom/price"),
  },

  // ── Upload ──
  upload: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: "Upload failed" }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }
    return res.json() as Promise<{ url: string; path: string }>;
  },

  // Chunked upload with XHR progress per chunk, resume support, and auto-retry
  uploadWithProgress: (
    file: File,
    onProgress: (percent: number) => void
  ): { promise: Promise<{ url: string; path: string; queued?: boolean; uploadId?: string }>; abort: () => void } => {
    const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks — small enough for mobile connections
    const MAX_RETRIES = 5;
    let aborted = false;
    let currentXhr: XMLHttpRequest | null = null;

    const uploadId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    // Upload a single chunk via XHR so we get real-time progress
    function uploadChunkXHR(
      chunkBlob: Blob,
      chunkIndex: number,
      onChunkProgress: (loaded: number, total: number) => void
    ): Promise<void> {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        currentXhr = xhr;

        const formData = new FormData();
        formData.append("chunk", chunkBlob, file.name);
        formData.append("uploadId", uploadId);
        formData.append("chunkIndex", String(chunkIndex));
        formData.append("totalChunks", String(totalChunks));
        formData.append("fileName", file.name);

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) onChunkProgress(e.loaded, e.total);
        });

        xhr.addEventListener("load", () => {
          currentXhr = null;
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else if (xhr.status === 413) {
            reject(new Error("CHUNK_TOO_LARGE"));
          } else if (xhr.status >= 400 && xhr.status < 500) {
            try {
              const err = JSON.parse(xhr.responseText);
              reject(new Error(err.error || `HTTP ${xhr.status}`));
            } catch { reject(new Error(`Chunk failed (HTTP ${xhr.status})`)); }
          } else {
            reject(new Error("RETRY"));
          }
        });

        xhr.addEventListener("error", () => { currentXhr = null; reject(new Error("RETRY")); });
        xhr.addEventListener("abort", () => { currentXhr = null; reject(new Error("Upload cancelled")); });
        xhr.addEventListener("timeout", () => { currentXhr = null; reject(new Error("RETRY")); });

        xhr.open("POST", "/api/upload/chunk");
        xhr.withCredentials = true;
        xhr.timeout = 120000; // 2 min per chunk
        xhr.send(formData);
      });
    }

    const promise = (async (): Promise<{ url: string; path: string; queued?: boolean; uploadId?: string }> => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const { enqueueUploadFile } = await import("@/lib/offline/upload-queue");
        const job = await enqueueUploadFile(file);
        onProgress(100);
        return {
          url: "",
          path: `queued://${job.uploadId}`,
          queued: true,
          uploadId: job.uploadId,
        };
      }

      // Check for already-uploaded chunks (resume support)
      let completedChunks: number[] = [];
      try {
        const res = await fetch(`/api/upload/chunk?uploadId=${uploadId}`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          completedChunks = data.completedChunks || [];
        }
      } catch {
        // Fresh start
      }

      // Upload each chunk with smooth progress
      for (let i = 0; i < totalChunks; i++) {
        if (aborted) throw new Error("Upload cancelled");

        // Skip already-uploaded chunks
        if (completedChunks.includes(i)) {
          const pct = Math.round(((i + 1) / totalChunks) * 95);
          onProgress(pct);
          continue;
        }

        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunkBlob = file.slice(start, end);

        let success = false;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          if (aborted) throw new Error("Upload cancelled");

          try {
            await uploadChunkXHR(chunkBlob, i, (loaded, total) => {
              // Smooth progress: base from completed chunks + fraction of current chunk
              const chunkFraction = loaded / total;
              const overall = ((i + chunkFraction) / totalChunks) * 95;
              onProgress(Math.round(overall));
            });
            success = true;
            break;
          } catch (err: any) {
            if (err.message === "Upload cancelled") throw err;
            if (err.message === "CHUNK_TOO_LARGE") {
              throw new Error("Upload chunk rejected by server. Please try again.");
            }
            if (err.message === "RETRY") {
              // Network/server error — wait and retry
              if (attempt < MAX_RETRIES - 1) {
                await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
              }
              continue;
            }
            // Non-retryable error (4xx)
            throw err;
          }
        }

        if (!success) {
          throw new Error(
            `Upload stalled on part ${i + 1} of ${totalChunks} after ${MAX_RETRIES} retries. ` +
            `Check your internet connection and try again — your progress will be saved.`
          );
        }

        onProgress(Math.round(((i + 1) / totalChunks) * 95));
      }

      if (aborted) throw new Error("Upload cancelled");

      // Assemble on server
      onProgress(96);
      const assembleRes = await fetch("/api/upload/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ uploadId, totalChunks, fileName: file.name }),
      });

      if (!assembleRes.ok) {
        const err = await assembleRes.json().catch(() => ({ error: "Assembly failed" }));
        if (err.missingChunks) {
          throw new Error(`Upload incomplete — ${err.missingChunks.length} chunk(s) missing. Please try again.`);
        }
        throw new Error(err.error || "Failed to assemble uploaded file");
      }

      onProgress(100);
      return assembleRes.json();
    })();

    return {
      promise,
      abort: () => {
        aborted = true;
        if (currentXhr) { try { currentXhr.abort(); } catch {} }
      },
    };
  },
};

