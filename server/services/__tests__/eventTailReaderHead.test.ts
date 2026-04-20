import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Tests for readEventsHead() — reads the first 64KB of events.jsonl
 * to extract session metadata (createdAt, firstUserMessage, turnCount).
 *
 * Uses a real fixture directory on disk so we exercise the actual file I/O
 * code paths (stat, read, partial-file truncation) rather than mocking fs.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '.head-fixtures');

// ── Mocks ────────────────────────────────────────────────────────

const mockGetConfig = vi.fn();

vi.mock('../../config.js', () => ({
  getConfig: (...args: unknown[]) => mockGetConfig(...args),
}));

vi.mock('../../utils/sanitize.js', () => ({
  sanitizeSessionId: (id: string) => id,
}));

import { readEventsHead } from '../eventTailReader.js';

// ── Helpers ──────────────────────────────────────────────────────

function makeEvent(
  type: string,
  data: Record<string, unknown>,
  timestamp: string,
): string {
  return JSON.stringify({
    type,
    id: `evt-${Math.random().toString(36).slice(2, 9)}`,
    parentId: null,
    timestamp,
    data,
  });
}

function createSessionDir(sessionId: string, eventsContent?: string): void {
  const dir = path.join(FIXTURES_DIR, sessionId);
  fs.mkdirSync(dir, { recursive: true });
  if (eventsContent !== undefined) {
    fs.writeFileSync(path.join(dir, 'events.jsonl'), eventsContent, 'utf8');
  }
}

// ── Setup / teardown ─────────────────────────────────────────────

beforeAll(() => {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
});

afterAll(() => {
  fs.rmSync(FIXTURES_DIR, { recursive: true, force: true });
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGetConfig.mockReturnValue({
    sessionStateDir: FIXTURES_DIR,
    tailBytes: 524288,
  });
  // Wipe session dirs from previous tests
  for (const entry of fs.readdirSync(FIXTURES_DIR)) {
    fs.rmSync(path.join(FIXTURES_DIR, entry), { recursive: true, force: true });
  }
});

// ── Tests ────────────────────────────────────────────────────────

