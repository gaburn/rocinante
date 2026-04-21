import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface LaunchRecord {
  launchId: string;
  normalizedPath: string;
  agentType: 'copilot' | 'claude' | 'shell';
  createdAt: number;
  consumed: boolean;
}

const VALID_AGENT_TYPES = new Set(['copilot', 'claude', 'shell']);
const LAUNCH_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

/**
 * Blocked path prefixes — reject paths that resolve into sensitive system
 * directories. Lowercase for case-insensitive comparison on Windows.
 */
const BLOCKED_PREFIXES_WIN = [
  'c:\\windows',
  'c:\\program files',
  'c:\\program files (x86)',
  'c:\\programdata',
];
const BLOCKED_PREFIXES_POSIX = [
  '/etc',
  '/usr',
  '/bin',
  '/sbin',
  '/boot',
  '/lib',
  '/lib64',
  '/proc',
  '/sys',
  '/dev',
  '/var/run',
];

const launches = new Map<string, LaunchRecord>();
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

/** Start periodic cleanup of expired launch records. */
function ensureCleanupTimer(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(purgeExpired, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref(); // don't keep process alive
}

/** Remove all expired records from the store. */
function purgeExpired(): void {
  const now = Date.now();
  for (const [id, record] of launches) {
    if (now - record.createdAt > LAUNCH_TTL_MS) {
      launches.delete(id);
    }
  }
}

function isExpired(record: LaunchRecord): boolean {
  return Date.now() - record.createdAt > LAUNCH_TTL_MS;
}

/**
 * Normalize a filesystem path: resolve to absolute, normalize separators,
 * remove trailing separator, and lowercase the drive letter on Windows.
 */
function normalizePath(repoPath: string): string {
  let resolved = path.resolve(repoPath);
  resolved = path.normalize(resolved);

  // Remove trailing separator (but not root like "C:\")
  if (resolved.length > 1 && resolved.endsWith(path.sep)) {
    resolved = resolved.slice(0, -1);
  }

  // On Windows, lowercase drive letter for consistency
  if (process.platform === 'win32' && /^[A-Z]:/.test(resolved)) {
    resolved = resolved[0].toLowerCase() + resolved.slice(1);
  }

  return resolved;
}

export function isValidAgentType(value: string): value is LaunchRecord['agentType'] {
  return VALID_AGENT_TYPES.has(value);
}

/**
 * Sanitize and validate a user-supplied repository path before any
 * filesystem access. Prevents path traversal and access to system dirs.
 *
 * @returns The resolved, absolute path.
 * @throws {Error} if the path is unsafe.
 */
export function sanitizeRepoPath(repoPath: string): string {
  if (!repoPath || typeof repoPath !== 'string') {
    throw new Error('repoPath is required');
  }

  if (repoPath.includes('\0')) {
    throw new Error('Path contains null bytes');
  }

  const resolved = path.resolve(repoPath);

  // After resolution, the path must be absolute (path.resolve guarantees
  // this, but belt-and-suspenders for CodeQL's static analysis).
  if (!path.isAbsolute(resolved)) {
    throw new Error('Path must be absolute');
  }

  // Reject if the resolved path still contains traversal segments.
  // path.resolve() normalizes these away, but if somehow present, block it.
  const segments = resolved.split(path.sep);
  if (segments.includes('..')) {
    throw new Error('Path contains traversal segments');
  }

  // Reject paths into sensitive system directories.
  const lower = resolved.toLowerCase();
  const blocked = process.platform === 'win32' ? BLOCKED_PREFIXES_WIN : BLOCKED_PREFIXES_POSIX;
  for (const prefix of blocked) {
    if (lower === prefix || lower.startsWith(prefix + path.sep)) {
      throw new Error(`Path resolves to a restricted system directory: ${prefix}`);
    }
  }

  return resolved;
}

/**
 * Validate that a path exists and is a directory.
 * Throws with a descriptive message on failure.
 *
 * Applies a CodeQL-recognized sanitization barrier (normalize + reject "..")
 * so the filesystem call uses a value CodeQL considers safe.
 */
export function validateDirectory(repoPath: string): void {
  const safePath = path.normalize(repoPath);
  if (safePath.includes('..')) {
    throw new Error(`Path contains traversal segments: ${repoPath}`);
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(safePath);
  } catch {
    throw new Error(`Path does not exist: ${safePath}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${safePath}`);
  }
}

/**
 * Create a launch record. Validates the path and agent type.
 */
export function createLaunch(repoPath: string, agentType: string): LaunchRecord {
  if (!repoPath || typeof repoPath !== 'string') {
    throw new Error('repoPath is required');
  }
  if (!isValidAgentType(agentType)) {
    throw new Error(`Invalid agentType: ${agentType}. Must be one of: copilot, claude, shell`);
  }

  // Sanitize BEFORE any filesystem access to prevent path traversal
  const safePath = sanitizeRepoPath(repoPath);
  validateDirectory(safePath);
  const normalizedPath = normalizePath(safePath);

  const record: LaunchRecord = {
    launchId: randomUUID(),
    normalizedPath,
    agentType,
    createdAt: Date.now(),
    consumed: false,
  };

  launches.set(record.launchId, record);
  ensureCleanupTimer();

  return record;
}

/**
 * Consume a launch record — marks it consumed and returns it.
 * Returns null if not found, expired, or already consumed.
 */
export function consumeLaunch(launchId: string): LaunchRecord | null {
  const record = launches.get(launchId);
  if (!record) return null;
  if (isExpired(record)) {
    launches.delete(launchId);
    return null;
  }
  if (record.consumed) return null;

  record.consumed = true;
  return { ...record };
}

/**
 * Read-only lookup of a launch record.
 * Returns null if not found or expired.
 */
export function getLaunch(launchId: string): LaunchRecord | null {
  const record = launches.get(launchId);
  if (!record) return null;
  if (isExpired(record)) {
    launches.delete(launchId);
    return null;
  }
  return { ...record };
}

/** Clear all records — useful for testing. */
export function clearLaunches(): void {
  launches.clear();
}

/** Stop the cleanup timer — call during shutdown. */
export function stopCleanupTimer(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
