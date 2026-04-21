import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useSessions, type UseSessionsResult, type SessionGroup, type ConversationMatch } from '../hooks/useSessions'
import type { Session, SessionSummary, SessionStatus, StatusCounts } from '../types'
import type { WorkstreamRegistryEntry } from '../hooks/useWorkstreams'
import type { UseAutoArchiveResult } from '../hooks/useAutoArchive'

/* ──────────────────────────────────────────────────────────────
 * Split SessionContext into three focused contexts to reduce
 * re-render cascades. Clicking a session only re-renders
 * SelectionContext consumers; polling only re-renders
 * DataContext consumers; action refs are stable.
 * ────────────────────────────────────────────────────────────── */

// ── Data Context — changes on poll / filter / search ──────────
export interface SessionDataContextValue {
  sessions: SessionSummary[]
  allSessions: SessionSummary[]
  statusCounts: StatusCounts
  archivedCount: number
  isLoading: boolean
  error: string | null
  statusFilter: SessionStatus | 'all'
  sourceFilter: 'copilot' | 'claude' | 'all'
  searchQuery: string
  viewMode: 'list' | 'network' | 'stats'
  showArchived: boolean
  autoRefreshEnabled: boolean
  groupedSessions: { groups: SessionGroup[]; ungrouped: SessionSummary[] }
  hasAnyWorkstreams: boolean
  conversationSearchResults: Map<string, ConversationMatch>
  archivedSearchResults: Map<string, ConversationMatch>
  isSearchingConversations: boolean
  archiveSynced: boolean
  autoArchive: UseAutoArchiveResult
  getWorkstreamNames: string[]
  workstreamRegistry: Readonly<Record<string, WorkstreamRegistryEntry>>
}

// ── Selection Context — changes on click ──────────────────────
export interface SessionSelectionContextValue {
  selectedSession: Session | null
  selectedSessionId: string | null
  selectedWorkstream: SessionGroup | null
  selectSession: (id: string) => void
  selectWorkstream: (name: string) => void
  clearSelection: () => void
}

// ── Actions Context — stable callbacks, rarely changes ────────
export interface SessionActionsContextValue {
  setStatusFilter: (status: SessionStatus | 'all') => void
  setSourceFilter: (source: 'copilot' | 'claude' | 'all') => void
  setSearchQuery: (query: string) => void
  setViewMode: (mode: 'list' | 'network' | 'stats') => void
  setShowArchived: (show: boolean) => void
  refreshSessions: () => void
  toggleAutoRefresh: () => void
  isArchived: (id: string) => boolean
  archiveSession: (id: string) => void
  unarchiveSession: (id: string) => void
  toggleArchive: (id: string) => void
  archiveAndSelectNext: (id: string) => void
  archiveAllCompleted: () => void
  getWorkstream: (sessionId: string) => string | null
  setWorkstream: (sessionId: string, name: string) => void
  removeWorkstream: (sessionId: string) => void
  getCustomName: (sessionId: string) => string | null
  setSessionName: (sessionId: string, name: string) => void
  removeSessionName: (sessionId: string) => void
  renameWorkstream: (oldName: string, newName: string) => void
  deleteWorkstream: (name: string) => void
  archiveWorkstream: (name: string) => void
  setWorkstreamDescription: (workstreamName: string, description: string) => void
  removeWorkstreamDescription: (workstreamName: string) => void
  autoGroupByRepository: () => void
  createWorkstream: (name: string, opts?: { repoPath?: string; pendingLaunchId?: string; description?: string }) => void
  updateWorkstreamRegistry: (name: string, updates: Partial<WorkstreamRegistryEntry>) => void
}

