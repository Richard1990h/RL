// Upload recording chunks via existing chunked upload API

import type { RecordingChunk } from "./media-recorder-manager";

export interface ChunkUploaderOptions {
  uploadId: string;
  onProgress?: (uploadedChunks: number, totalChunks: number) => void;
  onError?: (error: string, chunkIndex: number) => void;
}

export class ChunkUploader {
  private uploadId: string;
  private queue: RecordingChunk[] = [];
  private uploading = false;
  private uploadedCount = 0;
  private totalExpected = 0;
  private options: ChunkUploaderOptions;
  private aborted = false;

  constructor(options: ChunkUploaderOptions) {
    this.options = options;
    this.uploadId = options.uploadId;
  }

  enqueue(chunk: RecordingChunk) {
    this.totalExpected = Math.max(this.totalExpected, chunk.index + 1);
    this.queue.push(chunk);
    this.processQueue();
  }

  async finalize(totalChunks: number): Promise<{ url: string; path: string } | null> {
    // Wait for all queued chunks to upload
    while (this.queue.length > 0 || this.uploading) {
      await new Promise((r) => setTimeout(r, 200));
    }

    if (this.aborted) return null;

    // Call the complete endpoint
    try {
      const response = await fetch("/api/upload/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          uploadId: this.uploadId,
          fileName: `recording_${this.uploadId}.webm`,
          totalChunks,
        }),
      });

      if (!response.ok) {
        throw new Error(`Complete failed: ${response.status}`);
      }

      const data = await response.json();
      return { url: data.url, path: data.path };
    } catch (err) {
      this.options.onError?.(`Failed to finalize upload: ${err}`, -1);
      return null;
    }
  }

  abort() {
    this.aborted = true;
    this.queue = [];
  }

  private async processQueue() {
    if (this.uploading || this.queue.length === 0 || this.aborted) return;

    this.uploading = true;
    const chunk = this.queue.shift()!;

    let retries = 3;
    while (retries > 0 && !this.aborted) {
      try {
        await this.uploadChunk(chunk);
        this.uploadedCount++;
        this.options.onProgress?.(this.uploadedCount, this.totalExpected);
        break;
      } catch (err) {
        retries--;
        if (retries === 0) {
          this.options.onError?.(`Failed to upload chunk ${chunk.index}: ${err}`, chunk.index);
        } else {
          await new Promise((r) => setTimeout(r, 1000 * (3 - retries)));
        }
      }
    }

    this.uploading = false;
    this.processQueue();
  }

  private async uploadChunk(chunk: RecordingChunk): Promise<void> {
    const formData = new FormData();
    formData.append("file", chunk.blob, `chunk_${chunk.index}`);
    formData.append("uploadId", this.uploadId);
    formData.append("chunkIndex", String(chunk.index));
    formData.append("totalChunks", String(this.totalExpected));
    formData.append("fileName", `recording_${this.uploadId}.webm`);

    const response = await fetch("/api/upload/chunk", {
      method: "POST",
      credentials: "include",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }
  }
}
