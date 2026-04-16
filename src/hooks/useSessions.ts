import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  filterSessionsByStatus,
  getSessions,
  getSessionById,
  getStatusCounts,
} from '../services/sessionService'
import { useSettingsContext } from '../context/SettingsContext'
import type { Session, SessionSummary, SessionStatus, StatusCounts } from '../types'
import { useArchive } from './useArchive'
import { useAutoArchive, type UseAutoArchiveResult } from './useAutoArchive'
import { useSessionNames } from './useSessionNames'
import { useWorkstreams } from './useWorkstreams'

export interface ConversationMatch {
  snippet: string
  matchType: string
  isArchived?: boolean
}

export interface SessionGroup {
  name: string
  sessions: SessionSummary[]
  description: string | null
}

export interface UseSessionsResult {
  sessions: SessionSummary[]
  allSessions: SessionSummary[]
  selectedSession: Session | null
  selectedWorkstream: SessionGroup | null
  statusFilter: SessionStatus | 'all'
  sourceFilter: 'copilot' | 'claude' | 'all'
  searchQuery: string
  viewMode: 'list' | 'network' | 'stats'
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
  setSourceFilter: (source: 'copilot' | 'claude' | 'all') => void
  setSearchQuery: (query: string) => void
  setViewMode: (mode: 'list' | 'network' | 'stats') => void
  setShowArchived: (show: boolean) => void
  isArchived: (id: string) => boolean
  archiveSession: (id: string) => void
  unarchiveSession: (id: string) => void
  toggleArchive: (id: string) => void
  archiveAndSelectNext: (id: string) => void
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
  autoGroupByRepository: () => void
  hasAnyWorkstreams: boolean
  groupedSessions: { groups: SessionGroup[]; ungrouped: SessionSummary[] }
  conversationSearchResults: Map<string, ConversationMatch>
  archivedSearchResults: Map<string, ConversationMatch>
  isSearchingConversations: boolean
  archiveSynced: boolean
  // Auto-archive rules
  autoArchive: UseAutoArchiveResult
}

