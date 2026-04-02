import { useState } from 'react';
import { type TimelineEvent } from '../../types';
import { getEventStyle } from '../../utils/eventIcons';
import { formatRelativeTime } from '../../utils/formatters';

interface EventTimelineProps {
  events: TimelineEvent[];
}

export default function EventTimeline({ events }: EventTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const sorted = [...events].sort(
    (a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  return (
    <div className="rounded-lg border border-border-default bg-surface-secondary">
      {/* ── Header ─────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 pt-4 pb-3 text-left"
        aria-expanded={isExpanded}
      >
        <h2 className="font-mono text-sm font-semibold text-fg-heading">
          Session Timeline ({events.length})
        </h2>

        <span
          aria-hidden="true"
          className={`
            inline-block text-xs text-fg-secondary
            transition-transform duration-200
            ${isExpanded ? 'rotate-90' : 'rotate-0'}
          `}
        >
          ▶
        </span>
      </button>

      {isExpanded && (
        <>
          {/* ── Divider ────────────────────────────────────────── */}
          <div className="h-px bg-border-default" />

          {/* ── Body ───────────────────────────────────────────── */}
          {sorted.length === 0 ? (
            <div className="flex min-h-36 items-center justify-center p-6">
              <div className="space-y-1 text-center">
                <p className="text-2xl opacity-40" aria-hidden="true">
                  ◷
                </p>
                <p className="font-mono text-xs text-fg/30">
                  No events recorded
                </p>
              </div>
            </div>
          ) : (
            <div
              className="max-h-[400px] overflow-y-auto"
              style={{
                /* Soft inset shadow at top & bottom so the user perceives
                   clipped content behind the scroll edges. Pure CSS —
                   no extra wrapper elements needed. */
                boxShadow:
                  'inset 0 8px 10px -8px rgba(0,0,0,.45), inset 0 -8px 10px -8px rgba(0,0,0,.45)',
              }}
            >
              {sorted.map((event, i) => {
                const { colorClass } = getEventStyle(event.type);
                const isLast = i === sorted.length - 1;

                return (
                  <div
                    key={event.id}
                    className={`
                      group flex items-center gap-3 px-4 py-2
                      transition-colors duration-100
                      hover:bg-surface-hover/30
                      ${isLast ? '' : 'border-b border-border-default/50'}
                    `}
                  >
                    {/* Colored dot — 6 px indicator */}
                    <span
                      aria-hidden="true"
                      className={`h-1.5 w-1.5 shrink-0 rounded-full bg-current ${colorClass}`}
                    />

                    {/* Summary */}
                    <span
                      className="min-w-0 flex-1 truncate text-xs text-fg/60"
                      title={event.summary}
                    >
                      {event.summary}
                    </span>

                    {/* Relative timestamp */}
                    <time
                      dateTime={event.timestamp}
                      className="shrink-0 font-mono text-[10px] tabular-nums text-fg/25"
                    >
                      {formatRelativeTime(event.timestamp)}
                    </time>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
