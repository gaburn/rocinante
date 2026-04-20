import { useState, useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { SessionSummary } from '../../types';
import { useSessionData, useSessionSelection, useSessionActions } from '../../context/SessionContext';
import StatusSummaryBar from '../common/StatusSummaryBar';
import StatusFilter from '../filters/StatusFilter';
import SessionCard from './SessionCard';
import SessionGroup from './SessionGroup';
import WelcomeCard from './WelcomeCard';

const SKELETON_CARD_COUNT = 5;
const ESTIMATED_ROW_HEIGHT = 110;

function SessionCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="animate-pulse border-l-[3px] border-border-default rounded-r-md bg-surface-secondary px-3 py-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="h-3 w-28 rounded bg-surface-tertiary" />
        <div className="h-4 w-14 rounded-full bg-surface-tertiary" />
      </div>

      <div className="mt-2 space-y-1.5">
        <div className="h-2.5 w-full rounded bg-surface-tertiary" />
        <div className="h-2.5 w-4/5 rounded bg-surface-tertiary" />
      </div>

      <div className="mt-2.5 flex items-center justify-between">
        <div className="h-2.5 w-12 rounded bg-surface-tertiary" />
        <div className="h-2.5 w-16 rounded bg-surface-tertiary" />
      </div>
    </div>
  );
}

