import { offlineDb } from "@/lib/offline/db";
import { enqueueHttpAction } from "@/lib/offline/queue";
import type { UploadJobRecord } from "@/lib/offline/types";

const DEFAULT_CHUNK_SIZE = 512 * 1024;

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function sliceToBase64(file: Blob, start: number, end: number): Promise<string> {
  const chunk = file.slice(start, end);
  const buffer = await chunk.arrayBuffer();
  return toBase64(new Uint8Array(buffer));
}

export async function enqueueUploadFile(file: File): Promise<UploadJobRecord> {
  const uploadId = makeId("upload");
  const chunkSize = DEFAULT_CHUNK_SIZE;
  const totalChunks = Math.ceil(file.size / chunkSize);

  await offlineDb.putUploadBlob(uploadId, file);

  const createAction = await enqueueHttpAction({
    endpoint: "/api/upload/session",
    method: "POST",
    operation: "upload_create",
    body: {
      uploadId,
      fileName: file.name,
      mimeType: file.type,
      totalChunks,
    },
  });

  const chunkActionIds: string[] = [];
  let previousId = createAction.id;

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(file.size, start + chunkSize);
    const chunkBase64 = await sliceToBase64(file, start, end);
    const chunkAction = await enqueueHttpAction({
      endpoint: "/api/upload/chunk-json",
      method: "POST",
      operation: "upload_chunk",
      dependsOn: [previousId],
      body: {
        uploadId,
        chunkIndex: i,
        totalChunks,
        fileName: file.name,
        chunkBase64,
      },
    });
    chunkActionIds.push(chunkAction.id);
    previousId = chunkAction.id;
  }

  const commitAction = await enqueueHttpAction({
    endpoint: "/api/upload/complete",
    method: "POST",
    operation: "upload_commit",
    dependsOn: [previousId],
    body: {
      uploadId,
      totalChunks,
      fileName: file.name,
    },
  });

  const now = Date.now();
  const job: UploadJobRecord = {
    id: makeId("job"),
    uploadId,
    fileName: file.name,
    mimeType: file.type,
    fileSize: file.size,
    chunkSize,
    totalChunks,
    completedChunks: [],
    createActionId: createAction.id,
    chunkActionIds,
    commitActionId: commitAction.id,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  };

  await offlineDb.putUploadJob(job);
  return job;
}

export async function recoverUploadJobs(): Promise<void> {
  const jobs = await offlineDb.listUploadJobs();
  const actions = await offlineDb.listQueueActions();
  const actionIds = new Set(actions.map((a) => a.id));

  for (const job of jobs) {
    const required = [job.createActionId, ...job.chunkActionIds, job.commitActionId];
    const missingAction = required.some((id) => !actionIds.has(id));
    if (!missingAction) continue;

    const blob = await offlineDb.getUploadBlob(job.uploadId);
    if (!blob) {
      await offlineDb.putUploadJob({ ...job, status: "failed", updatedAt: Date.now() });
      continue;
    }

    await offlineDb.deleteUploadJob(job.id);
    await enqueueUploadFile(new File([blob], job.fileName, { type: job.mimeType || "application/octet-stream" }));
  }
}
