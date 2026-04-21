import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for NewWorkstreamDialog component logic.
 *
 * Following the project's pattern (useSessions.test.ts, SessionCardBadge.test.ts):
 * extract the core logic and test it directly — no React rendering needed.
 *
 * Extracted logic under test:
 * 1. Name validation (empty, duplicate)
 * 2. Submit validation (empty name, empty path, duplicate name)
 * 3. Agent auto-select (copilot-only, claude-only, both, neither)
 * 4. Agent detection fetch (success, failure)
 * 5. Submit flow (API call, success handling, error handling)
 * 6. Autocomplete filtering (cwd suggestions)
 * 7. Render gating (isOpen)
 */

// ── Types mirroring the component ────────────────────────────────

type AgentType = 'copilot' | 'claude' | 'shell';

interface AgentDetection {
  copilot: boolean;
  claude: boolean;
}

interface SessionLike {
  cwd?: string | null;
}

// ── Extracted logic: autocomplete ────────────────────────────────

/** Mirrors knownCwds memo from NewWorkstreamDialog */
function extractKnownCwds(sessions: SessionLike[]): string[] {
  const cwds = new Set<string>();
  for (const s of sessions) {
    if (s.cwd) cwds.add(s.cwd);
  }
  return Array.from(cwds).sort();
}

/** Mirrors filteredSuggestions memo from NewWorkstreamDialog */
function filterSuggestions(knownCwds: string[], repoPath: string): string[] {
  if (!repoPath.trim()) return knownCwds;
  const lower = repoPath.toLowerCase();
  return knownCwds.filter((c) => c.toLowerCase().includes(lower));
}

// ── Extracted logic: name validation ─────────────────────────────

/**
 * Mirrors validateName callback from NewWorkstreamDialog.
 * Returns error message or null.
 */
function validateName(value: string, existingNames: string[]): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null; // empty → no inline error (only on submit)
  const existing = existingNames.map((n) => n.toLowerCase());
  if (existing.includes(trimmed.toLowerCase())) {
    return 'A workstream with this name already exists';
  }
  return null;
}

// ── Extracted logic: submit validation ───────────────────────────

interface SubmitValidation {
  nameError: string | null;
  pathError: string | null;
  hasError: boolean;
}

/**
 * Mirrors the validation block in handleSubmit.
 * Returns the errors that would be set.
 */
function validateSubmit(
  name: string,
  repoPath: string,
  existingNames: string[],
): SubmitValidation {
  let nameError: string | null = null;
  let pathError: string | null = null;
  let hasError = false;

  const trimmedName = name.trim();
  const trimmedPath = repoPath.trim();

  if (!trimmedName) {
    nameError = 'Workstream name is required';
    hasError = true;
  } else {
    const existing = existingNames.map((n) => n.toLowerCase());
    if (existing.includes(trimmedName.toLowerCase())) {
      nameError = 'A workstream with this name already exists';
      hasError = true;
    }
  }

  if (!trimmedPath) {
    pathError = 'Repo path is required';
    hasError = true;
  }

  return { nameError, pathError, hasError };
}

// ── Extracted logic: agent auto-select ───────────────────────────

/**
 * Mirrors the auto-select logic in the agent detection effect.
 * Given detection results, returns the agent type that should be selected.
 */
function autoSelectAgent(detection: AgentDetection): AgentType {
  if (detection.copilot && !detection.claude) return 'copilot';
  if (detection.claude && !detection.copilot) return 'claude';
  if (detection.copilot) return 'copilot'; // both available → copilot wins
  return 'shell';
}

// ── Extracted logic: agent detection fetch ────────────────────────

/**
 * Simulates the agent detection fetch + error handling from the component's
 * useEffect. Returns detection result and chosen agent type.
 */
async function fetchAgentDetection(
  fetchFn: () => Promise<{ ok: boolean; json: () => Promise<AgentDetection> }>,
): Promise<{ detection: AgentDetection; agentType: AgentType; error: boolean }> {
  try {
    const res = await fetchFn();
    if (!res.ok) throw new Error('Agent detection failed');
    const data = await res.json();
    return { detection: data, agentType: autoSelectAgent(data), error: false };
  } catch {
    const fallback: AgentDetection = { copilot: false, claude: false };
    return { detection: fallback, agentType: 'shell', error: true };
  }
}

// ── Extracted logic: submit flow ─────────────────────────────────

