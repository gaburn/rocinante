import * as fs from 'node:fs';
import * as path from 'node:path';
import os from 'node:os';

const DEFAULT_ARCHIVE_PATH = path.join(os.homedir(), '.copilot', 'rocinante-archive.json');

let archivedIds = new Set<string>();
let initialized = false;
let sidecarPath = DEFAULT_ARCHIVE_PATH;

/** Load archived IDs from the JSON sidecar file. Silently starts empty on any error. */
function loadFromDisk(): void {
  try {
    if (fs.existsSync(sidecarPath)) {
      const raw = fs.readFileSync(sidecarPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        archivedIds = new Set(parsed.filter((v): v is string => typeof v === 'string'));
      }
    }
  } catch {
    // Corrupt or missing file — start with empty set
    archivedIds = new Set();
  }
}

/** Persist current archive set to the JSON sidecar file. Best-effort. */
function saveToDisk(): void {
  try {
    const dir = path.dirname(sidecarPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(sidecarPath, JSON.stringify([...archivedIds]), 'utf-8');
  } catch (err) {
    console.warn('[archiveStore] Failed to persist archive sidecar:', err);
  }
}

/** Initialize the archive store. Loads persisted state from disk. */
export function initArchiveStore(customPath?: string): void {
  if (customPath) {
    sidecarPath = customPath;
  }
  loadFromDisk();
  initialized = true;
}

/** Whether the store has been initialized (client has synced at least once). */
export function isInitialized(): boolean {
  return initialized;
}

/** Get all archived session IDs. */
export function getArchivedIds(): string[] {
  return [...archivedIds];
}

/** Replace the entire archive set. */
export function setArchivedIds(ids: string[]): void {
  archivedIds = new Set(ids);
  initialized = true;
  saveToDisk();
}

/** Add a single session ID to the archive. Idempotent. */
export function addArchived(id: string): void {
  archivedIds.add(id);
  saveToDisk();
}

/** Remove a single session ID from the archive. Idempotent. */
export function removeArchived(id: string): void {
  archivedIds.delete(id);
  saveToDisk();
}

/** Check if a session ID is archived. */
export function isArchived(id: string): boolean {
  return archivedIds.has(id);
}

/** Reset store state — primarily for tests. */
export function _resetForTest(): void {
  archivedIds = new Set();
  initialized = false;
  sidecarPath = DEFAULT_ARCHIVE_PATH;
}
