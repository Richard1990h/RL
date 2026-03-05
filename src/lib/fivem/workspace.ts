import path from "path";
import fs from "fs";
import os from "os";
import { execSync } from "child_process";

const FIVEM_BASE = path.join(process.cwd(), "fivem");

/** Validate slug contains only safe characters (alphanumeric, hyphens, underscores) */
function validateSlug(slug: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
    throw new Error(`Invalid workspace slug: ${slug}`);
  }
  return slug;
}

/** Root workspace directory for a server slug: fivem/{slug}/ */
export function getWorkspacePath(slug: string): string {
  return path.join(FIVEM_BASE, validateSlug(slug));
}

/** Resources directory: fivem/{slug}/resources/ (entire resources tree) */
export function getResourcesPath(slug: string): string {
  return path.join(FIVEM_BASE, validateSlug(slug), "resources");
}

/** Check if a workspace exists (has resources dir) */
export function workspaceExists(slug: string): boolean {
  try {
    return fs.existsSync(getResourcesPath(slug));
  } catch {
    return false;
  }
}

/** Backups directory: fivem/{slug}/backups/ */
function getBackupsPath(slug: string): string {
  return path.join(FIVEM_BASE, validateSlug(slug), "backups");
}

/**
 * Create a zip backup of the current resources directory.
 * Uses PowerShell Compress-Archive with -LiteralPath (handles [brackets]).
 * Returns the backup file path, or null if no resources to back up.
 */
export function createBackup(slug: string): string | null {
  const resourcesDir = getResourcesPath(slug);
  if (!fs.existsSync(resourcesDir)) return null;

  const backupsDir = getBackupsPath(slug);
  fs.mkdirSync(backupsDir, { recursive: true });

  const now = new Date();
  const stamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 14).replace(/(\d{8})(\d{6})/, "$1-$2");
  const zipName = `backup-resources-${stamp}.zip`;
  const zipPath = path.join(backupsDir, zipName);

  const psCmd = `Compress-Archive -LiteralPath '${resourcesDir}' -DestinationPath '${zipPath}' -Force`;
  execSync(`powershell -NoProfile -Command "${psCmd}"`, { timeout: 120000 });

  return zipPath;
}

/**
 * Recursively move all contents from src to dest.
 */
function moveContents(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      moveContents(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Copy resources directly from a local filesystem path (same machine).
 * This avoids the need for zipping when FiveM and web server are co-located.
 * Returns the number of files copied.
 */
export function copyLocalResources(slug: string, sourcePath: string): number {
  // Normalize path separators
  const normalizedSource = path.resolve(sourcePath);

  if (!fs.existsSync(normalizedSource)) {
    throw new Error(`Source path does not exist: ${normalizedSource}`);
  }

  const stat = fs.statSync(normalizedSource);
  if (!stat.isDirectory()) {
    throw new Error(`Source path is not a directory: ${normalizedSource}`);
  }

  // Backup existing if present
  if (workspaceExists(slug)) {
    try {
      createBackup(slug);
    } catch (e) {
      console.error(`[workspace] Backup failed for ${slug}:`, e);
    }
  }

  const resourcesDir = getResourcesPath(slug);

  // Remove old resources dir and recreate
  if (fs.existsSync(resourcesDir)) {
    fs.rmSync(resourcesDir, { recursive: true, force: true });
  }
  fs.mkdirSync(resourcesDir, { recursive: true });

  // Copy all contents
  moveContents(normalizedSource, resourcesDir);

  // Count files
  let count = 0;
  function countFiles(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) count++;
      else if (entry.isDirectory()) countFiles(path.join(dir, entry.name));
    }
  }
  countFiles(resourcesDir);

  return count;
}

/**
 * Determine which top-level workspace folders (e.g. "[hk]") contain the given resource names.
 * Scans the workspace resources directory for category folders (starting with "[")
 * and checks if any contain a subfolder matching the resource name.
 * Also includes resources that exist as top-level entries.
 */
export function getResourceFolders(slug: string, resourceNames: string[]): string[] {
  const resourcesDir = getResourcesPath(slug);
  if (!fs.existsSync(resourcesDir)) return [];

  const folders = new Set<string>();
  const entries = fs.readdirSync(resourcesDir, { withFileTypes: true });

  for (const res of resourceNames) {
    // Check category folders like [hk], [system]
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith("[")) {
        const catPath = path.join(resourcesDir, entry.name);
        if (fs.existsSync(path.join(catPath, res))) {
          folders.add(entry.name);
        }
      }
    }
    // Also check if it's a top-level resource
    if (fs.existsSync(path.join(resourcesDir, res))) {
      folders.add(res);
    }
  }

  return Array.from(folders);
}

