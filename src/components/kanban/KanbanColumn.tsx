import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Session, SessionStatus } from '../../types';
import KanbanTile from './KanbanTile';

const STATUS_SORT_ORDER: Record<SessionStatus, number> = {
  active: 0,
  blocked: 1,
  waiting: 2,
  completed: 3,
};

function sortTiles(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => {
    const statusDiff = STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status];
    if (statusDiff !== 0) return statusDiff;
    return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
  });
}

interface KanbanColumnProps {
  id: string;
  name: string;
  sessions: Session[];
  selectedSessionId: string | null;
  onSelectSession: (session: Session) => void;
  onSelectWorkstream?: () => void;
}

export default function KanbanColumn({
  id,
  name,
  sessions,
  selectedSessionId,
  onSelectSession,
  onSelectWorkstream,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { columnId: id, columnName: name },
  });

  const sorted = sortTiles(sessions);
  const sessionIds = sorted.map((s) => s.id);

  return (
    <div
      className={`
        flex flex-col shrink-0
        w-[320px] min-h-0 rounded-lg
        bg-surface-secondary/60 border
        transition-colors duration-150
        ${isOver
          ? 'border-border-active/60 bg-surface-secondary/80 shadow-[0_0_12px_rgba(99,102,241,0.12)]'
          : 'border-border-default/40'
        }
      `}
    >
      {/* Sticky header */}
      <div
        className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-t-lg border-b border-border-default/30 bg-surface-secondary/90 backdrop-blur-sm px-3 py-2"
      >
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
        <span className="shrink-0 rounded-full bg-surface-tertiary px-2 py-0.5 text-[10px] font-mono tabular-nums text-fg/40">
          {sessions.length}
        </span>
      </div>

      {/* Scrollable tile area */}
      <div
        ref={setNodeRef}
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
