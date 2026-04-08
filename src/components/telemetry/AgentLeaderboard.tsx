import type { AgentLeaderboardEntry } from '../../types'

interface AgentLeaderboardProps {
  data: AgentLeaderboardEntry[]
}

export default function AgentLeaderboard({ data }: AgentLeaderboardProps) {
  const maxCount = Math.max(...data.map((d) => d.tasksCompleted), 1)

  return (
    <div className="rounded-xl border border-border-default bg-surface-secondary p-5">
      <h3 className="mb-4 text-sm font-semibold text-fg-heading">
        Agent Leaderboard
        <span className="ml-2 text-xs font-normal text-fg-secondary">
          by tasks completed
        </span>
      </h3>

      {data.length === 0 ? (
        <div className="flex h-20 items-center justify-center text-fg-secondary text-sm">
          No agent task data
        </div>
      ) : (
        <div className="space-y-2">
          {data.slice(0, 10).map((entry, i) => {
            const pct = (entry.tasksCompleted / maxCount) * 100
            const successRate =
              entry.tasksCompleted > 0
                ? Math.round(
                    (entry.tasksSucceeded / entry.tasksCompleted) * 100,
                  )
                : 100

            return (
              <div key={entry.agent} className="flex items-center gap-3">
                {/* Rank */}
                <span className="w-5 text-right text-xs font-mono text-fg-secondary/60">
                  {i + 1}
                </span>

                {/* Agent name */}
                <span className="w-32 truncate text-xs font-mono text-fg-heading">
                  {entry.agent}
                </span>

                {/* Bar */}
                <div className="flex-1 h-4 rounded bg-surface-tertiary overflow-hidden">
                  <div
                    className="h-full rounded bg-violet-500/60 transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {/* Count + success badge */}
                <span className="w-12 text-right text-xs font-mono font-semibold text-fg-secondary">
                  {entry.tasksCompleted.toLocaleString()}
                </span>

                {successRate < 100 && (
                  <span className="ml-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-mono text-amber-400">
                    {successRate}%
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
