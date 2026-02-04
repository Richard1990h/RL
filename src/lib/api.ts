// Rally Live API Client
// Used by frontend components to call backend API routes

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
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

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, headers = {} } = options;

  const config: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    credentials: "include",
  };

  if (body && method !== "GET") {
    config.body = JSON.stringify(body);
  }

  const res = await fetch(endpoint, config);

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  return res.json();
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
      request(`/api/users/${id}`, { method: "PUT", body: data }),
    delete: (id: string) =>
      request(`/api/users/${id}`, { method: "DELETE" }),
    follow: (id: string) =>
      request(`/api/users/${id}/follow`, { method: "POST" }),
    unfollow: (id: string) =>
      request(`/api/users/${id}/follow`, { method: "DELETE" }),
    block: (id: string) =>
      request(`/api/users/${id}/block`, { method: "POST" }),
    unblock: (id: string) =>
      request(`/api/users/${id}/block`, { method: "DELETE" }),
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
      request("/api/videos", { method: "POST", body: data }),
    update: (id: string, data: Record<string, unknown>) =>
      request(`/api/videos/${id}`, { method: "PUT", body: data }),
    delete: (id: string) =>
      request(`/api/videos/${id}`, { method: "DELETE" }),
    like: (id: string, isLike: boolean) =>
      request(`/api/videos/${id}/like`, { method: "POST", body: { isLike } }),
    comments: (id: string, params?: Record<string, string>) => {
      const query = params ? "?" + new URLSearchParams(params).toString() : "";
      return request(`/api/videos/${id}/comments${query}`);
    },
    addComment: (id: string, text: string) =>
      request(`/api/videos/${id}/comments`, { method: "POST", body: { text } }),
    likeComment: (videoId: string, commentId: string) =>
      request(`/api/videos/${videoId}/comments/${commentId}/like`, { method: "POST" }),
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
      request("/api/series", { method: "POST", body: data }),
    update: (id: string, data: Record<string, unknown>) =>
      request(`/api/series/${id}`, { method: "PUT", body: data }),
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
      request("/api/messages", { method: "POST", body: data }),
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
      request("/api/live", { method: "POST", body: data }),
    update: (id: string, data: Record<string, unknown>) =>
      request(`/api/live/${id}`, { method: "PUT", body: data }),
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
      request(`/api/live/${id}/chat`, { method: "POST", body: data }),
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
  ): { promise: Promise<{ url: string; path: string }>; abort: () => void } => {
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

    const promise = (async (): Promise<{ url: string; path: string }> => {
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

// ── Legacy exports for backward compatibility during migration ──
// These will be removed once all pages are updated to use the api object
export async function fetchVideos() {
  const res = await api.videos.list();
  return (res as { videos: unknown[] }).videos || [];
}

export async function fetchVideo(id: string) {
  try {
    const res = await api.videos.get(id);
    return (res as { video: unknown }).video;
  } catch {
    return undefined;
  }
}

export async function fetchSeries(id: string) {
  try {
    const res = await api.series.get(id);
    return (res as { series: unknown }).series;
  } catch {
    return undefined;
  }
}

export async function fetchAllSeries() {
  const res = await api.series.list();
  return (res as { series: unknown[] }).series || [];
}

export async function fetchUser(id: string) {
  try {
    const res = await api.users.get(id);
    return (res as { user: unknown }).user;
  } catch {
    return undefined;
  }
}

export async function fetchLiveRooms() {
  const res = await api.live.list();
  return (res as { streams: unknown[] }).streams || [];
}

export async function fetchLiveRoom(id: string) {
  try {
    const res = await api.live.get(id);
    return (res as { stream: unknown }).stream;
  } catch {
    return undefined;
  }
}

export async function fetchNotifications() {
  const res = await api.notifications.list();
  return (res as { notifications: unknown[] }).notifications || [];
}

export async function searchVideos(query: string) {
  const res = await api.search({ q: query, type: "videos" });
  return (res as { videos: unknown[] }).videos || [];
}
