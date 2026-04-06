import type { ToolUsage } from '../../types/telemetry'

interface ToolLeaderboardProps {
  data: ToolUsage[]
}

export default function ToolLeaderboard({ data }: ToolLeaderboardProps) {
  const maxCount = Math.max(...data.map((d) => d.count), 1)

  return (
    <div className="rounded-xl border border-border-default bg-surface-secondary p-5">
      <h3 className="mb-4 text-sm font-semibold text-fg-heading">
        Top Tools
        <span className="ml-2 text-xs font-normal text-fg-secondary">
          by usage count
        </span>
      </h3>

      {data.length === 0 ? (
        <div className="flex h-20 items-center justify-center text-fg-secondary text-sm">
          No tool usage data
        </div>
      ) : (
        <div className="space-y-2">
          {data.slice(0, 10).map((tool, i) => {
            const pct = (tool.count / maxCount) * 100
            return (
              <div key={tool.name} className="flex items-center gap-3">
                {/* Rank */}
                <span className="w-5 text-right text-xs font-mono text-fg-secondary/60">
                  {i + 1}
                </span>

                {/* Tool name */}
                <span className="w-32 truncate text-xs font-mono text-fg-heading">
                  {tool.name}
                </span>

                {/* Bar */}
                <div className="flex-1 h-4 rounded bg-surface-tertiary overflow-hidden">
                  <div
                    className="h-full rounded bg-blue-500/60 transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {/* Count */}
                <span className="w-12 text-right text-xs font-mono font-semibold text-fg-secondary">
                  {tool.count.toLocaleString()}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
