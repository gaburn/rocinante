import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for GET /api/sessions/status endpoint.
 *
 * Returns source-availability metadata for both Copilot and Claude providers.
 * Always returns 200 — this is a lightweight diagnostic endpoint.
 */

// ── Mocks ────────────────────────────────────────────────────────

const { mockExistsSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: { ...actual, existsSync: mockExistsSync },
    existsSync: mockExistsSync,
  };
});

const MOCK_SQLITE = '/mock/session-store.db';
const MOCK_STATE_DIR = '/mock/session-state';
const MOCK_CLAUDE_DIR = '/mock/.claude';

vi.mock('../../config.js', () => ({
  getConfig: vi.fn(() => ({
    sqliteDbPath: MOCK_SQLITE,
    sessionStateDir: MOCK_STATE_DIR,
    claudeDir: MOCK_CLAUDE_DIR,
    cacheTtlMs: 10000,
    staleThresholdMs: 300000,
  })),
  isAdoConfigured: vi.fn(() => false),
}));

const mockMapAllSessionSummaries = vi.fn();
const mockMapSessionById = vi.fn();

vi.mock('../../services/sessionMapper.js', () => ({
  mapAllSessionSummaries: (...args: unknown[]) => mockMapAllSessionSummaries(...args),
  mapSessionById: (...args: unknown[]) => mockMapSessionById(...args),
}));

vi.mock('../../services/planReader.js', () => ({
  readSessionPlan: vi.fn(),
}));

vi.mock('../../services/demoData.js', () => ({
  generateDemoSessions: vi.fn(() => []),
  getDemoWorkstreams: vi.fn(() => []),
}));

vi.mock('../../services/sqliteReader.js', () => ({
  searchConversations: vi.fn(() => []),
}));

vi.mock('../../services/archiveStore.js', () => ({
  getArchivedIds: vi.fn(() => []),
  setArchivedIds: vi.fn(),
  addArchived: vi.fn(),
  removeArchived: vi.fn(),
  isArchived: vi.fn(() => false),
  isInitialized: vi.fn(() => false),
}));

vi.mock('../../services/adoMcpClient.js', () => ({
  mcpListPullRequests: vi.fn(),
  mcpGetPullRequest: vi.fn(),
}));

vi.mock('../../services/adoClient.js', () => ({
  getPullRequestsByBranches: vi.fn(),
  getWorkItemsForPullRequest: vi.fn(),
}));

import sessionsRouter from '../sessions.js';
import type { SourceStatus } from '../../services/providers/types.js';

// ── Helpers ──────────────────────────────────────────────────────

type RouteLayer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (...args: unknown[]) => unknown }>;
  };
};

function callGetSessionsStatus(): { statusCode: number; body: unknown } {
  const req = { method: 'GET', url: '/sessions/status', params: {}, query: {} } as never;
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) { res.statusCode = code; return res; },
    json(data: unknown) { res.body = data; return res; },
    set() { return res; },
  };

  const layer = (sessionsRouter as unknown as { stack: RouteLayer[] }).stack
    .find((l) => l.route?.path === '/sessions/status' && l.route?.methods?.get);

  if (!layer?.route) {
    throw new Error('GET /sessions/status route not found on router');
  }

  layer.route.stack[0].handle(req, res, () => {});
  return res;
}

// ── Setup ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockExistsSync.mockReturnValue(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────

describe('GET /api/sessions/status', () => {
  describe('response shape', () => {
    it('returns correct shape with copilot and claude source info', () => {
      mockExistsSync.mockReturnValue(false);

      const { statusCode, body } = callGetSessionsStatus();
      const status = body as SourceStatus;

      expect(statusCode).toBe(200);
      expect(status).toHaveProperty('copilot');
      expect(status).toHaveProperty('claude');
      expect(status.copilot).toHaveProperty('available');
      expect(status.copilot).toHaveProperty('sqliteAvailable');
      expect(status.copilot).toHaveProperty('filesystemAvailable');
      expect(status.copilot).toHaveProperty('sessionStateDir');
      expect(status.claude).toHaveProperty('available');
      expect(status.claude).toHaveProperty('claudeDir');
    });
  });

  describe('copilot availability', () => {
    it('reports copilot available when SQLite exists', () => {
      mockExistsSync.mockImplementation((p: string) => p === MOCK_SQLITE);

      const { body } = callGetSessionsStatus();
      const status = body as SourceStatus;

      expect(status.copilot.available).toBe(true);
      expect(status.copilot.sqliteAvailable).toBe(true);
      expect(status.copilot.filesystemAvailable).toBe(false);
    });

    it('reports copilot available when sessionStateDir exists (no SQLite)', () => {
      mockExistsSync.mockImplementation((p: string) => p === MOCK_STATE_DIR);

      const { body } = callGetSessionsStatus();
      const status = body as SourceStatus;

      expect(status.copilot.available).toBe(true);
      expect(status.copilot.sqliteAvailable).toBe(false);
      expect(status.copilot.filesystemAvailable).toBe(true);
    });

    it('reports copilot available when both SQLite and filesystem exist', () => {
      mockExistsSync.mockImplementation((p: string) =>
        p === MOCK_SQLITE || p === MOCK_STATE_DIR,
      );

      const { body } = callGetSessionsStatus();
      const status = body as SourceStatus;

      expect(status.copilot.available).toBe(true);
      expect(status.copilot.sqliteAvailable).toBe(true);
      expect(status.copilot.filesystemAvailable).toBe(true);
    });
  });

  describe('claude availability', () => {
    it('reports claude available when claudeDir exists', () => {
      mockExistsSync.mockImplementation((p: string) => p === MOCK_CLAUDE_DIR);

      const { body } = callGetSessionsStatus();
      const status = body as SourceStatus;

      expect(status.claude.available).toBe(true);
    });

    it('reports claude unavailable when claudeDir does not exist', () => {
      mockExistsSync.mockReturnValue(false);

      const { body } = callGetSessionsStatus();
      const status = body as SourceStatus;

      expect(status.claude.available).toBe(false);
    });
  });

  describe('both unavailable', () => {
    it('reports everything unavailable when nothing exists on disk', () => {
      mockExistsSync.mockReturnValue(false);

      const { body } = callGetSessionsStatus();
      const status = body as SourceStatus;

      expect(status.copilot.available).toBe(false);
      expect(status.copilot.sqliteAvailable).toBe(false);
      expect(status.copilot.filesystemAvailable).toBe(false);
      expect(status.claude.available).toBe(false);
    });
  });

  describe('reliability', () => {
    it('always returns 200 (never errors for a status check)', () => {
      // Even with everything missing, status code is 200
      mockExistsSync.mockReturnValue(false);
      const { statusCode } = callGetSessionsStatus();
      expect(statusCode).toBe(200);
    });

    it('includes sessionStateDir and claudeDir paths in the response', () => {
      mockExistsSync.mockReturnValue(false);

      const { body } = callGetSessionsStatus();
      const status = body as SourceStatus;

      expect(status.copilot.sessionStateDir).toBe(MOCK_STATE_DIR);
      expect(status.claude.claudeDir).toBe(MOCK_CLAUDE_DIR);
    });
  });
});