const SessionDataContext = createContext<SessionDataContextValue | null>(null)
const SessionSelectionContext = createContext<SessionSelectionContextValue | null>(null)
const SessionActionsContext = createContext<SessionActionsContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const s = useSessions()

  const dataValue = useMemo<SessionDataContextValue>(() => ({
    sessions: s.sessions,
    allSessions: s.allSessions,
    statusCounts: s.statusCounts,
    archivedCount: s.archivedCount,
    isLoading: s.isLoading,
    error: s.error,
    statusFilter: s.statusFilter,
    sourceFilter: s.sourceFilter,
    searchQuery: s.searchQuery,
    viewMode: s.viewMode,
    showArchived: s.showArchived,
    autoRefreshEnabled: s.autoRefreshEnabled,
    groupedSessions: s.groupedSessions,
    hasAnyWorkstreams: s.hasAnyWorkstreams,
    conversationSearchResults: s.conversationSearchResults,
    archivedSearchResults: s.archivedSearchResults,
    isSearchingConversations: s.isSearchingConversations,
    archiveSynced: s.archiveSynced,
    autoArchive: s.autoArchive,
    getWorkstreamNames: s.getWorkstreamNames,
    workstreamRegistry: s.workstreamRegistry,
  }), [
    s.sessions, s.allSessions, s.statusCounts, s.archivedCount,
    s.isLoading, s.error, s.statusFilter, s.sourceFilter, s.searchQuery, s.viewMode,
    s.showArchived, s.autoRefreshEnabled, s.groupedSessions,
    s.hasAnyWorkstreams, s.conversationSearchResults, s.archivedSearchResults,
    s.isSearchingConversations, s.archiveSynced, s.autoArchive, s.getWorkstreamNames,
    s.workstreamRegistry,
  ])

  const selectionValue = useMemo<SessionSelectionContextValue>(() => ({
    selectedSession: s.selectedSession,
    selectedSessionId: s.selectedSessionId,
    selectedWorkstream: s.selectedWorkstream,
    selectSession: s.selectSession,
    selectWorkstream: s.selectWorkstream,
    clearSelection: s.clearSelection,
  }), [
    s.selectedSession, s.selectedSessionId, s.selectedWorkstream,
    s.selectSession, s.selectWorkstream, s.clearSelection,
  ])

  const actionsValue = useMemo<SessionActionsContextValue>(() => ({
    setStatusFilter: s.setStatusFilter,
    setSourceFilter: s.setSourceFilter,
    setSearchQuery: s.setSearchQuery,
    setViewMode: s.setViewMode,
    setShowArchived: s.setShowArchived,
    refreshSessions: s.refreshSessions,
    toggleAutoRefresh: s.toggleAutoRefresh,
    isArchived: s.isArchived,
    archiveSession: s.archiveSession,
    unarchiveSession: s.unarchiveSession,
    toggleArchive: s.toggleArchive,
    archiveAndSelectNext: s.archiveAndSelectNext,
    archiveAllCompleted: s.archiveAllCompleted,
    getWorkstream: s.getWorkstream,
    setWorkstream: s.setWorkstream,
    removeWorkstream: s.removeWorkstream,
    getCustomName: s.getCustomName,
    setSessionName: s.setSessionName,
    removeSessionName: s.removeSessionName,
    renameWorkstream: s.renameWorkstream,
    deleteWorkstream: s.deleteWorkstream,
    archiveWorkstream: s.archiveWorkstream,
    setWorkstreamDescription: s.setWorkstreamDescription,
    removeWorkstreamDescription: s.removeWorkstreamDescription,
    autoGroupByRepository: s.autoGroupByRepository,
    createWorkstream: s.createWorkstream,
    updateWorkstreamRegistry: s.updateWorkstreamRegistry,
  }), [
    s.setStatusFilter, s.setSourceFilter, s.setSearchQuery, s.setViewMode, s.setShowArchived,
    s.refreshSessions, s.toggleAutoRefresh, s.isArchived, s.archiveSession,
    s.unarchiveSession, s.toggleArchive, s.archiveAndSelectNext,
    s.archiveAllCompleted, s.getWorkstream, s.setWorkstream,
    s.removeWorkstream, s.getCustomName, s.setSessionName,
    s.removeSessionName, s.renameWorkstream, s.deleteWorkstream, s.archiveWorkstream,
    s.setWorkstreamDescription, s.removeWorkstreamDescription,
    s.autoGroupByRepository, s.createWorkstream, s.updateWorkstreamRegistry,
  ])

  return (
    <SessionDataContext.Provider value={dataValue}>
      <SessionSelectionContext.Provider value={selectionValue}>
        <SessionActionsContext.Provider value={actionsValue}>
          {children}
        </SessionActionsContext.Provider>
      </SessionSelectionContext.Provider>
    </SessionDataContext.Provider>
  )
}

// ── Focused hooks — prefer these to minimize re-renders ───────

// eslint-disable-next-line react-refresh/only-export-components
export function useSessionData(): SessionDataContextValue {
  const ctx = useContext(SessionDataContext)
  if (!ctx) throw new Error('useSessionData must be used within SessionProvider')
  return ctx
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSessionSelection(): SessionSelectionContextValue {
  const ctx = useContext(SessionSelectionContext)
  if (!ctx) throw new Error('useSessionSelection must be used within SessionProvider')
  return ctx
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSessionActions(): SessionActionsContextValue {
  const ctx = useContext(SessionActionsContext)
  if (!ctx) throw new Error('useSessionActions must be used within SessionProvider')
  return ctx
}

/** @deprecated Use useSessionData / useSessionSelection / useSessionActions instead */
// eslint-disable-next-line react-refresh/only-export-components
export function useSessionContext(): UseSessionsResult {
  const data = useSessionData()
  const selection = useSessionSelection()
  const actions = useSessionActions()
  return { ...data, ...selection, ...actions }
}
