import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { SessionSummary, SessionStatus } from '../../types';
import type { ConversationMatch } from '../../hooks/useSessions';
import KanbanTile from './KanbanTile';

export const COLUMN_SORTABLE_PREFIX = 'column:';

const STATUS_SORT_ORDER: Record<SessionStatus, number> = {
  active: 0,
  blocked: 1,
  waiting: 2,
  completed: 3,
};

function sortTiles(sessions: SessionSummary[]): SessionSummary[] {
  return [...sessions].sort((a, b) => {
    const statusDiff = STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status];
    if (statusDiff !== 0) return statusDiff;
    return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
  });
}

interface KanbanColumnProps {
  id: string;
  name: string;
  sessions: SessionSummary[];
  selectedSessionId: string | null;
  onSelectSession: (session: SessionSummary) => void;
  onSelectWorkstream?: () => void;
  onArchive?: (sessionId: string) => void;
  onArchiveWorkstream?: () => void;
  onNewSession?: () => void;
  isFavorited?: boolean;
  onToggleFavorite?: () => void;
  isFocused?: boolean;
  onToggleFocus?: () => { ok: boolean; reason?: string };
  focusLimitReached?: string | null;
  isSortable?: boolean;
  conversationSearchResults?: Map<string, ConversationMatch>;
  searchQuery?: string;
}

