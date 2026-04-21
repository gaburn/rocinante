import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for mapSessionById — routing logic through the provider layer.
 *
 * Validates:
 * - claude: prefix routes to ClaudeSessionSource
 * - normal IDs route through CopilotSessionSource (not direct SQLite)
 * - returns undefined when no source has the session
 * - falls back to legacy SQLite when CopilotSessionSource is unavailable
 */

// ── Mock variables ──────────────────────────────────────────────

const mockGetSourceByName = vi.fn();

vi.mock('../providers/index.js', () => ({
  getActiveSources: vi.fn(() => []),
  getSourceByName: (...args: unknown[]) => mockGetSourceByName(...args),
  getSessionSourcesConfig: vi.fn(() => 'auto'),
}));

const mockGetSessionById = vi.fn();

vi.mock('../sqliteReader.js', () => ({
  getAllSessions: vi.fn(() => []),
  getSessionById: (...args: unknown[]) => mockGetSessionById(...args),
  getFirstUserMessage: vi.fn(() => null),
  getLastUserMessage: vi.fn(() => null),
  getTurnCount: vi.fn(() => 0),
  getSessionTurnDataBatch: vi.fn(() => new Map()),
}));

vi.mock('../eventTailReader.js', () => ({
  readEventsTail: vi.fn(() => []),
  readEventsHead: vi.fn(() => ({ createdAt: null, firstUserMessage: null, turnCount: 0 })),
}));

vi.mock('../statusDeriver.js', () => ({
  deriveSessionStatus: vi.fn(() => ({
    status: 'completed',
    lastActivityAt: '2026-01-01T01:00:00Z',
    blockedReason: undefined,
    waitingFor: undefined,
    waitingQuestion: undefined,
    waitingChoices: undefined,
    errorDetails: undefined,
  })),
  detectSquadSession: vi.fn(() => false),
}));

vi.mock('../agentTreeBuilder.js', () => ({
  buildAgentTree: vi.fn(() => ({
    name: 'root',
    status: 'completed',
    children: [],
    events: [],
    startedAt: '2026-01-01T00:00:00Z',
    endedAt: '2026-01-01T01:00:00Z',
  })),
}));

vi.mock('../eventTimelineBuilder.js', () => ({
  buildEventTimeline: vi.fn(() => []),
}));

vi.mock('../activityBucketBuilder.js', () => ({
  buildActivityBuckets: vi.fn(() => []),
}));

vi.mock('../squadCastExtractor.js', () => ({
  extractSquadCast: vi.fn(() => []),
}));

vi.mock('../sessionSummaryCache.js', () => ({
  getOrCompute: vi.fn((_id: string, _path: string, _updated: string, factory: () => unknown) => factory()),
  evictStale: vi.fn(),
}));

vi.mock('../../config.js', () => ({
  getConfig: vi.fn(() => ({
    sessionStateDir: '/mock/session-state',
    sqliteDbPath: '/mock/session-store.db',
    tailBytes: 524288,
    staleThresholdMs: 300000,
    cacheTtlMs: 10000,
    sessionSources: 'auto',
  })),
}));

vi.mock('../../utils/sanitize.js', () => ({
  sanitizeSessionId: (id: string) => id,
}));

import { mapSessionById } from '../sessionMapper.js';
import type { Session } from '../../../src/types/index.js';

// ── Helpers ──────────────────────────────────────────────────────

