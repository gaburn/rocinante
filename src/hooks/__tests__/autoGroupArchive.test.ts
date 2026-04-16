import { describe, it, expect } from 'vitest'
import type { SessionSummary, SessionStatus } from '../../types/index.js'

/**
 * Tests for auto-group by repository + archive interaction.
 *
 * The bug scenario: user archives sessions, then clicks Auto-group.
 * Auto-group should only operate on visible (non-archived) sessions.
 *
 * We extract the core logic from useWorkstreams.ts and useSessions.ts
 * into pure functions and test them directly — matching the existing
 * test pattern used in useSessions.test.ts.
 */

// ---------------------------------------------------------------------------
// Extracted logic: repoDisplayName (from useWorkstreams.ts line 34-39)
// ---------------------------------------------------------------------------

function repoDisplayName(repo: string): string {
  const trimmed = repo.trim().replace(/\/+$/, '')
  if (!trimmed) return repo
  const segments = trimmed.split('/')
  return segments[segments.length - 1] || repo
}

// ---------------------------------------------------------------------------
// Extracted logic: autoGroupByRepository (from useWorkstreams.ts line 219-239)
// ---------------------------------------------------------------------------

function autoGroupByRepository(
  sessions: SessionSummary[],
  currentMap: Record<string, string>,
): Record<string, string> {
  const next = { ...currentMap }
  let changed = false

  for (const session of sessions) {
    if (next[session.id]) continue

    const source = session.repository?.trim() || session.cwd?.trim()
    if (!source) continue

    const name = repoDisplayName(source)
    next[session.id] = name
    changed = true
  }

  return changed ? next : currentMap
}

// ---------------------------------------------------------------------------
// Extracted logic: archive filtering (from useSessions.ts line 288-294)
// ---------------------------------------------------------------------------

