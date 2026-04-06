import type { StatusBreakdownEntry } from '../../types/telemetry'
import {
  getStatusDotClass,
  getStatusLabel,
  getStatusTextClass,
} from '../../utils/statusColors'
import type { SessionStatus } from '../../types'

interface StatusBreakdownProps {
  data: StatusBreakdownEntry[]
}

const STATUS_BAR_COLORS: Record<SessionStatus, string> = {
  active: 'bg-emerald-400',
  blocked: 'bg-red-400',
  waiting: 'bg-amber-400',
  completed: 'bg-gray-500',
}

export default function StatusBreakdown({ data }: StatusBreakdownProps) {
  const total = data.reduce((sum, d) => sum + d.count, 0)

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
        {data
          .filter((d) => d.count > 0)
          .map((entry) => {
            const pct = (entry.count / total) * 100
            return (
              <div
                key={entry.status}
                className={`${STATUS_BAR_COLORS[entry.status]} transition-all duration-300`}
                style={{ width: `${pct}%` }}
                title={`${getStatusLabel(entry.status)}: ${entry.count} (${pct.toFixed(1)}%)`}
              />
            )
          })}
      </div>

      {/* Legend */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        {data.map((entry) => {
          const pct = total > 0 ? ((entry.count / total) * 100).toFixed(1) : '0'
          return (
            <div key={entry.status} className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${getStatusDotClass(entry.status)}`}
              />
              <span className={`text-xs ${getStatusTextClass(entry.status)}`}>
                {getStatusLabel(entry.status)}
              </span>
              <span className="ml-auto text-xs font-mono text-fg-secondary">
                {entry.count}{' '}
                <span className="text-fg-secondary/60">({pct}%)</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
