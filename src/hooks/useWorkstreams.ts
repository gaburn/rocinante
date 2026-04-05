import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWorkstreamMeta } from './useWorkstreamMeta'
import type { Session } from '../types'

const WORKSTREAM_STORAGE_KEY = 'rocinante-workstreams'
const DEMO_WORKSTREAM_STORAGE_KEY = 'rocinante-workstreams-demo'

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
  pruneStaleIds: (activeIds: string[]) => void
  autoGroupByRepository: (sessions: Session[]) => void
  hasAnyWorkstreams: boolean
  workstreamMap: Readonly<Record<string, string>>
  metaMap: Readonly<Record<string, { description: string }>>
}

export function useWorkstreams(): UseWorkstreamsResult {
  const [workstreamMap, setWorkstreamMap] = useState<Record<string, string>>(
    () => loadWorkstreamMap(WORKSTREAM_STORAGE_KEY),
  )
  const storageKeyRef = useRef(WORKSTREAM_STORAGE_KEY)
  const meta = useWorkstreamMeta()

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKeyRef.current, JSON.stringify(workstreamMap))
    } catch {
      // Ignore localStorage write errors so workstream state remains usable.
    }
  }, [workstreamMap])

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
    return Array.from(uniqueNames).sort((a, b) => a.localeCompare(b))
  }, [workstreamMap])

  const renameWorkstream = useCallback((oldName: string, newName: string) => {
    setWorkstreamMap((current) => {
      const nextName = newName.trim()
      if (!nextName) {
        return current
      }

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
    meta.deleteMetaKey(name)
  }, [meta])

  const pruneStaleIds = useCallback((activeIds: string[]) => {
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

  const autoGroupByRepository = useCallback((sessions: Session[]) => {
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
    return Object.keys(workstreamMap).length > 0
  }, [workstreamMap])

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
    pruneStaleIds,
    autoGroupByRepository,
    hasAnyWorkstreams,
    workstreamMap,
    metaMap: meta.metaMap,
  }
}
