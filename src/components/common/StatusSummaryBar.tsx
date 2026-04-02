import { useSessionContext } from '../../context/SessionContext'
import { getStatusTextClass, getStatusDotClass } from '../../utils/statusColors'

/* ────────────────────────────────────────────────────────
 * StatusSummaryBar
 * ────────────────────────────────────────────────────────
 * A compact, single-line status bar (à la VS Code) that
 * gives an at-a-glance view of every session state.
 *
 * ┌─ 12 Sessions  │  ● 5 Active  · ● 2 Blocked  · ● 1 Waiting  · ● 4 Done ─┐
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * Design notes
 *  · Counts at zero are dimmed so attention focuses on
 *    the numbers that actually matter right now.
 *  · Colored dots double as a redundant visual channel
 *    alongside the tinted numbers — good for a11y.
 *  · Monospace numerals keep the bar rock-steady even
 *    as counts tick up and down.
 * ──────────────────────────────────────────────────────── */

interface StatusItem {
  status: 'active' | 'blocked' | 'waiting' | 'completed'
  count: number
  label: string
}

export default function StatusSummaryBar() {
  const { statusCounts, archivedCount, getWorkstreamNames } = useSessionContext()
  const workstreamCount = getWorkstreamNames.length

  const items: StatusItem[] = [
    { status: 'active',    count: statusCounts.active,    label: 'Active'  },
    { status: 'blocked',   count: statusCounts.blocked,   label: 'Blocked' },
    { status: 'waiting',   count: statusCounts.waiting,   label: 'Waiting' },
    { status: 'completed', count: statusCounts.completed, label: 'Done'    },
  ]

  return (
    <div
      role="status"
      aria-label={`${statusCounts.total} sessions: ${items.map((i) => `${i.count} ${i.label}`).join(', ')}`}
      className="
        flex items-center gap-3
        bg-surface-tertiary
        border border-border-default
        rounded-lg
        px-3.5 py-1.5
        font-mono text-xs leading-none
        select-none
      "
    >
      {/* ── Workstream count ─────────────────────────── */}
      <span className="flex items-center gap-1.5 shrink-0">
        <span className="text-sm font-semibold tabular-nums text-fg/90">
          {workstreamCount}
        </span>
        <span className="text-fg/40">{workstreamCount === 1 ? 'Workstream' : 'Workstreams'}</span>
      </span>

      {/* ── Divider ─────────────────────────────────── */}
      <span
        aria-hidden="true"
        className="w-px self-stretch bg-fg/[0.08]"
      />

      {/* ── Total count (anchor number) ─────────────── */}
      <span className="flex items-center gap-1.5 shrink-0">
        <span className="text-sm font-semibold tabular-nums text-fg/90">
          {statusCounts.total}
        </span>
        <span className="text-fg/40">Sessions</span>
      </span>

      {/* ── Divider ─────────────────────────────────── */}
      <span
        aria-hidden="true"
        className="w-px self-stretch bg-fg/[0.08]"
      />

      {/* ── Per-status counts ───────────────────────── */}
      <span className="flex items-center gap-3">
        {items.map((item, idx) => (
          <span key={item.status} className="flex items-center gap-1.5">
            {/* interpunct separator (skip before first) */}
            {idx > 0 && (
              <span aria-hidden="true" className="text-fg/15 -ml-1.5 mr-0">
                ·
              </span>
            )}

            {/* colored dot */}
            <span
              aria-hidden="true"
              className={`
                size-1.5 rounded-full shrink-0
                ${getStatusDotClass(item.status)}
                ${item.count === 0 ? 'opacity-30' : 'opacity-100'}
              `}
            />

            {/* count */}
            <span
              className={`
                font-semibold tabular-nums
                ${getStatusTextClass(item.status)}
                ${item.count === 0 ? 'opacity-30' : 'opacity-100'}
              `}
            >
              {item.count}
            </span>

            {/* label */}
            <span
              className={`
                text-fg/40
                ${item.count === 0 ? 'opacity-30' : 'opacity-100'}
              `}
            >
              {item.label}
            </span>
          </span>
        ))}
        {archivedCount > 0 && (
          <>
            <span className="text-fg/15 mx-1">·</span>
            <span>
              <span className="text-fg/30 font-semibold tabular-nums">{archivedCount}</span>
              <span className="text-fg/20"> Archived</span>
            </span>
          </>
        )}
      </span>
    </div>
  )
}
