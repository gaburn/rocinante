import { useCallback, useEffect, useState } from 'react'

const WORKSTREAM_WORK_ITEMS_STORAGE_KEY = 'rocinante-workstream-workitems'

function loadInitialWorkItemMap(): Record<string, number[]> {
  try {
    const raw = window.localStorage.getItem(WORKSTREAM_WORK_ITEMS_STORAGE_KEY)
    if (!raw) {
      return {}
    }

    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

    const next: Record<string, number[]> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (!Array.isArray(value)) {
        continue
      }

      const validIds = value.filter(
        (entry): entry is number => typeof entry === 'number' && Number.isFinite(entry),
      )
      next[key] = validIds
    }

    return next
  } catch {
    return {}
  }
}

export interface UseWorkstreamWorkItemsResult {
  getWorkItemIds: (workstreamName: string) => number[]
  addWorkItemId: (workstreamName: string, id: number) => void
  removeWorkItemId: (workstreamName: string, id: number) => void
  setWorkItemIds: (workstreamName: string, ids: number[]) => void
  renameWorkstreamKey: (oldName: string, newName: string) => void
  deleteWorkstreamKey: (workstreamName: string) => void
  workItemMap: Readonly<Record<string, number[]>>
}

export function useWorkstreamWorkItems(): UseWorkstreamWorkItemsResult {
  const [workItemMap, setWorkItemMap] = useState<Record<string, number[]>>(loadInitialWorkItemMap)

  useEffect(() => {
    try {
      window.localStorage.setItem(WORKSTREAM_WORK_ITEMS_STORAGE_KEY, JSON.stringify(workItemMap))
    } catch {
      // Ignore localStorage write errors so work item state remains usable.
    }
  }, [workItemMap])

  const getWorkItemIds = useCallback(
    (workstreamName: string) => {
      return workItemMap[workstreamName] ?? []
    },
    [workItemMap],
  )

  const addWorkItemId = useCallback((workstreamName: string, id: number) => {
    setWorkItemMap((current) => {
      const currentIds = current[workstreamName] ?? []
      if (currentIds.includes(id)) {
        return current
      }

      return {
        ...current,
        [workstreamName]: [...currentIds, id],
      }
    })
  }, [])

  const removeWorkItemId = useCallback((workstreamName: string, id: number) => {
    setWorkItemMap((current) => {
      const currentIds = current[workstreamName]
      if (!currentIds) {
        return current
      }

      const nextIds = currentIds.filter((value) => value !== id)
      if (nextIds.length === currentIds.length) {
        return current
      }

      return {
        ...current,
        [workstreamName]: nextIds,
      }
    })
  }, [])

  const setWorkItemIds = useCallback((workstreamName: string, ids: number[]) => {
    setWorkItemMap((current) => {
      if (
        current[workstreamName] &&
        current[workstreamName].length === ids.length &&
        current[workstreamName].every((id, index) => id === ids[index])
      ) {
        return current
      }

      return {
        ...current,
        [workstreamName]: [...ids],
      }
    })
  }, [])

  const renameWorkstreamKey = useCallback((oldName: string, newName: string) => {
    setWorkItemMap((current) => {
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

  const deleteWorkstreamKey = useCallback((workstreamName: string) => {
    setWorkItemMap((current) => {
      if (!(workstreamName in current)) {
        return current
      }
      const { [workstreamName]: _removed, ...rest } = current // eslint-disable-line @typescript-eslint/no-unused-vars
      return rest
    })
  }, [])

  return {
    getWorkItemIds,
    addWorkItemId,
    removeWorkItemId,
    setWorkItemIds,
    renameWorkstreamKey,
    deleteWorkstreamKey,
    workItemMap,
  }
}
