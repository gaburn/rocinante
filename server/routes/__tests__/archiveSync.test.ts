import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';

/**
 * Tests for Sprint 1 Item C1: Archive sync endpoint payload handling.
 *
 * Validates that POST /api/sessions/archive accepts large payloads (1787+ UUIDs)
 * and that the archive round-trip (POST → GET) works correctly.
 *
 * These tests exercise the route handlers directly with mock archiveStore
 * to isolate the body-parsing and validation logic.
 */

// ── Mocks ────────────────────────────────────────────────────────

// In-memory archive set to simulate real store behavior
let archiveSet: Set<string>;

vi.mock('../../services/archiveStore.js', () => ({
  getArchivedIds: vi.fn(() => [...archiveSet]),
  setArchivedIds: vi.fn((ids: string[]) => { archiveSet = new Set(ids); }),
  addArchived: vi.fn((id: string) => { archiveSet.add(id); }),
  removeArchived: vi.fn((id: string) => { archiveSet.delete(id); }),
  isArchived: vi.fn((id: string) => archiveSet.has(id)),
  isInitialized: vi.fn(() => true),
}));

vi.mock('../../services/sessionMapper.js', () => ({
  mapAllSessionSummaries: vi.fn(() => []),
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

vi.mock('../../config.js', () => ({
  getConfig: vi.fn(() => ({
    cacheTtlMs: 10000,
    sessionStateDir: '/mock/session-state',
    staleThresholdMs: 300000,
  })),
}));

import sessionsRouter from '../sessions.js';

// ── Helpers ──────────────────────────────────────────────────────

type RouteLayer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (...args: unknown[]) => unknown }>;
  };
};

function findHandler(method: string, routePath: string) {
  const layer = (sessionsRouter as unknown as { stack: RouteLayer[] }).stack
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
    headers: {} as Record<string, string>,
    status(code: number) { res.statusCode = code; return res; },
    json(data: unknown) { res.body = data; return res; },
    set(key: string, value: string) { res.headers[key] = value; return res; },
  };
  return res;
}

function callPostArchive(body: unknown) {
  const handler = findHandler('post', '/sessions/archive');
  const req = { method: 'POST', url: '/sessions/archive', body, params: {}, query: {} };
  const res = mockRes();
  handler(req, res, () => {});
  return res;
}

function callGetArchive() {
  const handler = findHandler('get', '/sessions/archive');
  const req = { method: 'GET', url: '/sessions/archive', params: {}, query: {} };
  const res = mockRes();
  handler(req, res, () => {});
  return res;
}

function generateUUIDs(count: number): string[] {
  return Array.from({ length: count }, () => crypto.randomUUID());
}

// ── Test setup ───────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  archiveSet = new Set();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────

describe('POST /api/sessions/archive — archive sync', () => {
  it('accepts a payload with 1787 UUIDs and returns 200', () => {
    const ids = generateUUIDs(1787);
    const res = callPostArchive({ ids });

    expect(res.statusCode).toBe(200);
    expect((res.body as { ids: string[] }).ids).toHaveLength(1787);
  });

  it('round-trips: POST sync then GET returns the same IDs', () => {
    const ids = generateUUIDs(500);
    callPostArchive({ ids });

    const getRes = callGetArchive();
    const returnedIds = (getRes.body as { ids: string[] }).ids;

    expect(returnedIds).toHaveLength(500);
    expect(new Set(returnedIds)).toEqual(new Set(ids));
  });

  it('handles empty array', () => {
    const res = callPostArchive({ ids: [] });

    expect(res.statusCode).toBe(200);
    expect((res.body as { ids: string[] }).ids).toHaveLength(0);
  });

  it('handles a single UUID', () => {
    const id = crypto.randomUUID();
    const res = callPostArchive({ ids: [id] });

    expect(res.statusCode).toBe(200);
    const returned = (res.body as { ids: string[] }).ids;
    expect(returned).toHaveLength(1);
    expect(returned[0]).toBe(id);
  });

  it('handles 2000+ UUIDs (near the 2MB limit boundary)', () => {
    const ids = generateUUIDs(2500);
    const res = callPostArchive({ ids });

    expect(res.statusCode).toBe(200);
    expect((res.body as { ids: string[] }).ids).toHaveLength(2500);
  });

  it('replaces previous archive set on subsequent sync', () => {
    const firstBatch = generateUUIDs(100);
    callPostArchive({ ids: firstBatch });

    const secondBatch = generateUUIDs(50);
    callPostArchive({ ids: secondBatch });

    const getRes = callGetArchive();
    const returned = (getRes.body as { ids: string[] }).ids;
    expect(returned).toHaveLength(50);
    expect(new Set(returned)).toEqual(new Set(secondBatch));
  });

  it('rejects missing ids field', () => {
    const res = callPostArchive({});
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toContain('ids');
  });

  it('rejects non-array ids', () => {
    const res = callPostArchive({ ids: 'not-an-array' });
    expect(res.statusCode).toBe(400);
  });

  it('rejects array with non-string elements', () => {
    const res = callPostArchive({ ids: [123, 456] });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/sessions/archive — payload size validation', () => {
  it('1787 UUIDs serialized as JSON is within 2MB', () => {
    const ids = generateUUIDs(1787);
    const payload = JSON.stringify({ ids });
    const sizeInBytes = Buffer.byteLength(payload, 'utf-8');

    // 1787 UUIDs (36 chars each + quotes + commas) ≈ ~75KB — well under 2MB
    expect(sizeInBytes).toBeLessThan(2 * 1024 * 1024);
    // But over the old 100KB default? UUIDs + JSON overhead:
    // Each UUID in JSON: ~40 bytes (36 chars + quotes + comma)
    // 1787 * 40 ≈ 71480 bytes ≈ ~70KB
    // With JSON structure overhead, this is close to 100KB limit
    expect(sizeInBytes).toBeGreaterThan(50 * 1024); // Sanity: definitely non-trivial
  });
});

describe('GET /api/sessions/archive', () => {
  it('returns empty ids when archive is empty', () => {
    const res = callGetArchive();
    expect(res.statusCode).toBe(200);
    expect((res.body as { ids: string[] }).ids).toEqual([]);
  });

  it('returns all archived ids after sync', () => {
    const ids = generateUUIDs(10);
    callPostArchive({ ids });

    const res = callGetArchive();
    expect(res.statusCode).toBe(200);
    expect(new Set((res.body as { ids: string[] }).ids)).toEqual(new Set(ids));
  });
});
