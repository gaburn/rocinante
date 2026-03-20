import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  filterSessionsByStatus,
  getSessions,
  getStatusCounts,
} from '../services/sessionService'
import { useSettingsContext } from '../context/SettingsContext'
import type { Session, SessionStatus, StatusCounts } from '../types'
import { useArchive } from './useArchive'
import { useSessionNames } from './useSessionNames'
import { useWorkstreams } from './useWorkstreams'

export interface SessionGroup {
  name: string
  sessions: Session[]
  description: string | null
}

export interface UseSessionsResult {
  sessions: Session[]
  allSessions: Session[]
  selectedSession: Session | null
  selectedWorkstream: SessionGroup | null
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
  selectWorkstream: (name: string) => void
  clearSelection: () => void
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
  // Workstream management
  getWorkstream: (sessionId: string) => string | null
  setWorkstream: (sessionId: string, name: string) => void
  removeWorkstream: (sessionId: string) => void
  getCustomName: (sessionId: string) => string | null
  setSessionName: (sessionId: string, name: string) => void
  removeSessionName: (sessionId: string) => void
  getWorkstreamNames: string[]
  renameWorkstream: (oldName: string, newName: string) => void
  deleteWorkstream: (name: string) => void
  setWorkstreamDescription: (workstreamName: string, description: string) => void
  removeWorkstreamDescription: (workstreamName: string) => void
  hasAnyWorkstreams: boolean
  groupedSessions: { groups: SessionGroup[]; ungrouped: Session[] }
}

export function useSessions(): UseSessionsResult {
  const { settings } = useSettingsContext()
  const archive = useArchive()
  const sessionNames = useSessionNames()
  const workstreams = useWorkstreams()
  const [allSessions, setAllSessions] = useState<Session[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [selectedWorkstreamName, setSelectedWorkstreamName] = useState<string | null>(null)
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
      const activeIds = sessions.map((session) => session.id)
      archive.pruneStaleIds(activeIds)
      sessionNames.pruneStaleIds(activeIds)
      workstreams.pruneStaleIds(activeIds)
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load sessions.'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [archive.pruneStaleIds, sessionNames.pruneStaleIds, workstreams.pruneStaleIds])

  const sessionsWithNames = useMemo(() => {
    return allSessions.map((session) => {
      const customName = sessionNames.getCustomName(session.id)
      return customName ? { ...session, name: customName } : session
    })
  }, [allSessions, sessionNames.nameMap, sessionNames.getCustomName])

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
    let filtered = sessionsWithNames

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
    sessionsWithNames,
    showArchived,
    statusFilter,
    searchQuery,
    settings.display.showCompletedSessions,
    settings.display.sortOrder,
    archive.archivedIds,
  ])

  const statusCounts = useMemo(() => {
    const base = showArchived
      ? sessionsWithNames
      : sessionsWithNames.filter((session) => !archive.isArchived(session.id))

    return getStatusCounts(base)
  }, [sessionsWithNames, showArchived, archive.archivedIds])

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
    () => sessionsWithNames.find((session) => session.id === selectedSessionId) ?? null,
    [sessionsWithNames, selectedSessionId],
  )

  const groupedSessions = useMemo(() => {
    const groups = new Map<string, Session[]>()
    const ungrouped: Session[] = []

    for (const session of sessions) {
      const ws = workstreams.getWorkstream(session.id)
      if (ws) {
        const list = groups.get(ws) || []
        list.push(session)
        groups.set(ws, list)
      } else {
        ungrouped.push(session)
      }
    }

    const sortedGroups: SessionGroup[] = Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, groupSessions]) => ({
        name,
        sessions: groupSessions,
        description: workstreams.getDescription(name),
      }))

    return { groups: sortedGroups, ungrouped }
  }, [sessions, workstreams.workstreamMap, workstreams.metaMap])

  const selectedWorkstream = useMemo(
    () => groupedSessions.groups.find((g) => g.name === selectedWorkstreamName) ?? null,
    [groupedSessions.groups, selectedWorkstreamName],
  )

  useEffect(() => {
    if (selectedWorkstreamName) {
      return
    }

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
  }, [sessions, selectedSessionId, selectedWorkstreamName])

  useEffect(() => {
    if (
      selectedWorkstreamName &&
      !groupedSessions.groups.some((g) => g.name === selectedWorkstreamName)
    ) {
      setSelectedWorkstreamName(null)
    }
  }, [selectedWorkstreamName, groupedSessions.groups])

  const selectSession = useCallback((id: string) => {
    setSelectedWorkstreamName(null)
    setSelectedSessionId(id)
  }, [])

  const selectWorkstream = useCallback((name: string) => {
    setSelectedWorkstreamName(name)
    setSelectedSessionId(null)
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedWorkstreamName(null)
    setSelectedSessionId(null)
  }, [])

  const handleRenameWorkstream = useCallback(
    (oldName: string, newName: string) => {
      workstreams.renameWorkstream(oldName, newName)
      if (selectedWorkstreamName === oldName) {
        setSelectedWorkstreamName(newName)
      }
    },
    [workstreams.renameWorkstream, selectedWorkstreamName],
  )

  const refreshSessions = useCallback(() => {
    void loadSessions()
  }, [loadSessions])

  const toggleAutoRefresh = useCallback(() => {
    setAutoRefreshEnabled((enabled) => !enabled)
  }, [])

  return {
    sessions,
    allSessions: sessionsWithNames,
    selectedSession,
    selectedWorkstream,
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
    selectWorkstream,
    clearSelection,
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
    getWorkstream: workstreams.getWorkstream,
    setWorkstream: workstreams.setWorkstream,
    removeWorkstream: workstreams.removeWorkstream,
    getCustomName: sessionNames.getCustomName,
    setSessionName: sessionNames.setCustomName,
    removeSessionName: sessionNames.removeCustomName,
    getWorkstreamNames: workstreams.getWorkstreamNames,
    renameWorkstream: handleRenameWorkstream,
    deleteWorkstream: workstreams.deleteWorkstream,
    setWorkstreamDescription: workstreams.setDescription,
    removeWorkstreamDescription: workstreams.removeDescription,
    hasAnyWorkstreams: workstreams.hasAnyWorkstreams,
    groupedSessions,
  }
}
