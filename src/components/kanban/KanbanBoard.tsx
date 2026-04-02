import { useState, useMemo, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { Session } from '../../types';
import { useSessionContext } from '../../context/SessionContext';
import StatusSummaryBar from '../common/StatusSummaryBar';
import StatusFilter from '../filters/StatusFilter';
import KanbanColumn from './KanbanColumn';
import KanbanTile from './KanbanTile';

/* ─────────────────────────────────────────────────────────
 * KanbanBoard
 * ─────────────────────────────────────────────────────────
 * Horizontal board with one column per workstream.
 * Sessions are drag-and-droppable between columns to
 * reassign their workstream.
 * ───────────────────────────────────────────────────────── */

const UNGROUPED_ID = '__ungrouped__';

export default function KanbanBoard() {
  const {
    sessions,
    allSessions,
    selectedSession,
    selectedWorkstream,
    selectSession,
    selectWorkstream,
    isLoading,
    error,
    searchQuery,
    setSearchQuery,
    showArchived,
    setShowArchived,
    isArchived,
    toggleArchive,
    archiveAllCompleted,
    archivedCount,
    getWorkstream,
    setWorkstream,
    removeWorkstream,
    hasAnyWorkstreams,
    groupedSessions,
  } = useSessionContext();

  const [activeDragSession, setActiveDragSession] = useState<Session | null>(null);

  // Configure pointer sensor with a small activation distance to distinguish clicks from drags
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  /* ── Archive-related derived state ───────────────── */
  const hasCompletedNonArchived = allSessions.some(
    (s) => s.status === 'completed' && !isArchived(s.id),
  );
  const showArchiveControls = archivedCount > 0 || hasCompletedNonArchived;

  /* ── Build columns from grouped sessions ──────── */
  const columns = useMemo(() => {
    const cols: { id: string; name: string; sessions: Session[] }[] = [];

    for (const group of groupedSessions.groups) {
      cols.push({
        id: group.name,
        name: group.name,
        sessions: group.sessions,
      });
    }

    // Ungrouped column always goes last
    cols.push({
      id: UNGROUPED_ID,
      name: 'Ungrouped',
      sessions: groupedSessions.ungrouped,
    });

    return cols;
  }, [groupedSessions]);

  // If there are no workstreams at all, put everything in a single "All Sessions" column
  const effectiveColumns = useMemo(() => {
    if (!hasAnyWorkstreams) {
      return [{ id: UNGROUPED_ID, name: 'All Sessions', sessions }];
    }
    // Filter out empty columns only when search/status filter is active
    if (searchQuery.trim()) {
      return columns.filter((c) => c.sessions.length > 0);
    }
    return columns;
  }, [columns, sessions, hasAnyWorkstreams, searchQuery]);

  /* ── Drag handlers ─────────────────────────────── */
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const sessionId = event.active.id as string;
      const session = sessions.find((s) => s.id === sessionId) ?? null;
      setActiveDragSession(session);
    },
    [sessions],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragSession(null);

      const { active, over } = event;
      if (!over) return;

      const sessionId = active.id as string;

      // Determine the target column
      let targetColumnId: string | null = null;
      const overData = over.data?.current;

      if (overData?.columnId) {
        // Dropped directly on a column droppable
        targetColumnId = overData.columnId as string;
      } else if (overData?.session) {
        // Dropped on another tile — find which column the target tile belongs to
        const targetSession = overData.session as Session;
        const ws = getWorkstream(targetSession.id);
        targetColumnId = ws ?? UNGROUPED_ID;
      } else {
        // Might have been dropped on a column identified by its id
        targetColumnId = over.id as string;
      }

      if (!targetColumnId) return;

      // Find source column
      const sourceWorkstream = getWorkstream(sessionId);
      const sourceColumnId = sourceWorkstream ?? UNGROUPED_ID;

      // Only act if the column changed
      if (sourceColumnId === targetColumnId) return;

      if (targetColumnId === UNGROUPED_ID) {
        removeWorkstream(sessionId);
      } else {
        setWorkstream(sessionId, targetColumnId);
      }
    },
    [getWorkstream, setWorkstream, removeWorkstream],
  );

  const handleSelectSession = useCallback(
    (session: Session) => {
      selectSession(session.id);
    },
    [selectSession],
  );

  const showSkeletons = isLoading && sessions.length === 0;
  const showErrorState = !isLoading && Boolean(error) && sessions.length === 0;

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

        <div className="rounded-lg bg-surface-secondary">
          <StatusFilter />
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
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
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
                />
              ))}
            </div>

            {/* Ghost tile following the cursor during drag */}
            <DragOverlay dropAnimation={null}>
              {activeDragSession ? (
                <div className="w-[296px] opacity-80 rotate-[2deg] pointer-events-none">
                  <KanbanTile
                    session={activeDragSession}
                    isSelected={false}
                    onSelect={() => {}}
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* Scrollbar styles for kanban */}
      <style>{kanbanScrollbarCSS}</style>
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
