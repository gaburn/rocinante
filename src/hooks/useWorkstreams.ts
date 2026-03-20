import { useCallback, useEffect, useMemo, useState } from 'react'
import { useWorkstreamMeta } from './useWorkstreamMeta'

const WORKSTREAM_STORAGE_KEY = 'rocinante-workstreams'

function loadInitialWorkstreamMap(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(WORKSTREAM_STORAGE_KEY)
    if (!raw) {
      return {}
    }

    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

    const next: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') {
        next[key] = value
      }
    }

    return next
  } catch {
    return {}
  }
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
  hasAnyWorkstreams: boolean
  workstreamMap: Readonly<Record<string, string>>
  metaMap: Readonly<Record<string, { description: string }>>
}

export function useWorkstreams(): UseWorkstreamsResult {
  const [workstreamMap, setWorkstreamMap] = useState<Record<string, string>>(loadInitialWorkstreamMap)
  const meta = useWorkstreamMeta()

  useEffect(() => {
    try {
      window.localStorage.setItem(WORKSTREAM_STORAGE_KEY, JSON.stringify(workstreamMap))
    } catch {
      // Ignore localStorage write errors so workstream state remains usable.
    }
  }, [workstreamMap])

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
        const { [sessionId]: _, ...rest } = current
        return rest
      }

      if (current[sessionId] === nextName) {
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
      const { [sessionId]: _, ...rest } = current
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
    hasAnyWorkstreams,
    workstreamMap,
    metaMap: meta.metaMap,
  }
}
