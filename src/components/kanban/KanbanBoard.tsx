import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
  type CollisionDetection,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import type { SessionSummary } from '../../types';
import { useSessionData, useSessionSelection, useSessionActions } from '../../context/SessionContext';
import { useTerminalContext } from '../../context/TerminalContext';
import { useColumnOrder } from '../../hooks/useColumnOrder';
import StatusSummaryBar from '../common/StatusSummaryBar';
import StatusFilter from '../filters/StatusFilter';
import KanbanColumn, { COLUMN_SORTABLE_PREFIX } from './KanbanColumn';
import KanbanTile from './KanbanTile';
import WelcomeCard from '../sessions/WelcomeCard';
import NewWorkstreamDialog from './NewWorkstreamDialog';

/* ─────────────────────────────────────────────────────────
 * KanbanBoard
 * ─────────────────────────────────────────────────────────
 * Horizontal board with one column per workstream.
 * Sessions are drag-and-droppable between columns to
 * reassign their workstream. Columns themselves can be
 * dragged to reorder via a grip handle in the header.
 * ───────────────────────────────────────────────────────── */

const UNGROUPED_ID = '__ungrouped__';

/* Custom collision detection that filters droppables by drag type
   to avoid cross-interference between column and tile drags. */
const typedCollision: CollisionDetection = (args) => {
  const activeType = args.active.data.current?.type;

  if (activeType === 'column') {
    // Only consider column sortable droppables
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (c) => c.data.current?.type === 'column',
      ),
    });
  }

  // For tile drags, exclude column sortable droppables
  return closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter(
      (c) => c.data.current?.type !== 'column',
    ),
  });
};

