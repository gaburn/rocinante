import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Tests for server/services/launchManager.ts
 *
 * Validates:
 * - createLaunch: valid directory creates record with UUID + normalizedPath
 * - createLaunch: non-existent path throws
 * - createLaunch: file path (not directory) throws
 * - consumeLaunch: valid launchId returns record and marks consumed
 * - consumeLaunch: already-consumed returns null
 * - consumeLaunch: expired (past TTL) returns null
 * - consumeLaunch: non-existent launchId returns null
 * - getLaunch: returns record without consuming it
 */

vi.mock('node:fs');

import {
  createLaunch,
  consumeLaunch,
  getLaunch,
  clearLaunches,
  stopCleanupTimer,
  validateDirectory,
  isValidAgentType,
  sanitizeRepoPath,
} from '../launchManager.js';

// ── Helpers ──────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mockDirectoryExists(dirPath?: string) {
  vi.mocked(fs.statSync).mockReturnValue({
    isDirectory: () => true,
    isFile: () => false,
  } as unknown as fs.Stats);
}

function mockFileExists() {
  vi.mocked(fs.statSync).mockReturnValue({
    isDirectory: () => false,
    isFile: () => true,
  } as unknown as fs.Stats);
}

function mockPathNotFound() {
  vi.mocked(fs.statSync).mockImplementation(() => {
    throw new Error('ENOENT: no such file or directory');
  });
}

// ── Setup / Teardown ─────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  clearLaunches();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  stopCleanupTimer();
});

// ── isValidAgentType ─────────────────────────────────────────────

describe('isValidAgentType', () => {
  it('accepts copilot, claude, shell', () => {
    expect(isValidAgentType('copilot')).toBe(true);
    expect(isValidAgentType('claude')).toBe(true);
    expect(isValidAgentType('shell')).toBe(true);
  });

  it('rejects unknown agent types', () => {
    expect(isValidAgentType('gpt')).toBe(false);
    expect(isValidAgentType('')).toBe(false);
    expect(isValidAgentType('COPILOT')).toBe(false);
  });
});

// ── validateDirectory ────────────────────────────────────────────

describe('validateDirectory', () => {
  it('does not throw for a valid directory', () => {
    mockDirectoryExists();
    expect(() => validateDirectory('/some/dir')).not.toThrow();
  });

  it('throws for a non-existent path', () => {
    mockPathNotFound();
    expect(() => validateDirectory('/nope')).toThrow(/does not exist/);
  });

  it('throws for a file (not directory)', () => {
    mockFileExists();
    expect(() => validateDirectory('/some/file.txt')).toThrow(/not a directory/);
  });
});

// ── createLaunch ─────────────────────────────────────────────────

describe('createLaunch', () => {
  it('creates a record with UUID and normalizedPath for a valid directory', () => {
    mockDirectoryExists();
    const record = createLaunch('/repos/my-project', 'copilot');

    expect(record.launchId).toMatch(UUID_RE);
    expect(record.normalizedPath).toBeTruthy();
    expect(record.agentType).toBe('copilot');
    expect(record.consumed).toBe(false);
    expect(typeof record.createdAt).toBe('number');
  });

  it('normalizes the path (resolves to absolute)', () => {
    mockDirectoryExists();
    const record = createLaunch('/repos/my-project/', 'claude');

    // Should not end with trailing separator (unless root)
    expect(record.normalizedPath).not.toMatch(/[/\\]$/);
  });

  it('throws for a non-existent path', () => {
    mockPathNotFound();
    expect(() => createLaunch('/does/not/exist', 'copilot')).toThrow(/does not exist/);
  });

  it('throws for a path that is a file, not a directory', () => {
    mockFileExists();
    expect(() => createLaunch('/some/file.txt', 'copilot')).toThrow(/not a directory/);
  });

  it('throws for an invalid agentType', () => {
    mockDirectoryExists();
    expect(() => createLaunch('/repos/my-project', 'gpt4')).toThrow(/Invalid agentType/);
  });

  it('throws when repoPath is empty', () => {
    expect(() => createLaunch('', 'copilot')).toThrow(/repoPath is required/);
  });
});

// ── consumeLaunch ────────────────────────────────────────────────

describe('consumeLaunch', () => {
  it('returns the record and marks it consumed', () => {
    mockDirectoryExists();
    const created = createLaunch('/repos/project', 'shell');
    const consumed = consumeLaunch(created.launchId);

    expect(consumed).not.toBeNull();
    expect(consumed!.launchId).toBe(created.launchId);
    expect(consumed!.consumed).toBe(true);
  });

  it('returns null for an already-consumed launchId', () => {
    mockDirectoryExists();
    const created = createLaunch('/repos/project', 'copilot');
    consumeLaunch(created.launchId); // first consume
    const second = consumeLaunch(created.launchId);

    expect(second).toBeNull();
  });

  it('returns null for an expired launchId (past TTL)', () => {
    vi.useFakeTimers();
    mockDirectoryExists();
    const created = createLaunch('/repos/project', 'copilot');

    // Advance past the 5-minute TTL
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    const result = consumeLaunch(created.launchId);

    expect(result).toBeNull();
  });

  it('returns null for a non-existent launchId', () => {
    const result = consumeLaunch('00000000-0000-0000-0000-000000000000');
    expect(result).toBeNull();
  });
});

// ── getLaunch ─────────────────────────────────────────────────────

describe('getLaunch', () => {
  it('returns the record without consuming it', () => {
    mockDirectoryExists();
    const created = createLaunch('/repos/project', 'claude');
    const fetched = getLaunch(created.launchId);

    expect(fetched).not.toBeNull();
    expect(fetched!.launchId).toBe(created.launchId);
    expect(fetched!.consumed).toBe(false);

    // Should still be consumable
    const consumed = consumeLaunch(created.launchId);
    expect(consumed).not.toBeNull();
    expect(consumed!.consumed).toBe(true);
  });

  it('returns null for a non-existent launchId', () => {
    expect(getLaunch('nonexistent')).toBeNull();
  });

  it('returns null for an expired launchId', () => {
    vi.useFakeTimers();
    mockDirectoryExists();
    const created = createLaunch('/repos/project', 'shell');

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(getLaunch(created.launchId)).toBeNull();
  });
});

// ── sanitizeRepoPath ─────────────────────────────────────────────

describe('sanitizeRepoPath', () => {
  it('returns resolved absolute path for valid input', () => {
    const result = sanitizeRepoPath('/repos/my-project');
    expect(path.isAbsolute(result)).toBe(true);
  });

  it('throws for empty string', () => {
    expect(() => sanitizeRepoPath('')).toThrow(/repoPath is required/);
  });

  it('throws for null bytes in path', () => {
    expect(() => sanitizeRepoPath('/repos/my\0project')).toThrow(/null bytes/);
  });

  it('rejects paths that resolve into system directories (posix)', () => {
    // On Windows this test checks Windows blocked dirs instead
    if (process.platform === 'win32') {
      expect(() => sanitizeRepoPath('C:\\Windows\\System32')).toThrow(/restricted system directory/);
    } else {
      expect(() => sanitizeRepoPath('/etc/passwd')).toThrow(/restricted system directory/);
    }
  });

  it('resolves relative paths to absolute', () => {
    const result = sanitizeRepoPath('relative/path');
    expect(path.isAbsolute(result)).toBe(true);
  });

  it('rejects paths containing .. traversal segments', () => {
    expect(() => sanitizeRepoPath('/repos/my-project/../other-project')).toThrow(/traversal segments/);
  });
});