export default function SessionList() {
  const {
    sessions,
    allSessions,
    searchQuery,
    showArchived,
    archivedCount,
    hasAnyWorkstreams,
    groupedSessions,
    isLoading,
    error,
    getWorkstreamNames,
    archivedSearchResults,
  } = useSessionData();
  const {
    selectedSession,
    selectedWorkstream,
    selectSession,
    selectWorkstream,
  } = useSessionSelection();
  const {
    setSearchQuery,
    setShowArchived,
    isArchived,
    toggleArchive,
    archiveAllCompleted,
    getWorkstream,
    setWorkstreamDescription,
    removeWorkstreamDescription,
    setWorkstream,
    removeWorkstream,
  } = useSessionActions();

  const showSkeletons = isLoading && sessions.length === 0;
  const showErrorState = !isLoading && Boolean(error) && sessions.length === 0;
  const showEmptyState = !isLoading && sessions.length === 0;

  /* ── Archive-related derived state ───────────────── */
  const hasCompletedNonArchived = allSessions.some(
    (s) => s.status === 'completed' && !isArchived(s.id),
  );
  const showArchiveControls = archivedCount > 0 || hasCompletedNonArchived;

  /* ── Virtualization for flat list modes ──────── */
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeSessions = sessions.filter((s) => !isArchived(s.id));
  const archivedSessions = sessions.filter((s) => isArchived(s.id));

  // Derive active/archived splits for flat list rendering
  const activeSessions = sessions.filter((s) => !isArchived(s.id));
  const archivedSessions = sessions.filter((s) => isArchived(s.id));

  type ListItem =
    | { type: 'session'; session: SessionSummary; dimmed: boolean }
    | { type: 'divider' };

  const flatItems: ListItem[] = (() => {
    // Grouped mode uses non-virtualized rendering
    if (hasAnyWorkstreams) return [];
    if (showSkeletons || showErrorState || showEmptyState) return [];

    if (showArchived && archivedSessions.length > 0) {
      const items: ListItem[] = activeSessions.map((s) => ({
        type: 'session' as const,
        session: s,
        dimmed: false,
      }));
      items.push({ type: 'divider' as const });
      for (const s of archivedSessions) {
        items.push({ type: 'session' as const, session: s, dimmed: true });
      }
      return items;
    }

    return sessions.map((s) => ({
      type: 'session' as const,
      session: s,
      dimmed: false,
    }));
  })();

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: useCallback(
      (index: number) => flatItems[index]?.type === 'divider' ? 32 : ESTIMATED_ROW_HEIGHT,
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [flatItems.length],
    ),
    overscan: 5,
    gap: 10,
  });

  const useFlatVirtualized = flatItems.length > 0;

  /* ── Grouped-mode collapse state ──────────────── */
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const toggleCollapse = (name: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  /** Render session cards for a group, splitting active / archived. */
  const renderGroupCards = (groupSessions: SessionSummary[]) => {
    const active = groupSessions.filter((s) => !isArchived(s.id));
    const archived = groupSessions.filter((s) => isArchived(s.id));

    return (
      <div className="space-y-2.5 py-1.5">
        {active.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            isSelected={selectedSession?.id === session.id}
            isArchived={false}
            onClick={() => selectSession(session.id)}
            onArchive={(e) => { e.stopPropagation(); toggleArchive(session.id); }}
            workstream={getWorkstream(session.id)}
            workstreamNames={getWorkstreamNames}
            onSetWorkstream={(name) => setWorkstream(session.id, name)}
            onRemoveWorkstream={() => removeWorkstream(session.id)}
          />
        ))}

        {showArchived && archived.length > 0 && (
          <>
            <div className="text-[10px] font-mono uppercase tracking-widest text-fg/20 px-1 py-2">
              Archived
            </div>

            {archived.map((session) => (
              <div key={session.id} className="opacity-50 transition-opacity duration-200 hover:opacity-70">
                <SessionCard
                  session={session}
                  isSelected={selectedSession?.id === session.id}
                  isArchived
                  onClick={() => selectSession(session.id)}
                  onArchive={(e) => { e.stopPropagation(); toggleArchive(session.id); }}
                  workstream={getWorkstream(session.id)}
                  workstreamNames={getWorkstreamNames}
                  onSetWorkstream={(name) => setWorkstream(session.id, name)}
                  onRemoveWorkstream={() => removeWorkstream(session.id)}
                />
              </div>
            ))}
          </>
        )}
      </div>
    );
  };

  return (
    <section className="flex h-full flex-col bg-surface-primary">
      {/* ── Header: summary / search / status filter ── */}
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

      {/* ── Archive controls ──────────────────────────
       *  Shown when there are archived sessions or
       *  completed sessions that could be archived.
       *  Sits between the filter bar and the scrollable
       *  list as a slim utility row.
       * ──────────────────────────────────────────────── */}
      {showArchiveControls && (
        <div className="flex shrink-0 items-center justify-between border-b border-border-default/60 px-3 py-1.5 text-xs">
          {/* Left cluster: toggle + label + count */}
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

          {/* Right: bulk archive action */}
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

      {/* ── Scrollable session list ───────────────────── */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto bg-surface-primary p-3">
        {showSkeletons ? (
          <div className="space-y-2.5">
            {Array.from({ length: SKELETON_CARD_COUNT }).map((_, index) => (
              <SessionCardSkeleton key={index} />
            ))}
          </div>
        ) : showErrorState ? (
          <div className="flex h-full min-h-48 items-center justify-center text-center">
            <div className="space-y-2">
              <div className="text-2xl opacity-40" aria-hidden="true">
                ⚠️
              </div>
              <p className="text-sm text-red-300">
                Failed to load sessions
              </p>
              <p className="max-w-xs text-xs text-fg/45">{error}</p>
            </div>
          </div>
        ) : showEmptyState ? (
          searchQuery ? (
            <div className="flex h-full min-h-48 items-center justify-center text-center">
              <div className="space-y-2">
                <div className="text-2xl opacity-40" aria-hidden="true">📭</div>
                <p className="text-sm text-fg/45">
                  No sessions matching &apos;{searchQuery}&apos;
                </p>
              </div>
            </div>
          ) : archivedCount > 0 ? (
            <div className="flex h-full min-h-48 items-center justify-center text-center">
              <div className="space-y-2">
                <div className="text-2xl opacity-40" aria-hidden="true">📦</div>
                <p className="text-sm text-fg/45">All sessions archived</p>
                <button
                  type="button"
                  onClick={() => setShowArchived(true)}
                  className="cursor-pointer text-xs text-border-active transition-colors hover:text-fg/70"
                >
                  Show archived sessions →
                </button>
              </div>
            </div>
          ) : (
            <WelcomeCard />
          )
        ) : hasAnyWorkstreams ? (
          /* ── Grouped view: sessions organized by workstream ── */
          <div className="space-y-1">
            {groupedSessions.groups.map((group) => (
              <SessionGroup
                key={group.name}
                name={group.name}
                count={group.sessions.length}
                isCollapsed={collapsedGroups.has(group.name)}
                onToggleCollapse={() => toggleCollapse(group.name)}
                onSelectWorkstream={() => selectWorkstream(group.name)}
                isSelected={selectedWorkstream?.name === group.name}
                description={group.description}
                onDescriptionChange={(text) =>
                  text
                    ? setWorkstreamDescription(group.name, text)
                    : removeWorkstreamDescription(group.name)
                }
                onDropSession={(sessionId) => setWorkstream(sessionId, group.name)}
              >
                {renderGroupCards(group.sessions)}
              </SessionGroup>
            ))}

            {groupedSessions.ungrouped.length > 0 && (
              <SessionGroup
                name="Ungrouped"
                count={groupedSessions.ungrouped.length}
                isCollapsed={collapsedGroups.has('Ungrouped')}
                onToggleCollapse={() => toggleCollapse('Ungrouped')}
                description={null}
                onDropSession={(sessionId) => removeWorkstream(sessionId)}
              >
                {renderGroupCards(groupedSessions.ungrouped)}
              </SessionGroup>
            )}
          </div>
        ) : useFlatVirtualized ? (
          /* ── Virtualized flat list ── */
          <div
            style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const item = flatItems[virtualRow.index];
              if (item.type === 'divider') {
                return (
                  <div
                    key="__divider__"
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div
                      aria-label="Archived sessions"
                      className="text-[10px] font-mono uppercase tracking-widest text-fg/20 px-1 py-2"
                    >
                      Archived
                    </div>
                  </div>
                );
              }
              const { session, dimmed } = item;
              return (
                <div
                  key={session.id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className={dimmed ? 'opacity-50 transition-opacity duration-200 hover:opacity-70' : undefined}
                >
                  <SessionCard
                    session={session}
                    isSelected={selectedSession?.id === session.id}
                    isArchived={isArchived(session.id)}
                    onClick={() => selectSession(session.id)}
                    onArchive={(e) => { e.stopPropagation(); toggleArchive(session.id); }}
                    workstream={getWorkstream(session.id)}
                    workstreamNames={getWorkstreamNames}
                    onSetWorkstream={(name) => setWorkstream(session.id, name)}
                    onRemoveWorkstream={() => removeWorkstream(session.id)}
                  />
                </div>
              );
            })}
          </div>
        ) : null}

        {/* ── Archived search results banner ──────────────
         *  When searching and there are matches in archived
         *  sessions that aren't in the current view, show a
         *  compact "Also found in archived" section.
         * ──────────────────────────────────────────────── */}
        {searchQuery.trim().length >= 3 && archivedSearchResults.size > 0 && !showArchived && (
          <div className="mt-4 rounded-lg border border-border-default/40 bg-surface-secondary/50 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-fg/40 mb-2">
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
                <rect x="2" y="3" width="20" height="6" rx="1" />
                <path d="M2 9v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9" />
                <path d="M10 13h4" />
              </svg>
              Also found in {archivedSearchResults.size} archived session{archivedSearchResults.size !== 1 ? 's' : ''}
            </div>
            <div className="space-y-1.5">
              {Array.from(archivedSearchResults.entries()).slice(0, 5).map(([sessionId, match]) => (
                <button
                  key={sessionId}
                  type="button"
                  onClick={() => {
                    setShowArchived(true)
                    selectSession(sessionId)
                  }}
                  className="w-full text-left rounded px-2 py-1.5 text-xs transition-colors hover:bg-surface-tertiary/60 cursor-pointer"
                >
                  <span className="font-mono text-fg/30 text-[10px]">{sessionId.slice(0, 8)}…</span>
                  <span className="ml-2 text-fg/50">{match.snippet.slice(0, 80)}{match.snippet.length > 80 ? '…' : ''}</span>
                </button>
              ))}
              {archivedSearchResults.size > 5 && (
                <button
                  type="button"
                  onClick={() => setShowArchived(true)}
                  className="text-[11px] text-border-active transition-colors hover:text-fg/70 px-2 cursor-pointer"
                >
                  Show all archived results →
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