export default function KanbanColumn({
  id,
  name,
  sessions,
  selectedSessionId,
  onSelectSession,
  onSelectWorkstream,
  onArchive,
  onArchiveWorkstream,
  onNewSession,
  isFavorited = false,
  onToggleFavorite,
  isFocused = false,
  onToggleFocus,
  isSortable = false,
  conversationSearchResults,
  searchQuery,
}: KanbanColumnProps) {
  const sortableId = `${COLUMN_SORTABLE_PREFIX}${id}`;

  const {
    attributes: sortableAttrs,
    listeners: sortableListeners,
    setNodeRef: setSortableRef,
    transform: sortableTransform,
    transition: sortableTransition,
    isDragging: isColumnDragging,
  } = useSortable({
    id: sortableId,
    data: { type: 'column', columnId: id, columnName: name },
    disabled: !isSortable,
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id,
    data: { columnId: id, columnName: name },
  });

  const sorted = sortTiles(sessions);
  const sessionIds = sorted.map((s) => s.id);

  // Transient feedback when focus limit is reached
  const [showLimitMsg, setShowLimitMsg] = useState(false);
  const [limitMsg, setLimitMsg] = useState<string | null>(null);

  const columnStyle = isSortable
    ? {
        transform: CSS.Transform.toString(sortableTransform),
        transition: sortableTransition,
      }
    : undefined;

  return (
    <div
      ref={setSortableRef}
      style={columnStyle}
      className={`
        flex flex-col shrink-0
        w-[320px] min-h-0 rounded-lg
        bg-surface-secondary/60 border
        transition-all duration-150
        ${isOver
          ? 'border-border-active/60 bg-surface-secondary/80 shadow-[0_0_12px_rgba(99,102,241,0.12)]'
          : 'border-border-default/40'
        }
        ${isColumnDragging ? 'opacity-40 scale-[0.97]' : ''}
      `}
    >
      {/* Sticky header */}
      <div
        className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-t-lg border-b border-border-default/30 bg-surface-secondary/90 backdrop-blur-sm px-3 py-2"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {isSortable && (
            <span
              {...sortableAttrs}
              {...sortableListeners}
              className="shrink-0 cursor-grab active:cursor-grabbing text-fg/25 hover:text-fg/50 transition-colors select-none"
              aria-label={`Drag to reorder ${name} column`}
            >
              ⠿
            </span>
          )}
          <button
            type="button"
            onClick={onSelectWorkstream}
            className={`
              truncate text-xs font-semibold uppercase tracking-wider text-fg/60
              ${onSelectWorkstream ? 'cursor-pointer hover:text-fg/80 transition-colors' : 'cursor-default'}
            `}
          >
            {name}
          </button>
        </div>
        <span className="shrink-0 rounded-full bg-surface-tertiary px-2 py-0.5 text-[10px] font-mono tabular-nums text-fg/40">
          {sessions.length}
        </span>
        {onToggleFavorite && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onToggleFavorite}
            className={`shrink-0 rounded p-0.5 transition-colors ${
              isFavorited
                ? 'text-amber-400 hover:text-amber-300'
                : 'text-fg/25 hover:text-fg/60 hover:bg-surface-tertiary'
            }`}
            aria-label={isFavorited ? `Unfavorite ${name}` : `Favorite ${name}`}
            title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
          >
            <span className="text-sm leading-none" aria-hidden="true">
              {isFavorited ? '★' : '☆'}
            </span>
          </button>
        )}
        {onToggleFocus && (
          <button
            type="button"
            data-testid={`focus-pin-${name}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              const result = onToggleFocus();
              if (result && !result.ok && result.reason === 'limit_reached') {
                setLimitMsg('Focus limit reached. Unpin a workstream first.');
                setShowLimitMsg(true);
                setTimeout(() => setShowLimitMsg(false), 2500);
              }
            }}
            className={`shrink-0 rounded p-0.5 transition-colors ${
              isFocused
                ? 'text-blue-400 hover:text-blue-300'
                : 'text-fg/25 hover:text-fg/60 hover:bg-surface-tertiary'
            }`}
            aria-label={isFocused ? `Unpin ${name} from focus` : `Pin ${name} to focus`}
            title={isFocused ? 'Remove from focus' : 'Add to focus'}
          >
            <svg
              aria-hidden="true"
              className="h-3.5 w-3.5"
              fill={isFocused ? 'currentColor' : 'none'}
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2l0 10" />
              <path d="M18 8l-12 0" />
              <path d="M15 2l-6 0" />
              <path d="M12 12l0 10" />
            </svg>
          </button>
        )}
        {onNewSession && (
          <button
            type="button"
            onClick={onNewSession}
            className="shrink-0 rounded p-0.5 text-fg/25 transition-colors hover:text-fg/60 hover:bg-surface-tertiary"
            aria-label={`New session in ${name}`}
            title="New session"
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
          </button>
        )}
        {onArchiveWorkstream && (
          <button
            type="button"
            onClick={onArchiveWorkstream}
            className="shrink-0 rounded p-0.5 text-fg/25 transition-colors hover:text-fg/60 hover:bg-surface-tertiary"
            aria-label={`Archive ${name} workstream`}
            title="Archive workstream"
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
              <polyline points="21 8 21 21 3 21 3 8" />
              <rect x="1" y="3" width="22" height="5" />
              <line x1="10" y1="12" x2="14" y2="12" />
            </svg>
          </button>
        )}
      </div>

      {/* Focus limit feedback */}
      {showLimitMsg && limitMsg && (
        <div
          data-testid="focus-limit-message"
          className="px-3 py-1.5 text-[11px] text-amber-400/80 border-b border-border-default/30"
        >
          {limitMsg}
        </div>
      )}

      {/* Scrollable tile area */}
      <div
        ref={setDropRef}
        className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[120px] kanban-scrollable"
      >
        <SortableContext items={sessionIds} strategy={verticalListSortingStrategy}>
          {sorted.length > 0 ? (
            sorted.map((session) => (
              <KanbanTile
                key={session.id}
                session={session}
                isSelected={session.id === selectedSessionId}
                onSelect={onSelectSession}
                onArchive={onArchive}
                conversationMatch={conversationSearchResults?.get(session.id)}
                searchActive={Boolean(searchQuery?.trim())}
              />
            ))
          ) : (
            <div className="flex items-center justify-center py-8 text-xs text-fg/20 italic">
              No sessions
            </div>
          )}
        </SortableContext>
      </div>
    </div>
  );
}
