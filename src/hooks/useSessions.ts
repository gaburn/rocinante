import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  filterSessionsByStatus,
  getSessions,
  getStatusCounts,
} from '../services/sessionService'
import { useSettingsContext } from '../context/SettingsContext'
import type { Session, SessionStatus, StatusCounts } from '../types'
import { useArchive } from './useArchive'

export interface UseSessionsResult {
  sessions: Session[]
  allSessions: Session[]
  selectedSession: Session | null
  statusFilter: SessionStatus | 'all'
  searchQuery: string
  viewMode: 'list' | 'network'
  showArchived: boolean
  statusCounts: StatusCounts
  archivedCount: number
  isLoading: boolean
  error: string | null
  autoRefreshEnabled: boolean
  selectSession: (id: string) => void
  setStatusFilter: (status: SessionStatus | 'all') => void
  setSearchQuery: (query: string) => void
  setViewMode: (mode: 'list' | 'network') => void
  setShowArchived: (show: boolean) => void
  isArchived: (id: string) => boolean
  archiveSession: (id: string) => void
  unarchiveSession: (id: string) => void
  toggleArchive: (id: string) => void
  archiveAllCompleted: () => void
  refreshSessions: () => void
  toggleAutoRefresh: () => void
}

export function useSessions(): UseSessionsResult {
  const { settings } = useSettingsContext()
  const archive = useArchive()
  const [allSessions, setAllSessions] = useState<Session[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<SessionStatus | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'network'>(
    settings.display.defaultViewMode,
  )
  const [showArchived, setShowArchived] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true)

  const loadSessions = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const sessions = await getSessions()
      setAllSessions(sessions)
      archive.pruneStaleIds(sessions.map((session) => session.id))
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load sessions.'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [archive.pruneStaleIds])

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

    if (!showArchived) {
      filtered = filtered.filter((session) => !archive.isArchived(session.id))
    }

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
    showArchived,
    statusFilter,
    searchQuery,
    settings.display.showCompletedSessions,
    settings.display.sortOrder,
    archive.archivedIds,
  ])

  const statusCounts = useMemo(() => {
    const base = showArchived
      ? allSessions
      : allSessions.filter((session) => !archive.isArchived(session.id))

    return getStatusCounts(base)
  }, [allSessions, showArchived, archive.archivedIds])

  const archiveAllCompleted = useCallback(() => {
    const completedIds = allSessions
      .filter((session) => session.status === 'completed')
      .map((session) => session.id)
    archive.archiveByIds(completedIds)
  }, [allSessions, archive])

  const archivedCount = useMemo(
    () => allSessions.filter((session) => archive.isArchived(session.id)).length,
    [allSessions, archive.archivedIds],
  )

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
    showArchived,
    statusCounts,
    archivedCount,
    isLoading,
    error,
    autoRefreshEnabled,
    selectSession,
    setStatusFilter,
    setSearchQuery,
    setViewMode,
    setShowArchived,
    isArchived: archive.isArchived,
    archiveSession: archive.archiveSession,
    unarchiveSession: archive.unarchiveSession,
    toggleArchive: archive.toggleArchive,
    archiveAllCompleted,
    refreshSessions,
    toggleAutoRefresh,
  }
}