interface LaunchResponse {
  launchId: string;
  normalizedPath: string;
}

interface SubmitCallbacks {
  createWorkstream: (name: string, opts: { repoPath: string; pendingLaunchId: string }) => void;
  openTab: (session: { id: string; name: string; cwd: string }, mode: string) => void;
  openTerminal: () => void;
  onClose: () => void;
}

/**
 * Simulates the submit fetch flow from handleSubmit.
 * Returns success/error result.
 */
async function executeSubmit(
  trimmedName: string,
  trimmedPath: string,
  agentType: AgentType,
  fetchFn: (url: string, init: RequestInit) => Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
  }>,
  callbacks: SubmitCallbacks,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetchFn('/api/workstreams/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoPath: trimmedPath, agentType }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? `Launch failed (${res.status})`);
    }

    const { launchId, normalizedPath } = (await res.json()) as LaunchResponse;

    callbacks.createWorkstream(trimmedName, {
      repoPath: normalizedPath,
      pendingLaunchId: launchId,
    });

    const syntheticId = `launch-${launchId}`;
    callbacks.openTab(
      { id: syntheticId, name: `${trimmedName} (shell)`, cwd: normalizedPath },
      'shell',
    );
    callbacks.openTerminal();
    callbacks.onClose();

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { success: false, error: message };
  }
}

// ── Extracted logic: render gating ───────────────────────────────

/** Mirrors: if (!isOpen) return null */
function shouldRender(isOpen: boolean): boolean {
  return isOpen;
}

/** Mirrors: agentDetection ? (agentDetection.copilot || agentDetection.claude) : false */
function hasAnyCli(detection: AgentDetection | null): boolean {
  return detection ? detection.copilot || detection.claude : false;
}

// ═══════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════

