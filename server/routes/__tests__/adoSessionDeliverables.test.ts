import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for GET /api/ado/session-deliverables endpoint
 * and enrichSessionsWithAdoCounts in server/routes/sessions.ts
 *
 * Validates:
 * - Happy path: returns PRs + work items for a valid branch
 * - 400 for missing/empty branch param
 * - 403 when ADO not configured
 * - 502 when upstream ADO fails
 * - Deduplication of work items across PRs
 * - MCP-first fallback to REST
 */

// ── Mocks ────────────────────────────────────────────────────────

const mockMcpListPullRequests = vi.fn();
const mockMcpGetPullRequest = vi.fn();
const mockMcpGetWorkItemsBatch = vi.fn();

const mockGetPullRequestsByBranches = vi.fn();
const mockGetWorkItemsForPullRequest = vi.fn();
const mockGetAuthenticatedUserDisplayName = vi.fn();

vi.mock('../../services/adoMcpClient.js', () => ({
  mcpListPullRequests: (...args: unknown[]) => mockMcpListPullRequests(...args),
  mcpGetPullRequest: (...args: unknown[]) => mockMcpGetPullRequest(...args),
  mcpGetWorkItemsBatch: (...args: unknown[]) => mockMcpGetWorkItemsBatch(...args),
}));

vi.mock('../../services/adoClient.js', () => ({
  getPullRequestsByBranches: (...args: unknown[]) => mockGetPullRequestsByBranches(...args),
  getWorkItemsForPullRequest: (...args: unknown[]) => mockGetWorkItemsForPullRequest(...args),
  getAuthenticatedUserDisplayName: (...args: unknown[]) => mockGetAuthenticatedUserDisplayName(...args),
  getWorkItems: vi.fn(),
  testAdoConnection: vi.fn(),
  clearAdoCache: vi.fn(),
  clearTokenCache: vi.fn(),
}));

let mockAdoConfigured = true;
let mockAdoProject = 'TestProject';
let mockAdoRepository = '';
let mockAdoFilterByCreator = false;

vi.mock('../../config.js', () => ({
  getConfig: vi.fn(() => ({
    adoOrganization: 'TestOrg',
    adoProject: mockAdoProject,
    adoRepository: mockAdoRepository,
    adoFilterByCreator: mockAdoFilterByCreator,
    cacheTtlMs: 10000,
    sessionStateDir: '/mock',
    staleThresholdMs: 300000,
  })),
  isAdoConfigured: vi.fn(() => mockAdoConfigured),
  updateConfig: vi.fn(),
}));

import adoRouter from '../ado.js';

// ── Helpers ──────────────────────────────────────────────────────

type RouteLayer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (...args: unknown[]) => unknown }>;
  };
};

function findHandler(method: string, routePath: string) {
  const layer = (adoRouter as unknown as { stack: RouteLayer[] }).stack
    .find((l) => l.route?.path === routePath && l.route?.methods?.[method]);
  if (!layer?.route) {
    throw new Error(`${method.toUpperCase()} ${routePath} route not found on router`);
  }
  return layer.route.stack[0].handle;
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) { res.statusCode = code; return res; },
    json(data: unknown) { res.body = data; return res; },
  };
  return res;
}

async function callSessionDeliverables(query: Record<string, unknown> = {}) {
  const handler = findHandler('get', '/ado/session-deliverables');
  const req = { method: 'GET', url: '/ado/session-deliverables', params: {}, query };
  const res = mockRes();
  await handler(req, res, () => {});
  return res;
}

function makePr(id: number, branch: string, repoId?: string) {
  return {
    id,
    title: `PR #${id}`,
    status: 'active' as const,
    sourceBranch: branch,
    targetBranch: 'main',
    repositoryId: repoId ?? 'repo-1',
    repositoryName: 'test-repo',
    createdBy: 'dev',
    reviewers: [],
    url: `https://dev.azure.com/pr/${id}`,
  };
}

function makeWorkItem(id: number) {
  return {
    id,
    title: `WI #${id}`,
    state: 'Active',
    assignedTo: null,
    workItemType: 'Task',
    url: `https://dev.azure.com/wi/${id}`,
  };
}

// ── Setup ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockAdoConfigured = true;
  mockAdoProject = 'TestProject';
  mockAdoRepository = '';
  mockAdoFilterByCreator = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────

