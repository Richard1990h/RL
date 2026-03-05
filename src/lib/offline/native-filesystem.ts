import { getFilesystemPlugin, isNativeFilesystemAvailable } from "@/lib/offline/native-bridge";

const SEGMENT_DIR = "offline-segments";

export async function writeEncryptedSegmentNative(segmentId: string, cipherBase64: string): Promise<string | null> {
  if (!isNativeFilesystemAvailable()) return null;
  const fs = getFilesystemPlugin();
  if (!fs?.writeFile) return null;
  const nativeFileId = `${SEGMENT_DIR}/${segmentId}.enc`;
  await fs.writeFile({
    path: nativeFileId,
    data: cipherBase64,
    directory: "DATA",
    recursive: true,
  });
  return nativeFileId;
}

export async function readEncryptedSegmentNative(nativeFileId: string): Promise<string | null> {
  if (!isNativeFilesystemAvailable()) return null;
  const fs = getFilesystemPlugin();
  if (!fs?.readFile) return null;
  const result = await fs.readFile({ path: nativeFileId, directory: "DATA" });
  return result?.data ?? null;
}

export async function deleteEncryptedSegmentNative(nativeFileId: string): Promise<void> {
  if (!isNativeFilesystemAvailable()) return;
  const fs = getFilesystemPlugin();
  if (!fs?.deleteFile) return;
  try {
    await fs.deleteFile({ path: nativeFileId, directory: "DATA" });
  } catch {
    // Ignore native cleanup errors.
  }
}
