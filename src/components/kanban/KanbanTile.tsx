import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Session, SessionStatus } from '../../types';
import {
  getStatusBorderClass,
  getStatusBgClass,
  getStatusDotClass,
} from '../../utils/statusColors';
import { formatRelativeTime, countAgents, truncate } from '../../utils/formatters';
import { Sparkline } from '../common/Sparkline';

interface KanbanTileProps {
  session: Session;
  isSelected: boolean;
  onSelect: (session: Session) => void;
}

const PULSING_STATUSES = new Set<SessionStatus>(['active']);

export default function KanbanTile({ session, isSelected, onSelect }: KanbanTileProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: session.id, data: { type: 'tile', session } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const agentCount = countAgents(session.rootAgent);
  const timeAgo = formatRelativeTime(session.lastActivityAt);
  const shouldPulse = PULSING_STATUSES.has(session.status);

  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      onClick={() => onSelect(session)}
      {...attributes}
      {...listeners}
      className={`
        group relative w-full text-left cursor-grab active:cursor-grabbing
        border-l-[3px] rounded-r-md
        px-3 py-2 min-w-0
        transition-all duration-150 ease-out
        focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-active
        ${isDragging ? 'opacity-40 scale-[0.97]' : 'hover:brightness-110'}
        ${isSelected
          ? 'bg-surface-tertiary border-border-active ring-1 ring-border-active/30'
          : `${getStatusBgClass(session.status)} ${getStatusBorderClass(session.status)}`
        }
      `}
    >
      {/* Row 1: name + status dot */}
      <div className="flex items-center gap-2 min-w-0">
        <span
          aria-hidden="true"
          className={`
            shrink-0 size-1.5 rounded-full
            ${getStatusDotClass(session.status)}
            ${shouldPulse ? 'animate-pulse' : ''}
          `}
        />
        <span className="truncate text-sm font-semibold text-fg/90">
          {session.name}
        </span>
      </div>

      {/* Row 2: latest user request (truncated) */}
      <p className="mt-1 text-xs leading-relaxed text-fg/45 line-clamp-2">
        {truncate(session.latestUserMessage ?? session.intent, 60)}
      </p>

      {/* Row 2.5: latest assistant update */}
      {session.assistantUpdates && session.assistantUpdates.length > 0 && (
        <p className="mt-1 text-[11px] leading-relaxed text-fuchsia-300/70 line-clamp-1 border-l-2 border-fuchsia-500/40 pl-1.5">
          {session.assistantUpdates[session.assistantUpdates.length - 1]}
        </p>
      )}

      {/* Row 3: meta — time, sparkline, agent count */}
      <div className="mt-1.5 flex items-center gap-2 text-[11px] tabular-nums text-fg/30">
        <span>{timeAgo}</span>
        {session.activityBuckets && session.activityBuckets.length > 0 && (
          <Sparkline
            buckets={session.activityBuckets}
            width={40}
            height={10}
            className="text-fg/20 flex-1"
          />
        )}
        <span className="ml-auto whitespace-nowrap rounded-full bg-surface-tertiary px-1.5 py-0.5 text-[10px] text-fg/40">
          {agentCount} {agentCount === 1 ? 'agent' : 'agents'}
        </span>
      </div>
    </button>
  );
}
