import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';

/**
 * Tests for CopilotSessionSource filesystem fallback behavior.
 *
 * When SQLite is absent (fresh user), the source discovers sessions from
 * the ~/.copilot/session-state/ directories and builds synthetic session
 * objects using readEventsHead() metadata.
 */

// ── Mock variables (hoisted for vi.mock factory access) ──────────

const { mockExistsSync, mockReaddirSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockReaddirSync: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: { ...actual, existsSync: mockExistsSync, readdirSync: mockReaddirSync },
    existsSync: mockExistsSync,
    readdirSync: mockReaddirSync,
  };
});

const MOCK_SQLITE = '/mock/session-store.db';
const MOCK_STATE_DIR = '/mock/session-state';

vi.mock('../../../config.js', () => ({
  getConfig: vi.fn(() => ({
    sqliteDbPath: MOCK_SQLITE,
    sessionStateDir: MOCK_STATE_DIR,
    tailBytes: 524288,
  })),
}));

const mockGetSessionById = vi.fn();
const mockGetAllSessions = vi.fn();
const mockGetSessionTurnDataBatch = vi.fn();

vi.mock('../../sqliteReader.js', () => ({
  getAllSessions: (...args: unknown[]) => mockGetAllSessions(...args),
  getSessionById: (...args: unknown[]) => mockGetSessionById(...args),
  getSessionTurnDataBatch: (...args: unknown[]) => mockGetSessionTurnDataBatch(...args),
}));

const mockReadEventsTail = vi.fn();
const mockReadEventsHead = vi.fn();

vi.mock('../../eventTailReader.js', () => ({
  readEventsTail: (...args: unknown[]) => mockReadEventsTail(...args),
  readEventsHead: (...args: unknown[]) => mockReadEventsHead(...args),
}));

const mockMapToSession = vi.fn();
const mockMapSessionSummary = vi.fn();
const mockGetSessionCwd = vi.fn();

vi.mock('../../sessionMapper.js', () => ({
  mapToSession: (...args: unknown[]) => mockMapToSession(...args),
  mapSessionSummary: (...args: unknown[]) => mockMapSessionSummary(...args),
  getSessionCwd: (...args: unknown[]) => mockGetSessionCwd(...args),
}));

const mockGetOrComputeSummary = vi.fn();

vi.mock('../../sessionSummaryCache.js', () => ({
  getOrCompute: (...args: unknown[]) => mockGetOrComputeSummary(...args),
  evictStale: vi.fn(),
}));

vi.mock('../../../utils/sanitize.js', () => ({
  sanitizeSessionId: (id: string) => id,
}));

import { CopilotSessionSource } from '../copilotSource.js';
import type { Session, SessionSummary } from '../../../../src/types/index.js';

// ── Helpers ──────────────────────────────────────────────────────

function eventsFilePath(sessionId: string): string {
  return path.join(MOCK_STATE_DIR, sessionId, 'events.jsonl');
}

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

function makeSummary(id: string, overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id,
    name: `Session ${id}`,
    intent: 'Test',
    status: 'completed',
    startedAt: '2026-01-01T00:00:00Z',
    lastActivityAt: '2026-01-01T01:00:00Z',
    agentCount: 1,
    turnCount: 3,
    compacted: false,
    compactionCount: 0,
    ...overrides,
  };
}

function makeDirent(name: string, isDir: boolean) {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
    isSymbolicLink: () => false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    parentPath: MOCK_STATE_DIR,
    path: MOCK_STATE_DIR,
  };
}

// ── Setup ────────────────────────────────────────────────────────

// Advance Date.now past the 10s filesystem ID cache TTL between tests
let dateNow = 1_000_000_000;

