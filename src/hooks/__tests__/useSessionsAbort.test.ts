import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for the AbortController pattern used in useSessions.loadSessions().
 *
 * The hook aborts prior in-flight requests when loadSessions is called again
 * (e.g., from polling or manual refresh), preventing stale responses from
 * arriving out-of-order and causing UI flicker.
 *
 * We extract the abort orchestration logic and test it directly — same
 * approach used by the sibling useSessions.test.ts for search filtering.
 */

/** Minimal reproduction of the abort-aware fetch pattern from loadSessions */
function createAbortableLoader() {
  let currentController: AbortController | null = null;

  async function load(
    fetchFn: (signal: AbortSignal) => Promise<unknown>,
  ): Promise<{ data?: unknown; aborted: boolean; error?: string }> {
    // Abort any in-flight request
    if (currentController) {
      currentController.abort();
    }
    const controller = new AbortController();
    currentController = controller;

    try {
      const data = await fetchFn(controller.signal);
      return { data, aborted: false };
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { aborted: true };
      }
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { aborted: false, error: message };
    }
  }

  function abort() {
    if (currentController) {
      currentController.abort();
    }
  }

  function getCurrentController() {
    return currentController;
  }

  return { load, abort, getCurrentController };
}

/** Helper: create a fetch mock that waits until resolved/rejected externally */
function createDeferredFetch() {
  let resolveFn!: (value: unknown) => void;
  let rejectFn!: (reason: unknown) => void;
  const promise = new Promise((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });

  const fetchFn = vi.fn((signal: AbortSignal) => {
    return new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      });
      promise.then(resolve, reject);
    });
  });

  return { fetchFn, resolve: resolveFn, reject: rejectFn };
}

describe('loadSessions AbortController pattern', () => {
  let loader: ReturnType<typeof createAbortableLoader>;

  beforeEach(() => {
    loader = createAbortableLoader();
  });

  it('passes an AbortSignal to the fetch function', async () => {
    const fetchFn = vi.fn(async () => ['session1']);
    await loader.load(fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const signal = fetchFn.mock.calls[0][0];
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it('aborts the previous request when load is called again', async () => {
    const deferred1 = createDeferredFetch();
    const deferred2 = createDeferredFetch();

    const promise1 = loader.load(deferred1.fetchFn);

    // Second load should abort the first
    const promise2 = loader.load(deferred2.fetchFn);

    // Resolve the second request
    deferred2.resolve(['session-latest']);

    const [result1, result2] = await Promise.all([promise1, promise2]);

    expect(result1.aborted).toBe(true);
    expect(result2.aborted).toBe(false);
    expect(result2.data).toEqual(['session-latest']);
  });

  it('does not treat abort as a real error', async () => {
    const deferred = createDeferredFetch();
    const promise = loader.load(deferred.fetchFn);

    // Abort externally (simulates unmount)
    loader.abort();

    const result = await promise;
    expect(result.aborted).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('propagates non-abort errors normally', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('Network failure');
    });

    const result = await loader.load(fetchFn);
    expect(result.aborted).toBe(false);
    expect(result.error).toBe('Network failure');
  });

  it('abort() cancels the current in-flight request (unmount cleanup)', async () => {
    const deferred = createDeferredFetch();
    const promise = loader.load(deferred.fetchFn);

    // Simulate unmount: abort pending request
    loader.abort();

    const result = await promise;
    expect(result.aborted).toBe(true);
  });

  it('creates a fresh controller for each load call', async () => {
    const fetchFn = vi.fn(async () => []);

    await loader.load(fetchFn);
    const controller1 = loader.getCurrentController();

    await loader.load(fetchFn);
    const controller2 = loader.getCurrentController();

    expect(controller1).not.toBe(controller2);
  });

  it('handles rapid sequential calls — only the last one wins', async () => {
    const deferreds = Array.from({ length: 5 }, () => createDeferredFetch());
    const promises = deferreds.map((d) => loader.load(d.fetchFn));

    // Only resolve the last one
    deferreds[4].resolve(['final']);

    const results = await Promise.all(promises);

    // First 4 should be aborted
    for (let i = 0; i < 4; i++) {
      expect(results[i].aborted).toBe(true);
    }
    // Last one should succeed
    expect(results[4].aborted).toBe(false);
    expect(results[4].data).toEqual(['final']);
  });
});
