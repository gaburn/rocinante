import * as fs from 'node:fs';
import { SessionSummary } from '../../src/types/index.js';

interface CacheEntry {
  /** mtime (ms) of the event file, or parsed epoch of SQLite updated_at when no file. */
  mtime: number;
  /** Byte-size of the event file, or 0 when keyed on SQLite updated_at. */
  size: number;
  summary: SessionSummary;
}

/**
 * Per-session computation cache keyed on event file mtime+size.
 * Skips expensive mapping (agent tree, status derivation, compaction detection)
 * for sessions whose event file hasn't changed since last computation.
 *
 * For sessions with no event file, keys on SQLite updated_at instead.
 */
const summaryCache = new Map<string, CacheEntry>();

/**
 * Get or compute a session summary. Returns cached value when the event
 * file's mtime+size haven't changed; otherwise runs computeFn and stores result.
 *
 * @param sessionId     Unique session identifier
 * @param eventFilePath Absolute path to events.jsonl, or null if no file
 * @param sqliteUpdatedAt  SQLite updated_at string — used as fallback cache key
 * @param computeFn     Expensive mapping function to call on cache miss
 */
export function getOrCompute(
  sessionId: string,
  eventFilePath: string | null,
  sqliteUpdatedAt: string,
  computeFn: () => SessionSummary,
): SessionSummary {
  let mtime: number;
  let fileSize: number;

  if (eventFilePath) {
    try {
      const stats = fs.statSync(eventFilePath);
      mtime = stats.mtimeMs;
      fileSize = stats.size;
    } catch (error) {
      const fsError = error as NodeJS.ErrnoException;
      if (fsError.code === 'ENOENT') {
        // No event file — fall back to updated_at
        mtime = Date.parse(sqliteUpdatedAt) || 0;
        fileSize = 0;
      } else {
        throw error;
      }
    }
  } else {
    // No event file path — key on updated_at
    mtime = Date.parse(sqliteUpdatedAt) || 0;
    fileSize = 0;
  }

  const cached = summaryCache.get(sessionId);
  if (cached && cached.mtime === mtime && cached.size === fileSize) {
    return cached.summary;
  }

  // Cache miss — compute and store
  const summary = computeFn();
  summaryCache.set(sessionId, { mtime, size: fileSize, summary });
  return summary;
}

/**
 * Peek at a cached summary without triggering recomputation.
 */
export function getCachedSummary(sessionId: string): SessionSummary | undefined {
  return summaryCache.get(sessionId)?.summary;
}

/**
 * Evict cache entries for sessions no longer present in the active set.
 * Returns the number of entries evicted.
 */
export function evictStale(activeSessionIds: Set<string>): number {
  let evicted = 0;
  for (const key of summaryCache.keys()) {
    if (!activeSessionIds.has(key)) {
      summaryCache.delete(key);
      evicted++;
    }
  }
  return evicted;
}

/**
 * Remove a single session from the cache.
 */
export function invalidate(sessionId: string): void {
  summaryCache.delete(sessionId);
}

/**
 * Clear the entire summary cache.
 */
export function clearAll(): void {
  summaryCache.clear();
}

export function size(): number {
  return summaryCache.size;
}