describe('GET /api/ado/session-deliverables', () => {
  describe('validation', () => {
    it('returns 403 when ADO is not configured', async () => {
      mockAdoConfigured = false;
      const res = await callSessionDeliverables({ branch: 'feature/x' });
      expect(res.statusCode).toBe(403);
      expect((res.body as { error: string }).error).toMatch(/not configured/i);
    });

    it('returns 400 when branch param is missing', async () => {
      const res = await callSessionDeliverables({});
      expect(res.statusCode).toBe(400);
      expect((res.body as { error: string }).error).toMatch(/branch/i);
    });

    it('returns 400 when branch param is empty string', async () => {
      const res = await callSessionDeliverables({ branch: '' });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when branch param is whitespace-only', async () => {
      const res = await callSessionDeliverables({ branch: '   ' });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('MCP path — happy', () => {
    it('returns PRs and work items for a valid branch', async () => {
      const pr1 = makePr(101, 'feature/x', 'repo-1');
      const pr2 = makePr(102, 'feature/x', 'repo-1');

      mockMcpListPullRequests.mockResolvedValue([pr1, pr2]);
      mockMcpGetPullRequest
        .mockResolvedValueOnce({ pr: pr1, workItemIds: [1, 2] })
        .mockResolvedValueOnce({ pr: pr2, workItemIds: [3] });
      mockMcpGetWorkItemsBatch.mockResolvedValue([
        makeWorkItem(1), makeWorkItem(2), makeWorkItem(3),
      ]);

      const res = await callSessionDeliverables({ branch: 'feature/x' });

      expect(res.statusCode).toBe(200);
      const body = res.body as { pullRequests: unknown[]; workItems: unknown[] };
      expect(body.pullRequests).toHaveLength(2);
      expect(body.workItems).toHaveLength(3);
    });

    it('deduplicates work items across multiple PRs', async () => {
      const pr1 = makePr(101, 'feature/x', 'repo-1');
      const pr2 = makePr(102, 'feature/x', 'repo-1');

      mockMcpListPullRequests.mockResolvedValue([pr1, pr2]);
      // Both PRs link to work item 42
      mockMcpGetPullRequest
        .mockResolvedValueOnce({ pr: pr1, workItemIds: [42, 43] })
        .mockResolvedValueOnce({ pr: pr2, workItemIds: [42, 44] });
      mockMcpGetWorkItemsBatch.mockResolvedValue([
        makeWorkItem(42), makeWorkItem(43), makeWorkItem(44),
      ]);

      const res = await callSessionDeliverables({ branch: 'feature/x' });
      const body = res.body as { pullRequests: unknown[]; workItems: unknown[] };
      expect(body.workItems).toHaveLength(3);

      // Verify the batch call received deduplicated IDs (3 unique, not 4 total)
      const batchCallIds = mockMcpGetWorkItemsBatch.mock.calls[0][1] as number[];
      expect(new Set(batchCallIds).size).toBe(3);
    });

    it('returns empty work items when PRs have no work item refs', async () => {
      mockMcpListPullRequests.mockResolvedValue([makePr(101, 'feat', 'repo-1')]);
      mockMcpGetPullRequest.mockResolvedValue({ pr: makePr(101, 'feat'), workItemIds: [] });

      const res = await callSessionDeliverables({ branch: 'feat' });
      const body = res.body as { pullRequests: unknown[]; workItems: unknown[] };
      expect(body.pullRequests).toHaveLength(1);
      expect(body.workItems).toHaveLength(0);
    });

    it('returns empty when no PRs match the branch', async () => {
      mockMcpListPullRequests.mockResolvedValue([]);

      const res = await callSessionDeliverables({ branch: 'no-match' });
      const body = res.body as { pullRequests: unknown[]; workItems: unknown[] };
      expect(body.pullRequests).toHaveLength(0);
      expect(body.workItems).toHaveLength(0);
    });
  });

  describe('MCP→REST fallback', () => {
    it('falls back to REST when MCP throws', async () => {
      mockMcpListPullRequests.mockRejectedValue(new Error('MCP unavailable'));

      const pr = makePr(201, 'feature/y', 'repo-2');
      mockGetPullRequestsByBranches.mockResolvedValue([pr]);
      mockGetWorkItemsForPullRequest.mockResolvedValue([makeWorkItem(10)]);

      const res = await callSessionDeliverables({ branch: 'feature/y' });

      expect(res.statusCode).toBe(200);
      const body = res.body as { pullRequests: unknown[]; workItems: unknown[] };
      expect(body.pullRequests).toHaveLength(1);
      expect(body.workItems).toHaveLength(1);
      expect(mockGetPullRequestsByBranches).toHaveBeenCalledWith(['feature/y'], undefined, 'TestOrg', 'TestProject');
    });

    it('REST path deduplicates work items across PRs', async () => {
      mockMcpListPullRequests.mockRejectedValue(new Error('MCP down'));

      const pr1 = makePr(301, 'branch', 'r1');
      const pr2 = makePr(302, 'branch', 'r1');
      mockGetPullRequestsByBranches.mockResolvedValue([pr1, pr2]);

      // Same work item appears in both PRs
      const sharedWi = makeWorkItem(99);
      mockGetWorkItemsForPullRequest
        .mockResolvedValueOnce([sharedWi, makeWorkItem(100)])
        .mockResolvedValueOnce([sharedWi, makeWorkItem(101)]);

      const res = await callSessionDeliverables({ branch: 'branch' });
      const body = res.body as { pullRequests: unknown[]; workItems: unknown[] };
      // sharedWi (99) should appear only once → total 3
      expect(body.workItems).toHaveLength(3);
    });
  });

  describe('upstream errors', () => {
    it('returns 502 when REST fallback fails with ADO error', async () => {
      mockMcpListPullRequests.mockRejectedValue(new Error('MCP down'));
      mockGetPullRequestsByBranches.mockRejectedValue(
        new Error('Failed to reach Azure DevOps'),
      );

      const res = await callSessionDeliverables({ branch: 'feature/x' });
      expect(res.statusCode).toBe(502);
      expect((res.body as { error: string }).error).toMatch(/Azure DevOps/);
    });

    it('returns 500 for non-ADO errors in REST path', async () => {
      mockMcpListPullRequests.mockRejectedValue(new Error('MCP down'));
      mockGetPullRequestsByBranches.mockRejectedValue(new Error('Something broke'));

      const res = await callSessionDeliverables({ branch: 'feature/x' });
      expect(res.statusCode).toBe(500);
    });
  });

  describe('repository scoping', () => {
    it('passes repository query param to MCP when provided', async () => {
      mockMcpListPullRequests.mockResolvedValue([]);

      await callSessionDeliverables({ branch: 'feature/x', repository: 'my-repo' });

      expect(mockMcpListPullRequests).toHaveBeenCalledWith(
        expect.objectContaining({ repositoryId: 'my-repo' }),
      );
    });

    it('passes config adoRepository to MCP as fallback', async () => {
      mockAdoRepository = 'config-repo';
      mockMcpListPullRequests.mockResolvedValue([]);

      await callSessionDeliverables({ branch: 'feature/x' });

      expect(mockMcpListPullRequests).toHaveBeenCalledWith(
        expect.objectContaining({ repositoryId: 'config-repo' }),
      );
    });

    it('passes repository query param to REST when MCP fails', async () => {
      mockMcpListPullRequests.mockRejectedValue(new Error('MCP down'));
      mockGetPullRequestsByBranches.mockResolvedValue([]);

      await callSessionDeliverables({ branch: 'feature/x', repository: 'my-repo' });

      expect(mockGetPullRequestsByBranches).toHaveBeenCalledWith(['feature/x'], 'my-repo', 'TestOrg', 'TestProject');
    });

    it('no repository filter when neither query param nor config is set', async () => {
      mockMcpListPullRequests.mockResolvedValue([]);

      await callSessionDeliverables({ branch: 'feature/x' });

      const opts = mockMcpListPullRequests.mock.calls[0][0];
      expect(opts.repositoryId).toBeUndefined();
    });

    it('query param repository overrides config repository', async () => {
      mockAdoRepository = 'config-repo';
      mockMcpListPullRequests.mockResolvedValue([]);

      await callSessionDeliverables({ branch: 'feature/x', repository: 'override-repo' });

      expect(mockMcpListPullRequests).toHaveBeenCalledWith(
        expect.objectContaining({ repositoryId: 'override-repo' }),
      );
    });
  });

  describe('per-session org/project overrides', () => {
    it('passes per-session organization and project to MCP when query params provided', async () => {
      mockMcpListPullRequests.mockResolvedValue([]);

      await callSessionDeliverables({
        branch: 'users/gaburns/my-feature',
        organization: 'microsoft',
        project: 'DefenderCommon',
        repository: 'MTP.SovClouds.AdoSidecarExtension',
      });

      expect(mockMcpListPullRequests).toHaveBeenCalledWith(
        expect.objectContaining({
          project: 'DefenderCommon',
          repositoryId: 'MTP.SovClouds.AdoSidecarExtension',
        }),
      );
    });

    it('passes per-session organization and project to REST fallback', async () => {
      mockMcpListPullRequests.mockRejectedValue(new Error('MCP down'));
      mockGetPullRequestsByBranches.mockResolvedValue([]);

      await callSessionDeliverables({
        branch: 'users/gaburns/my-feature',
        organization: 'microsoft',
        project: 'DefenderCommon',
        repository: 'MTP.SovClouds.AdoSidecarExtension',
      });

      expect(mockGetPullRequestsByBranches).toHaveBeenCalledWith(
        ['users/gaburns/my-feature'],
        'MTP.SovClouds.AdoSidecarExtension',
        'microsoft',
        'DefenderCommon',
      );
    });

    it('falls back to global config when no per-session params provided', async () => {
      mockMcpListPullRequests.mockRejectedValue(new Error('MCP down'));
      mockGetPullRequestsByBranches.mockResolvedValue([]);

      await callSessionDeliverables({ branch: 'feature/x' });

      expect(mockGetPullRequestsByBranches).toHaveBeenCalledWith(
        ['feature/x'],
        undefined,
        'TestOrg',
        'TestProject',
      );
    });
  });

  describe('creator filtering', () => {
    it('filters PRs by creator when adoFilterByCreator is true', async () => {
      mockAdoFilterByCreator = true;
      mockGetAuthenticatedUserDisplayName.mockResolvedValue('Alice');

      const pr1 = makePr(101, 'feature/x', 'repo-1');
      pr1.createdBy = 'Alice';
      const pr2 = makePr(102, 'feature/x', 'repo-1');
      pr2.createdBy = 'Bob';

      mockMcpListPullRequests.mockResolvedValue([pr1, pr2]);
      mockMcpGetPullRequest
        .mockResolvedValueOnce({ pr: pr1, workItemIds: [] })
        .mockResolvedValueOnce({ pr: pr2, workItemIds: [] });

      const res = await callSessionDeliverables({ branch: 'feature/x' });
      const body = res.body as { pullRequests: Array<{ createdBy: string }> };
      expect(body.pullRequests).toHaveLength(1);
      expect(body.pullRequests[0].createdBy).toBe('Alice');
    });

    it('does not filter PRs when adoFilterByCreator is false', async () => {
      mockAdoFilterByCreator = false;

      const pr1 = makePr(101, 'feature/x', 'repo-1');
      pr1.createdBy = 'Alice';
      const pr2 = makePr(102, 'feature/x', 'repo-1');
      pr2.createdBy = 'Bob';

      mockMcpListPullRequests.mockResolvedValue([pr1, pr2]);
      mockMcpGetPullRequest
        .mockResolvedValueOnce({ pr: pr1, workItemIds: [] })
        .mockResolvedValueOnce({ pr: pr2, workItemIds: [] });

      const res = await callSessionDeliverables({ branch: 'feature/x' });
      const body = res.body as { pullRequests: unknown[] };
      expect(body.pullRequests).toHaveLength(2);
      expect(mockGetAuthenticatedUserDisplayName).not.toHaveBeenCalled();
    });

    it('returns all PRs when creator filter is on but user name cannot be resolved', async () => {
      mockAdoFilterByCreator = true;
      mockGetAuthenticatedUserDisplayName.mockResolvedValue(null);

      const pr1 = makePr(101, 'feature/x', 'repo-1');
      mockMcpListPullRequests.mockResolvedValue([pr1]);
      mockMcpGetPullRequest.mockResolvedValue({ pr: pr1, workItemIds: [] });

      const res = await callSessionDeliverables({ branch: 'feature/x' });
      const body = res.body as { pullRequests: unknown[] };
      expect(body.pullRequests).toHaveLength(1);
    });
  });
});
