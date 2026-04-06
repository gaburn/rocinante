export type SessionStatus = 'active' | 'blocked' | 'waiting' | 'completed';

export type AgentStatus = 'running' | 'completed' | 'blocked' | 'waiting';

export interface TimelineEvent {
  id: string;
  type: string;
  timestamp: string;
  parentId: string | null;
  summary: string;
  toolCallId?: string;
}

export interface SubAgent {
  id: string;
  name: string;
  status: AgentStatus;
  task: string;
  startedAt: string;
  completedAt?: string;
  toolCalls?: {
    name: string;
    summary: string;
    status: 'running' | 'completed';
    timestamp: string;
  }[];
  result?: {
    content: string;
    success: boolean;
  };
  arguments?: {
    prompt?: string;
    description?: string;
    agent_type?: string;
    name?: string;
    mode?: string;
    model?: string;
    [key: string]: unknown;
  };
  children: SubAgent[];
}

export interface ErrorDetail {
  eventType: string;
  message: string;
  timestamp: string;
}

export interface Session {
  id: string;
  name: string;
  intent: string;
  status: SessionStatus;
  startedAt: string;
  lastActivityAt: string;
  rootAgent: SubAgent;
  blockedReason?: string;
  waitingFor?: string;
  waitingQuestion?: string;
  waitingChoices?: string[];
  cwd?: string | null;
  repository?: string | null;
  branch?: string | null;
  errorDetails?: ErrorDetail[];
  events?: TimelineEvent[];
  activityBuckets?: number[];
  latestUserMessage?: string;
  assistantUpdates?: string[];
}

export interface StatusCounts {
  active: number;
  blocked: number;
  waiting: number;
  completed: number;
  total: number;
}

export interface PlanTask {
  id: string;
  title: string;
  description?: string;
}

export interface PlanSection {
  title: string;
  tasks: PlanTask[];
}

export interface SessionPlan {
  raw: string;
  sections: PlanSection[];
}

export interface ToolUsageEntry {
  tool: string;
  count: number;
  successCount: number;
  failureCount: number;
}

export interface DateCount {
  date: string;
  count: number;
}

export interface RepoCount {
  name: string;
  count: number;
}

export interface AgentLeaderboardEntry {
  agent: string;
  tasksCompleted: number;
  tasksSucceeded: number;
  tasksFailed: number;
}

export interface TelemetryData {
  generatedAt: string;

  sessionOverview: {
    totalSessions: number;
    byStatus: Record<SessionStatus, number>;
    averageDurationMs: number;
    sessionsToday: number;
    sessionsThisWeek: number;
    sessionsThisMonth: number;
  };

  toolUsage: {
    totalToolCalls: number;
    top10: ToolUsageEntry[];
    overallSuccessRate: number;
  };

  activityTimeline: {
    sessionsPerDay: DateCount[];
    eventsPerDay: DateCount[];
  };

  repoDistribution: {
    topRepos: RepoCount[];
    topBranches: RepoCount[];
  };

  agentStats: {
    totalSubAgentsSpawned: number;
    averageAgentsPerSession: number;
  };

  agentLeaderboard: AgentLeaderboardEntry[];
}