function filterOutArchived(
  sessions: SessionSummary[],
  isArchived: (id: string) => boolean,
  showArchived: boolean,
): SessionSummary[] {
  if (showArchived) return sessions
  return sessions.filter((s) => !isArchived(s.id))
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createSession(
  id: string,
  overrides: Partial<SessionSummary> = {},
): SessionSummary {
  return {
    id,
    name: overrides.name ?? `Session ${id}`,
    intent: overrides.intent ?? 'Do something',
    status: overrides.status ?? ('active' as SessionStatus),
    startedAt: overrides.startedAt ?? new Date().toISOString(),
    lastActivityAt: overrides.lastActivityAt ?? new Date().toISOString(),
    agentCount: overrides.agentCount ?? 1,
    turnCount: overrides.turnCount ?? 5,
    repository: overrides.repository,
    cwd: overrides.cwd,
    source: overrides.source,
  }
}

// ---------------------------------------------------------------------------
// 1. repoDisplayName
// ---------------------------------------------------------------------------

describe('repoDisplayName', () => {
  it('extracts last path segment from a full path', () => {
    expect(repoDisplayName('/home/user/projects/my-app')).toBe('my-app')
  })

  it('extracts last segment from a GitHub-style repo path', () => {
    expect(repoDisplayName('github/copilot-cli')).toBe('copilot-cli')
  })

  it('handles trailing slashes', () => {
    expect(repoDisplayName('/home/user/my-app/')).toBe('my-app')
  })

  it('handles multiple trailing slashes', () => {
    expect(repoDisplayName('/home/user/my-app///')).toBe('my-app')
  })

  it('returns the string itself when no separators', () => {
    expect(repoDisplayName('standalone-repo')).toBe('standalone-repo')
  })

  it('returns original for whitespace-only input', () => {
    expect(repoDisplayName('   ')).toBe('   ')
  })

  it('trims whitespace before extracting', () => {
    expect(repoDisplayName('  /home/user/my-app  ')).toBe('my-app')
  })
})

// ---------------------------------------------------------------------------
// 2. autoGroupByRepository — core logic
// ---------------------------------------------------------------------------

describe('autoGroupByRepository', () => {
  it('groups sessions by repository field', () => {
    const sessions = [
      createSession('s1', { repository: 'org/repo-alpha' }),
      createSession('s2', { repository: 'org/repo-beta' }),
      createSession('s3', { repository: 'org/repo-alpha' }),
    ]

    const result = autoGroupByRepository(sessions, {})

    expect(result['s1']).toBe('repo-alpha')
    expect(result['s2']).toBe('repo-beta')
    expect(result['s3']).toBe('repo-alpha')
  })

  it('falls back to cwd when repository is absent', () => {
    const sessions = [
      createSession('s1', { cwd: '/home/user/projects/fallback-app' }),
    ]

    const result = autoGroupByRepository(sessions, {})

    expect(result['s1']).toBe('fallback-app')
  })

  it('prefers repository over cwd when both are present', () => {
    const sessions = [
      createSession('s1', {
        repository: 'org/preferred-repo',
        cwd: '/home/user/projects/cwd-app',
      }),
    ]

    const result = autoGroupByRepository(sessions, {})

    expect(result['s1']).toBe('preferred-repo')
  })

  it('skips sessions already assigned to a workstream', () => {
    const sessions = [
      createSession('s1', { repository: 'org/repo-alpha' }),
      createSession('s2', { repository: 'org/repo-beta' }),
    ]
    const existing = { s1: 'My Custom Workstream' }

    const result = autoGroupByRepository(sessions, existing)

    expect(result['s1']).toBe('My Custom Workstream')
    expect(result['s2']).toBe('repo-beta')
  })

  it('skips sessions with no repository and no cwd', () => {
    const sessions = [
      createSession('s1', { repository: undefined, cwd: undefined }),
      createSession('s2', { repository: 'org/has-repo' }),
    ]

    const result = autoGroupByRepository(sessions, {})

    expect(result['s1']).toBeUndefined()
    expect(result['s2']).toBe('has-repo')
  })

  it('skips sessions with null repository and null cwd', () => {
    const sessions = [
      createSession('s1', { repository: null, cwd: null }),
    ]

    const result = autoGroupByRepository(sessions, {})

    expect(result['s1']).toBeUndefined()
  })

  it('skips sessions with empty-string repository and cwd', () => {
    const sessions = [
      createSession('s1', { repository: '', cwd: '' }),
    ]

    const result = autoGroupByRepository(sessions, {})

    expect(result['s1']).toBeUndefined()
  })

  it('skips sessions with whitespace-only repository and cwd', () => {
    const sessions = [
      createSession('s1', { repository: '   ', cwd: '   ' }),
    ]

    const result = autoGroupByRepository(sessions, {})

    expect(result['s1']).toBeUndefined()
  })

  it('returns the same reference when no changes are made', () => {
    const sessions = [
      createSession('s1', { repository: undefined, cwd: undefined }),
    ]
    const existing = { s2: 'some-ws' }

    const result = autoGroupByRepository(sessions, existing)

    // Same reference — React state optimization
    expect(result).toBe(existing)
  })

  it('returns the same reference when all sessions are already assigned', () => {
    const sessions = [
      createSession('s1', { repository: 'org/repo' }),
    ]
    const existing = { s1: 'existing-ws' }

    const result = autoGroupByRepository(sessions, existing)

    expect(result).toBe(existing)
  })

  it('handles empty sessions array', () => {
    const existing = { s1: 'ws1' }
    const result = autoGroupByRepository([], existing)

    expect(result).toBe(existing)
  })

  it('only groups the sessions it receives — does not invent new ones', () => {
    const sessions = [
      createSession('s1', { repository: 'org/repo' }),
    ]

    const result = autoGroupByRepository(sessions, {})

    expect(Object.keys(result)).toEqual(['s1'])
  })
})

// ---------------------------------------------------------------------------
// 3. Archive filtering
// ---------------------------------------------------------------------------

describe('filterOutArchived', () => {
  const archivedSet = new Set(['s2', 's4'])
  const isArchived = (id: string) => archivedSet.has(id)

  const sessions = [
    createSession('s1', { repository: 'org/repo-a' }),
    createSession('s2', { repository: 'org/repo-a' }),
    createSession('s3', { repository: 'org/repo-b' }),
    createSession('s4', { repository: 'org/repo-b' }),
  ]

  it('excludes archived sessions when showArchived is false', () => {
    const result = filterOutArchived(sessions, isArchived, false)

    expect(result.map((s) => s.id)).toEqual(['s1', 's3'])
  })

  it('includes all sessions when showArchived is true', () => {
    const result = filterOutArchived(sessions, isArchived, true)

    expect(result.map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4'])
  })

  it('returns all sessions when none are archived', () => {
    const noneArchived = () => false
    const result = filterOutArchived(sessions, noneArchived, false)

    expect(result).toHaveLength(4)
  })
})

// ---------------------------------------------------------------------------
// 4. Auto-group + archive interaction — THE CORE BUG SCENARIO
// ---------------------------------------------------------------------------

describe('auto-group + archive interaction', () => {
  const allSessions = [
    createSession('s1', { repository: 'org/repo-alpha', status: 'active' }),
    createSession('s2', { repository: 'org/repo-alpha', status: 'completed' }),
    createSession('s3', { repository: 'org/repo-beta', status: 'active' }),
    createSession('s4', { repository: 'org/repo-beta', status: 'completed' }),
    createSession('s5', { repository: 'org/repo-gamma', status: 'active' }),
  ]

  it('archived sessions should NOT be auto-grouped when showArchived=false', () => {
    // User archived s2 and s4
    const archivedSet = new Set(['s2', 's4'])
    const isArchived = (id: string) => archivedSet.has(id)

    // Pipeline: filter then auto-group (matching useSessions.ts flow)
    const visibleSessions = filterOutArchived(allSessions, isArchived, false)
    const result = autoGroupByRepository(visibleSessions, {})

    // s2 and s4 should NOT appear in the workstream map
    expect(result['s1']).toBe('repo-alpha')
    expect(result['s2']).toBeUndefined()
    expect(result['s3']).toBe('repo-beta')
    expect(result['s4']).toBeUndefined()
    expect(result['s5']).toBe('repo-gamma')
  })

  it('archived sessions SHOULD be auto-grouped when showArchived=true', () => {
    const archivedSet = new Set(['s2', 's4'])
    const isArchived = (id: string) => archivedSet.has(id)

    const visibleSessions = filterOutArchived(allSessions, isArchived, true)
    const result = autoGroupByRepository(visibleSessions, {})

    // All sessions should be grouped
    expect(result['s1']).toBe('repo-alpha')
    expect(result['s2']).toBe('repo-alpha')
    expect(result['s3']).toBe('repo-beta')
    expect(result['s4']).toBe('repo-beta')
    expect(result['s5']).toBe('repo-gamma')
  })

  it('previously archived sessions should not reappear in workstreams', () => {
    // Step 1: Auto-group all sessions first
    const initialMap = autoGroupByRepository(allSessions, {})
    expect(initialMap['s2']).toBe('repo-alpha')

    // Step 2: User archives s2
    const archivedSet = new Set(['s2'])
    const isArchived = (id: string) => archivedSet.has(id)

    // Step 3: User clicks Auto-group again with showArchived=false
    const visibleSessions = filterOutArchived(allSessions, isArchived, false)
    const result = autoGroupByRepository(visibleSessions, initialMap)

    // s2 still has its old assignment in the map (it was assigned before archiving)
    // BUT it should not appear in visible groupedSessions because it's filtered out
    // The workstream map retains the entry, but the UI display filters it.
    // This matches the groupedSessions logic in useSessions.ts line 399-423.
    expect(result['s2']).toBe('repo-alpha') // map retains it
    // The important part: the groupedSessions computation uses `sessions` (filtered)
    // so s2 won't show up in any visible group
    const visibleGrouped = visibleSessions.filter(
      (s) => result[s.id] !== undefined,
    )
    expect(visibleGrouped.find((s) => s.id === 's2')).toBeUndefined()
  })

  it('auto-group after archiving does not add NEW entries for archived sessions', () => {
    const archivedSet = new Set(['s2', 's4'])
    const isArchived = (id: string) => archivedSet.has(id)

    // No prior workstream assignments
    const visibleSessions = filterOutArchived(allSessions, isArchived, false)
    const result = autoGroupByRepository(visibleSessions, {})

    // Only non-archived sessions should get new assignments
    const assignedIds = Object.keys(result)
    expect(assignedIds).not.toContain('s2')
    expect(assignedIds).not.toContain('s4')
    expect(assignedIds).toContain('s1')
    expect(assignedIds).toContain('s3')
    expect(assignedIds).toContain('s5')
  })

  it('source-filtered sessions should not get auto-grouped', () => {
    const sessions = [
      createSession('c1', { repository: 'org/repo-alpha', source: 'copilot' }),
      createSession('c2', { repository: 'org/repo-alpha', source: 'claude' }),
      createSession('c3', { repository: 'org/repo-beta', source: 'copilot' }),
    ]

    // Simulate sourceFilter='copilot' — only copilot sessions visible
    const filtered = sessions.filter((s) => (s.source ?? 'copilot') === 'copilot')
    const result = autoGroupByRepository(filtered, {})

    expect(result['c1']).toBe('repo-alpha')
    expect(result['c2']).toBeUndefined() // Claude session not passed in
    expect(result['c3']).toBe('repo-beta')
  })

  it('status-filtered sessions should not get auto-grouped', () => {
    // Simulate statusFilter='active'
    const filtered = allSessions.filter((s) => s.status === 'active')
    const result = autoGroupByRepository(filtered, {})

    expect(result['s1']).toBe('repo-alpha')
    expect(result['s2']).toBeUndefined() // completed, not visible
    expect(result['s3']).toBe('repo-beta')
    expect(result['s4']).toBeUndefined() // completed, not visible
    expect(result['s5']).toBe('repo-gamma')
  })
})

// ---------------------------------------------------------------------------
// 5. handleAutoGroupByRepository — verifies it uses `sessions` not `allSessions`
// ---------------------------------------------------------------------------

describe('handleAutoGroupByRepository uses filtered sessions', () => {
  it('passes only visible sessions, not all sessions', () => {
    // This mirrors useSessions.ts line 496-498:
    //   const handleAutoGroupByRepository = useCallback(() => {
    //     autoGroupByRepository(sessions)    ← `sessions` is the filtered list
    //   }, [autoGroupByRepository, sessions])

    const allSessions = [
      createSession('s1', { repository: 'org/repo-a' }),
      createSession('s2', { repository: 'org/repo-a' }),
      createSession('s3', { repository: 'org/repo-b' }),
    ]
    const archivedSet = new Set(['s2'])
    const isArchived = (id: string) => archivedSet.has(id)

    // Simulate: `sessions` = filtered set (what handleAutoGroupByRepository uses)
    const sessions = filterOutArchived(allSessions, isArchived, false)

    // Simulate: `allSessions` = full set (what it should NOT use)
    // If the bug existed and it used allSessions instead:
    const buggyResult = autoGroupByRepository(allSessions, {})
    expect(buggyResult['s2']).toBe('repo-a') // Would wrongly group archived

    // Correct behavior: uses `sessions` (filtered)
    const correctResult = autoGroupByRepository(sessions, {})
    expect(correctResult['s2']).toBeUndefined() // Archived not grouped
    expect(correctResult['s1']).toBe('repo-a')
    expect(correctResult['s3']).toBe('repo-b')
  })
})

// ---------------------------------------------------------------------------
// 6. Archive sync + auto-group sequencing
// ---------------------------------------------------------------------------

describe('archive sync + auto-group sequencing', () => {
  it('auto-group respects client-side archive state even before server sync', () => {
    // Client has archived s2 locally but server hasn't confirmed yet
    const archivedSet = new Set(['s2'])
    const isArchived = (id: string) => archivedSet.has(id)

    const allSessions = [
      createSession('s1', { repository: 'org/repo-a' }),
      createSession('s2', { repository: 'org/repo-a' }),
    ]

    // Even before syncComplete=true, the filter uses client-side isArchived
    const visible = filterOutArchived(allSessions, isArchived, false)
    const result = autoGroupByRepository(visible, {})

    expect(result['s1']).toBe('repo-a')
    expect(result['s2']).toBeUndefined()
  })

  it('auto-group after sync completion still respects archive state', () => {
    // After sync, server confirmed the archive set
    const archivedSet = new Set(['s2', 's3'])
    const isArchived = (id: string) => archivedSet.has(id)

    const allSessions = [
      createSession('s1', { repository: 'org/repo-a' }),
      createSession('s2', { repository: 'org/repo-a' }),
      createSession('s3', { repository: 'org/repo-b' }),
      createSession('s4', { repository: 'org/repo-b' }),
    ]

    const visible = filterOutArchived(allSessions, isArchived, false)
    const result = autoGroupByRepository(visible, {})

    expect(result['s1']).toBe('repo-a')
    expect(result['s2']).toBeUndefined()
    expect(result['s3']).toBeUndefined()
    expect(result['s4']).toBe('repo-b')
  })

  it('pruneStaleIds removes workstream entries for sessions no longer active', () => {
    // Extracted from useWorkstreams.ts line 197-217
    function pruneStaleIds(
      currentMap: Record<string, string>,
      activeIds: string[],
    ): Record<string, string> {
      if (Object.keys(currentMap).length === 0) return currentMap

      const activeSet = new Set(activeIds)
      const next: Record<string, string> = {}
      let changed = false

      for (const [sessionId, value] of Object.entries(currentMap)) {
        if (activeSet.has(sessionId)) {
          next[sessionId] = value
        } else {
          changed = true
        }
      }

      return changed ? next : currentMap
    }

    const wsMap = {
      s1: 'repo-a',
      s2: 'repo-a',
      s3: 'repo-b',
    }

    // Only s1 and s3 are still in the active session list
    const result = pruneStaleIds(wsMap, ['s1', 's3'])

    expect(result['s1']).toBe('repo-a')
    expect(result['s2']).toBeUndefined()
    expect(result['s3']).toBe('repo-b')
  })
})

// ---------------------------------------------------------------------------
// 7. groupedSessions — verifies archive filtering in the display layer
// ---------------------------------------------------------------------------

describe('groupedSessions respects archive filtering', () => {
  // Extracted from useSessions.ts line 399-423
  function computeGroupedSessions(
    sessions: SessionSummary[],
    getWorkstream: (id: string) => string | null,
  ): { groups: { name: string; sessions: SessionSummary[] }[]; ungrouped: SessionSummary[] } {
    const groups = new Map<string, SessionSummary[]>()
    const ungrouped: SessionSummary[] = []

    for (const session of sessions) {
      const ws = getWorkstream(session.id)
      if (ws) {
        const list = groups.get(ws) || []
        list.push(session)
        groups.set(ws, list)
      } else {
        ungrouped.push(session)
      }
    }

    const sortedGroups = Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, groupSessions]) => ({ name, sessions: groupSessions }))

    return { groups: sortedGroups, ungrouped }
  }

  it('archived sessions with workstream assignments do not appear in visible groups', () => {
    const allSessions = [
      createSession('s1', { repository: 'org/repo-a' }),
      createSession('s2', { repository: 'org/repo-a' }),
      createSession('s3', { repository: 'org/repo-b' }),
    ]

    // All sessions assigned to workstreams
    const wsMap: Record<string, string> = {
      s1: 'repo-a',
      s2: 'repo-a',
      s3: 'repo-b',
    }
    const getWorkstream = (id: string) => wsMap[id] ?? null

    // Archive s2
    const archivedSet = new Set(['s2'])
    const isArchived = (id: string) => archivedSet.has(id)
    const visible = filterOutArchived(allSessions, isArchived, false)

    // Compute grouped sessions from visible only
    const { groups } = computeGroupedSessions(visible, getWorkstream)

    const repoAGroup = groups.find((g) => g.name === 'repo-a')
    expect(repoAGroup).toBeDefined()
    expect(repoAGroup!.sessions.map((s) => s.id)).toEqual(['s1'])
    expect(repoAGroup!.sessions.find((s) => s.id === 's2')).toBeUndefined()
  })

  it('all sessions appear in groups when showArchived=true', () => {
    const allSessions = [
      createSession('s1', { repository: 'org/repo-a' }),
      createSession('s2', { repository: 'org/repo-a' }),
    ]

    const wsMap: Record<string, string> = { s1: 'repo-a', s2: 'repo-a' }
    const getWorkstream = (id: string) => wsMap[id] ?? null

    const archivedSet = new Set(['s2'])
    const isArchived = (id: string) => archivedSet.has(id)
    const visible = filterOutArchived(allSessions, isArchived, true)

    const { groups } = computeGroupedSessions(visible, getWorkstream)

    const repoAGroup = groups.find((g) => g.name === 'repo-a')
    expect(repoAGroup!.sessions).toHaveLength(2)
  })

  it('sessions with no workstream go to ungrouped, regardless of archive state', () => {
    const allSessions = [
      createSession('s1', { repository: 'org/repo-a' }),
      createSession('s2'), // no repo, no workstream
    ]

    const wsMap: Record<string, string> = { s1: 'repo-a' }
    const getWorkstream = (id: string) => wsMap[id] ?? null

    const visible = filterOutArchived(allSessions, () => false, false)
    const { ungrouped } = computeGroupedSessions(visible, getWorkstream)

    expect(ungrouped.map((s) => s.id)).toEqual(['s2'])
  })
})
