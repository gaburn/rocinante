import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { SessionSummary, SessionStatus } from '../../types';
import type { ConversationMatch } from '../../hooks/useSessions';
import {
  getStatusBorderClass,
  getStatusBgClass,
  getStatusDotClass,
} from '../../utils/statusColors';
import { formatRelativeTime } from '../../utils/formatters';
import { renderInlineMarkdown } from '../../utils/inlineMarkdown';

interface KanbanTileProps {
  session: SessionSummary;
  isSelected: boolean;
  onSelect: (session: SessionSummary) => void;
  onArchive?: (sessionId: string) => void;
  conversationMatch?: ConversationMatch;
  searchActive?: boolean;
}

const PULSING_STATUSES = new Set<SessionStatus>(['active', 'waiting']);

export default function KanbanTile({ session, isSelected, onSelect, onArchive, conversationMatch, searchActive }: KanbanTileProps) {
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

  const agentCount = session.agentCount;
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
        ${!isSelected && session.status === 'waiting' ? 'animate-glow-amber' : ''}
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
        {session.status === 'waiting' && (
          <span
            className="shrink-0 inline-flex items-center justify-center size-4 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold"
            title="Waiting for user input"
            aria-label="Waiting for user input"
          >
            ?
          </span>
        )}
        <span className="truncate text-sm font-semibold text-fg/90">
          {session.name}
        </span>
      </div>

      {/* Row 1.5: repo path */}
      {session.cwd && (
        <p className="mt-0.5 truncate font-mono text-[10px] text-fg/25" title={session.cwd}>
          {session.cwd}
        </p>
      )}

      {/* Row 2: latest user request */}
      <p className="mt-1 text-xs leading-relaxed text-fg/45 line-clamp-2">
        {session.latestUserMessage ?? session.intent}
      </p>

      {/* Row 2.5: latest assistant update */}
      {session.lastAssistantUpdate && (
        <p className="mt-1 text-[11px] leading-relaxed text-fuchsia-300/70 line-clamp-2 border-l-2 border-fuchsia-500/40 pl-1.5">
          {renderInlineMarkdown(session.lastAssistantUpdate)}
        </p>
      )}

      {/* Row 2.75: conversation search match snippet */}
      {searchActive && conversationMatch && (
        <div className="mt-1 rounded bg-amber-500/10 px-1.5 py-1">
          <p className="text-[10px] leading-snug text-amber-300/80 line-clamp-2">
            <span className="mr-1" aria-label="Conversation match">💬</span>
            {conversationMatch.snippet}
          </p>
        </div>
      )}

      {/* Row 3: meta — time, agent count */}
      <div className="mt-1.5 flex items-center gap-2 text-[11px] tabular-nums text-fg/30">
        <span>{timeAgo}</span>
        {/* Archive session — visible on hover */}
        {onArchive && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onArchive(session.id);
            }}
            title="Archive this session"
            className="
              ml-auto opacity-0 group-hover:opacity-100
              rounded p-0.5 text-fg/25 transition-all duration-150
              hover:text-amber-400 cursor-pointer
            "
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="3" width="20" height="6" rx="1" />
              <path d="M2 9v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9" />
              <path d="M10 13h4" />
            </svg>
          </button>
        )}
        <span className={`${onArchive ? '' : 'ml-auto'} whitespace-nowrap rounded-full bg-surface-tertiary px-1.5 py-0.5 text-[10px] text-fg/40`}>
          {agentCount} {agentCount === 1 ? 'agent' : 'agents'}
        </span>
      </div>
    </button>
  );
}