/** File tree node for the workspace browser */
export type TreeNode = {
  name: string;
  type: "file" | "dir";
  children?: TreeNode[];
  fileCount?: number;
  changed?: boolean;
};

/**
 * Build a file tree of the workspace resources directory.
 * Only goes 2 levels deep for performance (category folders + resource folders + their contents).
 * When localPath is provided, compares workspace files against the FiveM server copy
 * and marks changed nodes (new or modified files) with `changed: true`.
 */
export function getResourceTree(slug: string, maxDepth = 3, localPath?: string): TreeNode[] {
  const resourcesDir = getResourcesPath(slug);
  if (!fs.existsSync(resourcesDir)) return [];

  const comparePath = localPath ? path.resolve(localPath) : null;
  const canCompare = comparePath && fs.existsSync(comparePath);

  function isFileChanged(workspaceFile: string, relPath: string): boolean {
    if (!canCompare) return false;
    const serverFile = path.join(comparePath!, relPath);
    if (!fs.existsSync(serverFile)) return true; // new file
    try {
      const wBuf = fs.readFileSync(workspaceFile);
      const sBuf = fs.readFileSync(serverFile);
      return Buffer.compare(wBuf, sBuf) !== 0;
    } catch {
      return true;
    }
  }

  function buildTree(dir: string, depth: number, relDir: string): TreeNode[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const nodes: TreeNode[] = [];
    for (const entry of entries) {
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        const childPath = path.join(dir, entry.name);
        const children = depth < maxDepth ? buildTree(childPath, depth + 1, relPath) : [];
        let fileCount = 0;
        let changed = false;
        if (depth >= maxDepth) {
          // Count files and check for changes recursively
          const scanDir = (d: string, rel: string) => {
            for (const e of fs.readdirSync(d, { withFileTypes: true })) {
              const eRel = `${rel}/${e.name}`;
              if (e.isFile()) {
                fileCount++;
                if (!changed && canCompare) changed = isFileChanged(path.join(d, e.name), eRel);
              } else if (e.isDirectory()) {
                scanDir(path.join(d, e.name), eRel);
              }
            }
          };
          scanDir(childPath, relPath);
        } else {
          // Bubble up: directory is changed if any child is changed
          changed = children.some(c => !!c.changed);
        }
        // Also check if this directory is entirely new on server side
        if (!changed && canCompare && !fs.existsSync(path.join(comparePath!, relPath))) {
          changed = true;
        }
        nodes.push({
          name: entry.name, type: "dir", children,
          fileCount: depth >= maxDepth ? fileCount : undefined,
          ...(canCompare ? { changed } : {}),
        });
      } else {
        const changed = canCompare ? isFileChanged(path.join(dir, entry.name), relPath) : undefined;
        nodes.push({ name: entry.name, type: "file", ...(changed !== undefined ? { changed } : {}) });
      }
    }
    return nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  return buildTree(resourcesDir, 1, "");
}

/**
 * Create a timestamped zip backup of specific resource folders on the LIVE FiveM server
 * before overwriting them with workspace changes.
 * Backups go to: fivem/{slug}/backups/live-backup-YYYYMMDD-HHMMSS.zip
 * Returns the backup file path, or null if nothing to back up.
 */
export function createLocalBackup(slug: string, localPath: string, resourceNames: string[]): string | null {
  const normalizedLocal = path.resolve(localPath);
  if (!fs.existsSync(normalizedLocal)) return null;

  // Check if any of the target folders actually exist on the live server
  const existingFolders: string[] = [];
  for (const name of resourceNames) {
    const folder = path.join(normalizedLocal, name);
    if (fs.existsSync(folder) && fs.statSync(folder).isDirectory()) {
      existingFolders.push(folder);
    }
  }
  if (existingFolders.length === 0) return null;

  const backupsDir = getBackupsPath(slug);
  fs.mkdirSync(backupsDir, { recursive: true });

  const now = new Date();
  const stamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 14).replace(/(\d{8})(\d{6})/, "$1-$2");
  const zipName = `live-backup-${stamp}.zip`;
  const zipPath = path.join(backupsDir, zipName);

  // Build a PowerShell -LiteralPath array for all folders (handles [brackets])
  const pathsArg = existingFolders.map(f => `'${f}'`).join(", ");
  const psCmd = `Compress-Archive -LiteralPath @(${pathsArg}) -DestinationPath '${zipPath}' -Force`;
  execSync(`powershell -NoProfile -Command "${psCmd}"`, { timeout: 180000 });

  console.log(`[workspace] Live backup created: ${zipPath} (${existingFolders.length} folders)`);
  return zipPath;
}

