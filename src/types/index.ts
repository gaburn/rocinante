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
