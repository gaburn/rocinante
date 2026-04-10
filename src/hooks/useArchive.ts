import { useCallback, useEffect, useRef, useState } from 'react'

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

// Fire-and-forget server calls — log warnings but never throw
function syncArchiveToServer(ids: string[]): void {
  fetch('/api/sessions/archive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  }).catch((err) => {
    console.warn('[useArchive] Failed to sync archive to server:', err)
  })
}

function serverArchiveAdd(id: string): void {
  fetch('/api/sessions/archive/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  }).catch((err) => {
    console.warn('[useArchive] Failed to add archive on server:', err)
  })
}

function serverArchiveRemove(id: string): void {
  fetch('/api/sessions/archive/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  }).catch((err) => {
    console.warn('[useArchive] Failed to remove archive on server:', err)
  })
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
  /** Whether the initial archive sync to server succeeded */
  synced: boolean
}

export function useArchive(): UseArchiveResult {
  const [archivedIds, setArchivedIds] = useState<Set<string>>(loadInitialArchiveIds)
  const [synced, setSynced] = useState(false)
  const didSyncRef = useRef(false)

  // Persist to localStorage on every change
  useEffect(() => {
    try {
      window.localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(Array.from(archivedIds)))
    } catch {
      // Ignore localStorage write errors so archive state remains usable.
    }
  }, [archivedIds])

  // On mount: push localStorage archive state to server
  useEffect(() => {
    if (didSyncRef.current) return
    didSyncRef.current = true

    const ids = Array.from(loadInitialArchiveIds())
    fetch('/api/sessions/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
      .then((res) => {
        if (res.ok) setSynced(true)
        else console.warn('[useArchive] Server sync returned', res.status)
      })
      .catch((err) => {
        console.warn('[useArchive] Initial archive sync failed (continuing client-only):', err)
      })
  }, [])

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
    serverArchiveAdd(id)
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
    serverArchiveRemove(id)
  }, [])

  const toggleArchive = useCallback((id: string) => {
    setArchivedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
        serverArchiveRemove(id)
      } else {
        next.add(id)
        serverArchiveAdd(id)
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
      // Sync full set to server
      syncArchiveToServer(Array.from(next))
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
      syncArchiveToServer([])
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
    synced,
  }
}
