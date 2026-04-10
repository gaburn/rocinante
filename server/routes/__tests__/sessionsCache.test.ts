import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for Phase 1: Server-Side Response Cache on GET /api/sessions
 * Module: server/routes/sessions.ts
 *
 * The route caches the full SessionSummary[] response in-memory with a
 * configurable TTL (CACHE_TTL_MS, default 10s). Second and subsequent requests
 * within the TTL window are served from cache without calling
 * mapAllSessionSummaries() again.
 */

// ── Mocks ────────────────────────────────────────────────────────

const mockMapAllSessionSummaries = vi.fn();
const mockMapSessionById = vi.fn();
const mockReadSessionPlan = vi.fn();
const mockGenerateDemoSessions = vi.fn();
const mockGetDemoWorkstreams = vi.fn();
const mockSearchConversations = vi.fn();

vi.mock('../../services/sessionMapper.js', () => ({
  mapAllSessionSummaries: (...args: unknown[]) => mockMapAllSessionSummaries(...args),
  mapSessionById: (...args: unknown[]) => mockMapSessionById(...args),
}));

vi.mock('../../services/planReader.js', () => ({
  readSessionPlan: (...args: unknown[]) => mockReadSessionPlan(...args),
}));

vi.mock('../../services/demoData.js', () => ({
  generateDemoSessions: (...args: unknown[]) => mockGenerateDemoSessions(...args),
  getDemoWorkstreams: (...args: unknown[]) => mockGetDemoWorkstreams(...args),
}));

vi.mock('../../services/sqliteReader.js', () => ({
  searchConversations: (...args: unknown[]) => mockSearchConversations(...args),
}));

vi.mock('../../services/archiveStore.js', () => ({
  getArchivedIds: vi.fn(() => []),
  setArchivedIds: vi.fn(),
  addArchived: vi.fn(),
  removeArchived: vi.fn(),
  isArchived: vi.fn(() => false),
  isInitialized: vi.fn(() => false),
}));

vi.mock('../../config.js', () => ({
  getConfig: vi.fn(() => ({
    cacheTtlMs: 10000,
    sessionStateDir: '/mock/session-state',
    staleThresholdMs: 300000,
  })),
  CACHE_TTL_MS: 10000,
}));

import type { SessionSummary } from '../../../src/types/index.js';
import sessionsRouter, { invalidateSessionsCache } from '../sessions.js';

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

/**
 * Invoke the GET /sessions route handler directly with mock req/res.
 * Express routers store handlers in a layer stack — we find the right one.
 */
function callGetSessions(): { statusCode: number; body: unknown; headers: Record<string, string> } {
  const req = { method: 'GET', url: '/sessions', params: {}, query: {} } as never;
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: null as unknown,
    status(code: number) { res.statusCode = code; return res; },
    json(data: unknown) { res.body = data; return res; },
    set(key: string, value: string) { res.headers[key] = value; return res; },
  };

  // Find the GET /sessions handler in the router's stack
  const layer = (sessionsRouter as unknown as { stack: Array<{ route?: { path: string; methods: { get?: boolean }; stack: Array<{ handle: Function }> } }> }).stack
    .find((l) => l.route?.path === '/sessions' && l.route?.methods?.get);

  if (!layer?.route) {
    throw new Error('GET /sessions route not found on router');
  }

  // Call the handler synchronously
  layer.route.stack[0].handle(req, res, () => {});
  return res;
}

// ── Time control ─────────────────────────────────────────────────

let nowMs: number;

beforeEach(() => {
  vi.clearAllMocks();
  nowMs = 1720000000000;
  vi.spyOn(Date, 'now').mockImplementation(() => nowMs);

  // Invalidate the module-level cache before each test
  invalidateSessionsCache();

  mockMapAllSessionSummaries.mockReturnValue([
    makeSummary('s1', { status: 'active' }),
    makeSummary('s2', { status: 'completed' }),
  ]);

  delete process.env.DEMO_MODE;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.DEMO_MODE;
});

// ─── Phase 1: Response Cache Tests ──────────────────────────────

