import { describe, it, expect } from 'vitest'

/**
 * Tests for toggleFocus logic in useWorkstreams (issue #24).
 *
 * Extracts the pure toggleFocus decision logic and tests it
 * directly — same pattern as autoGroupArchive.test.ts.
 */

// ---------------------------------------------------------------------------
// Types matching implementation
// ---------------------------------------------------------------------------

interface WorkstreamRegistryEntry {
  createdAt: string
  focused?: boolean
  archived?: boolean
}

type ToggleFocusResult =
  | { ok: true; focused: boolean }
  | { ok: false; reason: 'limit_reached' | 'ungrouped' }

// ---------------------------------------------------------------------------
// Extracted logic from useWorkstreams.ts toggleFocus (lines 297-325)
// ---------------------------------------------------------------------------

function toggleFocus(
  name: string,
  registry: Record<string, WorkstreamRegistryEntry>,
  workstreamThreshold: number,
): { result: ToggleFocusResult; nextRegistry: Record<string, WorkstreamRegistryEntry> } {
  // Ungrouped guard
  if (!name || name === 'Ungrouped') {
    return {
      result: { ok: false, reason: 'ungrouped' },
      nextRegistry: registry,
    }
  }

  const existing = registry[name] ?? { createdAt: new Date().toISOString() }

  // If already focused, unfocus it
  if (existing.focused) {
    const entry = registry[name] ?? { createdAt: new Date().toISOString() }
    const nextEntry = { ...entry }
    delete nextEntry.focused
    return {
      result: { ok: true, focused: false },
      nextRegistry: { ...registry, [name]: nextEntry },
    }
  }

  // Check limit before focusing
  const focusedCount = Object.values(registry).filter((e) => e.focused).length
  if (focusedCount >= workstreamThreshold) {
    return {
      result: { ok: false, reason: 'limit_reached' },
      nextRegistry: registry,
    }
  }

  const entry = registry[name] ?? { createdAt: new Date().toISOString() }
  return {
    result: { ok: true, focused: true },
    nextRegistry: { ...registry, [name]: { ...entry, focused: true } },
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mkRegistry = (
  entries: Record<string, { focused?: boolean }>,
): Record<string, WorkstreamRegistryEntry> => {
  const result: Record<string, WorkstreamRegistryEntry> = {}
  for (const [name, opts] of Object.entries(entries)) {
    result[name] = { createdAt: '2025-01-01T00:00:00Z', ...opts }
  }
  return result
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('toggleFocus', () => {
  const threshold = 3

  it('returns { ok: true, focused: true } on first toggle when under limit', () => {
    const registry = mkRegistry({ Auth: {}, API: {} })
    const { result } = toggleFocus('Auth', registry, threshold)
    expect(result).toEqual({ ok: true, focused: true })
  })

  it('marks the workstream as focused in the registry', () => {
    const registry = mkRegistry({ Auth: {}, API: {} })
    const { nextRegistry } = toggleFocus('Auth', registry, threshold)
    expect(nextRegistry['Auth'].focused).toBe(true)
  })

  it('returns { ok: false, reason: "limit_reached" } when threshold already pinned', () => {
    const registry = mkRegistry({
      Auth: { focused: true },
      API: { focused: true },
      Docs: { focused: true },
    })
    const { result } = toggleFocus('Tests', registry, threshold)
    expect(result).toEqual({ ok: false, reason: 'limit_reached' })
  })

  it('does not modify the registry when limit is reached', () => {
    const registry = mkRegistry({
      Auth: { focused: true },
      API: { focused: true },
      Docs: { focused: true },
    })
    const { nextRegistry } = toggleFocus('Tests', registry, threshold)
    expect(nextRegistry).toBe(registry) // strict referential equality
  })

  it('returns { ok: false, reason: "ungrouped" } for "Ungrouped"', () => {
    const registry = mkRegistry({ Auth: {} })
    const { result } = toggleFocus('Ungrouped', registry, threshold)
    expect(result).toEqual({ ok: false, reason: 'ungrouped' })
  })

  it('returns { ok: false, reason: "ungrouped" } for empty string', () => {
    const registry = mkRegistry({ Auth: {} })
    const { result } = toggleFocus('', registry, threshold)
    expect(result).toEqual({ ok: false, reason: 'ungrouped' })
  })

  it('unfocuses an already-focused workstream (returns { ok: true, focused: false })', () => {
    const registry = mkRegistry({ Auth: { focused: true }, API: {} })
    const { result, nextRegistry } = toggleFocus('Auth', registry, threshold)
    expect(result).toEqual({ ok: true, focused: false })
    expect(nextRegistry['Auth'].focused).toBeUndefined()
  })

  it('allows re-focusing after unfocusing (round-trip)', () => {
    const registry = mkRegistry({
      Auth: { focused: true },
      API: { focused: true },
      Docs: { focused: true },
    })
    // First: unfocus Auth
    const { nextRegistry: after1 } = toggleFocus('Auth', registry, threshold)
    expect(after1['Auth'].focused).toBeUndefined()

    // Now focus a new one — should succeed since we freed a slot
    const { result, nextRegistry: after2 } = toggleFocus('Tests', after1, threshold)
    expect(result).toEqual({ ok: true, focused: true })
    expect(after2['Tests'].focused).toBe(true)
  })

  it('creates a registry entry for a new workstream when focusing', () => {
    const registry = mkRegistry({})
    const { result, nextRegistry } = toggleFocus('Brand-New', registry, threshold)
    expect(result).toEqual({ ok: true, focused: true })
    expect(nextRegistry['Brand-New']).toBeDefined()
    expect(nextRegistry['Brand-New'].focused).toBe(true)
    expect(typeof nextRegistry['Brand-New'].createdAt).toBe('string')
  })
})
