import {
  getStatusDotClass,
  getStatusLabel,
  getStatusTextClass,
} from '../../utils/statusColors'
import type { SessionStatus } from '../../types'

interface StatusBreakdownProps {
  data: Record<SessionStatus, number>
}

const STATUS_BAR_COLORS: Record<SessionStatus, string> = {
  active: 'bg-emerald-400',
  blocked: 'bg-red-400',
  waiting: 'bg-amber-400',
  completed: 'bg-gray-500',
}

export default function StatusBreakdown({ data }: StatusBreakdownProps) {
  const entries = (Object.entries(data) as [SessionStatus, number][])
  const total = entries.reduce((sum, [, count]) => sum + count, 0)

  if (total === 0) {
    return (
      <div className="rounded-xl border border-border-default bg-surface-secondary p-5">
        <h3 className="mb-4 text-sm font-semibold text-fg-heading">
          Status Distribution
        </h3>
        <div className="flex h-20 items-center justify-center text-fg-secondary text-sm">
          No data available
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border-default bg-surface-secondary p-5">
      <h3 className="mb-4 text-sm font-semibold text-fg-heading">
        Status Distribution
      </h3>

      {/* Stacked horizontal bar */}
      <div className="flex h-6 w-full overflow-hidden rounded-full bg-surface-tertiary">
        {entries
          .filter(([, count]) => count > 0)
          .map(([status, count]) => {
            const pct = (count / total) * 100
            return (
              <div
                key={status}
                className={`${STATUS_BAR_COLORS[status]} transition-all duration-300`}
                style={{ width: `${pct}%` }}
                title={`${getStatusLabel(status)}: ${count} (${pct.toFixed(1)}%)`}
              />
            )
          })}
      </div>

      {/* Legend */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        {entries.map(([status, count]) => {
          const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0'
          return (
            <div key={status} className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${getStatusDotClass(status)}`}
              />
              <span className={`text-xs ${getStatusTextClass(status)}`}>
                {getStatusLabel(status)}
              </span>
              <span className="ml-auto text-xs font-mono text-fg-secondary">
                {count}{' '}
                <span className="text-fg-secondary/60">({pct}%)</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