export function useSessions(): UseSessionsResult {
  const { settings } = useSettingsContext()
  const archive = useArchive()
  const autoArchive = useAutoArchive()
  const sessionNames = useSessionNames()
  const workstreams = useWorkstreams()

  // Destructure hook properties used in dependency arrays for lint compliance
  const { pruneStaleIds: pruneArchiveIds, isArchived, archiveByIds, archiveSession, syncComplete: archiveSyncComplete } = archive
  const { pruneStaleIds: pruneNameIds, getCustomName } = sessionNames
  const {
    pruneStaleIds: pruneWorkstreamIds,
    getWorkstream,
    getDescription,
    renameWorkstream,
    autoGroupByRepository,
  } = workstreams
  const { rules: autoArchiveRules, getMatchingSessionIds } = autoArchive
  const [allSessions, setAllSessions] = useState<SessionSummary[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<Session | null>(null)
  const [selectedWorkstreamName, setSelectedWorkstreamName] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<SessionStatus | 'all'>('all')
  const [sourceFilter, setSourceFilter] = useState<'copilot' | 'claude' | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'network' | 'stats'>(
    settings.display.defaultViewMode,
  )
  const [showArchived, setShowArchived] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true)
  const [conversationSearchResults, setConversationSearchResults] = useState<Map<string, ConversationMatch>>(new Map())
  const [archivedSearchResults, setArchivedSearchResults] = useState<Map<string, ConversationMatch>>(new Map())
  const [isSearchingConversations, setIsSearchingConversations] = useState(false)
  const searchAbortRef = useRef<AbortController | null>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadSessionsAbortRef = useRef<AbortController | null>(null)
  const selectedIdRef = useRef<string | null>(null)

  // Keep ref in sync so loadSessions can refresh the selected detail
  useEffect(() => {
    selectedIdRef.current = selectedSessionId
  }, [selectedSessionId])

  const loadSessions = useCallback(async () => {
    // Abort any in-flight request to prevent stale responses arriving out-of-order
    if (loadSessionsAbortRef.current) {
      loadSessionsAbortRef.current.abort()
    }
    const controller = new AbortController()
    loadSessionsAbortRef.current = controller

    setIsLoading(true)
    setError(null)

    try {
      const sessions = await getSessions(showArchived, controller.signal)
      setAllSessions(sessions)

      // Only prune stale IDs when we have the FULL session list.
      // When showArchived=false the server excludes archived sessions,
      // so their IDs are absent from the response. Pruning against that
      // partial list would incorrectly wipe the client-side archive,
      // workstream assignments, and custom names for every archived session.
      if (showArchived) {
        const activeIds = sessions.map((session) => session.id)
        pruneArchiveIds(activeIds)
        pruneNameIds(activeIds)
        pruneWorkstreamIds(activeIds)
      }

      // Eagerly auto-select the first session on initial load so the
      // detail refresh below can fetch it in the same async flow. This
      // avoids an extra render cycle where the auto-select effect sets
      // the ID in one render and the detail-fetch effect starts the
      // request in the next — a gap that caused PlanViewer to not mount
      // in time to trigger its own plan fetch.
      if (!selectedIdRef.current && sessions.length > 0) {
        selectedIdRef.current = sessions[0].id
        setSelectedSessionId(sessions[0].id)
      }

      // Refresh selected session detail alongside list
      const currentId = selectedIdRef.current
      if (currentId) {
        try {
          const detail = await getSessionById(currentId, controller.signal)
          if (detail && selectedIdRef.current === currentId) {
            setSelectedSessionDetail(detail)
          }
        } catch { /* detail refresh is best-effort */ }
      }
    } catch (loadError) {
      // Silently ignore abort errors — a newer request has taken over
      if (loadError instanceof DOMException && loadError.name === 'AbortError') return
      const message =
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load sessions.'
      setError(message)
    } finally {
      // Only clear loading state if this controller is still current
      // (i.e., no newer request has superseded us)
      if (loadSessionsAbortRef.current === controller) {
        setIsLoading(false)
      }
    }
  }, [showArchived, pruneArchiveIds, pruneNameIds, pruneWorkstreamIds])

  const sessionsWithNames = useMemo(() => {
    return allSessions.map((session) => {
      const customName = getCustomName(session.id)
      return customName ? { ...session, name: customName } : session
    })
  }, [allSessions, getCustomName])

  // Auto-archive: apply rules to newly loaded sessions
  useEffect(() => {
    if (autoArchiveRules.length === 0 || sessionsWithNames.length === 0) return
    const toArchive = getMatchingSessionIds(sessionsWithNames)
      .filter((id) => !isArchived(id))
    if (toArchive.length > 0) {
      archiveByIds(toArchive)
    }
  }, [sessionsWithNames, autoArchiveRules, isArchived, archiveByIds, getMatchingSessionIds])

  // Wait for archive sync before first load so server has the exclude set
  useEffect(() => {
    if (!archiveSyncComplete) return
    void loadSessions()
  }, [loadSessions, archiveSyncComplete])

  // Abort any in-flight session load on unmount
  useEffect(() => {
    return () => {
      if (loadSessionsAbortRef.current) {
        loadSessionsAbortRef.current.abort()
      }
    }
  }, [])

  // Fetch full session detail when selection changes
  useEffect(() => {
    if (!selectedSessionId) {
      setSelectedSessionDetail(null)
      return
    }

    let cancelled = false
    getSessionById(selectedSessionId)
      .then((session) => {
        if (!cancelled && session) {
          setSelectedSessionDetail(session)
        } else if (!cancelled) {
          setSelectedSessionDetail(null)
        }
      })
      .catch(() => {
        if (!cancelled) setSelectedSessionDetail(null)
      })

    return () => { cancelled = true }
  }, [selectedSessionId])

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

  // Debounced conversation search via API
  useEffect(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current)
      searchTimerRef.current = null
    }
    if (searchAbortRef.current) {
      searchAbortRef.current.abort()
      searchAbortRef.current = null
    }

    if (searchQuery.trim().length < 3) {
      setConversationSearchResults(new Map())
      setArchivedSearchResults(new Map())
      setIsSearchingConversations(false)
      return
    }

    setIsSearchingConversations(true)

    searchTimerRef.current = setTimeout(() => {
      const controller = new AbortController()
      searchAbortRef.current = controller

      fetch(`/api/sessions/search?q=${encodeURIComponent(searchQuery.trim())}`, {
        signal: controller.signal,
      })
        .then((res) => {
          if (!res.ok) throw new Error(`Search failed: ${res.status}`)
          return res.json()
        })
        .then((results: { sessionId: string; matchType: string; snippet: string; isArchived?: boolean }[]) => {
          const map = new Map<string, ConversationMatch>()
          const archivedMap = new Map<string, ConversationMatch>()
          for (const r of results) {
            const match: ConversationMatch = { snippet: r.snippet, matchType: r.matchType, isArchived: r.isArchived }
            // Keep first (best) match per session
            if (r.isArchived && !showArchived) {
              if (!archivedMap.has(r.sessionId)) {
                archivedMap.set(r.sessionId, match)
              }
            } else {
              if (!map.has(r.sessionId)) {
                map.set(r.sessionId, match)
              }
            }
          }
          setConversationSearchResults(map)
          setArchivedSearchResults(archivedMap)
          setIsSearchingConversations(false)
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === 'AbortError') return
          setIsSearchingConversations(false)
        })
    }, 300)

    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current)
      }
      if (searchAbortRef.current) {
        searchAbortRef.current.abort()
      }
    }
  }, [searchQuery, showArchived])

  const sessions = useMemo(() => {
    let filtered = sessionsWithNames

    if (!showArchived) {
      filtered = filtered.filter((session) => !isArchived(session.id))
    }

    if (!settings.display.showCompletedSessions) {
      filtered = filtered.filter((session) => session.status !== 'completed')
    }

    filtered = filterSessionsByStatus(filtered, statusFilter)

    if (sourceFilter !== 'all') {
      filtered = filtered.filter((s) => (s.source ?? 'copilot') === sourceFilter)
    }

    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase()
      filtered = filtered.filter(
        (s) =>
          s.id.toLowerCase().includes(query) ||
          s.name.toLowerCase().includes(query) ||
          s.intent.toLowerCase().includes(query) ||
          conversationSearchResults.has(s.id),
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
    sourceFilter,
    searchQuery,
    conversationSearchResults,
    settings.display.showCompletedSessions,
    settings.display.sortOrder,
    isArchived,
  ])

  const statusCounts = useMemo(() => {
    const base = showArchived
      ? sessionsWithNames
      : sessionsWithNames.filter((session) => !isArchived(session.id))

    return getStatusCounts(base)
  }, [sessionsWithNames, showArchived, isArchived])

  const archiveAllCompleted = useCallback(() => {
    const completedIds = allSessions
      .filter((session) => session.status === 'completed')
      .map((session) => session.id)
    archiveByIds(completedIds)
  }, [allSessions, archiveByIds])

  const archiveAndSelectNext = useCallback(
    (id: string) => {
      // Find sibling sessions in the same workstream (or ungrouped)
      const ws = getWorkstream(id)
      const siblings = sessions.filter((s) => {
        const sWs = getWorkstream(s.id)
        return ws ? sWs === ws : !sWs
      })
      const idx = siblings.findIndex((s) => s.id === id)
      // Pick next sibling, or previous, or null
      const next =
        siblings[idx + 1] ?? siblings[idx - 1] ?? null
      archiveSession(id)
      if (next && next.id !== id) {
        setSelectedSessionId(next.id)
      }
    },
    [sessions, getWorkstream, archiveSession],
  )

  const archivedCount = useMemo(
    () => allSessions.filter((session) => isArchived(session.id)).length,
    [allSessions, isArchived],
  )

  const selectedSession = useMemo<Session | null>(() => {
    if (!selectedSessionDetail) return null
    // Apply custom name to the fetched detail
    const customName = getCustomName(selectedSessionDetail.id)
    return customName ? { ...selectedSessionDetail, name: customName } : selectedSessionDetail
  }, [selectedSessionDetail, getCustomName])

  const groupedSessions = useMemo(() => {
    const groups = new Map<string, SessionSummary[]>()
    const ungrouped: SessionSummary[] = []

    for (const session of sessions) {
      const ws = getWorkstream(session.id)
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
        description: getDescription(name),
      }))

    return { groups: sortedGroups, ungrouped }
  }, [sessions, getWorkstream, getDescription])

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
      renameWorkstream(oldName, newName)
      if (selectedWorkstreamName === oldName) {
        setSelectedWorkstreamName(newName)
      }
    },
    [renameWorkstream, selectedWorkstreamName],
  )

  const refreshSessions = useCallback(() => {
    void loadSessions()
  }, [loadSessions])

  const toggleAutoRefresh = useCallback(() => {
    setAutoRefreshEnabled((enabled) => !enabled)
  }, [])

  const handleAutoGroupByRepository = useCallback(() => {
    autoGroupByRepository(sessions)
  }, [autoGroupByRepository, sessions])

  return {
    sessions,
    allSessions: sessionsWithNames,
    selectedSession,
    selectedWorkstream,
    statusFilter,
    sourceFilter,
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
    setSourceFilter,
    setSearchQuery,
    setViewMode,
    setShowArchived,
    isArchived,
    archiveSession,
    unarchiveSession: archive.unarchiveSession,
    toggleArchive: archive.toggleArchive,
    archiveAndSelectNext,
    archiveAllCompleted,
    refreshSessions,
    toggleAutoRefresh,
    getWorkstream,
    setWorkstream: workstreams.setWorkstream,
    removeWorkstream: workstreams.removeWorkstream,
    getCustomName,
    setSessionName: sessionNames.setCustomName,
    removeSessionName: sessionNames.removeCustomName,
    getWorkstreamNames: workstreams.getWorkstreamNames,
    renameWorkstream: handleRenameWorkstream,
    deleteWorkstream: workstreams.deleteWorkstream,
    setWorkstreamDescription: workstreams.setDescription,
    removeWorkstreamDescription: workstreams.removeDescription,
    autoGroupByRepository: handleAutoGroupByRepository,
    hasAnyWorkstreams: workstreams.hasAnyWorkstreams,
    groupedSessions,
    conversationSearchResults,
    archivedSearchResults,
    isSearchingConversations,
    archiveSynced: archive.synced,
    autoArchive,
  }
}