describe('readEventsHead', () => {
  describe('happy path', () => {
    it('returns correct createdAt, firstUserMessage, and turnCount for multiple events', () => {
      const events = [
        makeEvent('user.message', { content: 'Hello world' }, '2026-01-01T00:00:00Z'),
        makeEvent('assistant.message', { content: 'Hi there' }, '2026-01-01T00:00:01Z'),
        makeEvent('user.message', { content: 'Fix the bug' }, '2026-01-01T00:00:02Z'),
      ].join('\n');
      createSessionDir('session-happy', events);

      const result = readEventsHead('session-happy');

      expect(result.createdAt).toBe('2026-01-01T00:00:00Z');
      expect(result.firstUserMessage).toBe('Hello world');
      expect(result.turnCount).toBe(2);
    });

    it('sets createdAt from the first event regardless of type', () => {
      const events = [
        makeEvent('assistant.message', { content: 'Starting...' }, '2026-06-15T10:30:00Z'),
        makeEvent('user.message', { content: 'Thanks' }, '2026-06-15T10:30:05Z'),
      ].join('\n');
      createSessionDir('session-createdAt', events);

      const result = readEventsHead('session-createdAt');

      expect(result.createdAt).toBe('2026-06-15T10:30:00Z');
    });
  });

  describe('no user messages', () => {
    it('returns null firstUserMessage when no user.message events exist', () => {
      const events = [
        makeEvent('assistant.message', { content: 'Starting...' }, '2026-01-01T00:00:00Z'),
        makeEvent('tool.result', { output: 'done' }, '2026-01-01T00:00:01Z'),
      ].join('\n');
      createSessionDir('session-no-user', events);

      const result = readEventsHead('session-no-user');

      expect(result.createdAt).toBe('2026-01-01T00:00:00Z');
      expect(result.firstUserMessage).toBeNull();
      expect(result.turnCount).toBe(0);
    });
  });

  describe('empty and missing files', () => {
    it('returns all null/0 for an empty events.jsonl', () => {
      createSessionDir('session-empty', '');

      const result = readEventsHead('session-empty');

      expect(result.createdAt).toBeNull();
      expect(result.firstUserMessage).toBeNull();
      expect(result.turnCount).toBe(0);
    });

    it('returns all null/0 when events.jsonl does not exist', () => {
      // Session dir exists but no events.jsonl
      fs.mkdirSync(path.join(FIXTURES_DIR, 'session-no-file'), { recursive: true });

      const result = readEventsHead('session-no-file');

      expect(result.createdAt).toBeNull();
      expect(result.firstUserMessage).toBeNull();
      expect(result.turnCount).toBe(0);
    });

    it('returns all null/0 when session directory does not exist', () => {
      const result = readEventsHead('session-nonexistent');

      expect(result.createdAt).toBeNull();
      expect(result.firstUserMessage).toBeNull();
      expect(result.turnCount).toBe(0);
    });
  });

  describe('large file — partial read', () => {
    it('finds user message within the first 64KB', () => {
      // Pad with assistant messages, then place a user message within 64KB
      const lines: string[] = [];
      for (let i = 0; i < 50; i++) {
        lines.push(
          makeEvent('assistant.message', { content: `Resp ${i} ${'x'.repeat(200)}` }, `2026-01-01T00:${String(i).padStart(2, '0')}:00Z`),
        );
      }
      lines.push(makeEvent('user.message', { content: 'Found within 64KB' }, '2026-01-01T01:00:00Z'));
      createSessionDir('session-within', lines.join('\n'));

      const result = readEventsHead('session-within');

      expect(result.createdAt).toBe('2026-01-01T00:00:00Z');
      expect(result.firstUserMessage).toBe('Found within 64KB');
      expect(result.turnCount).toBe(1);
    });

    it('does not find user message beyond maxBytes boundary', () => {
      // Generate lines totalling > 64KB of padding BEFORE the user message
      const lines: string[] = [];
      const lineSize = 500;
      const linesNeeded = Math.ceil(65536 / lineSize) + 30;
      for (let i = 0; i < linesNeeded; i++) {
        lines.push(
          makeEvent('assistant.message', { content: `Pad ${i} ${'y'.repeat(400)}` }, `2026-01-01T00:${String(i % 60).padStart(2, '0')}:00Z`),
        );
      }
      // Place user message well beyond 64KB
      lines.push(makeEvent('user.message', { content: 'Beyond boundary' }, '2026-01-02T00:00:00Z'));
      createSessionDir('session-beyond', lines.join('\n'));

      const result = readEventsHead('session-beyond');

      expect(result.createdAt).not.toBeNull();
      expect(result.firstUserMessage).toBeNull();
      expect(result.turnCount).toBe(0);
    });

    it('respects custom maxBytes parameter', () => {
      const lines = [
        makeEvent('user.message', { content: 'First line is short' }, '2026-01-01T00:00:00Z'),
        makeEvent('user.message', { content: 'Second line too' }, '2026-01-01T00:00:01Z'),
      ];
      createSessionDir('session-custom-max', lines.join('\n'));

      // Read with a very small maxBytes — only the first line should fit
      const firstLineBytes = Buffer.byteLength(lines[0], 'utf8');
      const result = readEventsHead('session-custom-max', firstLineBytes + 2);

      expect(result.createdAt).toBe('2026-01-01T00:00:00Z');
      expect(result.firstUserMessage).toBe('First line is short');
      // The second user.message might be truncated and dropped
      expect(result.turnCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('malformed data', () => {
    it('skips malformed JSON lines and parses valid ones', () => {
      const events = [
        'not valid json at all',
        '{"broken": true',
        makeEvent('user.message', { content: 'Valid message' }, '2026-01-01T00:00:00Z'),
        '{another broken}',
        makeEvent('user.message', { content: 'Second valid' }, '2026-01-01T00:01:00Z'),
      ].join('\n');
      createSessionDir('session-malformed', events);

      const result = readEventsHead('session-malformed');

      expect(result.createdAt).toBe('2026-01-01T00:00:00Z');
      expect(result.firstUserMessage).toBe('Valid message');
      expect(result.turnCount).toBe(2);
    });

    it('returns all null/0 when entire file is malformed', () => {
      createSessionDir('session-all-bad', 'garbage\nmore garbage\n{bad json}\n');

      const result = readEventsHead('session-all-bad');

      expect(result.createdAt).toBeNull();
      expect(result.firstUserMessage).toBeNull();
      expect(result.turnCount).toBe(0);
    });
  });

  describe('edge cases — content filtering', () => {
    it('skips user.message with empty content for firstUserMessage but still counts turns', () => {
      const events = [
        makeEvent('user.message', { content: '' }, '2026-01-01T00:00:00Z'),
        makeEvent('user.message', { content: '   ' }, '2026-01-01T00:00:01Z'),
        makeEvent('user.message', { content: 'Real message' }, '2026-01-01T00:00:02Z'),
      ].join('\n');
      createSessionDir('session-empty-content', events);

      const result = readEventsHead('session-empty-content');

      expect(result.firstUserMessage).toBe('Real message');
      expect(result.turnCount).toBe(3);
    });

    it('trims whitespace from firstUserMessage', () => {
      const events = [
        makeEvent('user.message', { content: '  padded message  ' }, '2026-01-01T00:00:00Z'),
      ].join('\n');
      createSessionDir('session-trim', events);

      const result = readEventsHead('session-trim');

      expect(result.firstUserMessage).toBe('padded message');
    });

    it('handles blank lines between events', () => {
      const events = [
        makeEvent('user.message', { content: 'First' }, '2026-01-01T00:00:00Z'),
        '',
        '',
        makeEvent('user.message', { content: 'Second' }, '2026-01-01T00:00:01Z'),
      ].join('\n');
      createSessionDir('session-blanks', events);

      const result = readEventsHead('session-blanks');

      expect(result.firstUserMessage).toBe('First');
      expect(result.turnCount).toBe(2);
    });
  });
});
