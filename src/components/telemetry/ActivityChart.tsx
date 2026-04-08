import type { DateCount } from '../../types'

interface ActivityChartProps {
  data: DateCount[]
}

export default function ActivityChart({ data }: ActivityChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-fg-secondary text-sm">
        No activity data available
      </div>
    )
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1)

  return (
    <div className="rounded-xl border border-border-default bg-surface-secondary p-5">
      <h3 className="mb-4 text-sm font-semibold text-fg-heading">
        Sessions per Day
        <span className="ml-2 text-xs font-normal text-fg-secondary">
          Last {data.length} days
        </span>
      </h3>

      <div className="relative flex">
        {/* Y-axis labels */}
        <div className="flex flex-col justify-between h-48 pr-2 text-[10px] text-fg-secondary font-mono text-right w-8 shrink-0">
          <span>{maxCount}</span>
          <span>{Math.round(maxCount * 0.75)}</span>
          <span>{Math.round(maxCount * 0.5)}</span>
          <span>{Math.round(maxCount * 0.25)}</span>
          <span>0</span>
        </div>

        <div className="relative flex-1">
          {/* Y-axis guide lines */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="border-t border-border-default/30" />
            ))}
          </div>

          <svg
            viewBox={`0 0 ${data.length * 20} 120`}
            className="w-full h-48"
            preserveAspectRatio="none"
            role="img"
            aria-label="Sessions per day bar chart"
          >
            {data.map((day, i) => {
              const barHeight = (day.count / maxCount) * 100
              const x = i * 20 + 2
              const y = 110 - barHeight

              return (
                <g key={day.date}>
                  <rect
                    x={x}
                    y={y}
                    width={16}
                    height={barHeight}
                    rx={3}
                    className="fill-blue-500/70 hover:fill-blue-400 transition-colors"
                  />
                  {/* Tooltip area */}
                  <title>
                    {day.date}: {day.count} session{day.count !== 1 ? 's' : ''}
                  </title>
                </g>
              )
            })}
          </svg>

          {/* X-axis labels — show first, middle, last */}
          <div className="mt-2 flex justify-between text-[10px] text-fg-secondary font-mono">
            <span>{formatDateLabel(data[0]?.date)}</span>
            {data.length > 2 && (
              <span>
                {formatDateLabel(data[Math.floor(data.length / 2)]?.date)}
              </span>
            )}
            <span>{formatDateLabel(data[data.length - 1]?.date)}</span>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-4 text-xs text-fg-secondary">
        <span>
          Peak:{' '}
          <span className="font-semibold text-fg-heading">{maxCount}</span>
        </span>
        <span>
          Total:{' '}
          <span className="font-semibold text-fg-heading">
            {data.reduce((sum, d) => sum + d.count, 0)}
          </span>
        </span>
      </div>
    </div>
  )
}

function formatDateLabel(date?: string): string {
  if (!date) return ''
  const d = new Date(date)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
