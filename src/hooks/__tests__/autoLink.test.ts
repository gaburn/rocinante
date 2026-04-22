import { describe, it, expect } from 'vitest'
import { normalizePath } from '../../utils/normalizePath'

/**
 * The auto-link logic from useSessions.ts (useEffect around line 218).
 *
 * When a workstream has a pendingLaunchId, the polling cycle matches
 * ALL sessions (not just newly-discovered ones) by:
 *   1. session is not already assigned to a workstream
 *   2. normalizePath(session.cwd) === normalizePath(entry.repoPath)
 *   3. |session.startedAt - launchTime| <= 5 minutes
 * On first match, the pending flag is consumed (pendingLaunchId cleared)
 * and the session is assigned to the workstream.
 *
 * Checking all sessions (rather than only "new" ones) is critical because
 * a session may first appear without cwd (workspace.yaml not yet written)
 * and only gain it on a later poll cycle.
 *
 * We extract this logic into a pure function and test it directly.
 */

interface WorkstreamRegistryEntry {
  createdAt: string
  repoPath?: string
  pendingLaunchId?: string
  pendingLaunchAt?: string
}

interface MinimalSession {
  id: string
  cwd?: string | null
  startedAt: string
  source?: 'copilot' | 'claude'
}

interface AutoLinkResult {
  sessionId: string
  workstreamName: string
}

const FIVE_MINUTES_MS = 5 * 60 * 1000
const FRESH_LAUNCH_MS = 60 * 1000

/**
 * Pure extraction of the auto-link matching logic from useSessions.ts.
 * Returns the list of (sessionId, workstreamName) pairs that would be linked,
 * and mutates the registry entries by clearing pendingLaunchId on consumed matches.
 *
 * Also returns `autoSelectSessionId` — the session that should be auto-selected
 * in the detail panel.  Only set for fresh launches (pendingLaunchAt within 60s
 * of `now`); stale pending entries are linked but NOT auto-selected.
 *
 * @param assignedSessions - Set of session IDs already assigned to a workstream
 * @param now - Current timestamp in ms (defaults to Date.now())
 */
function computeAutoLinks(
  registry: Record<string, WorkstreamRegistryEntry>,
  sessions: MinimalSession[],
  assignedSessions: Set<string> = new Set(),
  now: number = Date.now(),
): { links: AutoLinkResult[]; autoSelectSessionId: string | null } {
  const links: AutoLinkResult[] = []
  let autoSelectSessionId: string | null = null

  const pendingEntries = Object.entries(registry).filter(
    ([, entry]) => entry.pendingLaunchId != null,
  )

  if (pendingEntries.length === 0 || sessions.length === 0) return { links, autoSelectSessionId }

  for (const [wsName, entry] of pendingEntries) {
    if (!entry.repoPath) continue
    const normalizedRepoPath = normalizePath(entry.repoPath)
    const launchTime = new Date(entry.pendingLaunchAt ?? entry.createdAt).getTime()

    for (const session of sessions) {
      if (!session.cwd) continue
      // Skip sessions already assigned to a workstream
      if (assignedSessions.has(session.id)) continue
      if (normalizePath(session.cwd) !== normalizedRepoPath) continue

      const sessionStartedAt = new Date(session.startedAt).getTime()
      if (Math.abs(sessionStartedAt - launchTime) > FIVE_MINUTES_MS) continue

      // Match found — record and consume
      links.push({ sessionId: session.id, workstreamName: wsName })

      // Auto-select only for fresh launches (within 60s of now)
      if (entry.pendingLaunchAt && (now - launchTime) < FRESH_LAUNCH_MS) {
        autoSelectSessionId = session.id
      }

      entry.pendingLaunchId = undefined
      entry.pendingLaunchAt = undefined
      break // consume-once
    }
  }

  return { links, autoSelectSessionId }
}

// ── Helpers ──────────────────────────────────────────────────────────

function makeSession(
  id: string,
  cwd: string | null,
  startedAt: string,
  source?: 'copilot' | 'claude',
): MinimalSession {
  return { id, cwd, startedAt, ...(source ? { source } : {}) }
}

