import { useCallback, useEffect, useState } from 'react'

const ARCHIVE_STORAGE_KEY = 'rocinante-archived-sessions'

function loadInitialArchiveIds(): Set<string> {
  try {
    const raw = window.localStorage.getItem(ARCHIVE_STORAGE_KEY)
    if (!raw) {
      return new Set<string>()
    }

    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return new Set<string>()
    }

    const validIds = parsed.filter((value): value is string => typeof value === 'string')
    return new Set<string>(validIds)
  } catch {
    return new Set<string>()
  }
}

export interface UseArchiveResult {
  isArchived: (id: string) => boolean
  archiveSession: (id: string) => void
  unarchiveSession: (id: string) => void
  toggleArchive: (id: string) => void
  archiveByIds: (ids: string[]) => void
  pruneStaleIds: (activeIds: string[]) => void
  clearArchive: () => void
  archivedIds: ReadonlySet<string>
}

export function useArchive(): UseArchiveResult {
  const [archivedIds, setArchivedIds] = useState<Set<string>>(loadInitialArchiveIds)

  useEffect(() => {
    try {
      window.localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(Array.from(archivedIds)))
    } catch {
      // Ignore localStorage write errors so archive state remains usable.
    }
  }, [archivedIds])

  const isArchived = useCallback(
    (id: string) => {
      return archivedIds.has(id)
    },
    [archivedIds],
  )

  const archiveSession = useCallback((id: string) => {
    setArchivedIds((current) => {
      if (current.has(id)) {
        return current
      }
      const next = new Set(current)
      next.add(id)
      return next
    })
  }, [])

  const unarchiveSession = useCallback((id: string) => {
    setArchivedIds((current) => {
      if (!current.has(id)) {
        return current
      }
      const next = new Set(current)
      next.delete(id)
      return next
    })
  }, [])

  const toggleArchive = useCallback((id: string) => {
    setArchivedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const archiveByIds = useCallback((ids: string[]) => {
    setArchivedIds((current) => {
      if (ids.length === 0) {
        return current
      }

      const next = new Set(current)
      for (const id of ids) {
        next.add(id)
      }
      return next
    })
  }, [])

  const pruneStaleIds = useCallback((activeIds: string[]) => {
    setArchivedIds((current) => {
      if (current.size === 0) {
        return current
      }

      const activeSet = new Set(activeIds)
      const next = new Set<string>()

      for (const id of current) {
        if (activeSet.has(id)) {
          next.add(id)
        }
      }

      if (next.size === current.size) {
        return current
      }

      return next
    })
  }, [])

  const clearArchive = useCallback(() => {
    setArchivedIds((current) => {
      if (current.size === 0) {
        return current
      }
      return new Set<string>()
    })
  }, [])

  return {
    isArchived,
    archiveSession,
    unarchiveSession,
    toggleArchive,
    archiveByIds,
    pruneStaleIds,
    clearArchive,
    archivedIds,
  }
}
