import { useState, useEffect, useCallback, useRef } from 'react'
import { getSessionDeliverables } from '../services/adoService'
import type { AdoPullRequest, AdoWorkItem } from '../types/ado'

export interface UseSessionDeliverablesResult {
  pullRequests: AdoPullRequest[]
  workItems: AdoWorkItem[]
  isLoading: boolean
  error: string | null
  refresh: () => void
}

export function useSessionDeliverables(
  branch: string | null | undefined,
  isAdoConfigured: boolean,
): UseSessionDeliverablesResult {
  const [pullRequests, setPullRequests] = useState<AdoPullRequest[]>([])
  const [workItems, setWorkItems] = useState<AdoWorkItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetchDeliverables = useCallback(() => {
    // Abort any in-flight request
    abortRef.current?.abort()

    if (!branch || !branch.trim() || !isAdoConfigured) {
      setPullRequests([])
      setWorkItems([])
      setError(null)
      setIsLoading(false)
      return
    }

    const controller = new AbortController()
    abortRef.current = controller

    setIsLoading(true)
    setError(null)

    getSessionDeliverables(branch)
      .then((data) => {
        if (!controller.signal.aborted) {
          setPullRequests(data.pullRequests)
          setWorkItems(data.workItems)
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        if (err instanceof DOMException && err.name === 'AbortError') return
        const message = err instanceof Error ? err.message : 'Failed to fetch deliverables'
        setError(message)
        setPullRequests([])
        setWorkItems([])
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      })
  }, [branch, isAdoConfigured])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDeliverables()

    return () => {
      abortRef.current?.abort()
    }
  }, [fetchDeliverables])

  return {
    pullRequests,
    workItems,
    isLoading,
    error,
    refresh: fetchDeliverables,
  }
}
