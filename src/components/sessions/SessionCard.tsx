import { useState, memo } from 'react';
import type { SessionSummary } from '../../types';
import { getStatusBorderClass } from '../../utils/statusColors';
import { formatRelativeTime } from '../../utils/formatters';
import StatusBadge from '../common/StatusBadge';
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
  session: SessionSummary;
  isSelected: boolean;
  isArchived: boolean;
  onClick: () => void;
  onArchive: (e: React.MouseEvent) => void;
  workstream: string | null;
  workstreamNames: string[];
  onSetWorkstream: (name: string) => void;
  onRemoveWorkstream: () => void;
}

const SessionCard = memo(function SessionCard({
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
  const [isDragging, setIsDragging] = useState(false);
  const [isEditingWorkstream, setIsEditingWorkstream] = useState(false);
  const agentCount = session.agentCount;
  const timeAgo = formatRelativeTime(session.lastActivityAt);

  return (
    <button
      type="button"
      draggable="true"
      onClick={onClick}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', session.id);
        e.dataTransfer.effectAllowed = 'move';
        setIsDragging(true);
      }}
      onDragEnd={() => setIsDragging(false)}
      aria-current={isSelected ? 'true' : undefined}
      className={`
        group relative w-full text-left cursor-pointer
        border-l-[3px] rounded-r-md
        px-3 py-2.5
        transition-[colors,opacity] duration-150 ease-out
        focus-visible:outline-none
        focus-visible:ring-1 focus-visible:ring-border-active
        ${isArchived ? 'opacity-50' : ''}
        ${isDragging ? 'opacity-40' : ''}
        ${
          isSelected
            ? 'bg-surface-tertiary border-border-active'
            : `bg-surface-secondary hover:bg-surface-hover ${getStatusBorderClass(session.status)}`
        }
        ${!isSelected && session.status === 'waiting' ? 'animate-glow-amber' : ''}
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
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate text-sm font-semibold text-fg/90">
            {session.name}
          </span>
          {session.status === 'waiting' && (
            <span
              className="shrink-0 inline-flex items-center justify-center size-4 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold"
              title="Waiting for user input"
              aria-label="Waiting for user input"
            >
              ?
            </span>
          )}
        </div>
        <StatusBadge status={session.status} size="sm" />
      </div>

      {/* ── Workstream tag (lazy-mounted) ─────────── */}
      <div className="mt-1" onClick={e => e.stopPropagation()}>
        {isEditingWorkstream ? (
          <WorkstreamAutocomplete
            value={workstream}
            suggestions={workstreamNames}
            onChange={(name) => { onSetWorkstream(name); setIsEditingWorkstream(false); }}
            onRemove={() => { onRemoveWorkstream(); setIsEditingWorkstream(false); }}
            size="sm"
            autoFocus
            onEditEnd={() => setIsEditingWorkstream(false)}
          />
        ) : workstream ? (
          <span
            className="bg-surface-tertiary text-fg/40 text-[10px] font-mono rounded-full px-2 py-0.5 inline-flex items-center gap-1 select-none transition-colors"
          >
            <button
              type="button"
              className="cursor-pointer hover:text-fg/60 transition-colors"
              onClick={(e) => { e.stopPropagation(); setIsEditingWorkstream(true); }}
              aria-label={`Edit workstream: ${workstream}`}
            >
              {workstream}
            </button>
            <button
              type="button"
              className="cursor-pointer ml-0.5 opacity-50 hover:opacity-100 transition-opacity"
              onClick={(e) => { e.stopPropagation(); onRemoveWorkstream(); }}
              aria-label={`Remove workstream: ${workstream}`}
            >
              ✕
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="text-fg/20 text-[10px] font-mono hover:text-fg/35 cursor-pointer select-none transition-colors"
            onClick={(e) => { e.stopPropagation(); setIsEditingWorkstream(true); }}
            aria-label="Add workstream"
          >
            + workstream
          </button>
        )}
      </div>

      {/* ── Intent / task description ─────────────── */}
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg/50">
        {session.latestUserMessage ?? session.intent}
      </p>

      {/* ── Meta row: relative time + agent count ── */}
      <div className="mt-1.5 flex items-center gap-2 text-[11px] tabular-nums text-fg/30">
        <span>{timeAgo}</span>
        {session.compacted && (
          <span
            className="text-amber-400/70"
            title={`Context was compacted ${session.compactionCount ?? 1} time(s) during this session — some earlier context may have been summarized`}
            aria-label="Context compacted"
          >
            ⚠️
          </span>
        )}
        <span className="ml-auto">
          {agentCount} {agentCount === 1 ? 'agent' : 'agents'}
        </span>
      </div>
    </button>
  );
}, (prev, next) => {
  // Shallow compare on stable identity + key props
  return (
    prev.session.id === next.session.id &&
    prev.session.lastActivityAt === next.session.lastActivityAt &&
    prev.session.status === next.session.status &&
    prev.session.name === next.session.name &&
    prev.session.latestUserMessage === next.session.latestUserMessage &&
    prev.session.compacted === next.session.compacted &&
    prev.session.compactionCount === next.session.compactionCount &&
    prev.isSelected === next.isSelected &&
    prev.isArchived === next.isArchived &&
    prev.workstream === next.workstream &&
    prev.workstreamNames === next.workstreamNames
  );
});

export default SessionCard;
