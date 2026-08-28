import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  listWorkflows,
  getWorkflow,
  createWorkflow,
  runStep,
  approveWorkflow,
} from '../workflowService';

/**
 * Tests for the workflow client service. Exercises the real
 * fetch-wrapping functions (not reimplemented logic) against a stubbed
 * globalThis fetch, per the server-owned API contract:
 *   GET /api/workflows, POST /api/workflows, GET /api/workflows/:id,
 *   POST /api/workflows/:id/run-step|approve|mode-gate|input-response|...
 *
 * Key behaviors under test:
 *  - server error messages (body.error) must be surfaced to the caller
 *    instead of being swallowed.
 *  - GET /api/workflows returns valid and corrupt workflow entries separately;
 *    the client must split these into `{ workflows, errors }`.
 */

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe('workflowService', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('listWorkflows', () => {
    it('returns valid workflow views from the server envelope', async () => {
      const workflows = [{ id: 'w1', name: 'Test', mode: 'simple', status: 'pending', phases: [] }];
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        jsonResponse({ workflows, errors: [] }),
      );

      const result = await listWorkflows();

      expect(globalThis.fetch).toHaveBeenCalledWith('/api/workflows', undefined);
      expect(result.workflows).toEqual(workflows);
      expect(result.errors).toEqual([]);
    });

    it('normalizes corrupt workflow entries', async () => {
      const valid = { id: 'w1', name: 'Test', mode: 'simple', status: 'running', phases: [] };
      const corrupt = {
        id: 'w2',
        status: 'error',
        sourceFile: 'w2.json',
        error: { code: 'invalid-state', message: 'Corrupt persisted state' },
        message: 'Corrupt persisted state',
      };
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        jsonResponse({ workflows: [valid], errors: [corrupt] }),
      );

      const result = await listWorkflows();

      expect(result.workflows).toEqual([valid]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({ id: 'w2', message: 'Corrupt persisted state' });
    });

    it('falls back to a generic message for a corrupt entry without an error message', async () => {
      const corrupt = {
        id: 'w3',
        status: 'error',
        sourceFile: 'w3.json',
        error: { code: 'invalid-state', message: 'This workflow entry could not be read.' },
        message: 'This workflow entry could not be read.',
      };
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        jsonResponse({ workflows: [], errors: [corrupt] }),
      );

      const result = await listWorkflows();

      expect(result.workflows).toEqual([]);
      expect(result.errors[0].message).toBe('This workflow entry could not be read.');
    });

    it('surfaces a server-provided error message on failure', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        jsonResponse({ error: 'Workflow store unavailable' }, false, 503),
      );

      await expect(listWorkflows()).rejects.toThrow('Workflow store unavailable');
    });

    it('falls back to a generic message when the error body is not JSON', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('not json');
        },
      } as unknown as Response);

      await expect(listWorkflows()).rejects.toThrow('Request failed: 500');
    });
  });

  describe('getWorkflow', () => {
    it('requests the detail endpoint for the given id', async () => {
      const detail = { id: 'w1', name: 'Test', mode: 'simple', status: 'running', phases: [] };
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse(detail));

      const result = await getWorkflow('w1');

      expect(globalThis.fetch).toHaveBeenCalledWith('/api/workflows/w1', undefined);
      expect(result).toEqual(detail);
    });

    it('encodes the workflow id in the URL', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse({}));
      await getWorkflow('w1/../etc');
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/workflows/w1%2F..%2Fetc', undefined);
    });
  });

  describe('createWorkflow', () => {
    it('posts the creation body as JSON', async () => {
      const body = {
        name: 'Fix retry logic',
        goal: 'Stabilize retries',
        repositoryTarget: '/repo',
        mode: 'simple' as const,
      };
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse({ id: 'w1', ...body, status: 'pending', phases: [] }));

      await createWorkflow(body);

      expect(globalThis.fetch).toHaveBeenCalledWith('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    });

    it('surfaces validation error messages from the server', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        jsonResponse({ error: 'Bug Fix classification is required' }, false, 400),
      );

      await expect(
        createWorkflow({ name: 'n', goal: 'g', repositoryTarget: '/r', mode: 'bug-fix' }),
      ).rejects.toThrow('Bug Fix classification is required');
    });
  });

  describe('action endpoints', () => {
    it('runStep accepts the server workflow response', async () => {
      const workflow = {
        id: 'w1',
        name: 'Test',
        goal: 'Test the contract',
        mode: 'simple',
        repositoryTarget: '/repo',
        status: 'running',
        phases: [],
        runId: 'r1',
        workflowSessionId: 's1',
      };
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse(workflow));

      const result = await runStep('w1', { phaseId: 'research', stepId: 'research' });

      expect(result).toEqual(workflow);
    });

    it('approveWorkflow posts to approve and surfaces rejection messages', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        jsonResponse({ error: 'Nothing is ready for approval' }, false, 409),
      );
      await expect(
        approveWorkflow('w1', {
          phaseId: 'implement',
          stepId: 'implement',
          runId: 'run-1',
          artifact: 'implementation.md',
        }),
      ).rejects.toThrow('Nothing is ready for approval');
    });
  });
});
