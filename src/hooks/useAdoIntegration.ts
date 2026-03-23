import { useState, useEffect, useCallback, useMemo } from 'react'
import { getAdoStatus, getWorkItems, getPullRequests } from '../services/adoService'
import type { AdoWorkItem, AdoPullRequest, AdoStatus } from '../types/ado'
import { useWorkstreamWorkItems } from './useWorkstreamWorkItems'
import type { Session } from '../types'

export interface UseAdoIntegrationResult {
  // ADO status
  adoStatus: AdoStatus | null
  isAdoConfigured: boolean

  // Work items
  workItemIds: number[]
  workItems: AdoWorkItem[]
  isLoadingWorkItems: boolean
  addWorkItemId: (id: number) => void
  removeWorkItemId: (id: number) => void

  // Pull requests
  pullRequests: AdoPullRequest[]
  isLoadingPRs: boolean

  // Errors
  workItemError: string | null
  prError: string | null

  // Refresh
  refresh: () => void

  // Work item key management (for rename/delete cascade)
  renameWorkstreamKey: (oldName: string, newName: string) => void
  deleteWorkstreamKey: (workstreamName: string) => void
}

export function useAdoIntegration(workstreamName: string | null, sessions: Session[]): UseAdoIntegrationResult {
  const wiHook = useWorkstreamWorkItems()

  const [adoStatus, setAdoStatus] = useState<AdoStatus | null>(null)
  const [workItems, setWorkItems] = useState<AdoWorkItem[]>([])
  const [pullRequests, setPullRequests] = useState<AdoPullRequest[]>([])
  const [isLoadingWorkItems, setIsLoadingWorkItems] = useState(false)
  const [isLoadingPRs, setIsLoadingPRs] = useState(false)
  const [workItemError, setWorkItemError] = useState<string | null>(null)
  const [prError, setPrError] = useState<string | null>(null)

  const isAdoConfigured = adoStatus?.configured ?? false

  const workItemIds = useMemo(() => {
    if (!workstreamName) {
      return []
    }
    return wiHook.getWorkItemIds(workstreamName)
  }, [wiHook, workstreamName])

  const branches = useMemo(() => {
    const uniqueBranches = new Set(
      sessions
        .map((session) => session.branch)
        .filter((branch): branch is string => Boolean(branch && branch.trim())),
    )
    return Array.from(uniqueBranches)
  }, [sessions])

  useEffect(() => {
    let isCancelled = false

    getAdoStatus()
      .then((status) => {
        if (!isCancelled) {
          setAdoStatus(status)
        }
      })
      .catch(() => {})

    return () => {
      isCancelled = true
    }
  }, [])

  const fetchWorkItems = useCallback(() => {
    if (!workstreamName || !isAdoConfigured || workItemIds.length === 0) {
      setWorkItems([])
      setWorkItemError(null)
      setIsLoadingWorkItems(false)
      return
    }

    setIsLoadingWorkItems(true)
    setWorkItemError(null)

    getWorkItems(workItemIds)
      .then((items) => {
        setWorkItems(items)
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Failed to fetch work items'
        setWorkItemError(message)
        setWorkItems([])
      })
      .finally(() => {
        setIsLoadingWorkItems(false)
      })
  }, [isAdoConfigured, workItemIds, workstreamName])

  const fetchPullRequests = useCallback(() => {
    if (!workstreamName || !isAdoConfigured || branches.length === 0) {
      setPullRequests([])
      setPrError(null)
      setIsLoadingPRs(false)
      return
    }

    setIsLoadingPRs(true)
    setPrError(null)

    getPullRequests(branches)
      .then((prs) => {
        setPullRequests(prs)
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Failed to fetch pull requests'
        setPrError(message)
        setPullRequests([])
      })
      .finally(() => {
        setIsLoadingPRs(false)
      })
  }, [branches, isAdoConfigured, workstreamName])

  useEffect(() => {
    fetchWorkItems()
  }, [fetchWorkItems])

  useEffect(() => {
    fetchPullRequests()
  }, [fetchPullRequests])

  const addWorkItemId = useCallback(
    (id: number) => {
      if (!workstreamName) {
        return
      }
      wiHook.addWorkItemId(workstreamName, id)
    },
    [wiHook, workstreamName],
  )

  const removeWorkItemId = useCallback(
    (id: number) => {
      if (!workstreamName) {
        return
      }
      wiHook.removeWorkItemId(workstreamName, id)
    },
    [wiHook, workstreamName],
  )

  const refresh = useCallback(() => {
    fetchWorkItems()
    fetchPullRequests()
  }, [fetchPullRequests, fetchWorkItems])

  return {
    adoStatus,
    isAdoConfigured,
    workItemIds,
    workItems,
    isLoadingWorkItems,
    addWorkItemId,
    removeWorkItemId,
    pullRequests,
    isLoadingPRs,
    workItemError,
    prError,
    refresh,
    renameWorkstreamKey: wiHook.renameWorkstreamKey,
    deleteWorkstreamKey: wiHook.deleteWorkstreamKey,
  }
}