/**
 * Push selected resource folders from workspace back to the FiveM server's local filesystem.
 * Creates a timestamped backup of the live server's resource folders FIRST.
 * Only copies the selected top-level resource folders (e.g. "[hk]", "oxmysql").
 * Returns { filesCopied, backupPath }.
 */
export function pushResourcesToLocal(slug: string, destPath: string, resourceNames: string[]): number {
  const resourcesDir = getResourcesPath(slug);
  if (!fs.existsSync(resourcesDir)) {
    throw new Error("Workspace resources directory does not exist");
  }

  const normalizedDest = path.resolve(destPath);
  if (!fs.existsSync(normalizedDest)) {
    throw new Error(`Destination path does not exist: ${normalizedDest}`);
  }

  // Backup live server's resource folders before overwriting
  try {
    createLocalBackup(slug, normalizedDest, resourceNames);
  } catch (e) {
    console.error(`[workspace] Live backup failed for ${slug} — proceeding anyway:`, e);
  }

  let totalFiles = 0;
  for (const name of resourceNames) {
    const srcFolder = path.join(resourcesDir, name);
    if (!fs.existsSync(srcFolder) || !fs.statSync(srcFolder).isDirectory()) {
      console.warn(`[workspace] Skipping ${name} — not found in workspace`);
      continue;
    }

    // Ensure resolved path is within workspace (prevent traversal)
    const resolvedSrc = path.resolve(srcFolder);
    if (!resolvedSrc.startsWith(path.resolve(resourcesDir))) {
      console.warn(`[workspace] Skipping ${name} — path traversal detected`);
      continue;
    }

    const destFolder = path.join(normalizedDest, name);
    // Remove old destination folder contents and re-copy
    // Use overwrite approach instead of delete-then-copy to handle file locks
    if (fs.existsSync(destFolder)) {
      try {
        fs.rmSync(destFolder, { recursive: true, force: true });
      } catch (e) {
        // If full delete fails (e.g. FiveM file locks), log and overwrite in-place
        console.warn(`[workspace] Could not fully delete ${destFolder}, overwriting in-place:`, (e as Error).message);
      }
    }
    fs.mkdirSync(destFolder, { recursive: true });
    moveContents(resolvedSrc, destFolder);

    // Count files
    const countInDir = (d: string): number => {
      let c = 0;
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isFile()) c++;
        else if (e.isDirectory()) c += countInDir(path.join(d, e.name));
      }
      return c;
    };
    totalFiles += countInDir(destFolder);
  }

  return totalFiles;
}

/**
 * Extract an uploaded zip buffer into the workspace.
 * Backs up existing resources first, then extracts.
 * Extracts to a temp dir first to avoid PowerShell [bracket] issues,
 * then moves contents to the final [hk] path.
 * Returns the number of files extracted.
 */
export function extractUpload(slug: string, zipBuffer: Buffer): number {
  // Backup existing if present
  if (workspaceExists(slug)) {
    try {
      createBackup(slug);
    } catch (e) {
      console.error(`[workspace] Backup failed for ${slug}:`, e);
    }
  }

  const resourcesDir = getResourcesPath(slug);

  // Remove old resources dir and recreate
  if (fs.existsSync(resourcesDir)) {
    fs.rmSync(resourcesDir, { recursive: true, force: true });
  }
  fs.mkdirSync(resourcesDir, { recursive: true });

  // Write zip buffer to a temp file
  const tmpZip = path.join(os.tmpdir(), `fivem-upload-${Date.now()}.zip`);
  // Extract to a temp dir (no brackets in path — avoids PowerShell issues)
  const tmpExtract = path.join(os.tmpdir(), `fivem-extract-${Date.now()}`);
  fs.writeFileSync(tmpZip, zipBuffer);

  try {
    // Extract to clean temp dir using PowerShell
    const psCmd = `Expand-Archive -Path '${tmpZip}' -DestinationPath '${tmpExtract}' -Force`;
    execSync(`powershell -NoProfile -Command "${psCmd}"`, { timeout: 120000 });

    // Move extracted contents to the real [hk] path
    moveContents(tmpExtract, resourcesDir);
  } finally {
    try { fs.unlinkSync(tmpZip); } catch { /* ignore */ }
    try { fs.rmSync(tmpExtract, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  // Count extracted files
  let count = 0;
  function countFiles(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) count++;
      else if (entry.isDirectory()) countFiles(path.join(dir, entry.name));
    }
  }
  countFiles(resourcesDir);

  return count;
}