function makeRegistry(
  entries: Record<string, { repoPath?: string; pendingLaunchId?: string; pendingLaunchAt?: string; createdAt: string }>,
): Record<string, WorkstreamRegistryEntry> {
  return { ...entries }
}

const NOW = '2026-07-18T12:00:00Z'
const ONE_MINUTE_LATER = '2026-07-18T12:01:00Z'
const TEN_MINUTES_LATER = '2026-07-18T12:10:00Z'
const TWO_DAYS_AGO = '2026-07-16T12:00:00Z'

// ── Tests ────────────────────────────────────────────────────────────

describe('Auto-link pending launches to sessions (useSessions logic)', () => {
  it('happy path: new session with matching cwd gets linked', () => {
    const registry = makeRegistry({
      'my-workstream': {
        repoPath: '/home/user/project',
        pendingLaunchId: 'launch-1',
        createdAt: NOW,
      },
    })
    const sessions = [
      makeSession('sess-1', '/home/user/project', ONE_MINUTE_LATER),
    ]

    const { links } = computeAutoLinks(registry, sessions)

    expect(links).toEqual([
      { sessionId: 'sess-1', workstreamName: 'my-workstream' },
    ])
    // pendingLaunchId should be consumed
    expect(registry['my-workstream'].pendingLaunchId).toBeUndefined()
  })

  it('no match — different path: session with different cwd is NOT linked', () => {
    const registry = makeRegistry({
      ws: {
        repoPath: '/home/user/projectA',
        pendingLaunchId: 'launch-1',
        createdAt: NOW,
      },
    })
    const sessions = [
      makeSession('sess-1', '/home/user/projectB', ONE_MINUTE_LATER),
    ]

    const { links } = computeAutoLinks(registry, sessions)

    expect(links).toHaveLength(0)
    // pendingLaunchId should NOT be consumed
    expect(registry['ws'].pendingLaunchId).toBe('launch-1')
  })

  it('no match — too old: session created outside 5-min window is NOT linked', () => {
    const registry = makeRegistry({
      ws: {
        repoPath: '/home/user/project',
        pendingLaunchId: 'launch-1',
        createdAt: NOW,
      },
    })
    const sessions = [
      makeSession('sess-1', '/home/user/project', TEN_MINUTES_LATER),
    ]

    const { links } = computeAutoLinks(registry, sessions)

    expect(links).toHaveLength(0)
    expect(registry['ws'].pendingLaunchId).toBe('launch-1')
  })

  it('consume-once: second session with same cwd does NOT get linked after first consumes', () => {
    const registry = makeRegistry({
      ws: {
        repoPath: '/home/user/project',
        pendingLaunchId: 'launch-1',
        createdAt: NOW,
      },
    })
    const sessions = [
      makeSession('sess-1', '/home/user/project', ONE_MINUTE_LATER),
      makeSession('sess-2', '/home/user/project', ONE_MINUTE_LATER),
    ]

    const { links } = computeAutoLinks(registry, sessions)

    expect(links).toHaveLength(1)
    expect(links[0].sessionId).toBe('sess-1')
    // Only the first session wins
    expect(registry['ws'].pendingLaunchId).toBeUndefined()
  })

  it('multiple pending launches for different workstreams link independently', () => {
    const registry = makeRegistry({
      'ws-alpha': {
        repoPath: '/repos/alpha',
        pendingLaunchId: 'launch-a',
        createdAt: NOW,
      },
      'ws-beta': {
        repoPath: '/repos/beta',
        pendingLaunchId: 'launch-b',
        createdAt: NOW,
      },
    })
    const sessions = [
      makeSession('sess-a', '/repos/alpha', ONE_MINUTE_LATER),
      makeSession('sess-b', '/repos/beta', ONE_MINUTE_LATER),
    ]

    const { links } = computeAutoLinks(registry, sessions)

    expect(links).toHaveLength(2)
    expect(links).toContainEqual({ sessionId: 'sess-a', workstreamName: 'ws-alpha' })
    expect(links).toContainEqual({ sessionId: 'sess-b', workstreamName: 'ws-beta' })
    expect(registry['ws-alpha'].pendingLaunchId).toBeUndefined()
    expect(registry['ws-beta'].pendingLaunchId).toBeUndefined()
  })

  it('path normalization: Windows-style registry path matches Unix-style session cwd', () => {
    const registry = makeRegistry({
      ws: {
        repoPath: 'C:\\Users\\dev\\project',
        pendingLaunchId: 'launch-1',
        createdAt: NOW,
      },
    })
    const sessions = [
      makeSession('sess-1', 'c:/users/dev/project', ONE_MINUTE_LATER),
    ]

    const { links } = computeAutoLinks(registry, sessions)

    expect(links).toHaveLength(1)
    expect(links[0].sessionId).toBe('sess-1')
  })

  it('path normalization: Unix-style registry path matches Windows-style session cwd', () => {
    const registry = makeRegistry({
      ws: {
        repoPath: 'C:/Users/Dev/Project',
        pendingLaunchId: 'launch-1',
        createdAt: NOW,
      },
    })
    const sessions = [
      makeSession('sess-1', 'C:\\Users\\Dev\\Project', ONE_MINUTE_LATER),
    ]

    const { links } = computeAutoLinks(registry, sessions)

    expect(links).toHaveLength(1)
  })

  it('no pending launches: returns empty array (no-op)', () => {
    const registry = makeRegistry({
      ws: {
        repoPath: '/repos/thing',
        createdAt: NOW,
        // no pendingLaunchId
      },
    })
    const sessions = [
      makeSession('sess-1', '/repos/thing', ONE_MINUTE_LATER),
    ]

    const { links } = computeAutoLinks(registry, sessions)

    expect(links).toHaveLength(0)
  })

  it('no new sessions: returns empty array (no-op)', () => {
    const registry = makeRegistry({
      ws: {
        repoPath: '/repos/thing',
        pendingLaunchId: 'launch-1',
        createdAt: NOW,
      },
    })

    const { links } = computeAutoLinks(registry, [])

    expect(links).toHaveLength(0)
    // pendingLaunchId should still be intact
    expect(registry['ws'].pendingLaunchId).toBe('launch-1')
  })

  it('skips sessions with null cwd', () => {
    const registry = makeRegistry({
      ws: {
        repoPath: '/repos/thing',
        pendingLaunchId: 'launch-1',
        createdAt: NOW,
      },
    })
    const sessions = [
      makeSession('sess-1', null, ONE_MINUTE_LATER),
    ]

    const { links } = computeAutoLinks(registry, sessions)

    expect(links).toHaveLength(0)
  })

  it('skips registry entries with no repoPath', () => {
    const registry = makeRegistry({
      ws: {
        pendingLaunchId: 'launch-1',
        createdAt: NOW,
        // no repoPath
      },
    })
    const sessions = [
      makeSession('sess-1', '/some/path', ONE_MINUTE_LATER),
    ]

    const { links } = computeAutoLinks(registry, sessions)

    expect(links).toHaveLength(0)
  })

  it('session exactly at the 5-minute boundary is still linked', () => {
    const exactly5MinLater = new Date(
      new Date(NOW).getTime() + FIVE_MINUTES_MS,
    ).toISOString()
    const registry = makeRegistry({
      ws: {
        repoPath: '/repos/edge',
        pendingLaunchId: 'launch-1',
        createdAt: NOW,
      },
    })
    const sessions = [
      makeSession('sess-1', '/repos/edge', exactly5MinLater),
    ]

    const { links } = computeAutoLinks(registry, sessions)

    expect(links).toHaveLength(1)
  })

  it('session 1ms past the 5-minute boundary is NOT linked', () => {
    const justPast5Min = new Date(
      new Date(NOW).getTime() + FIVE_MINUTES_MS + 1,
    ).toISOString()
    const registry = makeRegistry({
      ws: {
        repoPath: '/repos/edge',
        pendingLaunchId: 'launch-1',
        createdAt: NOW,
      },
    })
    const sessions = [
      makeSession('sess-1', '/repos/edge', justPast5Min),
    ]

    const { links } = computeAutoLinks(registry, sessions)

    expect(links).toHaveLength(0)
  })

  it('trailing slashes are normalized: paths still match', () => {
    const registry = makeRegistry({
      ws: {
        repoPath: '/repos/project/',
        pendingLaunchId: 'launch-1',
        createdAt: NOW,
      },
    })
    const sessions = [
      makeSession('sess-1', '/repos/project', ONE_MINUTE_LATER),
    ]

    const { links } = computeAutoLinks(registry, sessions)

    expect(links).toHaveLength(1)
  })

  it('pendingLaunchAt overrides createdAt for time window: old workstream still links', () => {
    const registry = makeRegistry({
      ws: {
        repoPath: '/repos/project',
        pendingLaunchId: 'launch-1',
        createdAt: TWO_DAYS_AGO,
        pendingLaunchAt: NOW,
      },
    })
    const sessions = [
      makeSession('sess-1', '/repos/project', ONE_MINUTE_LATER),
    ]

    const { links } = computeAutoLinks(registry, sessions)

    expect(links).toHaveLength(1)
    expect(links[0].sessionId).toBe('sess-1')
    expect(registry['ws'].pendingLaunchId).toBeUndefined()
    expect(registry['ws'].pendingLaunchAt).toBeUndefined()
  })

  it('old workstream without pendingLaunchAt fails time window (createdAt fallback)', () => {
    const registry = makeRegistry({
      ws: {
        repoPath: '/repos/project',
        pendingLaunchId: 'launch-1',
        createdAt: TWO_DAYS_AGO,
        // no pendingLaunchAt — falls back to createdAt
      },
    })
    const sessions = [
      makeSession('sess-1', '/repos/project', ONE_MINUTE_LATER),
    ]

    const { links } = computeAutoLinks(registry, sessions)

    expect(links).toHaveLength(0)
  })

  it('skips sessions already assigned to a workstream', () => {
    const registry = makeRegistry({
      ws: {
        repoPath: '/repos/project',
        pendingLaunchId: 'launch-1',
        createdAt: NOW,
      },
    })
    const sessions = [
      makeSession('sess-1', '/repos/project', ONE_MINUTE_LATER),
    ]
    // sess-1 is already assigned to another workstream
    const assigned = new Set(['sess-1'])

    const { links } = computeAutoLinks(registry, sessions, assigned)

    expect(links).toHaveLength(0)
    // pendingLaunchId should NOT be consumed
    expect(registry['ws'].pendingLaunchId).toBe('launch-1')
  })

  it('matches unassigned session even when other sessions in list are assigned', () => {
    const registry = makeRegistry({
      ws: {
        repoPath: '/repos/project',
        pendingLaunchId: 'launch-1',
        createdAt: NOW,
      },
    })
    const sessions = [
      makeSession('sess-old', '/repos/project', ONE_MINUTE_LATER),
      makeSession('sess-new', '/repos/project', ONE_MINUTE_LATER),
    ]
    // sess-old is already in another workstream; sess-new is unassigned
    const assigned = new Set(['sess-old'])

    const { links } = computeAutoLinks(registry, sessions, assigned)

    expect(links).toHaveLength(1)
    expect(links[0].sessionId).toBe('sess-new')
    expect(registry['ws'].pendingLaunchId).toBeUndefined()
  })

  it('session without cwd on first poll matches after cwd appears (simulated re-check)', () => {
    // Simulates: session first appears without cwd, then gains it on a later poll.
    // Old code would miss this because the session was already "seen".
    // New code checks ALL sessions each time, so it matches on the retry.
    const registry = makeRegistry({
      ws: {
        repoPath: '/repos/project',
        pendingLaunchId: 'launch-1',
        pendingLaunchAt: NOW,
        createdAt: TWO_DAYS_AGO,
      },
    })

    // Poll 1: session exists but has no cwd yet
    const sessionsNoCwd = [
      makeSession('sess-1', null, ONE_MINUTE_LATER),
    ]
    const { links: links1 } = computeAutoLinks(registry, sessionsNoCwd)
    expect(links1).toHaveLength(0)
    // pendingLaunchId still intact — not consumed
    expect(registry['ws'].pendingLaunchId).toBe('launch-1')

    // Poll 2: same session now has cwd populated
    const sessionsWithCwd = [
      makeSession('sess-1', '/repos/project', ONE_MINUTE_LATER),
    ]
    const { links: links2 } = computeAutoLinks(registry, sessionsWithCwd)
    expect(links2).toHaveLength(1)
    expect(links2[0].sessionId).toBe('sess-1')
    expect(registry['ws'].pendingLaunchId).toBeUndefined()
  })

  // ── Auto-select tests ──────────────────────────────────────────────

  it('auto-selects session when launch is fresh (within 60s of now)', () => {
    const nowMs = new Date(NOW).getTime()
    const registry = makeRegistry({
      ws: {
        repoPath: '/repos/project',
        pendingLaunchId: 'launch-1',
        pendingLaunchAt: NOW,
        createdAt: TWO_DAYS_AGO,
      },
    })
    const sessions = [
      makeSession('sess-1', '/repos/project', ONE_MINUTE_LATER),
    ]

    // "now" is 30s after launch — fresh
    const { links, autoSelectSessionId } = computeAutoLinks(registry, sessions, new Set(), nowMs + 30_000)

    expect(links).toHaveLength(1)
    expect(autoSelectSessionId).toBe('sess-1')
  })

  it('does NOT auto-select when launch is stale (>60s ago)', () => {
    const nowMs = new Date(NOW).getTime()
    const registry = makeRegistry({
      ws: {
        repoPath: '/repos/project',
        pendingLaunchId: 'launch-1',
        pendingLaunchAt: NOW,
        createdAt: TWO_DAYS_AGO,
      },
    })
    const sessions = [
      makeSession('sess-1', '/repos/project', ONE_MINUTE_LATER),
    ]

    // "now" is 90s after launch — stale
    const { links, autoSelectSessionId } = computeAutoLinks(registry, sessions, new Set(), nowMs + 90_000)

    expect(links).toHaveLength(1)
    expect(links[0].sessionId).toBe('sess-1')
    expect(autoSelectSessionId).toBeNull()
  })

  it('does NOT auto-select when pendingLaunchAt is missing (createdAt fallback)', () => {
    const nowMs = new Date(NOW).getTime()
    const registry = makeRegistry({
      ws: {
        repoPath: '/repos/project',
        pendingLaunchId: 'launch-1',
        createdAt: NOW,
        // no pendingLaunchAt
      },
    })
    const sessions = [
      makeSession('sess-1', '/repos/project', ONE_MINUTE_LATER),
    ]

    // Even though createdAt was recent, auto-select requires explicit pendingLaunchAt
    const { links, autoSelectSessionId } = computeAutoLinks(registry, sessions, new Set(), nowMs + 30_000)

    expect(links).toHaveLength(1)
    expect(autoSelectSessionId).toBeNull()
  })

  it('auto-select picks the last matched session when multiple workstreams link', () => {
    const nowMs = new Date(NOW).getTime()
    const registry = makeRegistry({
      'ws-alpha': {
        repoPath: '/repos/alpha',
        pendingLaunchId: 'launch-a',
        pendingLaunchAt: NOW,
        createdAt: TWO_DAYS_AGO,
      },
      'ws-beta': {
        repoPath: '/repos/beta',
        pendingLaunchId: 'launch-b',
        pendingLaunchAt: NOW,
        createdAt: TWO_DAYS_AGO,
      },
    })
    const sessions = [
      makeSession('sess-a', '/repos/alpha', ONE_MINUTE_LATER),
      makeSession('sess-b', '/repos/beta', ONE_MINUTE_LATER),
    ]

    const { links, autoSelectSessionId } = computeAutoLinks(registry, sessions, new Set(), nowMs + 10_000)

    expect(links).toHaveLength(2)
    // Last matched wins (sess-b overwrites sess-a)
    expect(autoSelectSessionId).toBe('sess-b')
  })
})
