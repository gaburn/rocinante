import type { ReactNode } from 'react';

/* ------------------------------------------------------------------ */
/*  SessionGroup – collapsible sidebar section for grouped sessions   */
/* ------------------------------------------------------------------ */

interface SessionGroupProps {
  name: string;
  count: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  children: ReactNode;
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
}: SessionGroupProps) {
  const isUngrouped = name === 'Ungrouped';
  const expanded = !isCollapsed;

  return (
    <div role="group" aria-label={`${name} – ${count} session${count === 1 ? '' : 's'}`}>
      {/* ---- clickable header row ---- */}
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-expanded={expanded}
        className={
          'flex w-full items-center gap-2 px-2 py-1.5 rounded-md ' +
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

      {/* ---- collapsible content area ---- */}
      {expanded && (
        <div className="pl-1">
          {children}
        </div>
      )}
    </div>
  );
}
