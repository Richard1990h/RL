import type {
  CachedVideoRecord,
  EncryptedSegmentRecord,
  FeedSnapshotRecord,
  OfflineQueueAction,
  SyncStateRecord,
  UploadJobRecord,
} from "@/lib/offline/types";

type DbStoreName =
  | "queue_actions"
  | "feed_snapshots"
  | "cached_videos"
  | "sync_state"
  | "upload_jobs"
  | "upload_blobs"
  | "encrypted_segments";

const DB_NAME = "rally-offline-db";
const DB_VERSION = 3;

class OfflineDB {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    if (typeof indexedDB === "undefined") {
      return Promise.reject(new Error("IndexedDB is not available in this runtime"));
    }
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("queue_actions")) {
          const store = db.createObjectStore("queue_actions", { keyPath: "id" });
          store.createIndex("by_not_before", "notBefore", { unique: false });
          store.createIndex("by_status", "status", { unique: false });
          store.createIndex("by_created", "createdAt", { unique: false });
          store.createIndex("by_operation", "operation", { unique: false });
        } else {
          const store = request.transaction?.objectStore("queue_actions");
          if (store && !store.indexNames.contains("by_operation")) {
            store.createIndex("by_operation", "operation", { unique: false });
          }
        }
        if (!db.objectStoreNames.contains("feed_snapshots")) {
          const store = db.createObjectStore("feed_snapshots", { keyPath: "key" });
          store.createIndex("by_updated", "updatedAt", { unique: false });
        }
        if (!db.objectStoreNames.contains("cached_videos")) {
          const store = db.createObjectStore("cached_videos", { keyPath: "id" });
          store.createIndex("by_access", "lastAccessAt", { unique: false });
          store.createIndex("by_expires", "expiresAt", { unique: false });
          store.createIndex("by_created", "createdAt", { unique: false });
        }
        if (!db.objectStoreNames.contains("sync_state")) {
          db.createObjectStore("sync_state", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("upload_jobs")) {
          const store = db.createObjectStore("upload_jobs", { keyPath: "id" });
          store.createIndex("by_upload_id", "uploadId", { unique: true });
          store.createIndex("by_status", "status", { unique: false });
          store.createIndex("by_updated", "updatedAt", { unique: false });
        }
        if (!db.objectStoreNames.contains("upload_blobs")) {
          db.createObjectStore("upload_blobs", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("encrypted_segments")) {
          const store = db.createObjectStore("encrypted_segments", { keyPath: "id" });
          store.createIndex("by_video_id", "videoId", { unique: false });
          store.createIndex("by_access", "lastAccessAt", { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Failed to open offline database"));
    });
    return this.dbPromise;
  }

  private async tx<T>(store: DbStoreName, mode: IDBTransactionMode, fn: (os: IDBObjectStore) => Promise<T>): Promise<T> {
    const db = await this.open();
    const transaction = db.transaction(store, mode);
    const os = transaction.objectStore(store);
    const result = await fn(os);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    });
    return result;
  }

  async putQueueAction(action: OfflineQueueAction): Promise<void> {
    await this.tx("queue_actions", "readwrite", (os) => requestAsPromise<void>(os.put(action)));
  }

  async listQueueActions(): Promise<OfflineQueueAction[]> {
    return this.tx("queue_actions", "readonly", (os) =>
      requestAsPromise<OfflineQueueAction[]>(os.getAll())
    );
  }

  async deleteQueueAction(id: string): Promise<void> {
    await this.tx("queue_actions", "readwrite", (os) => requestAsPromise<void>(os.delete(id)));
  }

  async putFeedSnapshot(record: FeedSnapshotRecord): Promise<void> {
    await this.tx("feed_snapshots", "readwrite", (os) => requestAsPromise<void>(os.put(record)));
  }

  async getFeedSnapshot(key: string): Promise<FeedSnapshotRecord | undefined> {
    return this.tx("feed_snapshots", "readonly", (os) =>
      requestAsPromise<FeedSnapshotRecord | undefined>(os.get(key))
    );
  }

  async putCachedVideo(record: CachedVideoRecord): Promise<void> {
    await this.tx("cached_videos", "readwrite", (os) => requestAsPromise<void>(os.put(record)));
  }

  async listCachedVideos(): Promise<CachedVideoRecord[]> {
    return this.tx("cached_videos", "readonly", (os) => requestAsPromise<CachedVideoRecord[]>(os.getAll()));
  }

  async deleteCachedVideo(id: string): Promise<void> {
    await this.tx("cached_videos", "readwrite", (os) => requestAsPromise<void>(os.delete(id)));
  }

  async getCachedVideo(id: string): Promise<CachedVideoRecord | undefined> {
    return this.tx("cached_videos", "readonly", (os) => requestAsPromise<CachedVideoRecord | undefined>(os.get(id)));
  }

  async getSyncState(): Promise<SyncStateRecord | undefined> {
    return this.tx("sync_state", "readonly", (os) => requestAsPromise<SyncStateRecord | undefined>(os.get("singleton")));
  }

  async putSyncState(state: SyncStateRecord): Promise<void> {
    await this.tx("sync_state", "readwrite", (os) => requestAsPromise<void>(os.put(state)));
  }

  async putUploadJob(job: UploadJobRecord): Promise<void> {
    await this.tx("upload_jobs", "readwrite", (os) => requestAsPromise<void>(os.put(job)));
  }

  async getUploadJob(id: string): Promise<UploadJobRecord | undefined> {
    return this.tx("upload_jobs", "readonly", (os) => requestAsPromise<UploadJobRecord | undefined>(os.get(id)));
  }

  async getUploadJobByUploadId(uploadId: string): Promise<UploadJobRecord | undefined> {
    return this.tx("upload_jobs", "readonly", async (os) => {
      const index = os.index("by_upload_id");
      return requestAsPromise<UploadJobRecord | undefined>(index.get(uploadId));
    });
  }

  async listUploadJobs(): Promise<UploadJobRecord[]> {
    return this.tx("upload_jobs", "readonly", (os) => requestAsPromise<UploadJobRecord[]>(os.getAll()));
  }

  async deleteUploadJob(id: string): Promise<void> {
    await this.tx("upload_jobs", "readwrite", (os) => requestAsPromise<void>(os.delete(id)));
  }

  async putUploadBlob(id: string, blob: Blob): Promise<void> {
    await this.tx("upload_blobs", "readwrite", (os) => requestAsPromise<void>(os.put({ id, blob })));
  }

  async getUploadBlob(id: string): Promise<Blob | undefined> {
    return this.tx("upload_blobs", "readonly", async (os) => {
      const record = await requestAsPromise<{ id: string; blob: Blob } | undefined>(os.get(id));
      return record?.blob;
    });
  }

  async deleteUploadBlob(id: string): Promise<void> {
    await this.tx("upload_blobs", "readwrite", (os) => requestAsPromise<void>(os.delete(id)));
  }

  async putEncryptedSegment(record: EncryptedSegmentRecord): Promise<void> {
    await this.tx("encrypted_segments", "readwrite", (os) => requestAsPromise<void>(os.put(record)));
  }

  async getEncryptedSegment(id: string): Promise<EncryptedSegmentRecord | undefined> {
    return this.tx("encrypted_segments", "readonly", (os) => requestAsPromise<EncryptedSegmentRecord | undefined>(os.get(id)));
  }

  async deleteEncryptedSegment(id: string): Promise<void> {
    await this.tx("encrypted_segments", "readwrite", (os) => requestAsPromise<void>(os.delete(id)));
  }

  async listEncryptedSegmentsByVideo(videoId: string): Promise<EncryptedSegmentRecord[]> {
    return this.tx("encrypted_segments", "readonly", async (os) => {
      const index = os.index("by_video_id");
      return requestAsPromise<EncryptedSegmentRecord[]>(index.getAll(videoId));
    });
  }

  async deleteEncryptedSegmentsByVideo(videoId: string): Promise<void> {
    const records = await this.listEncryptedSegmentsByVideo(videoId);
    if (records.length === 0) return;
    await this.tx("encrypted_segments", "readwrite", async (os) => {
      for (const record of records) {
        await requestAsPromise<void>(os.delete(record.id));
      }
      return undefined;
    });
  }
}

function requestAsPromise<T>(request: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export const offlineDb = new OfflineDB();
