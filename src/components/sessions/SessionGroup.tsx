import { useCallback, useRef, useState, type ReactNode } from 'react';

/* ------------------------------------------------------------------ */
/*  SessionGroup – collapsible sidebar section for grouped sessions   */
/* ------------------------------------------------------------------ */

interface SessionGroupProps {
  name: string;
  count: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  children: ReactNode;
  description: string | null;
  onDescriptionChange?: (text: string) => void;
  onDropSession?: (sessionId: string) => void;
}

/** Inline chevron-right icon that rotates 90° when expanded. */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-3 w-3 shrink-0 text-fg/30 transition-transform duration-150 ease-out ${
        open ? 'rotate-90' : ''
      }`}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 4 10 8 6 12" />
    </svg>
  );
}

export default function SessionGroup({
  name,
  count,
  isCollapsed,
  onToggleCollapse,
  children,
  description,
  onDescriptionChange,
  onDropSession,
}: SessionGroupProps) {
  const isUngrouped = name === 'Ungrouped';
  const expanded = !isCollapsed;

  /* ---- description editing state ---- */
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState('');

  const startEditing = useCallback(() => {
    setDraftText(description ?? '');
    setIsEditing(true);
  }, [description]);

  const handleStartEditingClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      startEditing();
    },
    [startEditing],
  );

  const commitEdit = useCallback(() => {
    setIsEditing(false);
    onDescriptionChange?.(draftText.trim());
  }, [draftText, onDescriptionChange]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
  }, []);

  /* ---- drag-and-drop state ---- */
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounter = useRef(0);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!onDropSession) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    },
    [onDropSession],
  );

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (!onDropSession) return;
      e.preventDefault();
      dragCounter.current += 1;
      setIsDragOver(true);
    },
    [onDropSession],
  );

  const handleDragLeave = useCallback(
    (_e: React.DragEvent) => {
      if (!onDropSession) return;
      dragCounter.current -= 1;
      if (dragCounter.current === 0) setIsDragOver(false);
    },
    [onDropSession],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!onDropSession) return;
      e.preventDefault();
      dragCounter.current = 0;
      setIsDragOver(false);
      const sessionId = e.dataTransfer.getData('text/plain');
      if (sessionId) onDropSession(sessionId);
    },
    [onDropSession],
  );

  /* ---- whether to show description UI at all ---- */
  const showDescriptionUI = !!onDescriptionChange;
  const hasDescription = !!description;

  return (
    <div
      role="group"
      aria-label={`${name} – ${count} session${count === 1 ? '' : 's'}`}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={
        'rounded-md transition-all duration-150 ' +
        (isDragOver && onDropSession
          ? 'ring-1 ring-border-active bg-surface-hover/30'
          : '')
      }
    >
      {/* ---- clickable header row ---- */}
      <div className="group flex items-center">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={expanded}
          className={
            'flex flex-1 min-w-0 items-center gap-2 px-2 py-1.5 rounded-md ' +
            'hover:bg-surface-hover cursor-pointer transition-colors ' +
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-active'
          }
        >
          <Chevron open={expanded} />

          <span
            className={
              'truncate text-xs ' +
              (isUngrouped
                ? 'font-normal text-fg/40'
                : 'font-semibold text-fg/70')
            }
          >
            {name}
          </span>

          <span className="ml-auto shrink-0 text-[10px] tabular-nums text-fg/30">
            {count}
          </span>
        </button>

        {/* add-note icon — visible on hover when no description yet */}
        {showDescriptionUI && !hasDescription && !isEditing && (
          <button
            type="button"
            aria-label="Add description"
            onClick={handleStartEditingClick}
            className={
              'opacity-0 group-hover:opacity-100 shrink-0 mr-1 p-0.5 rounded ' +
              'text-[11px] leading-none cursor-pointer transition-opacity duration-100 ' +
              'hover:bg-surface-hover focus-visible:opacity-100 ' +
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-active'
            }
          >
            📝
          </button>
        )}
      </div>

      {/* ---- description / editing area ---- */}
      {showDescriptionUI && isEditing && (
        <textarea
          rows={3}
          autoFocus
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              commitEdit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancelEdit();
            }
          }}
          className={
            'mt-0.5 ml-5 mr-2 w-[calc(100%-1.75rem)] text-[10px] font-mono text-fg/50 ' +
            'bg-surface-secondary border border-border-default rounded px-2 py-1 resize-none ' +
            'focus:outline-none focus:ring-1 focus:ring-border-active'
          }
        />
      )}

      {showDescriptionUI && !isEditing && hasDescription && (
        <button
          type="button"
          onClick={handleStartEditingClick}
          className={
            'block w-full text-left text-[10px] text-fg/30 truncate pl-5 pr-2 ' +
            'cursor-pointer rounded-sm hover:text-fg/50 transition-colors'
          }
        >
          {description}
        </button>
      )}

      {/* ---- collapsible content area ---- */}
      {expanded && (
        <div className="pl-1">
          {children}
        </div>
      )}
    </div>
  );
}