function makeSession(id: string, overrides: Partial<Session> = {}): Session {
  return {
    id,
    name: `Session ${id}`,
    intent: 'Test',
    status: 'completed',
    startedAt: '2026-01-01T00:00:00Z',
    lastActivityAt: '2026-01-01T01:00:00Z',
    agentCount: 1,
    turnCount: 3,
    rootAgent: { name: 'root', status: 'completed', children: [], events: [], startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T01:00:00Z' },
    events: [],
    activityBuckets: [],
    compacted: false,
    compactionCount: 0,
    ...overrides,
  } as Session;
}

// ── Setup ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSourceByName.mockReturnValue(undefined);
  mockGetSessionById.mockReturnValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────

describe('mapSessionById — provider routing', () => {
  describe('claude-prefixed IDs', () => {
    it('routes claude: IDs to the Claude source', () => {
      const claudeSession = makeSession('claude:abc-123', { source: 'claude' });
      const mockClaudeSource = {
        name: 'claude',
        getSession: vi.fn(() => claudeSession),
        listSessionSummaries: vi.fn(() => []),
        isAvailable: vi.fn(() => true),
      };
      mockGetSourceByName.mockImplementation((name: string) =>
        name === 'claude' ? mockClaudeSource : undefined,
      );

      const result = mapSessionById('claude:abc-123');

      expect(result).toBeDefined();
      expect(result!.id).toBe('claude:abc-123');
      expect(mockClaudeSource.getSession).toHaveBeenCalledWith('claude:abc-123');
    });

    it('returns undefined when Claude source is not available', () => {
      mockGetSourceByName.mockReturnValue(undefined);

      const result = mapSessionById('claude:unknown');

      expect(result).toBeUndefined();
    });

    it('returns undefined when Claude source returns null', () => {
      const mockClaudeSource = {
        name: 'claude',
        getSession: vi.fn(() => null),
        listSessionSummaries: vi.fn(() => []),
        isAvailable: vi.fn(() => true),
      };
      mockGetSourceByName.mockImplementation((name: string) =>
        name === 'claude' ? mockClaudeSource : undefined,
      );

      const result = mapSessionById('claude:nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('normal IDs — CopilotSessionSource', () => {
    it('routes normal IDs through CopilotSessionSource', () => {
      const copilotSession = makeSession('normal-id', { source: 'copilot' });
      const mockCopilotSource = {
        name: 'copilot',
        getSession: vi.fn(() => copilotSession),
        listSessionSummaries: vi.fn(() => []),
        isAvailable: vi.fn(() => true),
      };
      mockGetSourceByName.mockImplementation((name: string) =>
        name === 'copilot' ? mockCopilotSource : undefined,
      );

      const result = mapSessionById('normal-id');

      expect(result).toBeDefined();
      expect(result!.id).toBe('normal-id');
      expect(mockCopilotSource.getSession).toHaveBeenCalledWith('normal-id');
    });

    it('returns undefined when CopilotSessionSource returns null', () => {
      const mockCopilotSource = {
        name: 'copilot',
        getSession: vi.fn(() => null),
        listSessionSummaries: vi.fn(() => []),
        isAvailable: vi.fn(() => true),
      };
      mockGetSourceByName.mockImplementation((name: string) =>
        name === 'copilot' ? mockCopilotSource : undefined,
      );

      const result = mapSessionById('nonexistent-id');

      expect(result).toBeUndefined();
    });

    it('does NOT call getSessionById directly when CopilotSessionSource is available', () => {
      const mockCopilotSource = {
        name: 'copilot',
        getSession: vi.fn(() => makeSession('some-id')),
        listSessionSummaries: vi.fn(() => []),
        isAvailable: vi.fn(() => true),
      };
      mockGetSourceByName.mockImplementation((name: string) =>
        name === 'copilot' ? mockCopilotSource : undefined,
      );

      mapSessionById('some-id');

      // getSessionById is the direct SQLite path — should NOT be called
      expect(mockGetSessionById).not.toHaveBeenCalled();
    });
  });

  describe('legacy fallback — CopilotSessionSource unavailable', () => {
    it('falls back to direct SQLite lookup when CopilotSessionSource is undefined', () => {
      // getSourceByName returns undefined for 'copilot'
      mockGetSourceByName.mockReturnValue(undefined);

      // Direct SQLite returns a session row
      mockGetSessionById.mockReturnValue({
        id: 'legacy-id',
        cwd: '/repo',
        repository: null,
        branch: null,
        summary: null,
        host_type: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T01:00:00Z',
      });

      const result = mapSessionById('legacy-id');

      expect(result).toBeDefined();
      expect(result!.id).toBe('legacy-id');
      expect(result!.source).toBe('copilot');
      expect(mockGetSessionById).toHaveBeenCalledWith('legacy-id');
    });

    it('returns undefined when legacy SQLite also has no session', () => {
      mockGetSourceByName.mockReturnValue(undefined);
      mockGetSessionById.mockReturnValue(null);

      const result = mapSessionById('totally-unknown');

      expect(result).toBeUndefined();
    });
  });
});
