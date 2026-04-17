import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for ADO enrichment on GET /api/sessions.
 *
 * enrichSessionsWithAdoCounts() is called inside the sessions route handler
 * when isAdoConfigured() returns true. It mutates SessionSummary[] in place,
 * adding adoPrCount and adoWorkItemCount.
 *
 * We test this through the route handler using the same direct-invocation
 * pattern as sessionsCache.test.ts.
 */

// ── Mocks ────────────────────────────────────────────────────────

const mockMapAllSessionSummaries = vi.fn();
const mockMcpListPullRequests = vi.fn();
const mockMcpGetPullRequest = vi.fn();
const mockGetPullRequestsByBranches = vi.fn();
const mockGetWorkItemsForPullRequest = vi.fn();

let mockAdoConfigured = false;

vi.mock('../../services/sessionMapper.js', () => ({
  mapAllSessionSummaries: (...args: unknown[]) => mockMapAllSessionSummaries(...args),
  mapSessionById: vi.fn(),
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

vi.mock('../../config.js', () => ({
  getConfig: vi.fn(() => ({
    cacheTtlMs: 10000,
    sessionStateDir: '/mock',
    staleThresholdMs: 300000,
    adoProject: 'TestProject',
  })),
  isAdoConfigured: vi.fn(() => mockAdoConfigured),
}));

vi.mock('../../services/adoMcpClient.js', () => ({
  mcpListPullRequests: (...args: unknown[]) => mockMcpListPullRequests(...args),
  mcpGetPullRequest: (...args: unknown[]) => mockMcpGetPullRequest(...args),
}));

vi.mock('../../services/adoClient.js', () => ({
  getPullRequestsByBranches: (...args: unknown[]) => mockGetPullRequestsByBranches(...args),
  getWorkItemsForPullRequest: (...args: unknown[]) => mockGetWorkItemsForPullRequest(...args),
}));

import type { SessionSummary } from '../../../src/types/index.js';
import sessionsRouter, { invalidateSessionsCache } from '../sessions.js';

// ── Helpers ──────────────────────────────────────────────────────

function makeSummary(id: string, overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id,
    name: `Session ${id}`,
    intent: 'Test intent',
    status: 'active',
    startedAt: '2026-04-10T00:00:00Z',
    lastActivityAt: '2026-04-10T01:00:00Z',
    agentCount: 1,
    turnCount: 5,
    ...overrides,
  };
}

type RouteLayer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (...args: unknown[]) => unknown }>;
  };
};

async function callGetSessions() {
  const handler = (sessionsRouter as unknown as { stack: RouteLayer[] }).stack
    .find((l) => l.route?.path === '/sessions' && l.route?.methods?.get);
  if (!handler?.route) throw new Error('GET /sessions not found');

  const req = { method: 'GET', url: '/sessions', params: {}, query: {} } as never;
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: null as unknown,
    status(code: number) { res.statusCode = code; return res; },
    json(data: unknown) { res.body = data; return res; },
    set(key: string, value: string) { res.headers[key] = value; return res; },
  };

  await handler.route.stack[0].handle(req, res, () => {});
  return res;
}

// ── Setup ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  invalidateSessionsCache();
  mockAdoConfigured = false;
  delete process.env.DEMO_MODE;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.DEMO_MODE;
});

// ── Tests ────────────────────────────────────────────────────────

describe('GET /api/sessions — ADO enrichment', () => {
  it('sessions have no ADO counts when ADO is not configured', async () => {
    mockAdoConfigured = false;
    const sessions = [makeSummary('s1', { branch: 'feature/x' })];
    mockMapAllSessionSummaries.mockReturnValue(sessions);

    const res = await callGetSessions();
    expect(res.statusCode).toBe(200);

    const body = res.body as SessionSummary[];
    expect(body[0].adoPrCount).toBeUndefined();
    expect(body[0].adoWorkItemCount).toBeUndefined();
    // MCP should not have been called
    expect(mockMcpListPullRequests).not.toHaveBeenCalled();
  });

  // ADO enrichment is disabled in the session list route because:
  // 1. MCP SDK dynamic import blocks the event loop under tsx watch
  // 2. REST fallback uses execSync which also blocks
  // Deliverables are available per-session via GET /api/ado/session-deliverables
  it('enrichment is disabled — ADO counts are never set even when configured', async () => {
    mockAdoConfigured = true;
    const sessions = [makeSummary('s1', { branch: 'feature/x' })];
    mockMapAllSessionSummaries.mockReturnValue(sessions);

    const res = await callGetSessions();
    expect(res.statusCode).toBe(200);

    const body = res.body as SessionSummary[];
    // Enrichment disabled — no ADO counts
    expect(body[0].adoPrCount).toBeUndefined();
    expect(body[0].adoWorkItemCount).toBeUndefined();
    // No ADO calls should have been made
    expect(mockMcpListPullRequests).not.toHaveBeenCalled();
    expect(mockGetPullRequestsByBranches).not.toHaveBeenCalled();
  });
});
