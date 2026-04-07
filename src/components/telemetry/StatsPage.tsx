import { useTelemetry } from '../../hooks/useTelemetry'
import StatCard from './StatCard'
import ActivityChart from './ActivityChart'
import StatusBreakdown from './StatusBreakdown'
import ModelBreakdown from './ModelBreakdown'
import TokenUtilization from './TokenUtilization'
import ToolLeaderboard from './ToolLeaderboard'
import AgentLeaderboard from './AgentLeaderboard'

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  if (m >= 60) {
    const h = Math.floor(m / 60)
    const rm = m % 60
    return `${h}h ${rm}m`
  }
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

export default function StatsPage() {
  const { data, isLoading, error, refresh } = useTelemetry()

  if (isLoading && !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
          <span className="text-sm text-fg-secondary">
            Loading telemetry…
          </span>
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="text-red-400 text-sm">{error}</span>
          <button
            type="button"
            onClick={refresh}
            className="rounded-md bg-surface-tertiary px-3 py-1.5 text-xs text-fg-secondary hover:text-fg-heading hover:bg-surface-hover transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="h-full overflow-y-auto layout-scrollable">
      <div className="mx-auto max-w-6xl p-6 space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-fg-heading">
              Session Analytics
            </h2>
            <p className="text-xs text-fg-secondary mt-0.5">
              Telemetry overview · auto-refreshes every 30s
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={isLoading}
            className="rounded-md bg-surface-tertiary px-3 py-1.5 text-xs text-fg-secondary hover:text-fg-heading hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Sessions"
            value={data.sessionOverview.totalSessions.toLocaleString()}
            icon={<SessionsIcon />}
          />
          <StatCard
            label="Active Now"
            value={data.sessionOverview.byStatus.active}
            icon={<ActiveIcon />}
            accent="text-emerald-400"
            indicator="green"
          />
          <StatCard
            label="Avg Duration"
            value={formatDuration(data.sessionOverview.averageDurationMs / 1000)}
            icon={<ClockIcon />}
          />
          <StatCard
            label="Tool Calls"
            value={data.toolUsage.totalToolCalls.toLocaleString()}
            icon={<ToolIcon />}
            accent="text-blue-400"
          />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ActivityChart data={data.activityTimeline.sessionsPerDay} />
          <StatusBreakdown data={data.sessionOverview.byStatus} />
        </div>

        {/* Model utilization */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ModelBreakdown data={data.modelUtilization} />
          <TokenUtilization data={data.tokenUtilization} />
        </div>

        {/* Bottom row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ToolLeaderboard data={data.toolUsage.top10} />
          <AgentLeaderboard data={data.agentLeaderboard} />
        </div>

        {/* Repo row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Repository breakdown */}
          <div className="rounded-xl border border-border-default bg-surface-secondary p-5">
            <h3 className="mb-4 text-sm font-semibold text-fg-heading">
              Top Repositories
              <span className="ml-2 text-xs font-normal text-fg-secondary">
                by session count
              </span>
            </h3>
            {data.repoDistribution.topRepos.length === 0 ? (
              <div className="flex h-20 items-center justify-center text-fg-secondary text-sm">
                No repository data
              </div>
            ) : (
              <div className="space-y-3">
                {data.repoDistribution.topRepos.slice(0, 5).map((repo, i) => (
                  <div
                    key={repo.name}
                    className="flex items-center justify-between rounded-lg bg-surface-tertiary/50 px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-mono text-fg-secondary/60 w-4 text-right shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-xs font-mono text-fg-heading truncate">
                        {repo.name}
                      </span>
                    </div>
                    <span className="text-xs font-mono font-semibold text-blue-400 shrink-0 ml-2">
                      {repo.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Inline SVG micro-icons ── */

function SessionsIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="12" height="10" rx="2" />
      <line x1="2" y1="7" x2="14" y2="7" />
    </svg>
  )
}

function ActiveIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="2 8 5 8 6.5 4 8 11 10 6 11.5 8 14 8" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
      <polyline points="8 4.5 8 8 10.5 9.5" />
    </svg>
  )
}

function ToolIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.5 2.5l3 3-8.5 8.5H2v-3L10.5 2.5z" />
      <line x1="8.5" y1="4.5" x2="11.5" y2="7.5" />
    </svg>
  )
}
