import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  filterSessionsByStatus,
  getSessions,
  getStatusCounts,
} from '../services/sessionService'
import { useSettingsContext } from '../context/SettingsContext'
import type { Session, SessionStatus, StatusCounts } from '../types'

export interface UseSessionsResult {
  sessions: Session[]
  allSessions: Session[]
  selectedSession: Session | null
  statusFilter: SessionStatus | 'all'
  searchQuery: string
  viewMode: 'list' | 'network'
  statusCounts: StatusCounts
  isLoading: boolean
  error: string | null
  autoRefreshEnabled: boolean
  selectSession: (id: string) => void
  setStatusFilter: (status: SessionStatus | 'all') => void
  setSearchQuery: (query: string) => void
  setViewMode: (mode: 'list' | 'network') => void
  refreshSessions: () => void
  toggleAutoRefresh: () => void
}

export function useSessions(): UseSessionsResult {
  const { settings } = useSettingsContext()
  const [allSessions, setAllSessions] = useState<Session[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<SessionStatus | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'network'>(
    settings.display.defaultViewMode,
  )
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true)

  const loadSessions = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const sessions = await getSessions()
      setAllSessions(sessions)
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load sessions.'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  useEffect(() => {
    if (
      !autoRefreshEnabled ||
      settings.display.refreshInterval === 0
    ) {
      return
    }

    const intervalId = window.setInterval(() => {
      void loadSessions()
    }, settings.display.refreshInterval)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [autoRefreshEnabled, loadSessions, settings.display.refreshInterval])

  const sessions = useMemo(() => {
    let filtered = allSessions

    if (!settings.display.showCompletedSessions) {
      filtered = filtered.filter((session) => session.status !== 'completed')
    }

    filtered = filterSessionsByStatus(filtered, statusFilter)

    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase()
      filtered = filtered.filter(
        (s) => s.name.toLowerCase().includes(query) || s.intent.toLowerCase().includes(query),
      )
    }

    if (settings.display.sortOrder === 'alphabetical') {
      return [...filtered].sort((a, b) => a.name.localeCompare(b.name))
    }

    if (settings.display.sortOrder === 'status-grouped') {
      const statusPriority: Record<SessionStatus, number> = {
        active: 1,
        blocked: 2,
        waiting: 3,
        completed: 4,
      }

      return [...filtered].sort((a, b) => {
        const priorityDiff = statusPriority[a.status] - statusPriority[b.status]
        if (priorityDiff !== 0) {
          return priorityDiff
        }
        return (
          new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
        )
      })
    }

    return filtered
  }, [
    allSessions,
    statusFilter,
    searchQuery,
    settings.display.showCompletedSessions,
    settings.display.sortOrder,
  ])

  const statusCounts = useMemo(() => getStatusCounts(allSessions), [allSessions])

  const selectedSession = useMemo(
    () => allSessions.find((session) => session.id === selectedSessionId) ?? null,
    [allSessions, selectedSessionId],
  )

  useEffect(() => {
    if (sessions.length === 0) {
      setSelectedSessionId(null)
      return
    }

    if (!selectedSessionId) {
      setSelectedSessionId(sessions[0].id)
      return
    }

    const selectedSessionStillVisible = sessions.some(
      (session) => session.id === selectedSessionId,
    )

    if (!selectedSessionStillVisible) {
      setSelectedSessionId(sessions[0].id)
    }
  }, [sessions, selectedSessionId])

  const selectSession = useCallback((id: string) => {
    setSelectedSessionId(id)
  }, [])

  const refreshSessions = useCallback(() => {
    void loadSessions()
  }, [loadSessions])

  const toggleAutoRefresh = useCallback(() => {
    setAutoRefreshEnabled((enabled) => !enabled)
  }, [])

  return {
    sessions,
    allSessions,
    selectedSession,
    statusFilter,
    searchQuery,
    viewMode,
    statusCounts,
    isLoading,
    error,
    autoRefreshEnabled,
    selectSession,
    setStatusFilter,
    setSearchQuery,
    setViewMode,
    refreshSessions,
    toggleAutoRefresh,
  }
}
