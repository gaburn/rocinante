import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWorkstreamMeta } from './useWorkstreamMeta'
import { useSettingsContext } from '../context/SettingsContext'
import type { SessionSummary } from '../types'

const WORKSTREAM_STORAGE_KEY = 'rocinante-workstreams'
const DEMO_WORKSTREAM_STORAGE_KEY = 'rocinante-workstreams-demo'
const WORKSTREAM_REGISTRY_KEY = 'rocinante-workstream-registry'

export interface WorkstreamRegistryEntry {
  createdAt: string
  repoPath?: string
  pendingLaunchId?: string
  pendingLaunchAt?: string
  description?: string
  archived?: boolean
  favorited?: boolean
  focused?: boolean
}

function loadWorkstreamRegistry(): Record<string, WorkstreamRegistryEntry> {
  try {
    const raw = window.localStorage.getItem(WORKSTREAM_REGISTRY_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    const next: Record<string, WorkstreamRegistryEntry> = {}
    for (const [k, value] of Object.entries(parsed)) {
      if (value && typeof value === 'object' && !Array.isArray(value) && typeof (value as Record<string, unknown>).createdAt === 'string') {
        const entry = value as Record<string, unknown>
        next[k] = {
          createdAt: entry.createdAt as string,
          ...(typeof entry.repoPath === 'string' ? { repoPath: entry.repoPath } : {}),
          ...(typeof entry.pendingLaunchId === 'string' ? { pendingLaunchId: entry.pendingLaunchId } : {}),
          ...(typeof entry.pendingLaunchAt === 'string' ? { pendingLaunchAt: entry.pendingLaunchAt } : {}),
          ...(typeof entry.description === 'string' ? { description: entry.description } : {}),
          ...(typeof entry.archived === 'boolean' ? { archived: entry.archived } : {}),
          ...(typeof entry.favorited === 'boolean' ? { favorited: entry.favorited } : {}),
          ...(typeof entry.focused === 'boolean' ? { focused: entry.focused } : {}),
        }
      }
    }
    return next
  } catch {
    return {}
  }
}

function loadWorkstreamMap(key: string): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) {
      return {}
    }

    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

    const next: Record<string, string> = {}
    for (const [k, value] of Object.entries(parsed)) {
      if (typeof value === 'string') {
        next[k] = value
      }
    }

    return next
  } catch {
    return {}
  }
}

/** Extract a short display name from a repository string (last path segment). */
function repoDisplayName(repo: string): string {
  const trimmed = repo.trim().replace(/\/+$/, '')
  if (!trimmed) return repo
  const segments = trimmed.split('/')
  return segments[segments.length - 1] || repo
}

export type ToggleFocusResult =
  | { ok: true; focused: boolean }
  | { ok: false; reason: 'limit_reached' | 'ungrouped' }

export interface UseWorkstreamsResult {
  getWorkstream: (sessionId: string) => string | null
  setWorkstream: (sessionId: string, name: string) => void
  removeWorkstream: (sessionId: string) => void
  getDescription: (workstreamName: string) => string | null
  setDescription: (workstreamName: string, description: string) => void
  removeDescription: (workstreamName: string) => void
  getWorkstreamNames: string[]
  renameWorkstream: (oldName: string, newName: string) => void
  deleteWorkstream: (name: string) => void
  archiveWorkstream: (name: string) => void
  toggleFavorite: (name: string) => void
  toggleFocus: (name: string) => ToggleFocusResult
  pruneStaleIds: (activeIds: string[]) => void
  autoGroupByRepository: (sessions: SessionSummary[]) => void
  hasAnyWorkstreams: boolean
  workstreamMap: Readonly<Record<string, string>>
  metaMap: Readonly<Record<string, { description: string }>>
  createWorkstream: (name: string, opts?: { repoPath?: string; pendingLaunchId?: string; description?: string }) => void
  getWorkstreamRegistry: () => Readonly<Record<string, WorkstreamRegistryEntry>>
  updateWorkstreamRegistry: (name: string, updates: Partial<WorkstreamRegistryEntry>) => void
  workstreamRegistry: Readonly<Record<string, WorkstreamRegistryEntry>>
}

