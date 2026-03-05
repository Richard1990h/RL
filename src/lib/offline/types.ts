export type QueueActionKind = "http" | "upload";
export type QueueActionOperation =
  | "mutation"
  | "upload_create"
  | "upload_chunk"
  | "upload_commit";

export interface OfflineQueueAction {
  id: string;
  kind: QueueActionKind;
  operation?: QueueActionOperation;
  endpoint: string;
  method: string;
  headers?: Record<string, string>;
  body?: unknown;
  idempotencyKey: string;
  nonce: string;
  signature?: string;
  attempts: number;
  notBefore: number;
  createdAt: number;
  updatedAt: number;
  dependsOn?: string[];
  status: "queued" | "running" | "failed";
  lastError?: string;
}

export interface FeedSnapshotRecord {
  key: string;
  data: unknown;
  updatedAt: number;
}

export interface CachedVideoRecord {
  id: string;
  creatorId: string;
  quality: "144p" | "240p";
  manifestFileId: string;
  segmentFileIds: string[];
  bytes: number;
  watchedCompletedAt?: number;
  lastAccessAt: number;
  createdAt: number;
  expiresAt: number;
}

export interface UploadJobRecord {
  id: string;
  uploadId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  chunkSize: number;
  totalChunks: number;
  completedChunks: number[];
  createActionId: string;
  chunkActionIds: string[];
  commitActionId: string;
  status: "queued" | "syncing" | "completed" | "failed";
  createdAt: number;
  updatedAt: number;
}

export interface EncryptedSegmentRecord {
  id: string;
  videoId: string;
  ivBase64: string;
  cipherBase64: string;
  storageType?: "indexeddb" | "native_filesystem";
  nativeFileId?: string;
  bytes: number;
  createdAt: number;
  lastAccessAt: number;
}

export interface SyncStateRecord {
  id: "singleton";
  online: boolean;
  lastSyncAt: number;
  queueDepth: number;
  inFlight: boolean;
  syncCursor?: string;
  minSupportedWebVersion?: string;
  currentWebVersion?: string;
}

export interface QueueResult {
  accepted: string[];
  rejected: Array<{ id: string; reason: string }>;
}