describe('GET /api/sessions — response cache', () => {
  describe('first call computes and caches the result', () => {
    it('calls mapAllSessionSummaries on the first request', () => {
      const res = callGetSessions();

      expect(mockMapAllSessionSummaries).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect((res.body as SessionSummary[]).length).toBe(2);
    });
  });

  describe('second call within TTL returns cached data (should be <50ms)', () => {
    it('does NOT call mapAllSessionSummaries again within TTL window', () => {
      callGetSessions(); // Call 1 — computes
      expect(mockMapAllSessionSummaries).toHaveBeenCalledTimes(1);

      nowMs += 5000; // 5s later — still within 10s TTL
      callGetSessions(); // Call 2 — should use cache
      expect(mockMapAllSessionSummaries).toHaveBeenCalledTimes(1); // NOT called again
    });

    it('returns the same data on the second call', () => {
      const res1 = callGetSessions();
      nowMs += 3000;
      const res2 = callGetSessions();

      expect(res1.body).toEqual(res2.body);
    });
  });

  describe('call after TTL expires recomputes', () => {
    it('recomputes after TTL expires', () => {
      callGetSessions(); // Call 1 at T=0
      expect(mockMapAllSessionSummaries).toHaveBeenCalledTimes(1);

      nowMs += 11000; // 11s later — past 10s TTL
      callGetSessions(); // Call 2 — should recompute
      expect(mockMapAllSessionSummaries).toHaveBeenCalledTimes(2);
    });

    it('returns fresh data after TTL expires', () => {
      mockMapAllSessionSummaries.mockReturnValueOnce([makeSummary('old1')]);
      callGetSessions(); // Gets old data

      nowMs += 11000;
      mockMapAllSessionSummaries.mockReturnValueOnce([makeSummary('new1')]);
      const res = callGetSessions(); // Gets fresh data

      expect((res.body as SessionSummary[])[0].id).toBe('new1');
    });
  });

  describe('cache returns the same data structure as uncached path', () => {
    it('cached response preserves all SessionSummary fields', () => {
      const fullSummary = makeSummary('s1', {
        status: 'active',
        blockedReason: 'Waiting on user input',
        repository: 'rocinante',
        branch: 'feature/cache',
        compacted: true,
        compactionCount: 2,
        latestUserMessage: 'Fix the tests',
        lastAssistantUpdate: 'Running vitest...',
        source: 'copilot',
        isSquadSession: true,
      });
      mockMapAllSessionSummaries.mockReturnValue([fullSummary]);

      const res1 = callGetSessions(); // Computes
      nowMs += 3000;
      const res2 = callGetSessions(); // From cache

      const cached = (res2.body as SessionSummary[])[0];
      expect(cached).toEqual(fullSummary);
      expect(cached.blockedReason).toBe('Waiting on user input');
      expect(cached.repository).toBe('rocinante');
      expect(cached.isSquadSession).toBe(true);
    });
  });

  describe('cache invalidation', () => {
    it('invalidateSessionsCache forces recomputation on next request', () => {
      callGetSessions();
      expect(mockMapAllSessionSummaries).toHaveBeenCalledTimes(1);

      nowMs += 3000; // Still within TTL
      invalidateSessionsCache();

      callGetSessions(); // Should recompute after invalidation
      expect(mockMapAllSessionSummaries).toHaveBeenCalledTimes(2);
    });

    it('demo mode bypasses cache entirely', () => {
      process.env.DEMO_MODE = 'true';
      mockGenerateDemoSessions.mockReturnValue([makeSummary('demo1')]);

      const res = callGetSessions();
      expect(mockMapAllSessionSummaries).not.toHaveBeenCalled();
      expect(mockGenerateDemoSessions).toHaveBeenCalledTimes(1);
      expect((res.body as SessionSummary[])[0].id).toBe('demo1');
    });

    it('error in mapAllSessionSummaries returns 500 and does not cache the error', () => {
      mockMapAllSessionSummaries.mockImplementation(() => {
        throw new Error('SQLite locked');
      });

      const res1 = callGetSessions();
      expect(res1.statusCode).toBe(500);
      expect((res1.body as { error: string }).error).toBe('SQLite locked');

      // Fix the error and try again
      mockMapAllSessionSummaries.mockReturnValue([makeSummary('s1')]);
      const res2 = callGetSessions();
      expect(res2.statusCode).toBe(200);
      expect((res2.body as SessionSummary[])[0].id).toBe('s1');
    });
  });
});

describe('Response cache — edge cases', () => {
  it('handles empty session list', () => {
    mockMapAllSessionSummaries.mockReturnValue([]);
    const res = callGetSessions();
    expect(res.body).toEqual([]);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('handles large session lists (1787 sessions)', () => {
    const largeBatch = Array.from({ length: 1787 }, (_, i) =>
      makeSummary(`s${i}`, { status: i % 10 === 0 ? 'active' : 'completed' }),
    );
    mockMapAllSessionSummaries.mockReturnValue(largeBatch);

    const res = callGetSessions();
    expect((res.body as SessionSummary[])).toHaveLength(1787);
  });

  it('cache at exactly TTL boundary still serves cached data', () => {
    callGetSessions(); // T=0
    expect(mockMapAllSessionSummaries).toHaveBeenCalledTimes(1);

    nowMs += 9999; // 1ms before TTL expires
    callGetSessions();
    expect(mockMapAllSessionSummaries).toHaveBeenCalledTimes(1); // Still cached
  });

  it('multiple invalidations are safe (idempotent)', () => {
    callGetSessions();
    invalidateSessionsCache();
    invalidateSessionsCache();
    invalidateSessionsCache();

    callGetSessions(); // Should work fine
    expect(mockMapAllSessionSummaries).toHaveBeenCalledTimes(2);
  });
});
