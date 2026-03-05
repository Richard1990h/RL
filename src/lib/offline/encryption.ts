import { getSecureStoragePlugin } from "@/lib/offline/native-bridge";

const KEY_STORAGE_ID = "rally_offline_aes_key_v1";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getNativeStoredKey(): Promise<string | null> {
  const secureStorage = getSecureStoragePlugin();
  if (!secureStorage?.get) return null;
  try {
    const result = await secureStorage.get({ key: KEY_STORAGE_ID });
    return result?.value ?? null;
  } catch {
    return null;
  }
}

async function setNativeStoredKey(value: string): Promise<boolean> {
  const secureStorage = getSecureStoragePlugin();
  if (!secureStorage?.set) return false;
  try {
    await secureStorage.set({ key: KEY_STORAGE_ID, value });
    return true;
  } catch {
    return false;
  }
}

async function getOrCreateRawKeyBase64(): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("Encryption key access is only available in browser runtime");
  }

  const nativeValue = await getNativeStoredKey();
  if (nativeValue) return nativeValue;

  const fallback = window.localStorage.getItem(KEY_STORAGE_ID);
  if (fallback) return fallback;

  const raw = crypto.getRandomValues(new Uint8Array(32));
  const encoded = toBase64(raw);

  const storedInNative = await setNativeStoredKey(encoded);
  if (!storedInNative) {
    window.localStorage.setItem(KEY_STORAGE_ID, encoded);
  }

  return encoded;
}

export async function getOfflineAesKey(): Promise<CryptoKey> {
  const keyBase64 = await getOrCreateRawKeyBase64();
  const rawKey = fromBase64(keyBase64);
  const rawBytes = Uint8Array.from(rawKey);
  return crypto.subtle.importKey("raw", rawBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptBytes(plainBytes: Uint8Array): Promise<{ ivBase64: string; cipherBase64: string }> {
  const key = await getOfflineAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, Uint8Array.from(plainBytes));
  return {
    ivBase64: toBase64(iv),
    cipherBase64: toBase64(new Uint8Array(encrypted)),
  };
}

export async function decryptBytes(ivBase64: string, cipherBase64: string): Promise<Uint8Array> {
  const key = await getOfflineAesKey();
  const iv = Uint8Array.from(fromBase64(ivBase64));
  const cipher = Uint8Array.from(fromBase64(cipherBase64));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new Uint8Array(plain);
}
