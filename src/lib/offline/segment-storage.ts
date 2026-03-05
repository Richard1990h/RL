import { offlineDb } from "@/lib/offline/db";
import { decryptBytes, encryptBytes } from "@/lib/offline/encryption";
import {
  deleteEncryptedSegmentNative,
  readEncryptedSegmentNative,
  writeEncryptedSegmentNative,
} from "@/lib/offline/native-filesystem";

export async function storeEncryptedSegment(segmentId: string, videoId: string, bytes: Uint8Array): Promise<void> {
  const { ivBase64, cipherBase64 } = await encryptBytes(bytes);
  const nativeFileId = await writeEncryptedSegmentNative(segmentId, cipherBase64);
  await offlineDb.putEncryptedSegment({
    id: segmentId,
    videoId,
    ivBase64,
    cipherBase64: nativeFileId ? "" : cipherBase64,
    storageType: nativeFileId ? "native_filesystem" : "indexeddb",
    nativeFileId: nativeFileId ?? undefined,
    bytes: bytes.byteLength,
    createdAt: Date.now(),
    lastAccessAt: Date.now(),
  });
}

export async function readEncryptedSegment(segmentId: string): Promise<Uint8Array | undefined> {
  const record = await offlineDb.getEncryptedSegment(segmentId);
  if (!record) return undefined;
  const cipherBase64 = record.storageType === "native_filesystem" && record.nativeFileId
    ? await readEncryptedSegmentNative(record.nativeFileId)
    : record.cipherBase64;
  if (!cipherBase64) return undefined;
  const plain = await decryptBytes(record.ivBase64, cipherBase64);
  await offlineDb.putEncryptedSegment({ ...record, lastAccessAt: Date.now() });
  return plain;
}

export async function removeEncryptedSegmentsForVideo(videoId: string): Promise<void> {
  const segments = await offlineDb.listEncryptedSegmentsByVideo(videoId);
  for (const segment of segments) {
    if (segment.storageType === "native_filesystem" && segment.nativeFileId) {
      await deleteEncryptedSegmentNative(segment.nativeFileId);
    }
    await offlineDb.deleteEncryptedSegment(segment.id);
  }
}