describe('NewWorkstreamDialog', () => {
  // ── 1. Rendering gate ──────────────────────────────────────────

  describe('render gating', () => {
    it('renders when isOpen is true', () => {
      expect(shouldRender(true)).toBe(true);
    });

    it('does not render when isOpen is false', () => {
      expect(shouldRender(false)).toBe(false);
    });
  });

  // ── 2. Name validation ────────────────────────────────────────

  describe('name validation', () => {
    it('returns null for empty input (no inline error until submit)', () => {
      expect(validateName('', ['existing'])).toBeNull();
    });

    it('returns null for whitespace-only input', () => {
      expect(validateName('   ', ['existing'])).toBeNull();
    });

    it('returns null for a unique name', () => {
      expect(validateName('new-stream', ['existing-stream'])).toBeNull();
    });

    it('returns error for duplicate name (exact match)', () => {
      expect(validateName('my-stream', ['my-stream'])).toBe(
        'A workstream with this name already exists',
      );
    });

    it('returns error for duplicate name (case-insensitive)', () => {
      expect(validateName('My-Stream', ['my-stream'])).toBe(
        'A workstream with this name already exists',
      );
    });

    it('trims input before comparing', () => {
      expect(validateName('  my-stream  ', ['my-stream'])).toBe(
        'A workstream with this name already exists',
      );
    });

    it('returns null when existing names list is empty', () => {
      expect(validateName('anything', [])).toBeNull();
    });
  });

  // ── 3. Submit validation ───────────────────────────────────────

  describe('submit validation', () => {
    it('passes with valid name and path', () => {
      const result = validateSubmit('my-stream', '/path/to/repo', []);
      expect(result.hasError).toBe(false);
      expect(result.nameError).toBeNull();
      expect(result.pathError).toBeNull();
    });

    it('fails with empty name', () => {
      const result = validateSubmit('', '/path/to/repo', []);
      expect(result.hasError).toBe(true);
      expect(result.nameError).toBe('Workstream name is required');
      expect(result.pathError).toBeNull();
    });

    it('fails with whitespace-only name', () => {
      const result = validateSubmit('   ', '/path/to/repo', []);
      expect(result.hasError).toBe(true);
      expect(result.nameError).toBe('Workstream name is required');
    });

    it('fails with empty path', () => {
      const result = validateSubmit('my-stream', '', []);
      expect(result.hasError).toBe(true);
      expect(result.pathError).toBe('Repo path is required');
      expect(result.nameError).toBeNull();
    });

    it('fails with whitespace-only path', () => {
      const result = validateSubmit('my-stream', '   ', []);
      expect(result.hasError).toBe(true);
      expect(result.pathError).toBe('Repo path is required');
    });

    it('fails with duplicate name', () => {
      const result = validateSubmit('existing', '/path', ['existing']);
      expect(result.hasError).toBe(true);
      expect(result.nameError).toBe('A workstream with this name already exists');
    });

    it('detects duplicate name case-insensitively', () => {
      const result = validateSubmit('Existing', '/path', ['existing']);
      expect(result.hasError).toBe(true);
      expect(result.nameError).toBe('A workstream with this name already exists');
    });

    it('reports both errors when name and path are both empty', () => {
      const result = validateSubmit('', '', []);
      expect(result.hasError).toBe(true);
      expect(result.nameError).toBe('Workstream name is required');
      expect(result.pathError).toBe('Repo path is required');
    });
  });

  // ── 4. Agent detection / auto-select ───────────────────────────

  describe('agent auto-select', () => {
    it('selects copilot when only copilot is available', () => {
      expect(autoSelectAgent({ copilot: true, claude: false })).toBe('copilot');
    });

    it('selects claude when only claude is available', () => {
      expect(autoSelectAgent({ copilot: false, claude: true })).toBe('claude');
    });

    it('prefers copilot when both are available', () => {
      expect(autoSelectAgent({ copilot: true, claude: true })).toBe('copilot');
    });

    it('falls back to shell when neither is available', () => {
      expect(autoSelectAgent({ copilot: false, claude: false })).toBe('shell');
    });
  });

  describe('hasAnyCli helper', () => {
    it('returns false when detection is null (loading)', () => {
      expect(hasAnyCli(null)).toBe(false);
    });

    it('returns false when neither CLI is detected', () => {
      expect(hasAnyCli({ copilot: false, claude: false })).toBe(false);
    });

    it('returns true when copilot is detected', () => {
      expect(hasAnyCli({ copilot: true, claude: false })).toBe(true);
    });

    it('returns true when claude is detected', () => {
      expect(hasAnyCli({ copilot: false, claude: true })).toBe(true);
    });

    it('returns true when both are detected', () => {
      expect(hasAnyCli({ copilot: true, claude: true })).toBe(true);
    });
  });

  // ── 5. Agent detection fetch ───────────────────────────────────

  describe('agent detection fetch', () => {
    it('returns detection and auto-selected type on success', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ copilot: true, claude: false }),
      });

      const result = await fetchAgentDetection(mockFetch);
      expect(result.error).toBe(false);
      expect(result.detection).toEqual({ copilot: true, claude: false });
      expect(result.agentType).toBe('copilot');
    });

    it('returns both CLIs and selects copilot', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ copilot: true, claude: true }),
      });

      const result = await fetchAgentDetection(mockFetch);
      expect(result.detection).toEqual({ copilot: true, claude: true });
      expect(result.agentType).toBe('copilot');
    });

    it('falls back to shell on HTTP error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({}),
      });

      const result = await fetchAgentDetection(mockFetch);
      expect(result.error).toBe(true);
      expect(result.detection).toEqual({ copilot: false, claude: false });
      expect(result.agentType).toBe('shell');
    });

    it('falls back to shell on network error', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await fetchAgentDetection(mockFetch);
      expect(result.error).toBe(true);
      expect(result.agentType).toBe('shell');
    });
  });

  // ── 6. Submit flow ─────────────────────────────────────────────

  describe('submit flow', () => {
    let createWorkstream: ReturnType<typeof vi.fn>;
    let openTab: ReturnType<typeof vi.fn>;
    let openTerminal: ReturnType<typeof vi.fn>;
    let onClose: ReturnType<typeof vi.fn>;
    let callbacks: SubmitCallbacks;

    beforeEach(() => {
      createWorkstream = vi.fn();
      openTab = vi.fn();
      openTerminal = vi.fn();
      onClose = vi.fn();
      callbacks = { createWorkstream, openTab, openTerminal, onClose };
    });

    it('calls POST /api/workstreams/launch with correct body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ launchId: 'abc-123', normalizedPath: '/resolved/path' }),
      });

      await executeSubmit('my-stream', '/some/path', 'copilot', mockFetch, callbacks);

      expect(mockFetch).toHaveBeenCalledWith('/api/workstreams/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoPath: '/some/path', agentType: 'copilot' }),
      });
    });

    it('creates workstream with normalizedPath and launchId on success', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ launchId: 'abc-123', normalizedPath: '/resolved/path' }),
      });

      const result = await executeSubmit('my-stream', '/some/path', 'shell', mockFetch, callbacks);

      expect(result.success).toBe(true);
      expect(createWorkstream).toHaveBeenCalledWith('my-stream', {
        repoPath: '/resolved/path',
        pendingLaunchId: 'abc-123',
      });
    });

    it('opens a tab with synthetic launch ID', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ launchId: 'xyz-789', normalizedPath: '/the/path' }),
      });

      await executeSubmit('auth-work', '/the/path', 'claude', mockFetch, callbacks);

      expect(openTab).toHaveBeenCalledWith(
        { id: 'launch-xyz-789', name: 'auth-work (shell)', cwd: '/the/path' },
        'shell',
      );
    });

    it('opens terminal and closes dialog on success', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ launchId: 'id', normalizedPath: '/p' }),
      });

      await executeSubmit('ws', '/p', 'shell', mockFetch, callbacks);

      expect(openTerminal).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('returns error message from API body on 400', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Directory does not exist' }),
      });

      const result = await executeSubmit('ws', '/bad/path', 'shell', mockFetch, callbacks);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Directory does not exist');
    });

    it('returns generic error when API body has no error field', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      const result = await executeSubmit('ws', '/path', 'shell', mockFetch, callbacks);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Launch failed (500)');
    });

    it('returns generic error when API body parsing fails', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => { throw new Error('not JSON'); },
      });

      const result = await executeSubmit('ws', '/path', 'shell', mockFetch, callbacks);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Launch failed (502)');
    });

    it('does not call callbacks on error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Bad path' }),
      });

      await executeSubmit('ws', '/path', 'shell', mockFetch, callbacks);

      expect(createWorkstream).not.toHaveBeenCalled();
      expect(openTab).not.toHaveBeenCalled();
      expect(openTerminal).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('handles network-level fetch failure', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      const result = await executeSubmit('ws', '/path', 'shell', mockFetch, callbacks);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to fetch');
    });
  });

  // ── 7. Autocomplete ────────────────────────────────────────────

  describe('autocomplete suggestions', () => {
    describe('extractKnownCwds', () => {
      it('extracts unique cwds from sessions', () => {
        const sessions: SessionLike[] = [
          { cwd: '/path/a' },
          { cwd: '/path/b' },
          { cwd: '/path/a' }, // duplicate
        ];
        expect(extractKnownCwds(sessions)).toEqual(['/path/a', '/path/b']);
      });

      it('ignores sessions with null/undefined cwd', () => {
        const sessions: SessionLike[] = [
          { cwd: '/path/a' },
          { cwd: null },
          { cwd: undefined },
          {},
        ];
        expect(extractKnownCwds(sessions)).toEqual(['/path/a']);
      });

      it('returns empty array for empty sessions', () => {
        expect(extractKnownCwds([])).toEqual([]);
      });

      it('sorts cwds alphabetically', () => {
        const sessions: SessionLike[] = [
          { cwd: '/z-repo' },
          { cwd: '/a-repo' },
          { cwd: '/m-repo' },
        ];
        expect(extractKnownCwds(sessions)).toEqual(['/a-repo', '/m-repo', '/z-repo']);
      });
    });

    describe('filterSuggestions', () => {
      const cwds = ['/home/user/project-a', '/home/user/project-b', '/var/repos/my-app'];

      it('returns all cwds when input is empty', () => {
        expect(filterSuggestions(cwds, '')).toEqual(cwds);
      });

      it('returns all cwds when input is whitespace', () => {
        expect(filterSuggestions(cwds, '   ')).toEqual(cwds);
      });

      it('filters by substring match', () => {
        expect(filterSuggestions(cwds, 'project')).toEqual([
          '/home/user/project-a',
          '/home/user/project-b',
        ]);
      });

      it('matches case-insensitively', () => {
        expect(filterSuggestions(cwds, 'PROJECT')).toEqual([
          '/home/user/project-a',
          '/home/user/project-b',
        ]);
      });

      it('returns empty when nothing matches', () => {
        expect(filterSuggestions(cwds, 'zzz-no-match')).toEqual([]);
      });

      it('matches partial path segments', () => {
        expect(filterSuggestions(cwds, '/var')).toEqual(['/var/repos/my-app']);
      });
    });
  });
});
