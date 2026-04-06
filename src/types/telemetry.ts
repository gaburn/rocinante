import type { SessionStatus } from './index'

export interface DailyActivity {
  date: string
  count: number
}

export interface ToolUsage {
  name: string
  count: number
}

export interface RepoBreakdown {
  repository: string
  count: number
}

export interface StatusBreakdownEntry {
  status: SessionStatus
  count: number
}

export interface TelemetryData {
  totalSessions: number
  activeSessions: number
  avgDurationSeconds: number
  totalToolCalls: number
  dailyActivity: DailyActivity[]
  statusBreakdown: StatusBreakdownEntry[]
  topTools: ToolUsage[]
  topRepositories: RepoBreakdown[]
}
