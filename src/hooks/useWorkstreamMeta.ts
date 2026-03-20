import { useCallback, useEffect, useState } from 'react'

const WORKSTREAM_META_STORAGE_KEY = 'rocinante-workstream-meta'
const MAX_DESCRIPTION_LENGTH = 500

interface WorkstreamMeta {
  description: string
}

function loadInitialMetaMap(): Record<string, WorkstreamMeta> {
  try {
    const raw = window.localStorage.getItem(WORKSTREAM_META_STORAGE_KEY)
    if (!raw) {
      return {}
    }

    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

    const next: Record<string, WorkstreamMeta> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        typeof value.description === 'string'
      ) {
        next[key] = { description: value.description }
      }
    }

    return next
  } catch {
    return {}
  }
}

export interface UseWorkstreamMetaResult {
  getDescription: (workstreamName: string) => string | null
  setDescription: (workstreamName: string, description: string) => void
  removeDescription: (workstreamName: string) => void
  renameMetaKey: (oldName: string, newName: string) => void
  deleteMetaKey: (workstreamName: string) => void
  metaMap: Readonly<Record<string, { description: string }>>
}

export function useWorkstreamMeta(): UseWorkstreamMetaResult {
  const [metaMap, setMetaMap] = useState<Record<string, WorkstreamMeta>>(loadInitialMetaMap)

  useEffect(() => {
    try {
      window.localStorage.setItem(WORKSTREAM_META_STORAGE_KEY, JSON.stringify(metaMap))
    } catch {
      // Ignore localStorage write errors so metadata state remains usable.
    }
  }, [metaMap])

  const getDescription = useCallback(
    (workstreamName: string) => {
      return metaMap[workstreamName]?.description ?? null
    },
    [metaMap],
  )

  const removeDescription = useCallback((workstreamName: string) => {
    setMetaMap((current) => {
      if (!(workstreamName in current)) {
        return current
      }
      const { [workstreamName]: _, ...rest } = current
      return rest
    })
  }, [])

  const setDescription = useCallback((workstreamName: string, description: string) => {
    setMetaMap((current) => {
      const trimmedDescription = description.trim().slice(0, MAX_DESCRIPTION_LENGTH)
      if (!trimmedDescription) {
        if (!(workstreamName in current)) {
          return current
        }
        const { [workstreamName]: _, ...rest } = current
        return rest
      }

      if (current[workstreamName]?.description === trimmedDescription) {
        return current
      }

      return {
        ...current,
        [workstreamName]: { description: trimmedDescription },
      }
    })
  }, [])

  const renameMetaKey = useCallback((oldName: string, newName: string) => {
    setMetaMap((current) => {
      if (!(oldName in current)) {
        return current
      }

      const nextName = newName.trim()
      if (!nextName || nextName === oldName) {
        return current
      }

      const { [oldName]: oldValue, ...rest } = current
      return {
        ...rest,
        [nextName]: oldValue,
      }
    })
  }, [])

  const deleteMetaKey = useCallback((workstreamName: string) => {
    setMetaMap((current) => {
      if (!(workstreamName in current)) {
        return current
      }
      const { [workstreamName]: _, ...rest } = current
      return rest
    })
  }, [])

  return {
    getDescription,
    setDescription,
    removeDescription,
    renameMetaKey,
    deleteMetaKey,
    metaMap,
  }
}