beforeEach(() => {
  vi.clearAllMocks();
  dateNow += 20_000;
  vi.spyOn(Date, 'now').mockImplementation(() => dateNow);

  // Defaults: neither SQLite nor filesystem exists
  mockExistsSync.mockReturnValue(false);
  mockReaddirSync.mockReturnValue([]);
  mockGetAllSessions.mockReturnValue([]);
  mockGetSessionTurnDataBatch.mockReturnValue(new Map());
  mockReadEventsTail.mockReturnValue([]);
  mockReadEventsHead.mockReturnValue({ createdAt: null, firstUserMessage: null, turnCount: 0 });
  mockGetSessionCwd.mockReturnValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────

describe('CopilotSessionSource', () => {
  describe('isAvailable()', () => {
    it('returns true when SQLite database exists', () => {
      mockExistsSync.mockImplementation((p: string) => p === MOCK_SQLITE);

      const source = new CopilotSessionSource();
      expect(source.isAvailable()).toBe(true);
    });

    it('returns true when sessionStateDir exists (no SQLite)', () => {
      mockExistsSync.mockImplementation((p: string) => p === MOCK_STATE_DIR);

      const source = new CopilotSessionSource();
      expect(source.isAvailable()).toBe(true);
    });

    it('returns true when both SQLite and sessionStateDir exist', () => {
      mockExistsSync.mockImplementation((p: string) =>
        p === MOCK_SQLITE || p === MOCK_STATE_DIR,
      );

      const source = new CopilotSessionSource();
      expect(source.isAvailable()).toBe(true);
    });

    it('returns false when neither SQLite nor sessionStateDir exists', () => {
      mockExistsSync.mockReturnValue(false);

      const source = new CopilotSessionSource();
      expect(source.isAvailable()).toBe(false);
    });
  });

  describe('getSession(id) — SQLite path', () => {
    it('returns session from SQLite when database has the session', () => {
      const row = {
        id: 'abc-123',
        cwd: '/repo',
        repository: 'rocinante',
        branch: 'main',
        summary: 'Test session',
        host_type: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T01:00:00Z',
      };
      mockGetSessionById.mockReturnValue(row);
      const session = makeSession('abc-123', { source: 'copilot' });
      mockMapToSession.mockReturnValue(session);

      const source = new CopilotSessionSource();
      const result = source.getSession('abc-123');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('abc-123');
      expect(result!.source).toBe('copilot');
      expect(mockGetSessionById).toHaveBeenCalledWith('abc-123');
    });
  });

  describe('getSession(id) — filesystem fallback', () => {
    it('falls back to filesystem when SQLite returns null', () => {
      mockGetSessionById.mockReturnValue(null);

      // Filesystem: events.jsonl exists for this session
      mockExistsSync.mockImplementation((p: string) => {
        return p === eventsFilePath('fs-session-1');
      });

      mockReadEventsHead.mockReturnValue({
        createdAt: '2026-06-01T00:00:00Z',
        firstUserMessage: 'Fix the tests',
        turnCount: 2,
      });

      const session = makeSession('fs-session-1');
      mockMapToSession.mockReturnValue(session);

      const source = new CopilotSessionSource();
      const result = source.getSession('fs-session-1');

      expect(result).not.toBeNull();
      expect(result!.source).toBe('copilot');
      expect(mockReadEventsHead).toHaveBeenCalledWith('fs-session-1');
    });

    it('returns null when session does not exist in SQLite or filesystem', () => {
      mockGetSessionById.mockReturnValue(null);
      mockExistsSync.mockReturnValue(false);

      const source = new CopilotSessionSource();
      const result = source.getSession('nonexistent');

      expect(result).toBeNull();
    });

    it('passes SessionMappingContext with head data to mapToSession', () => {
      mockGetSessionById.mockReturnValue(null);
      mockExistsSync.mockImplementation((p: string) => p === eventsFilePath('ctx-session'));
      mockReadEventsHead.mockReturnValue({
        createdAt: '2026-06-01T12:00:00Z',
        firstUserMessage: 'Create the feature',
        turnCount: 5,
      });
      mockMapToSession.mockReturnValue(makeSession('ctx-session'));

      const source = new CopilotSessionSource();
      source.getSession('ctx-session');

      // mapToSession should be called with a synthetic SqliteSession row + events + context
      expect(mockMapToSession).toHaveBeenCalledTimes(1);
      const [syntheticRow, _events, ctx] = mockMapToSession.mock.calls[0];
      expect(syntheticRow.id).toBe('ctx-session');
      expect(syntheticRow.created_at).toBe('2026-06-01T12:00:00Z');
      expect(ctx).toEqual({
        firstUserMessage: 'Create the feature',
        turnCount: 5,
      });
    });

    it('handles corrupt events.jsonl gracefully (readEventsHead returns defaults)', () => {
      mockGetSessionById.mockReturnValue(null);
      mockExistsSync.mockImplementation((p: string) => p === eventsFilePath('corrupt'));
      mockReadEventsHead.mockReturnValue({ createdAt: null, firstUserMessage: null, turnCount: 0 });
      mockMapToSession.mockReturnValue(makeSession('corrupt'));

      const source = new CopilotSessionSource();
      const result = source.getSession('corrupt');

      expect(result).not.toBeNull();
    });

    it('returns null when buildSessionFromFilesystem throws', () => {
      mockGetSessionById.mockReturnValue(null);
      mockExistsSync.mockImplementation((p: string) => p === eventsFilePath('error'));
      mockReadEventsHead.mockImplementation(() => {
        throw new Error('Disk I/O error');
      });

      const source = new CopilotSessionSource();
      const result = source.getSession('error');

      expect(result).toBeNull();
    });
  });

  describe('listSessionSummaries() — filesystem merge', () => {
    it('includes filesystem-only sessions not present in SQLite', () => {
      // SQLite has no sessions
      mockGetAllSessions.mockReturnValue([]);

      // Filesystem has one session directory
      mockExistsSync.mockImplementation((p: string) => {
        if (p === MOCK_STATE_DIR) return true;
        if (p === eventsFilePath('fs-only-1')) return true;
        return false;
      });
      mockReaddirSync.mockReturnValue([makeDirent('fs-only-1', true)]);

      // When building the filesystem session, mapToSession returns a session
      const session = makeSession('fs-only-1', { source: 'copilot' });
      mockMapToSession.mockReturnValue(session);
      mockReadEventsHead.mockReturnValue({
        createdAt: '2026-06-01T00:00:00Z',
        firstUserMessage: 'Hello',
        turnCount: 1,
      });

      const source = new CopilotSessionSource();
      const summaries = source.listSessionSummaries();

      // Should contain the filesystem-only session
      expect(summaries.some(s => s.id === 'fs-only-1')).toBe(true);
    });

    it('deduplicates sessions present in both SQLite and filesystem', () => {
      // SQLite has session "shared-1"
      const row = {
        id: 'shared-1',
        cwd: '/repo',
        repository: null,
        branch: null,
        summary: null,
        host_type: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T01:00:00Z',
      };
      mockGetAllSessions.mockReturnValue([row]);
      mockGetSessionTurnDataBatch.mockReturnValue(
        new Map([['shared-1', { firstMessage: 'Hi', lastMessage: 'Bye', turnCount: 2 }]]),
      );

      // getOrComputeSummary returns a pre-built summary
      const sqliteSummary = makeSummary('shared-1', { source: 'copilot' });
      mockGetOrComputeSummary.mockImplementation(
        (_id: string, _path: string, _updated: string, factory: () => SessionSummary) => factory(),
      );
      mockMapSessionSummary.mockReturnValue(sqliteSummary);
      mockReadEventsTail.mockReturnValue([]);

      // Filesystem ALSO has "shared-1"
      mockExistsSync.mockImplementation((p: string) => {
        if (p === MOCK_STATE_DIR) return true;
        if (p === eventsFilePath('shared-1')) return true;
        return false;
      });
      mockReaddirSync.mockReturnValue([makeDirent('shared-1', true)]);

      const source = new CopilotSessionSource();
      const summaries = source.listSessionSummaries();

      // "shared-1" should appear exactly once (from SQLite, not duplicated)
      const matches = summaries.filter(s => s.id === 'shared-1');
      expect(matches).toHaveLength(1);
    });

    it('respects excludeIds for filesystem sessions', () => {
      mockGetAllSessions.mockReturnValue([]);
      mockExistsSync.mockImplementation((p: string) => {
        if (p === MOCK_STATE_DIR) return true;
        if (p === eventsFilePath('excluded')) return true;
        if (p === eventsFilePath('included')) return true;
        return false;
      });
      mockReaddirSync.mockReturnValue([
        makeDirent('excluded', true),
        makeDirent('included', true),
      ]);
      mockMapToSession.mockImplementation(
        (row: { id: string }) => makeSession(row.id, { source: 'copilot' }),
      );
      mockReadEventsHead.mockReturnValue({
        createdAt: '2026-01-01T00:00:00Z',
        firstUserMessage: null,
        turnCount: 0,
      });

      const source = new CopilotSessionSource();
      const summaries = source.listSessionSummaries(new Set(['excluded']));

      expect(summaries.some(s => s.id === 'excluded')).toBe(false);
      expect(summaries.some(s => s.id === 'included')).toBe(true);
    });

    it('skips non-directory entries in sessionStateDir', () => {
      mockGetAllSessions.mockReturnValue([]);
      mockExistsSync.mockImplementation((p: string) => {
        if (p === MOCK_STATE_DIR) return true;
        return false;
      });
      mockReaddirSync.mockReturnValue([
        makeDirent('some-file.txt', false), // not a directory
        makeDirent('.DS_Store', false),
      ]);

      const source = new CopilotSessionSource();
      const summaries = source.listSessionSummaries();

      expect(summaries).toHaveLength(0);
    });

    it('skips directories without events.jsonl', () => {
      mockGetAllSessions.mockReturnValue([]);
      mockExistsSync.mockImplementation((p: string) => {
        if (p === MOCK_STATE_DIR) return true;
        // No events.jsonl for either session
        return false;
      });
      mockReaddirSync.mockReturnValue([
        makeDirent('session-no-events', true),
      ]);

      const source = new CopilotSessionSource();
      const summaries = source.listSessionSummaries();

      expect(summaries).toHaveLength(0);
    });
  });
});
