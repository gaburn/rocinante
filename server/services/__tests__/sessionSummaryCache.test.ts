import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';

/**
 * Tests for Phase 2: Per-Session Summary Computation Cache
 * Module: server/services/sessionSummaryCache.ts
 *
 * The cache stores computed SessionSummary objects keyed on event-file mtime+size.
 * When the event file hasn't changed, we skip the expensive mapping pipeline
 * (agent tree, status derivation, compaction, git context) entirely.
 */

// ── Mocks ────────────────────────────────────────────────────────

vi.mock('node:fs');

// Types used in tests — match the project's actual interfaces
import type { SessionSummary } from '../../../src/types/index.js';
import {
  getOrCompute,
  getCachedSummary,
  evictStale,
  invalidate,
  clearAll,
  size,
} from '../sessionSummaryCache.js';

// ── Helpers ──────────────────────────────────────────────────────

function makeSummary(id: string, overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id,
    name: `Session ${id}`,
    intent: 'Test intent',
    status: 'completed',
    startedAt: '2026-04-10T00:00:00Z',
    lastActivityAt: '2026-04-10T01:00:00Z',
    agentCount: 1,
    turnCount: 5,
    ...overrides,
  };
}

function mockStatSync(mtimeMs: number, fileSize: number) {
  vi.mocked(fs.statSync).mockReturnValue({ mtimeMs, size: fileSize } as fs.Stats);
}