export default function KanbanBoard() {
  const {
    sessions,
    allSessions,
    isLoading,
    error,
    searchQuery,
    showArchived,
    archivedCount,
    hasAnyWorkstreams,
    groupedSessions,
    conversationSearchResults,
    isSearchingConversations,
    autoArchive,
    workstreamRegistry,
  } = useSessionData();
  const {
    selectedSession,
    selectSession,
    selectWorkstream,
  } = useSessionSelection();
  const {
    setSearchQuery,
    setShowArchived,
    isArchived,
    archiveSession,
    archiveAllCompleted,
    getWorkstream,
    setWorkstream,
    removeWorkstream,
    autoGroupByRepository,
    archiveWorkstream,
    updateWorkstreamRegistry,
    toggleFavorite,
  } = useSessionActions();

  const { openLaunchTerminal } = useTerminalContext();

  const { reorderColumns, getOrderedNames } = useColumnOrder();

  const [activeDragSession, setActiveDragSession] = useState<SessionSummary | null>(null);
  const [activeDragColumnName, setActiveDragColumnName] = useState<string | null>(null);
  const [showNewWorkstream, setShowNewWorkstream] = useState(false);
  const [newWorkstreamDefaultPath, setNewWorkstreamDefaultPath] = useState<string | undefined>();

  // Cached agent detection for quick in-column session launches
  type AgentType = 'copilot' | 'claude' | 'shell';
  const agentCacheRef = useRef<{ agents: AgentType | null; fetched: boolean }>({ agents: null, fetched: false });

  useEffect(() => {
    if (agentCacheRef.current.fetched) return;
    agentCacheRef.current.fetched = true;
    fetch('/api/workstreams/agents')
      .then((res) => (res.ok ? (res.json() as Promise<{ copilot: boolean; claude: boolean }>) : null))
      .then((data) => {
        if (!data) { agentCacheRef.current.agents = 'shell'; return; }
        if (data.copilot) agentCacheRef.current.agents = 'copilot';
        else if (data.claude) agentCacheRef.current.agents = 'claude';
        else agentCacheRef.current.agents = 'shell';
      })
      .catch(() => { agentCacheRef.current.agents = 'shell'; });
  }, []);

  // Configure pointer sensor with a small activation distance to distinguish clicks from drags
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  /* ── Archive-related derived state ───────────────── */
  const hasCompletedNonArchived = allSessions.some(
    (s) => s.status === 'completed' && !isArchived(s.id),
  );
  const showArchiveControls = archivedCount > 0 || hasCompletedNonArchived;
  const activeRuleCount = autoArchive.rules.filter((r) => r.enabled).length;

  /* ── Build columns from grouped sessions, respecting persisted order ──────── */
  const columns = useMemo(() => {
    const cols: { id: string; name: string; sessions: SessionSummary[] }[] = [];

    const groupNames = groupedSessions.groups.map((g) => g.name);
    const orderedNames = getOrderedNames(groupNames);

    for (const name of orderedNames) {
      const group = groupedSessions.groups.find((g) => g.name === name);
      if (group) {
        cols.push({ id: group.name, name: group.name, sessions: group.sessions });
      }
    }

    // Ungrouped column always goes last
    cols.push({
      id: UNGROUPED_ID,
      name: 'Ungrouped',
      sessions: groupedSessions.ungrouped,
    });

    return cols;
  }, [groupedSessions, getOrderedNames]);

  // If there are no workstreams at all, put everything in a single "All Sessions" column
  const effectiveColumns = useMemo(() => {
    if (!hasAnyWorkstreams) {
      return [{ id: UNGROUPED_ID, name: 'All Sessions', sessions }];
    }
    let cols = columns;
    // Filter out empty columns only when search/status filter is active
    if (searchQuery.trim()) {
      cols = cols.filter((c) => c.sessions.length > 0);
    }
    // Sort favorited workstreams before non-favorited; Ungrouped always last.
    // Uses live workstreamRegistry so toggling ★ immediately reorders columns.
    return [...cols].sort((a, b) => {
      const aIsUngrouped = a.id === UNGROUPED_ID;
      const bIsUngrouped = b.id === UNGROUPED_ID;
      if (aIsUngrouped && !bIsUngrouped) return 1;
      if (!aIsUngrouped && bIsUngrouped) return -1;
      const aFav = workstreamRegistry[a.name]?.favorited ? 1 : 0;
      const bFav = workstreamRegistry[b.name]?.favorited ? 1 : 0;
      if (aFav !== bFav) return bFav - aFav;
      return 0; // preserve existing order within group
    });
  }, [columns, sessions, hasAnyWorkstreams, searchQuery, workstreamRegistry]);

  // Column sortable ids for SortableContext (all columns, Ungrouped disabled via prop)
  const columnSortableIds = useMemo(
    () => effectiveColumns.map((col) => `${COLUMN_SORTABLE_PREFIX}${col.id}`),
    [effectiveColumns],
  );

  /* ── Drag handlers ─────────────────────────────── */
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const dragType = event.active.data.current?.type as string | undefined;

      if (dragType === 'column') {
        setActiveDragColumnName(event.active.data.current?.columnName as string);
        setActiveDragSession(null);
      } else {
        const sessionId = event.active.id as string;
        const session = sessions.find((s) => s.id === sessionId) ?? null;
        setActiveDragSession(session);
        setActiveDragColumnName(null);
      }
    },
    [sessions],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragSession(null);
      setActiveDragColumnName(null);

      const { active, over } = event;
      if (!over) return;

      const activeType = active.data.current?.type;

      if (activeType === 'column') {
        // ── Column reorder ──
        const activeColId = active.data.current?.columnId as string;
        let overColId = over.data.current?.columnId as string | undefined;

        if (!overColId) {
          const overId = over.id as string;
          if (overId.startsWith(COLUMN_SORTABLE_PREFIX)) {
            overColId = overId.slice(COLUMN_SORTABLE_PREFIX.length);
          }
        }

        if (activeColId && overColId && activeColId !== overColId) {
          reorderColumns(activeColId, overColId);
        }
        return;
      }

      // ── Tile drag (existing logic) ──
      const sessionId = active.id as string;

      let targetColumnId: string | null = null;
      const overData = over.data?.current;

      if (overData?.columnId) {
        targetColumnId = overData.columnId as string;
      } else if (overData?.session) {
        const targetSession = overData.session as SessionSummary;
        const ws = getWorkstream(targetSession.id);
        targetColumnId = ws ?? UNGROUPED_ID;
      } else {
        targetColumnId = over.id as string;
      }

      if (!targetColumnId) return;

      const sourceWorkstream = getWorkstream(sessionId);
      const sourceColumnId = sourceWorkstream ?? UNGROUPED_ID;

      if (sourceColumnId === targetColumnId) return;

      if (targetColumnId === UNGROUPED_ID) {
        removeWorkstream(sessionId);
      } else {
        setWorkstream(sessionId, targetColumnId);
      }
    },
    [getWorkstream, setWorkstream, removeWorkstream, reorderColumns],
  );

  const handleSelectSession = useCallback(
    (session: SessionSummary) => {
      selectSession(session.id);
    },
    [selectSession],
  );

  const handleNewSessionFromColumn = useCallback(
    async (colId: string, colSessions: SessionSummary[]) => {
      // Determine repo path: most-common cwd from column sessions, or registry repoPath
      const cwds = colSessions.map((s) => s.cwd).filter(Boolean) as string[];
      let repoPath: string | undefined;

      if (cwds.length > 0) {
        const freq = new Map<string, number>();
        for (const c of cwds) freq.set(c, (freq.get(c) ?? 0) + 1);
        let maxCount = 0;
        for (const [path, count] of freq) {
          if (count > maxCount) { maxCount = count; repoPath = path; }
        }
      } else {
        repoPath = workstreamRegistry[colId]?.repoPath;
      }

      // If no repo path available, fall back to opening the dialog with workstream pre-context
      if (!repoPath) {
        setNewWorkstreamDefaultPath(undefined);
        setShowNewWorkstream(true);
        return;
      }

      const agentType = agentCacheRef.current.agents ?? 'shell';

      try {
        const res = await fetch('/api/workstreams/launch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repoPath, agentType }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null) as { error?: string } | null;
          throw new Error(body?.error ?? `Launch failed (${res.status})`);
        }

        const { launchId, normalizedPath } = (await res.json()) as {
          launchId: string;
          normalizedPath: string;
        };

        // Link this launch to the existing workstream
        updateWorkstreamRegistry(colId, { pendingLaunchId: launchId, pendingLaunchAt: new Date().toISOString(), repoPath: normalizedPath });

        openLaunchTerminal(launchId, colId, normalizedPath);
      } catch (err) {
        // On failure, fall back to dialog
        console.error('Quick session launch failed:', err);
        setNewWorkstreamDefaultPath(repoPath);
        setShowNewWorkstream(true);
      }
    },
    [workstreamRegistry, updateWorkstreamRegistry, openLaunchTerminal],
  );

  // Column being dragged (for overlay ghost)
  const activeDragColumn = useMemo(() => {
    if (!activeDragColumnName) return null;
    return effectiveColumns.find((col) => col.name === activeDragColumnName) ?? null;
  }, [activeDragColumnName, effectiveColumns]);

  const showSkeletons = isLoading && sessions.length === 0;
  const showErrorState = !isLoading && Boolean(error) && sessions.length === 0;
  const showEmptyState = !isLoading && !error && sessions.length === 0 && !searchQuery.trim();

  return (
    <section className="flex h-full flex-col bg-surface-primary">
      {/* ── Top bar: summary / search / status filter ── */}
      <div className="shrink-0 space-y-2 border-b border-border-default bg-surface-primary p-3">
        <StatusSummaryBar />

        <div className="relative">
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg/35"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
          <input
            type="text"
            placeholder="Search sessions…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface-secondary border border-border-default rounded-lg px-3 py-1.5 pl-8 text-sm text-fg/80 placeholder:text-fg/25 focus:outline-none focus:ring-1 focus:ring-border-active"
          />
          {searchQuery ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-fg/45 transition hover:text-fg/80"
            >
              ✕
            </button>
          ) : null}
        </div>

        {/* Conversation search indicator */}
        {isSearchingConversations && (
          <div className="flex items-center gap-1.5 px-1 text-[11px] text-fg/35">
            <svg className="h-3 w-3 animate-spin" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.3" />
              <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Searching conversations…
          </div>
        )}
        {!isSearchingConversations && searchQuery.trim().length >= 3 && conversationSearchResults.size > 0 && (
          <div className="px-1 text-[11px] text-amber-400/60">
            💬 {conversationSearchResults.size} conversation {conversationSearchResults.size === 1 ? 'match' : 'matches'}
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-lg bg-surface-secondary">
            <StatusFilter />
          </div>

          <button
            type="button"
            title="Auto-group sessions by repository"
            onClick={autoGroupByRepository}
            className="
              inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border-default
              bg-surface-secondary px-2.5 py-1.5 text-xs text-fg/55
              transition-colors duration-150
              hover:border-border-active hover:text-fg/80
            "
          >
            <svg
              aria-hidden="true"
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            Auto-group
          </button>

          <button
            type="button"
            title="Create a new workstream"
            onClick={() => {
              setNewWorkstreamDefaultPath(undefined);
              setShowNewWorkstream(true);
            }}
            className="
              inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border-default
              bg-surface-secondary px-2.5 py-1.5 text-xs text-fg/55
              transition-colors duration-150
              hover:border-border-active hover:text-fg/80
            "
          >
            <svg
              aria-hidden="true"
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Workstream
          </button>
        </div>
      </div>

      {/* ── Archive controls ── */}
      {showArchiveControls && (
        <div className="flex shrink-0 items-center justify-between border-b border-border-default/60 px-3 py-1.5 text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={showArchived}
              aria-label={`Show archived sessions (${archivedCount})`}
              onClick={() => setShowArchived(!showArchived)}
              className={`
                relative inline-flex h-[16px] w-[28px] shrink-0 cursor-pointer items-center
                rounded-full transition-colors duration-200 ease-in-out
                focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-active focus-visible:ring-offset-1 focus-visible:ring-offset-surface-primary
                ${showArchived ? 'bg-border-active' : 'bg-surface-tertiary'}
              `}
            >
              <span
                aria-hidden="true"
                className={`
                  pointer-events-none inline-block h-[10px] w-[10px] rounded-full bg-fg/80
                  shadow-sm transition-transform duration-200 ease-in-out
                  ${showArchived ? 'translate-x-[14px]' : 'translate-x-[3px]'}
                `}
              />
            </button>
            <span className="select-none text-fg/50">Show Archived</span>
            {archivedCount > 0 && (
              <span className="tabular-nums text-fg/30">({archivedCount})</span>
            )}
          </div>

          <button
            type="button"
            disabled={!hasCompletedNonArchived}
            onClick={archiveAllCompleted}
            className="
              inline-flex items-center gap-1 text-fg/40
              transition-colors duration-150
              enabled:cursor-pointer enabled:hover:text-fg/60
              disabled:cursor-not-allowed disabled:opacity-40
            "
          >
            <svg
              aria-hidden="true"
              className="h-3 w-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="3" width="20" height="6" rx="1" />
              <path d="M2 9v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9" />
              <path d="M10 13h4" />
            </svg>
            Archive All Completed
          </button>
        </div>
      )}

      {/* ── Auto-archive rules indicator ── */}
      {activeRuleCount > 0 && (
        <div className="flex shrink-0 items-center border-b border-border-default/60 px-3 py-1 text-xs">
          <span className="flex items-center gap-1.5 text-fg/35" title="Auto-archive rules are filtering sessions">
            <span aria-hidden="true">🔕</span>
            <span>{activeRuleCount} auto-archive {activeRuleCount === 1 ? 'rule' : 'rules'} active</span>
          </span>
        </div>
      )}

      {/* ── Board area ── */}
      <div className="flex-1 overflow-hidden min-h-0">
        {showSkeletons ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex gap-4 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="w-[320px] animate-pulse rounded-lg bg-surface-secondary/60 h-64" />
              ))}
            </div>
          </div>
        ) : showErrorState ? (
          <div className="flex h-full items-center justify-center text-center">
            <div className="space-y-2">
              <div className="text-2xl opacity-40" aria-hidden="true">⚠️</div>
              <p className="text-sm text-red-300">Failed to load sessions</p>
              <p className="max-w-xs text-xs text-fg/45">{error}</p>
            </div>
          </div>
        ) : showEmptyState ? (
          <WelcomeCard />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={typedCollision}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={columnSortableIds} strategy={horizontalListSortingStrategy}>
              <div className="flex h-full gap-4 overflow-x-auto p-4 kanban-scrollable">
                {effectiveColumns.map((col) => (
                  <KanbanColumn
                    key={col.id}
                    id={col.id}
                    name={col.name}
                    sessions={col.sessions}
                    selectedSessionId={selectedSession?.id ?? null}
                    onSelectSession={handleSelectSession}
                    onSelectWorkstream={
                      col.id !== UNGROUPED_ID && col.name !== 'All Sessions'
                        ? () => selectWorkstream(col.name)
                        : undefined
                    }
                    onArchive={archiveSession}
                    onArchiveWorkstream={
                      col.id !== UNGROUPED_ID && col.name !== 'All Sessions'
                        ? () => {
                            col.sessions.forEach((s) => archiveSession(s.id));
                            archiveWorkstream(col.name);
                          }
                        : undefined
                    }
                    onNewSession={
                      col.id !== UNGROUPED_ID && col.name !== 'All Sessions'
                        ? () => handleNewSessionFromColumn(col.id, col.sessions)
                        : undefined
                    }
                    isFavorited={Boolean(workstreamRegistry[col.name]?.favorited)}
                    onToggleFavorite={
                      col.id !== UNGROUPED_ID && col.name !== 'All Sessions'
                        ? () => toggleFavorite(col.name)
                        : undefined
                    }
                    isSortable={col.id !== UNGROUPED_ID && col.name !== 'All Sessions'}
                    conversationSearchResults={conversationSearchResults}
                    searchQuery={searchQuery}
                  />
                ))}
              </div>
            </SortableContext>

            {/* Ghost overlay following cursor during drag */}
            <DragOverlay dropAnimation={null}>
              {activeDragSession ? (
                <div className="w-[296px] opacity-80 rotate-[2deg] pointer-events-none">
                  <KanbanTile
                    session={activeDragSession}
                    isSelected={false}
                    onSelect={() => {}}
                  />
                </div>
              ) : activeDragColumn ? (
                <div className="w-[320px] opacity-85 pointer-events-none">
                  <div className="rounded-lg border border-border-active/60 bg-surface-secondary/90 backdrop-blur-sm shadow-lg shadow-black/20">
                    <div className="flex items-center justify-between gap-2 px-3 py-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="shrink-0 text-fg/40 select-none">⠿</span>
                        <span className="truncate text-xs font-semibold uppercase tracking-wider text-fg/60">
                          {activeDragColumn.name}
                        </span>
                      </div>
                      <span className="shrink-0 rounded-full bg-surface-tertiary px-2 py-0.5 text-[10px] font-mono tabular-nums text-fg/40">
                        {activeDragColumn.sessions.length}
                      </span>
                    </div>
                    {activeDragColumn.sessions.length > 0 && (
                      <div className="border-t border-border-default/30 px-3 py-2 text-[10px] text-fg/25 italic">
                        {activeDragColumn.sessions.length} session{activeDragColumn.sessions.length !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* Scrollbar styles for kanban */}
      <style>{kanbanScrollbarCSS}</style>

      <NewWorkstreamDialog
        isOpen={showNewWorkstream}
        onClose={() => setShowNewWorkstream(false)}
        sessions={allSessions}
        defaultRepoPath={newWorkstreamDefaultPath}
      />
    </section>
  );
}

const kanbanScrollbarCSS = `
  .kanban-scrollable::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  .kanban-scrollable::-webkit-scrollbar-track {
    background: transparent;
  }
  .kanban-scrollable::-webkit-scrollbar-thumb {
    background: var(--color-border-default);
    border-radius: 9999px;
  }
  .kanban-scrollable::-webkit-scrollbar-thumb:hover {
    background: var(--color-surface-hover);
  }
  .kanban-scrollable {
    scrollbar-width: thin;
    scrollbar-color: var(--color-border-default) transparent;
  }
`;
