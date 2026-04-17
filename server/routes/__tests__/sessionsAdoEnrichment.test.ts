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

  it('sessions get ADO counts when ADO is configured and branch matches', async () => {
    mockAdoConfigured = true;
    const sessions = [makeSummary('s1', { branch: 'feature/x' })];
    mockMapAllSessionSummaries.mockReturnValue(sessions);

    mockMcpListPullRequests.mockResolvedValue([
      { id: 1, repositoryId: 'r1', title: 'PR1', status: 'active', sourceBranch: 'feature/x', targetBranch: 'main', repositoryName: 'repo', createdBy: 'dev', reviewers: [], url: '' },
    ]);
    mockMcpGetPullRequest.mockResolvedValue({ pr: {}, workItemIds: [10, 11] });

    const res = await callGetSessions();
    expect(res.statusCode).toBe(200);

    const body = res.body as SessionSummary[];
    expect(body[0].adoPrCount).toBe(1);
    expect(body[0].adoWorkItemCount).toBe(2);
  });

  it('sessions without a branch are not enriched', async () => {
    mockAdoConfigured = true;
    const sessions = [
      makeSummary('s1', { branch: 'feature/x' }),
      makeSummary('s2', { branch: undefined }),
    ];
    mockMapAllSessionSummaries.mockReturnValue(sessions);

    mockMcpListPullRequests.mockResolvedValue([]);

    const res = await callGetSessions();
    const body = res.body as SessionSummary[];
    expect(body[1].adoPrCount).toBeUndefined();
    expect(body[1].adoWorkItemCount).toBeUndefined();
  });

  it('ADO failure does not break the session list', async () => {
    mockAdoConfigured = true;
    const sessions = [makeSummary('s1', { branch: 'feature/x' })];
    mockMapAllSessionSummaries.mockReturnValue(sessions);

    // MCP fails — no REST fallback in enrichment path
    mockMcpListPullRequests.mockRejectedValue(new Error('MCP down'));

    const res = await callGetSessions();
    // Should still return 200 with sessions — counts stay undefined
    expect(res.statusCode).toBe(200);
    const body = res.body as SessionSummary[];
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe('s1');
    // REST should NOT be called — no fallback in enrichment
    expect(mockGetPullRequestsByBranches).not.toHaveBeenCalled();
  });

  it('timeout is respected — slow ADO does not block sessions', async () => {
    mockAdoConfigured = true;
    const sessions = [makeSummary('s1', { branch: 'feature/x' })];
    mockMapAllSessionSummaries.mockReturnValue(sessions);

    // Simulate a very slow MCP call that never resolves quickly
    mockMcpListPullRequests.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 60_000)),
    );

    // The route uses Promise.race with a 10s timeout.
    // We mock Date.now + use vi.useFakeTimers to avoid actual waiting.
    vi.useFakeTimers();
    const promise = callGetSessions();
    vi.advanceTimersByTime(11_000); // Past the 10s timeout
    vi.useRealTimers();

    const res = await promise;
    expect(res.statusCode).toBe(200);
    // Sessions returned — counts stay undefined due to timeout
    const body = res.body as SessionSummary[];
    expect(body).toHaveLength(1);
  });

  it('skips enrichment when no sessions have branches', async () => {
    mockAdoConfigured = true;
    const sessions = [
      makeSummary('s1'), // no branch
      makeSummary('s2'), // no branch
    ];
    mockMapAllSessionSummaries.mockReturnValue(sessions);

    const res = await callGetSessions();
    expect(res.statusCode).toBe(200);
    // No ADO calls should have been made
    expect(mockMcpListPullRequests).not.toHaveBeenCalled();
    expect(mockGetPullRequestsByBranches).not.toHaveBeenCalled();
  });

  it('skips enrichment gracefully when MCP fails — no REST fallback', async () => {
    mockAdoConfigured = true;
    const sessions = [makeSummary('s1', { branch: 'feature/x' })];
    mockMapAllSessionSummaries.mockReturnValue(sessions);

    // MCP fails — enrichment should bail, not fall back to REST
    mockMcpListPullRequests.mockRejectedValue(new Error('nope'));

    const res = await callGetSessions();
    const body = res.body as SessionSummary[];
    // Sessions returned without ADO counts
    expect(res.statusCode).toBe(200);
    expect(body[0].adoPrCount).toBeUndefined();
    expect(body[0].adoWorkItemCount).toBeUndefined();
    // REST should NOT be called — execSync blocks event loop, breaks timeout
    expect(mockGetPullRequestsByBranches).not.toHaveBeenCalled();
    expect(mockGetWorkItemsForPullRequest).not.toHaveBeenCalled();
  });
});
