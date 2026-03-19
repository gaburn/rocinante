import { useSessionContext } from '../../context/SessionContext';
import StatusSummaryBar from '../common/StatusSummaryBar';
import StatusFilter from '../filters/StatusFilter';
import SessionCard from './SessionCard';

const SKELETON_CARD_COUNT = 5;

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
    selectedSession,
    selectSession,
    isLoading,
    error,
    searchQuery,
    setSearchQuery,
  } = useSessionContext();

  const showSkeletons = isLoading && sessions.length === 0;
  const showErrorState = !isLoading && Boolean(error) && sessions.length === 0;
  const showEmptyState = !isLoading && sessions.length === 0;

  return (
    <section className="flex h-full flex-col bg-surface-primary">
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

      <div className="flex-1 overflow-y-auto bg-surface-primary p-3">
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
          <div className="flex h-full min-h-48 items-center justify-center text-center">
            <div className="space-y-2">
              <div className="text-2xl opacity-40" aria-hidden="true">
                📭
              </div>
              <p className="text-sm text-fg/45">
                {searchQuery ? `No sessions matching '${searchQuery}'` : 'No sessions found'}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                isSelected={selectedSession?.id === session.id}
                onClick={() => selectSession(session.id)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
