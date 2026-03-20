import type { Session } from '../../types';
import { getStatusBorderClass } from '../../utils/statusColors';
import { formatRelativeTime, countAgents } from '../../utils/formatters';
import StatusBadge from '../common/StatusBadge';
import { Sparkline } from '../common/Sparkline';
import WorkstreamAutocomplete from '../common/WorkstreamAutocomplete';

/* ────────────────────────────────────────────────────────
 * SessionCard
 * ────────────────────────────────────────────────────────
 * A compact, sidebar-friendly session card rendered as a
 * native <button> for full keyboard & screen-reader
 * accessibility.
 *
 * Visual anatomy
 *  ┌╶╶╶┬──────────────────────────────────────────────┐
 *  ┊ ▌ │  Session name (bold, truncate)  [● Status]   │
 *  ┊ ▌ │  Intent / task description clipped to         │
 *  ┊ ▌ │  two lines at most …                          │
 *  ┊ ▌ │  2m ago                           4 agents    │
 *  └╶╶╶┴──────────────────────────────────────────────┘
 *    ↑ 3 px left accent — status-colored by default,
 *      indigo (border-active) when selected
 *
 * States
 *  · Default   bg-surface-secondary + status left border
 *  · Hover     bg-surface-hover, smooth 150 ms ease-out
 *  · Selected  bg-surface-tertiary + indigo left border
 *  · Focus     visible ring for keyboard navigation
 * ──────────────────────────────────────────────────────── */

interface SessionCardProps {
  session: Session;
  isSelected: boolean;
  isArchived: boolean;
  onClick: () => void;
  onArchive: (e: React.MouseEvent) => void;
  workstream: string | null;
  workstreamNames: string[];
  onSetWorkstream: (name: string) => void;
  onRemoveWorkstream: () => void;
}

export default function SessionCard({
  session,
  isSelected,
  isArchived,
  onClick,
  onArchive,
  workstream,
  workstreamNames,
  onSetWorkstream,
  onRemoveWorkstream,
}: SessionCardProps) {
  const agentCount = countAgents(session.rootAgent);
  const timeAgo = formatRelativeTime(session.lastActivityAt);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isSelected ? 'true' : undefined}
      className={`
        group relative w-full text-left cursor-pointer
        border-l-[3px] rounded-r-md
        px-3 py-2.5
        transition-[colors,opacity] duration-150 ease-out
        focus-visible:outline-none
        focus-visible:ring-1 focus-visible:ring-border-active
        ${isArchived ? 'opacity-50' : ''}
        ${
          isSelected
            ? 'bg-surface-tertiary border-border-active'
            : `bg-surface-secondary hover:bg-surface-hover ${getStatusBorderClass(session.status)}`
        }
      `}
    >
      {/* ── Archive / Unarchive button ────────────── */}
      <span
        role="button"
        tabIndex={-1}
        title={isArchived ? 'Unarchive' : 'Archive'}
        onClick={(e) => {
          e.stopPropagation();
          onArchive(e);
        }}
        className={`
          absolute top-1.5 right-1.5
          inline-flex items-center justify-center
          w-5 h-5 rounded p-0.5
          text-fg/30 hover:text-fg/60
          transition-opacity duration-150
          ${isArchived ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
        `}
      >
        {isArchived ? (
          /* ↩ undo / unarchive arrow */
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-3.5 h-3.5"
            aria-hidden="true"
          >
            <path d="M4 7l-3 3 3 3" />
            <path d="M1 10h9a4 4 0 0 0 0-8H8" />
          </svg>
        ) : (
          /* ↓ archive box */
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-3.5 h-3.5"
            aria-hidden="true"
          >
            <rect x="1" y="1" width="14" height="4" rx="1" />
            <path d="M2 5v8a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V5" />
            <path d="M6 9h4" />
          </svg>
        )}
      </span>
      {/* ── Top row: name + status badge ──────────── */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="truncate text-sm font-semibold text-fg/90">
          {session.name}
        </span>
        <StatusBadge status={session.status} size="sm" />
      </div>

      {/* ── Workstream tag ────────────────────────── */}
      <div className="mt-1" onClick={e => e.stopPropagation()}>
        <WorkstreamAutocomplete
          value={workstream}
          suggestions={workstreamNames}
          onChange={onSetWorkstream}
          onRemove={onRemoveWorkstream}
          size="sm"
        />
      </div>

      {/* ── Intent / task description ─────────────── */}
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg/50">
        {session.intent}
      </p>

      {/* ── Meta row: relative time + sparkline + agent count ── */}
      <div className="mt-1.5 flex items-center gap-2 text-[11px] tabular-nums text-fg/30">
        <span>{timeAgo}</span>
        {session.activityBuckets && session.activityBuckets.length > 0 && (
          <Sparkline
            buckets={session.activityBuckets}
            width={48}
            height={12}
            className="text-fg/20 flex-1"
          />
        )}
        <span className="ml-auto">
          {agentCount} {agentCount === 1 ? 'agent' : 'agents'}
        </span>
      </div>
    </button>
  );
}
