import type { Session } from '../../types';
import { getStatusBorderClass } from '../../utils/statusColors';
import { formatRelativeTime, countAgents } from '../../utils/formatters';
import StatusBadge from '../common/StatusBadge';
import { Sparkline } from '../common/Sparkline';

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
  onClick: () => void;
}

export default function SessionCard({
  session,
  isSelected,
  onClick,
}: SessionCardProps) {
  const agentCount = countAgents(session.rootAgent);
  const timeAgo = formatRelativeTime(session.lastActivityAt);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isSelected ? 'true' : undefined}
      className={`
        group w-full text-left cursor-pointer
        border-l-[3px] rounded-r-md
        px-3 py-2.5
        transition-colors duration-150 ease-out
        focus-visible:outline-none
        focus-visible:ring-1 focus-visible:ring-border-active
        ${
          isSelected
            ? 'bg-surface-tertiary border-border-active'
            : `bg-surface-secondary hover:bg-surface-hover ${getStatusBorderClass(session.status)}`
        }
      `}
    >
      {/* ── Top row: name + status badge ──────────── */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="truncate text-sm font-semibold text-fg/90">
          {session.name}
        </span>
        <StatusBadge status={session.status} size="sm" />
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
