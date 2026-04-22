import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for server/routes/workstreams.ts
 *
 * Validates:
 * - GET /workstreams/agents — returns { copilot: boolean, claude: boolean }
 * - POST /workstreams/launch — valid request returns launchId + normalizedPath
 * - POST /workstreams/launch — missing repoPath returns 400
 * - POST /workstreams/launch — invalid agentType returns 400
 * - POST /workstreams/launch — non-existent path returns 400
 */

// ── Mocks ────────────────────────────────────────────────────────

const mockCreateLaunch = vi.fn();
const mockIsValidAgentType = vi.fn();

vi.mock('../../services/launchManager.js', () => ({
  createLaunch: (...args: unknown[]) => mockCreateLaunch(...args),
  isValidAgentType: (...args: unknown[]) => mockIsValidAgentType(...args),
}));

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from 'node:child_process';
import workstreamsRouter, { clearAgentCache } from '../workstreams.js';

// ── Helpers ──────────────────────────────────────────────────────

type RouteLayer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (...args: unknown[]) => unknown }>;
  };
};

function findHandler(method: string, routePath: string) {
  const layer = (workstreamsRouter as unknown as { stack: RouteLayer[] }).stack
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

// ── Setup / Teardown ─────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  clearAgentCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── GET /workstreams/agents ──────────────────────────────────────

describe('GET /workstreams/agents', () => {
  it('returns { copilot: boolean, claude: boolean }', async () => {
    // Mock `which`/`where` — copilot found, claude not found
    vi.mocked(execFileSync)
      .mockReturnValueOnce(Buffer.from('/usr/bin/copilot'))  // copilot check
      .mockImplementationOnce(() => { throw new Error('not found'); }); // claude check

    const handler = findHandler('get', '/workstreams/agents');
    const res = mockRes();
    await handler({}, res, () => {});

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ copilot: true, claude: false });
  });

  it('returns both false when neither binary exists', async () => {
    vi.mocked(execFileSync).mockImplementation(() => { throw new Error('not found'); });

    const handler = findHandler('get', '/workstreams/agents');
    const res = mockRes();
    await handler({}, res, () => {});

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ copilot: false, claude: false });
  });

  it('uses cached result on subsequent calls', async () => {
    vi.mocked(execFileSync).mockReturnValue(Buffer.from('found'));

    const handler = findHandler('get', '/workstreams/agents');
    const res1 = mockRes();
    await handler({}, res1, () => {});
    expect(res1.body).toEqual({ copilot: true, claude: true });

    // Second call should use cache — execFileSync should only have 2 calls total
    const res2 = mockRes();
    await handler({}, res2, () => {});
    expect(res2.body).toEqual({ copilot: true, claude: true });
    expect(execFileSync).toHaveBeenCalledTimes(2); // only from first call
  });
});

// ── POST /workstreams/launch ─────────────────────────────────────

describe('POST /workstreams/launch', () => {
  it('returns launchId and normalizedPath for a valid request', async () => {
    mockIsValidAgentType.mockReturnValue(true);
    mockCreateLaunch.mockReturnValue({
      launchId: 'abc-123',
      normalizedPath: '/repos/project',
      agentType: 'shell',
      createdAt: Date.now(),
      consumed: false,
    });

    const handler = findHandler('post', '/workstreams/launch');
    const req = { body: { repoPath: '/repos/project', agentType: 'shell' } };
    const res = mockRes();
    await handler(req, res, () => {});

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      launchId: 'abc-123',
      normalizedPath: '/repos/project',
    });
  });

  it('returns 400 when repoPath is missing', async () => {
    const handler = findHandler('post', '/workstreams/launch');
    const req = { body: { agentType: 'copilot' } };
    const res = mockRes();
    await handler(req, res, () => {});

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/repoPath/i);
  });

  it('returns 400 when repoPath is empty string', async () => {
    const handler = findHandler('post', '/workstreams/launch');
    const req = { body: { repoPath: '', agentType: 'copilot' } };
    const res = mockRes();
    await handler(req, res, () => {});

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/repoPath/i);
  });

  it('returns 400 for an invalid agentType', async () => {
    mockIsValidAgentType.mockReturnValue(false);

    const handler = findHandler('post', '/workstreams/launch');
    const req = { body: { repoPath: '/repos/project', agentType: 'gpt4' } };
    const res = mockRes();
    await handler(req, res, () => {});

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/agentType/i);
  });

  it('returns 400 when agentType is missing', async () => {
    const handler = findHandler('post', '/workstreams/launch');
    const req = { body: { repoPath: '/repos/project' } };
    const res = mockRes();
    await handler(req, res, () => {});

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/agentType/i);
  });

  it('returns 400 when createLaunch throws for non-existent path', async () => {
    mockIsValidAgentType.mockReturnValue(true);
    mockCreateLaunch.mockImplementation(() => {
      throw new Error('Path does not exist: /nope');
    });

    // Must also pass the binary check for copilot
    vi.mocked(execFileSync).mockReturnValue(Buffer.from('found'));

    const handler = findHandler('post', '/workstreams/launch');
    const req = { body: { repoPath: '/nope', agentType: 'copilot' } };
    const res = mockRes();
    await handler(req, res, () => {});

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/does not exist/i);
  });

  it('returns 400 when createLaunch throws for path not a directory', async () => {
    mockIsValidAgentType.mockReturnValue(true);
    mockCreateLaunch.mockImplementation(() => {
      throw new Error('Path is not a directory: /some/file.txt');
    });

    // Must also pass the binary check for shell (no binary check needed)
    const handler = findHandler('post', '/workstreams/launch');
    const req = { body: { repoPath: '/some/file.txt', agentType: 'shell' } };
    const res = mockRes();
    await handler(req, res, () => {});

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/not a directory/i);
  });

  it('returns 400 when agent binary not found for copilot/claude', async () => {
    mockIsValidAgentType.mockReturnValue(true);
    vi.mocked(execFileSync).mockImplementation(() => { throw new Error('not found'); });

    const handler = findHandler('post', '/workstreams/launch');
    const req = { body: { repoPath: '/repos/project', agentType: 'copilot' } };
    const res = mockRes();
    await handler(req, res, () => {});

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/binary not found/i);
  });
});
