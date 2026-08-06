import { describe, it, expect } from 'vitest'
import type { SessionStatus } from '../../types/index.js'

/**
 * Tests for useFocusMode hook logic (issue #24 — Daily Focus + Warning).
 *
 * Pattern: extract the pure derivation logic from useFocusMode.ts and test
 * directly — same approach as kanbanFavoriteSorting.test.ts and
 * autoGroupArchive.test.ts.
 */

// ---------------------------------------------------------------------------
// Types matching the hook's runtime shapes
// ---------------------------------------------------------------------------

interface SessionSummaryLike {
  id: string
  status: SessionStatus
}

interface SessionGroupLike {
  name: string
  sessions: SessionSummaryLike[]
}

interface GroupedSessionsLike {
  groups: SessionGroupLike[]
  ungrouped: SessionSummaryLike[]
}

interface WorkstreamRegistryEntry {
  createdAt: string
  focused?: boolean
  archived?: boolean
}

// ---------------------------------------------------------------------------
// Extracted logic mirrors useFocusMode.ts derivations
// ---------------------------------------------------------------------------

function computeActiveWorkstreamCount(grouped: GroupedSessionsLike): number {
  let count = 0
  for (const group of grouped.groups) {
    if (group.sessions.some((s) => s.status === 'active')) {
      count++
    }
  }
  if (grouped.ungrouped.some((s) => s.status === 'active')) {
    count++
  }
  return count
}

function computeFocusedWorkstreamNames(
  registry: Record<string, WorkstreamRegistryEntry>,
): string[] {
  return Object.entries(registry)
    .filter(([, entry]) => entry.focused)
    .map(([name]) => name)
    .sort((a, b) => a.localeCompare(b))
}

function computeIsFocusLimitReached(
  focusedNames: string[],
  threshold: number,
): boolean {
  return focusedNames.length >= threshold
}

function computeShouldShowWarning(
  activeCount: number,
  threshold: number,
): boolean {
  return activeCount > threshold
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mkSession = (
  id: string,
  status: SessionStatus = 'active',
): SessionSummaryLike => ({ id, status })

const mkGroup = (
  name: string,
  sessions: SessionSummaryLike[],
): SessionGroupLike => ({ name, sessions })

const mkRegistry = (
  entries: Record<string, { focused?: boolean; archived?: boolean }>,
): Record<string, WorkstreamRegistryEntry> => {
  const result: Record<string, WorkstreamRegistryEntry> = {}
  for (const [name, opts] of Object.entries(entries)) {
    result[name] = { createdAt: '2025-01-01T00:00:00Z', ...opts }
  }
  return result
}

// ---------------------------------------------------------------------------
// Tests: shouldShowWarning
// ---------------------------------------------------------------------------

describe('shouldShowWarning', () => {
  const threshold = 3

  it('is true when activeWorkstreamCount > threshold (4 active, threshold 3)', () => {
    expect(computeShouldShowWarning(4, threshold)).toBe(true)
  })

  it('is false when activeWorkstreamCount === threshold (3 active, threshold 3 — at-limit is safe)', () => {
    expect(computeShouldShowWarning(3, threshold)).toBe(false)
  })

  it('is false when activeWorkstreamCount < threshold (2 active, threshold 3)', () => {
    expect(computeShouldShowWarning(2, threshold)).toBe(false)
  })

  it('is false when no workstreams are active (0 active, threshold 3)', () => {
    expect(computeShouldShowWarning(0, threshold)).toBe(false)
  })

  it('respects custom thresholds (6 active, threshold 5)', () => {
    expect(computeShouldShowWarning(6, 5)).toBe(true)
    expect(computeShouldShowWarning(5, 5)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Tests: activeWorkstreamCount
// ---------------------------------------------------------------------------

describe('activeWorkstreamCount', () => {
  it('counts distinct workstreams with at least one active session', () => {
    const grouped: GroupedSessionsLike = {
      groups: [
        mkGroup('Auth', [mkSession('s1', 'active'), mkSession('s2', 'completed')]),
        mkGroup('API', [mkSession('s3', 'active')]),
        mkGroup('Docs', [mkSession('s4', 'completed'), mkSession('s5', 'blocked')]),
        mkGroup('Tests', [mkSession('s6', 'active')]),
      ],
      ungrouped: [],
    }
    // Auth, API, Tests are active — Docs is not
    expect(computeActiveWorkstreamCount(grouped)).toBe(3)
  })

  it('includes ungrouped sessions in the count', () => {
    const grouped: GroupedSessionsLike = {
      groups: [
        mkGroup('Auth', [mkSession('s1', 'active')]),
      ],
      ungrouped: [mkSession('s2', 'active')],
    }
    // Auth + ungrouped = 2
    expect(computeActiveWorkstreamCount(grouped)).toBe(2)
  })

  it('returns 0 when no sessions are active', () => {
    const grouped: GroupedSessionsLike = {
      groups: [
        mkGroup('Auth', [mkSession('s1', 'completed')]),
        mkGroup('API', [mkSession('s2', 'blocked')]),
      ],
      ungrouped: [mkSession('s3', 'waiting')],
    }
    expect(computeActiveWorkstreamCount(grouped)).toBe(0)
  })

  it('returns 0 when there are no workstreams or sessions', () => {
    const grouped: GroupedSessionsLike = { groups: [], ungrouped: [] }
    expect(computeActiveWorkstreamCount(grouped)).toBe(0)
  })

  it('counts a workstream only once even if it has multiple active sessions', () => {
    const grouped: GroupedSessionsLike = {
      groups: [
        mkGroup('Auth', [mkSession('s1', 'active'), mkSession('s2', 'active'), mkSession('s3', 'active')]),
      ],
      ungrouped: [],
    }
    expect(computeActiveWorkstreamCount(grouped)).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Tests: focusedWorkstreamNames
// ---------------------------------------------------------------------------

describe('focusedWorkstreamNames', () => {
  it('returns sorted names of workstreams where focused === true', () => {
    const registry = mkRegistry({
      Zebra: { focused: true },
      Alpha: { focused: true },
      Middle: {},
      Beta: { focused: true },
    })
    expect(computeFocusedWorkstreamNames(registry)).toEqual([
      'Alpha',
      'Beta',
      'Zebra',
    ])
  })

  it('returns empty array when no workstreams are focused', () => {
    const registry = mkRegistry({ Auth: {}, API: {}, Docs: {} })
    expect(computeFocusedWorkstreamNames(registry)).toEqual([])
  })

  it('excludes entries where focused is undefined or falsy', () => {
    const registry = mkRegistry({
      Auth: { focused: true },
      API: { focused: false },
      Docs: {},
    })
    expect(computeFocusedWorkstreamNames(registry)).toEqual(['Auth'])
  })
})

// ---------------------------------------------------------------------------
// Tests: isFocusLimitReached
// ---------------------------------------------------------------------------

describe('isFocusLimitReached', () => {
  it('is true when focused count >= threshold (3 focused, threshold 3)', () => {
    expect(computeIsFocusLimitReached(['A', 'B', 'C'], 3)).toBe(true)
  })

  it('is true when focused count > threshold (4 focused, threshold 3)', () => {
    expect(computeIsFocusLimitReached(['A', 'B', 'C', 'D'], 3)).toBe(true)
  })

  it('is false when focused count < threshold (2 focused, threshold 3)', () => {
    expect(computeIsFocusLimitReached(['A', 'B'], 3)).toBe(false)
  })

  it('is false when no workstreams are focused', () => {
    expect(computeIsFocusLimitReached([], 3)).toBe(false)
  })
})
