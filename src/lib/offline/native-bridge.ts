type SecureStoragePlugin = {
  get?: (opts: { key: string }) => Promise<{ value: string }>;
  set?: (opts: { key: string; value: string }) => Promise<void>;
};

type FilesystemPlugin = {
  writeFile?: (opts: { path: string; data: string; directory?: string; recursive?: boolean }) => Promise<void>;
  readFile?: (opts: { path: string; directory?: string }) => Promise<{ data: string }>;
  deleteFile?: (opts: { path: string; directory?: string }) => Promise<void>;
};

type CapacitorRuntime = {
  Plugins?: {
    SecureStorage?: SecureStoragePlugin;
    Filesystem?: FilesystemPlugin;
  };
};

function getCapacitorRuntime(): CapacitorRuntime | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Capacitor?: CapacitorRuntime }).Capacitor;
}

export function getSecureStoragePlugin(): SecureStoragePlugin | undefined {
  return getCapacitorRuntime()?.Plugins?.SecureStorage;
}

export function getFilesystemPlugin(): FilesystemPlugin | undefined {
  return getCapacitorRuntime()?.Plugins?.Filesystem;
}

export function isNativeSecureStorageAvailable(): boolean {
  const plugin = getSecureStoragePlugin();
  return Boolean(plugin?.get && plugin?.set);
}

export function isNativeFilesystemAvailable(): boolean {
  const plugin = getFilesystemPlugin();
  return Boolean(plugin?.readFile && plugin?.writeFile && plugin?.deleteFile);
}
