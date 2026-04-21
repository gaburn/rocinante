import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for useSessionDeliverables hook logic.
 *
 * Following the project's pattern (useSessions.test.ts, useSessionsAbort.test.ts):
 * extract the core logic and test it directly — no React rendering needed.
 *
 * The hook's fetch logic:
 * 1. If branch is null/undefined/empty OR !isAdoConfigured → return empty, no fetch
 * 2. Otherwise fetch from /api/ado/session-deliverables?branch=X
 * 3. AbortController pattern: new fetch aborts prior in-flight request
 * 4. Errors set error state, clear data
 */

import type { SessionDeliverables } from '../../types/ado.js';

// ── Extract testable logic from the hook ─────────────────────────

/**
 * Mirrors the fetch decision logic from useSessionDeliverables.
 * Returns true if a fetch should be made.
 */
function shouldFetch(
  branch: string | null | undefined,
  isAdoConfigured: boolean,
): boolean {
  if (!branch || !branch.trim() || !isAdoConfigured) return false;
  return true;
}

/**
 * Simulate the abort-aware deliverables fetcher.
 */
function createDeliverablesFetcher() {
  let currentController: AbortController | null = null;

  interface FetchResult {
    data?: SessionDeliverables;
    aborted: boolean;
    error?: string;
  }

  async function fetch(
    branch: string | null | undefined,
    isAdoConfigured: boolean,
    fetchFn: (branch: string) => Promise<SessionDeliverables>,
  ): Promise<FetchResult> {
    // Abort prior request
    currentController?.abort();

    if (!shouldFetch(branch, isAdoConfigured)) {
      currentController = null;
      return { data: { pullRequests: [], workItems: [] }, aborted: false };
    }

    const controller = new AbortController();
    currentController = controller;

    try {
      const data = await fetchFn(branch!.trim());
      if (controller.signal.aborted) return { aborted: true };
      return { data, aborted: false };
    } catch (err: unknown) {
      if (controller.signal.aborted) return { aborted: true };
      if (err instanceof DOMException && err.name === 'AbortError') return { aborted: true };
      const message = err instanceof Error ? err.message : 'Failed to fetch deliverables';
      return { aborted: false, error: message };
    }
  }

  function abort() {
    currentController?.abort();
  }

  function getController() {
    return currentController;
  }

  return { fetch, abort, getController };
}

// ── Tests ────────────────────────────────────────────────────────

describe('useSessionDeliverables — fetch decision logic', () => {
  it('should not fetch when branch is null', () => {
    expect(shouldFetch(null, true)).toBe(false);
  });

  it('should not fetch when branch is undefined', () => {
    expect(shouldFetch(undefined, true)).toBe(false);
  });

  it('should not fetch when branch is empty string', () => {
    expect(shouldFetch('', true)).toBe(false);
  });

  it('should not fetch when branch is whitespace only', () => {
    expect(shouldFetch('   ', true)).toBe(false);
  });

  it('should not fetch when ADO is not configured', () => {
    expect(shouldFetch('feature/x', false)).toBe(false);
  });

  it('should not fetch when both branch is null and ADO not configured', () => {
    expect(shouldFetch(null, false)).toBe(false);
  });

  it('should fetch when branch is valid and ADO is configured', () => {
    expect(shouldFetch('feature/x', true)).toBe(true);
  });
});

describe('useSessionDeliverables — fetch lifecycle', () => {
  let fetcher: ReturnType<typeof createDeliverablesFetcher>;

  const mockData: SessionDeliverables = {
    pullRequests: [
      { id: 1, title: 'PR1', status: 'active', sourceBranch: 'feat', targetBranch: 'main', repositoryName: 'repo', createdBy: 'dev', reviewers: [], url: '' },
    ],
    workItems: [
      { id: 10, title: 'WI1', state: 'Active', assignedTo: null, workItemType: 'Task', url: '' },
    ],
  };

  beforeEach(() => {
    fetcher = createDeliverablesFetcher();
  });

  it('returns empty when branch is null (no fetch)', async () => {
    const fetchFn = vi.fn();
    const result = await fetcher.fetch(null, true, fetchFn);

    expect(result.aborted).toBe(false);
    expect(result.data!.pullRequests).toHaveLength(0);
    expect(result.data!.workItems).toHaveLength(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns empty when ADO not configured (no fetch)', async () => {
    const fetchFn = vi.fn();
    const result = await fetcher.fetch('feature/x', false, fetchFn);

    expect(result.aborted).toBe(false);
    expect(result.data!.pullRequests).toHaveLength(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('fetches deliverables when branch and ADO configured', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockData);
    const result = await fetcher.fetch('feature/x', true, fetchFn);

    expect(result.aborted).toBe(false);
    expect(result.data!.pullRequests).toHaveLength(1);
    expect(result.data!.workItems).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledWith('feature/x');
  });

  it('handles fetch error gracefully', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('Network failure'));
    const result = await fetcher.fetch('feature/x', true, fetchFn);

    expect(result.aborted).toBe(false);
    expect(result.error).toBe('Network failure');
    expect(result.data).toBeUndefined();
  });

  it('handles non-Error rejection gracefully', async () => {
    const fetchFn = vi.fn().mockRejectedValue('string error');
    const result = await fetcher.fetch('feature/x', true, fetchFn);

    expect(result.aborted).toBe(false);
    expect(result.error).toBe('Failed to fetch deliverables');
  });

  it('aborts prior request on new fetch', async () => {
    let resolveFirst!: (v: SessionDeliverables) => void;
    const firstFetch = vi.fn(
      () => new Promise<SessionDeliverables>((resolve) => { resolveFirst = resolve; }),
    );
    const secondFetch = vi.fn().mockResolvedValue(mockData);

    // Start first fetch (will hang)
    const firstPromise = fetcher.fetch('feature/old', true, firstFetch);

    // Start second fetch — should abort the first
    const secondResult = await fetcher.fetch('feature/new', true, secondFetch);

    // First should now be marked aborted when it resolves
    resolveFirst(mockData);
    const firstResult = await firstPromise;

    expect(firstResult.aborted).toBe(true);
    expect(secondResult.aborted).toBe(false);
    expect(secondResult.data!.pullRequests).toHaveLength(1);
  });

  it('trims whitespace from branch before fetching', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockData);
    await fetcher.fetch('  feature/x  ', true, fetchFn);

    expect(fetchFn).toHaveBeenCalledWith('feature/x');
  });
});