function mockStatSyncEnoent() {
  vi.mocked(fs.statSync).mockImplementation(() => {
    const err = new Error('ENOENT') as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    throw err;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  clearAll();
});

// ─── Phase 2: Core Cache Behavior ───────────────────────────────

describe('sessionSummaryCache', () => {
  describe('cache hit — mtime+size unchanged', () => {
    it('returns cached summary without calling computeFn on second access', () => {
      mockStatSync(1000, 2048);

      const computeFn = vi.fn(() => makeSummary('s1'));

      // First call — should compute
      const first = getOrCompute(
        's1', '/mock/session-state/s1/events.jsonl', '2026-04-10T00:00:00Z', computeFn,
      );
      expect(computeFn).toHaveBeenCalledTimes(1);
      expect(first.id).toBe('s1');

      // Second call — same mtime+size, should return cached
      const second = getOrCompute(
        's1', '/mock/session-state/s1/events.jsonl', '2026-04-10T00:00:00Z', computeFn,
      );
      expect(computeFn).toHaveBeenCalledTimes(1); // NOT called again
      expect(second).toEqual(first);
    });

    it('returns structurally identical data from cache (no field drift)', () => {
      mockStatSync(5000, 4096);

      const original = makeSummary('s2', {
        status: 'active',
        blockedReason: undefined,
        repository: 'rocinante',
        branch: 'main',
        compacted: true,
        compactionCount: 3,
      });
      const computeFn = vi.fn(() => original);

      getOrCompute(
        's2', '/mock/session-state/s2/events.jsonl', '2026-04-10T00:00:00Z', computeFn,
      );
      const cached = getOrCompute(
        's2', '/mock/session-state/s2/events.jsonl', '2026-04-10T00:00:00Z', computeFn,
      );

      // Every field on the cached version must match the original
      expect(cached).toEqual(original);
      expect(cached.status).toBe('active');
      expect(cached.compacted).toBe(true);
      expect(cached.compactionCount).toBe(3);
    });
  });

  describe('cache miss — mtime or size changes', () => {
    it('recomputes when event file mtime changes', () => {
      const computeFn = vi.fn(() => makeSummary('s3'));

      // First call with mtime=1000
      mockStatSync(1000, 2048);
      getOrCompute(
        's3', '/mock/session-state/s3/events.jsonl', '2026-04-10T00:00:00Z', computeFn,
      );
      expect(computeFn).toHaveBeenCalledTimes(1);

      // Second call — mtime changed (file was written to)
      mockStatSync(2000, 2048);
      getOrCompute(
        's3', '/mock/session-state/s3/events.jsonl', '2026-04-10T00:00:00Z', computeFn,
      );
      expect(computeFn).toHaveBeenCalledTimes(2); // Recomputed
    });

    it('recomputes when event file size changes', () => {
      const computeFn = vi.fn(() => makeSummary('s4'));

      // First call with size=2048
      mockStatSync(1000, 2048);
      getOrCompute(
        's4', '/mock/session-state/s4/events.jsonl', '2026-04-10T00:00:00Z', computeFn,
      );

      // Second call — size changed (new events appended)
      mockStatSync(1000, 3072);
      getOrCompute(
        's4', '/mock/session-state/s4/events.jsonl', '2026-04-10T00:00:00Z', computeFn,
      );
      expect(computeFn).toHaveBeenCalledTimes(2);
    });

    it('recomputes when both mtime and size change', () => {
      const computeFn = vi.fn(() => makeSummary('s5'));

      mockStatSync(1000, 2048);
      getOrCompute(
        's5', '/mock/session-state/s5/events.jsonl', '2026-04-10T00:00:00Z', computeFn,
      );

      mockStatSync(3000, 5120);
      getOrCompute(
        's5', '/mock/session-state/s5/events.jsonl', '2026-04-10T00:00:00Z', computeFn,
      );
      expect(computeFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('sessions with no event file', () => {
    it('falls back to SQLite updated_at for cache key when event file does not exist', () => {
      mockStatSyncEnoent();

      const computeFn = vi.fn(() => makeSummary('s6'));

      // First call — should compute using updated_at as cache key
      getOrCompute(
        's6', '/mock/session-state/s6/events.jsonl', '2026-04-10T00:00:00Z', computeFn,
      );
      expect(computeFn).toHaveBeenCalledTimes(1);

      // Second call — same updated_at, should use cache
      getOrCompute(
        's6', '/mock/session-state/s6/events.jsonl', '2026-04-10T00:00:00Z', computeFn,
      );
      expect(computeFn).toHaveBeenCalledTimes(1); // Cached
    });

    it('recomputes when SQLite updated_at changes (no event file)', () => {
      mockStatSyncEnoent();

      const computeFn = vi.fn(() => makeSummary('s7'));

      getOrCompute(
        's7', '/mock/session-state/s7/events.jsonl', '2026-04-10T00:00:00Z', computeFn,
      );

      // updated_at changed — should recompute
      getOrCompute(
        's7', '/mock/session-state/s7/events.jsonl', '2026-04-10T01:30:00Z', computeFn,
      );
      expect(computeFn).toHaveBeenCalledTimes(2);
    });

    it('caches correctly when eventFilePath is null', () => {
      const computeFn = vi.fn(() => makeSummary('s8'));

      getOrCompute(
        's8', null, '2026-04-10T00:00:00Z', computeFn,
      );
      getOrCompute(
        's8', null, '2026-04-10T00:00:00Z', computeFn,
      );
      expect(computeFn).toHaveBeenCalledTimes(1); // Cached on updated_at
    });
  });

  describe('eviction — stale entries', () => {
    it('evicts cache entries for sessions no longer in SQLite', () => {
      mockStatSync(1000, 2048);

      // Populate cache with 3 sessions
      getOrCompute('s10', '/e/s10', '2026-04-10T00:00:00Z', () => makeSummary('s10'));
      getOrCompute('s11', '/e/s11', '2026-04-10T00:00:00Z', () => makeSummary('s11'));
      getOrCompute('s12', '/e/s12', '2026-04-10T00:00:00Z', () => makeSummary('s12'));
      expect(size()).toBe(3);

      // s11 is no longer in SQLite — evict it
      const activeIds = new Set(['s10', 's12']);
      const evictedCount = evictStale(activeIds);
      expect(evictedCount).toBe(1);
      expect(size()).toBe(2);

      // s11 should no longer be in cache
      expect(getCachedSummary('s11')).toBeUndefined();
      // s10 and s12 should still be cached
      expect(getCachedSummary('s10')).toBeDefined();
      expect(getCachedSummary('s12')).toBeDefined();
    });

    it('evicts all entries when activeIds is empty', () => {
      mockStatSync(1000, 2048);

      getOrCompute('s20', '/e/s20', '2026-04-10T00:00:00Z', () => makeSummary('s20'));
      getOrCompute('s21', '/e/s21', '2026-04-10T00:00:00Z', () => makeSummary('s21'));

      const evicted = evictStale(new Set());
      expect(evicted).toBe(2);
      expect(size()).toBe(0);
    });

    it('evicts nothing when all sessions are still active', () => {
      mockStatSync(1000, 2048);

      getOrCompute('s30', '/e/s30', '2026-04-10T00:00:00Z', () => makeSummary('s30'));
      getOrCompute('s31', '/e/s31', '2026-04-10T00:00:00Z', () => makeSummary('s31'));

      const evicted = evictStale(new Set(['s30', 's31']));
      expect(evicted).toBe(0);
      expect(size()).toBe(2);
    });
  });

  describe('status transitions — active session correctness', () => {
    it('reflects updated status when event file changes (idle → active)', () => {
      const computeFn = vi.fn();

      // First: session is idle (completed)
      mockStatSync(1000, 2048);
      computeFn.mockReturnValue(makeSummary('s40', { status: 'completed' }));
      const first = getOrCompute(
        's40', '/e/s40', '2026-04-10T00:00:00Z', computeFn,
      );
      expect(first.status).toBe('completed');

      // Second: event file changed — session is now active
      mockStatSync(2000, 3072);
      computeFn.mockReturnValue(makeSummary('s40', { status: 'active' }));
      const second = getOrCompute(
        's40', '/e/s40', '2026-04-10T00:00:00Z', computeFn,
      );
      expect(second.status).toBe('active');
    });

    it('reflects updated status (active → completed) when file changes', () => {
      const computeFn = vi.fn();

      mockStatSync(1000, 2048);
      computeFn.mockReturnValue(makeSummary('s41', { status: 'active' }));
      getOrCompute('s41', '/e/s41', '2026-04-10T00:00:00Z', computeFn);

      mockStatSync(3000, 4096);
      computeFn.mockReturnValue(makeSummary('s41', { status: 'completed' }));
      const result = getOrCompute(
        's41', '/e/s41', '2026-04-10T00:00:00Z', computeFn,
      );
      expect(result.status).toBe('completed');
    });

    it('does NOT update status when file has not changed (stale-safe)', () => {
      const computeFn = vi.fn();

      mockStatSync(1000, 2048);
      computeFn.mockReturnValue(makeSummary('s42', { status: 'active' }));
      getOrCompute('s42', '/e/s42', '2026-04-10T00:00:00Z', computeFn);

      // File unchanged — computeFn not called, cached value returned
      const cached = getOrCompute(
        's42', '/e/s42', '2026-04-10T00:00:00Z', computeFn,
      );
      expect(cached.status).toBe('active'); // Cached value
      expect(computeFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('invalidate and clearAll', () => {
    it('invalidate removes a single session from cache', () => {
      mockStatSync(1000, 2048);

      getOrCompute('s50', '/e/s50', '2026-04-10T00:00:00Z', () => makeSummary('s50'));
      getOrCompute('s51', '/e/s51', '2026-04-10T00:00:00Z', () => makeSummary('s51'));
      expect(size()).toBe(2);

      invalidate('s50');
      expect(size()).toBe(1);
      expect(getCachedSummary('s50')).toBeUndefined();
      expect(getCachedSummary('s51')).toBeDefined();
    });

    it('clearAll empties the entire cache', () => {
      mockStatSync(1000, 2048);

      getOrCompute('s60', '/e/s60', '2026-04-10T00:00:00Z', () => makeSummary('s60'));
      getOrCompute('s61', '/e/s61', '2026-04-10T00:00:00Z', () => makeSummary('s61'));

      clearAll();
      expect(size()).toBe(0);
    });

    it('invalidate on non-existent key is a no-op', () => {
      expect(() => invalidate('nonexistent')).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('handles statSync throwing non-ENOENT errors by propagating', () => {
      vi.mocked(fs.statSync).mockImplementation(() => {
        throw new Error('EPERM: permission denied');
      });

      const computeFn = vi.fn(() => makeSummary('s70'));

      expect(() => {
        getOrCompute('s70', '/e/s70', '2026-04-10T00:00:00Z', computeFn);
      }).toThrow();
    });

    it('handles computeFn throwing an error by not caching', () => {
      mockStatSync(1000, 2048);

      const computeFn = vi.fn(() => {
        throw new Error('Mapping failed');
      });

      expect(() => {
        getOrCompute('s71', '/e/s71', '2026-04-10T00:00:00Z', computeFn);
      }).toThrow('Mapping failed');

      // After error, cache should NOT contain a stale/broken entry
      expect(getCachedSummary('s71')).toBeUndefined();
    });

    it('concurrent sessions with different IDs are cached independently', () => {
      mockStatSync(1000, 2048);

      const summaryA = makeSummary('sA', { name: 'Session A' });
      const summaryB = makeSummary('sB', { name: 'Session B' });

      getOrCompute('sA', '/e/sA', '2026-04-10T00:00:00Z', () => summaryA);
      getOrCompute('sB', '/e/sB', '2026-04-10T00:00:00Z', () => summaryB);

      expect(getCachedSummary('sA')?.name).toBe('Session A');
      expect(getCachedSummary('sB')?.name).toBe('Session B');
      expect(size()).toBe(2);
    });
  });
});
