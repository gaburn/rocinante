import { useCallback, useEffect, useState } from 'react'

const PLAN_STATUS_STORAGE_KEY = 'rocinante-plan-status'

type PlanStatusBySession = Record<string, string[]>

function loadInitialPlanStatus(): PlanStatusBySession {
  try {
    const raw = window.localStorage.getItem(PLAN_STATUS_STORAGE_KEY)
    if (!raw) {
      return {}
    }

    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

    const result: PlanStatusBySession = {}
    for (const [sessionId, checkedTaskIds] of Object.entries(parsed)) {
      if (typeof sessionId !== 'string' || !Array.isArray(checkedTaskIds)) {
        continue
      }

      const validTaskIds = checkedTaskIds.filter(
        (value): value is string => typeof value === 'string',
      )
      result[sessionId] = validTaskIds
    }

    return result
  } catch {
    return {}
  }
}

export interface UsePlanStatusResult {
  isTaskChecked: (sessionId: string, taskId: string) => boolean
  toggleTask: (sessionId: string, taskId: string) => void
  getProgress: (sessionId: string, totalTasks: number) => { checked: number; total: number }
  clearSession: (sessionId: string) => void
}

export function usePlanStatus(): UsePlanStatusResult {
  const [planStatusBySession, setPlanStatusBySession] = useState<PlanStatusBySession>(
    loadInitialPlanStatus,
  )

  useEffect(() => {
    try {
      window.localStorage.setItem(
        PLAN_STATUS_STORAGE_KEY,
        JSON.stringify(planStatusBySession),
      )
    } catch {
      // Ignore localStorage write errors so plan status remains usable.
    }
  }, [planStatusBySession])

  const isTaskChecked = useCallback(
    (sessionId: string, taskId: string) => {
      const checkedTaskIds = planStatusBySession[sessionId]
      if (!checkedTaskIds) {
        return false
      }
      return checkedTaskIds.includes(taskId)
    },
    [planStatusBySession],
  )

  const toggleTask = useCallback((sessionId: string, taskId: string) => {
    setPlanStatusBySession((current) => {
      const currentCheckedTaskIds = current[sessionId] ?? []
      const isChecked = currentCheckedTaskIds.includes(taskId)

      const nextCheckedTaskIds = isChecked
        ? currentCheckedTaskIds.filter((id) => id !== taskId)
        : [...currentCheckedTaskIds, taskId]

      if (nextCheckedTaskIds.length === 0) {
        if (!(sessionId in current)) {
          return current
        }
        const { [sessionId]: _removed1, ...rest } = current // eslint-disable-line @typescript-eslint/no-unused-vars
        return rest
      }

      return {
        ...current,
        [sessionId]: nextCheckedTaskIds,
      }
    })
  }, [])

  const getProgress = useCallback(
    (sessionId: string, totalTasks: number) => {
      const checked = planStatusBySession[sessionId]?.length ?? 0
      return { checked, total: totalTasks }
    },
    [planStatusBySession],
  )

  const clearSession = useCallback((sessionId: string) => {
    setPlanStatusBySession((current) => {
      if (!(sessionId in current)) {
        return current
      }
      const { [sessionId]: _removed2, ...rest } = current // eslint-disable-line @typescript-eslint/no-unused-vars
      return rest
    })
  }, [])

  return {
    isTaskChecked,
    toggleTask,
    getProgress,
    clearSession,
  }
}