export function useWorkstreams(): UseWorkstreamsResult {
  const [workstreamMap, setWorkstreamMap] = useState<Record<string, string>>(
    () => loadWorkstreamMap(WORKSTREAM_STORAGE_KEY),
  )
  const [registry, setRegistry] = useState<Record<string, WorkstreamRegistryEntry>>(
    loadWorkstreamRegistry,
  )
  const storageKeyRef = useRef(WORKSTREAM_STORAGE_KEY)
  const meta = useWorkstreamMeta()
  const { settings } = useSettingsContext()

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKeyRef.current, JSON.stringify(workstreamMap))
    } catch {
      // Ignore localStorage write errors so workstream state remains usable.
    }
  }, [workstreamMap])

  useEffect(() => {
    try {
      window.localStorage.setItem(WORKSTREAM_REGISTRY_KEY, JSON.stringify(registry))
    } catch {
      // Ignore localStorage write errors so registry state remains usable.
    }
  }, [registry])

  // Detect demo mode and use isolated storage so real workstreams stay untouched
  const demoChecked = useRef(false)
  useEffect(() => {
    if (demoChecked.current) return
    demoChecked.current = true

    fetch('/api/demo/workstreams')
      .then((res) => {
        if (!res.ok) return null
        return res.json() as Promise<Record<string, string[]>>
      })
      .then((mapping) => {
        if (!mapping) return

        // Switch to demo-specific storage key
        storageKeyRef.current = DEMO_WORKSTREAM_STORAGE_KEY

        const existing = loadWorkstreamMap(DEMO_WORKSTREAM_STORAGE_KEY)
        if (Object.keys(existing).length > 0) {
          // Restore previously-saved demo workstreams
          setWorkstreamMap(existing)
        } else {
          // Seed demo workstreams from API response
          const seeded: Record<string, string> = {}
          for (const [workstreamName, sessionIds] of Object.entries(mapping)) {
            for (const id of sessionIds) {
              seeded[id] = workstreamName
            }
          }
          setWorkstreamMap(seeded)
        }
      })
      .catch(() => {
        // Non-critical: silently ignore if demo endpoint unavailable
      })
  }, [])

  const getWorkstream = useCallback(
    (sessionId: string) => {
      return workstreamMap[sessionId] ?? null
    },
    [workstreamMap],
  )

  const setWorkstream = useCallback((sessionId: string, name: string) => {
    setWorkstreamMap((current) => {
      const nextName = name.trim()

      if (!nextName) {
        if (!(sessionId in current)) {
          return current
        }
        const { [sessionId]: _removed, ...rest } = current // eslint-disable-line @typescript-eslint/no-unused-vars
        return rest
      }

      if (current[sessionId] === nextName){
        return current
      }

      return {
        ...current,
        [sessionId]: nextName,
      }
    })
  }, [])

  const removeWorkstream = useCallback((sessionId: string) => {
    setWorkstreamMap((current) => {
      if (!(sessionId in current)) {
        return current
      }
      const { [sessionId]: _deleted, ...rest } = current // eslint-disable-line @typescript-eslint/no-unused-vars
      return rest
    })
  }, [])

  const getWorkstreamNames = useMemo(() => {
    const uniqueNames = new Set(Object.values(workstreamMap))
    for (const [name, entry] of Object.entries(registry)) {
      if (entry.archived) {
        uniqueNames.delete(name)
      } else {
        uniqueNames.add(name)
      }
    }
    return Array.from(uniqueNames).sort((a, b) => a.localeCompare(b))
  }, [workstreamMap, registry])

  const renameWorkstream = useCallback((oldName: string, newName: string) => {
    const nextName = newName.trim()
    if (!nextName) return

    setWorkstreamMap((current) => {
      let changed = false
      const next: Record<string, string> = {}

      for (const [sessionId, name] of Object.entries(current)) {
        if (name === oldName) {
          next[sessionId] = nextName
          changed = true
        } else {
          next[sessionId] = name
        }
      }

      return changed ? next : current
    })
    setRegistry((current) => {
      if (!(oldName in current)) return current
      const { [oldName]: entry, ...rest } = current
      return { ...rest, [nextName]: entry }
    })
    meta.renameMetaKey(oldName, newName)
  }, [meta])

  const deleteWorkstream = useCallback((name: string) => {
    setWorkstreamMap((current) => {
      let changed = false
      const next: Record<string, string> = {}

      for (const [sessionId, value] of Object.entries(current)) {
        if (value === name) {
          changed = true
          continue
        }
        next[sessionId] = value
      }

      return changed ? next : current
    })
    setRegistry((current) => {
      if (!(name in current)) return current
      const { [name]: _deleted, ...rest } = current // eslint-disable-line @typescript-eslint/no-unused-vars
      return rest
    })
    meta.deleteMetaKey(name)
  }, [meta])

  const archiveWorkstream = useCallback((name: string) => {
    setRegistry((current) => {
      const existing = current[name]
      if (!existing) {
        // Create a minimal registry entry so the archived state persists
        return { ...current, [name]: { createdAt: new Date().toISOString(), archived: true } }
      }
      if (existing.archived) return current
      return { ...current, [name]: { ...existing, archived: true } }
    })
  }, [])

  const toggleFavorite = useCallback((name: string) => {
    setRegistry((current) => {
      const existing = current[name] ?? { createdAt: new Date().toISOString() }
      return { ...current, [name]: { ...existing, favorited: !existing.favorited } }
    })
  }, [])

  const toggleFocus = useCallback((name: string): ToggleFocusResult => {
    // The Ungrouped workstream cannot be focused
    if (!name || name === 'Ungrouped') {
      return { ok: false, reason: 'ungrouped' }
    }

    const existing = registry[name] ?? { createdAt: new Date().toISOString() }

    // If already focused, unfocus it
    if (existing.focused) {
      setRegistry((current) => {
        const entry = current[name] ?? { createdAt: new Date().toISOString() }
        return { ...current, [name]: { ...entry, focused: undefined } }
      })
      return { ok: true, focused: false }
    }

    // Check limit before focusing
    const focusedCount = Object.values(registry).filter((e) => e.focused).length
    if (focusedCount >= settings.display.workstreamThreshold) {
      return { ok: false, reason: 'limit_reached' }
    }

    setRegistry((current) => {
      const entry = current[name] ?? { createdAt: new Date().toISOString() }
      return { ...current, [name]: { ...entry, focused: true } }
    })
    return { ok: true, focused: true }
  }, [registry, settings.display.workstreamThreshold])

  const pruneStaleIds= useCallback((activeIds: string[]) => {
    setWorkstreamMap((current) => {
      if (Object.keys(current).length === 0) {
        return current
      }

      const activeSet = new Set(activeIds)
      const next: Record<string, string> = {}
      let changed = false

      for (const [sessionId, value] of Object.entries(current)) {
        if (activeSet.has(sessionId)) {
          next[sessionId] = value
        } else {
          changed = true
        }
      }

      return changed ? next : current
    })
  }, [])

  const autoGroupByRepository = useCallback((sessions: SessionSummary[]) => {
    setWorkstreamMap((current) => {
      const next = { ...current }
      let changed = false

      for (const session of sessions) {
        // Skip sessions that already have a workstream assignment
        if (next[session.id]) continue

        // Use repository if available, fall back to cwd
        const source = session.repository?.trim() || session.cwd?.trim()
        if (!source) continue

        const name = repoDisplayName(source)
        next[session.id] = name
        changed = true
      }

      return changed ? next : current
    })
  }, [])

  const hasAnyWorkstreams = useMemo(() => {
    return Object.keys(workstreamMap).length > 0 || Object.keys(registry).length > 0
  }, [workstreamMap, registry])

  const createWorkstream = useCallback((name: string, opts?: { repoPath?: string; pendingLaunchId?: string; description?: string }) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setRegistry((current) => {
      if (trimmed in current) return current
      return {
        ...current,
        [trimmed]: {
          createdAt: new Date().toISOString(),
          ...(opts?.repoPath ? { repoPath: opts.repoPath } : {}),
          ...(opts?.pendingLaunchId ? { pendingLaunchId: opts.pendingLaunchId } : {}),
          ...(opts?.description ? { description: opts.description } : {}),
        },
      }
    })
  }, [])

  const getWorkstreamRegistry = useCallback(() => registry, [registry])

  const updateWorkstreamRegistry = useCallback((name: string, updates: Partial<WorkstreamRegistryEntry>) => {
    setRegistry((current) => {
      const existing = current[name] ?? { createdAt: new Date().toISOString() }
      const merged = { ...existing, ...updates }
      // Remove keys explicitly set to undefined
      for (const key of Object.keys(updates) as (keyof WorkstreamRegistryEntry)[]) {
        if (updates[key] === undefined) {
          delete merged[key]
        }
      }
      return { ...current, [name]: merged }
    })
  }, [])

  return {
    getWorkstream,
    setWorkstream,
    removeWorkstream,
    getDescription: meta.getDescription,
    setDescription: meta.setDescription,
    removeDescription: meta.removeDescription,
    getWorkstreamNames,
    renameWorkstream,
    deleteWorkstream,
    archiveWorkstream,
    toggleFavorite,
    toggleFocus,
    pruneStaleIds,
    autoGroupByRepository,
    hasAnyWorkstreams,
    workstreamMap,
    metaMap: meta.metaMap,
    createWorkstream,
    getWorkstreamRegistry,
    updateWorkstreamRegistry,
    workstreamRegistry: registry,
  }
}
