import { useCallback, useEffect, useState } from 'react'

const SESSION_NAMES_STORAGE_KEY = 'rocinante-session-names'

function loadInitialNameMap(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(SESSION_NAMES_STORAGE_KEY)
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

export interface UseSessionNamesResult {
  getCustomName: (sessionId: string) => string | null
  setCustomName: (sessionId: string, name: string) => void
  removeCustomName: (sessionId: string) => void
  pruneStaleIds: (activeIds: string[]) => void
  nameMap: Readonly<Record<string, string>>
}

export function useSessionNames(): UseSessionNamesResult {
  const [nameMap, setNameMap] = useState<Record<string, string>>(loadInitialNameMap)

  useEffect(() => {
    try {
      window.localStorage.setItem(SESSION_NAMES_STORAGE_KEY, JSON.stringify(nameMap))
    } catch {
      // Ignore localStorage write errors so name state remains usable.
    }
  }, [nameMap])

  const getCustomName = useCallback(
    (sessionId: string) => {
      return nameMap[sessionId] ?? null
    },
    [nameMap],
  )

  const setCustomName = useCallback((sessionId: string, name: string) => {
    setNameMap((current) => {
      const trimmedName = name.trim()
      if (!trimmedName) {
        return current
      }

      if (current[sessionId] === trimmedName) {
        return current
      }

      return {
        ...current,
        [sessionId]: trimmedName,
      }
    })
  }, [])

  const removeCustomName = useCallback((sessionId: string) => {
    setNameMap((current) => {
      if (!(sessionId in current)) {
        return current
      }
      const { [sessionId]: _, ...rest } = current
      return rest
    })
  }, [])

  const pruneStaleIds = useCallback((activeIds: string[]) => {
    setNameMap((current) => {
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

  return {
    getCustomName,
    setCustomName,
    removeCustomName,
    pruneStaleIds,
    nameMap,
  }
}
