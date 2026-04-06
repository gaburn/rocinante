import { TelemetryData, ToolUsageEntry, DateCount, RepoCount, SessionStatus, AgentLeaderboardEntry } from '../../src/types/index.js';
import { getAllSessions, SqliteSession } from './sqliteReader.js';
import { readEventsTail, ParsedEvent } from './eventTailReader.js';
import { deriveSessionStatus } from './statusDeriver.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getConfig } from '../config.js';

const CACHE_TTL_MS = 30_000;

let cachedResult: TelemetryData | null = null;
let cacheTimestamp = 0;

// Read full events file scanning only for task-related lines (grep-style)
function readTaskEvents(sessionId: string): ParsedEvent[] {
  const { sessionStateDir } = getConfig();
  const filePath = path.join(sessionStateDir, sessionId, 'events.jsonl');
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const results: ParsedEvent[] = [];
    for (const line of content.split('\n')) {
      if (!line.includes('"task"')) continue;
      try {
        const parsed = JSON.parse(line) as ParsedEvent;
        if (parsed.type === 'tool.execution_start' && parsed.data) {
          const toolName = (parsed.data.toolName ?? parsed.data.tool_name ?? parsed.data.name) as string | undefined;
          if (toolName === 'task') {
            results.push(parsed);
          }
        }
      } catch {
        // skip malformed lines
      }
    }
    return results;
  } catch {
    return [];
  }
}

function toEpochMs(timestamp: string): number {
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getStartOfDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function getStartOfWeek(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d;
}

function getStartOfMonth(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

// --- Session overview ---

function computeSessionOverview(
  rows: SqliteSession[],
  rowEvents: Map<string, ParsedEvent[]>,
): TelemetryData['sessionOverview'] {
  const now = new Date();
  const startOfDay = getStartOfDay(now).getTime();
  const startOfWeek = getStartOfWeek(now).getTime();
  const startOfMonth = getStartOfMonth(now).getTime();

  const byStatus: Record<SessionStatus, number> = {
    active: 0,
    blocked: 0,
    waiting: 0,
    completed: 0,
  };

  let totalDuration = 0;
  let durationCount = 0;
  let sessionsToday = 0;
  let sessionsThisWeek = 0;
  let sessionsThisMonth = 0;

  for (const row of rows) {
    const events = rowEvents.get(row.id) ?? [];
    const derived = deriveSessionStatus(events, row.updated_at);
    byStatus[derived.status] = (byStatus[derived.status] ?? 0) + 1;

    const startMs = toEpochMs(row.created_at);
    const endMs = toEpochMs(derived.lastActivityAt);
    if (startMs > 0 && endMs > 0 && endMs >= startMs) {
      totalDuration += endMs - startMs;
      durationCount++;
    }

    if (startMs >= startOfDay) sessionsToday++;
    if (startMs >= startOfWeek) sessionsThisWeek++;
    if (startMs >= startOfMonth) sessionsThisMonth++;
  }

  return {
    totalSessions: rows.length,
    byStatus,
    averageDurationMs: durationCount > 0 ? Math.round(totalDuration / durationCount) : 0,
    sessionsToday,
    sessionsThisWeek,
    sessionsThisMonth,
  };
}

// --- Tool usage (from recent sessions only) ---

const MAX_SESSIONS_FOR_TOOLS = 50;

interface ToolStats {
  count: number;
  success: number;
  failure: number;
}

function computeToolUsage(
  rows: SqliteSession[],
  rowEvents: Map<string, ParsedEvent[]>,
): TelemetryData['toolUsage'] {
  const toolMap = new Map<string, ToolStats>();
  let totalCalls = 0;

  // Only scan the most recent sessions (rows are already sorted by updated_at DESC)
  const recentRows = rows.slice(0, MAX_SESSIONS_FOR_TOOLS);

  for (const row of recentRows) {
    const events = rowEvents.get(row.id) ?? [];

    // Build toolCallId → toolName index from start events
    // (complete events don't carry toolName)
    const callIdToName = new Map<string, string>();
    for (const event of events) {
      if (event.type === 'tool.execution_start' && event.data) {
        const name = (event.data.toolName ?? event.data.tool_name ?? event.data.name) as string | undefined;
        const callId = event.data.toolCallId as string | undefined;
        if (name && callId) {
          callIdToName.set(callId, name);
        }
      }
    }

    for (const event of events) {
      if (event.type !== 'tool.execution_complete') continue;

      const data = event.data;
      if (!data) continue;

      // Look up tool name: first try the event data, then fall back to the start-event index
      const callId = data.toolCallId as string | undefined;
      const toolName = (data.toolName ?? data.tool_name ?? data.name ??
        (callId ? callIdToName.get(callId) : undefined)) as string | undefined;
      if (!toolName) continue;

      totalCalls++;
      let stats = toolMap.get(toolName);
      if (!stats) {
        stats = { count: 0, success: 0, failure: 0 };
        toolMap.set(toolName, stats);
      }
      stats.count++;

      const success = data.success as boolean | undefined;
      const status = data.status as string | undefined;
      const error = data.error as string | undefined;
      if (success === false || status?.toLowerCase() === 'error' || status?.toLowerCase() === 'failed' || error) {
        stats.failure++;
      } else {
        stats.success++;
      }
    }
  }

  const sorted = Array.from(toolMap.entries())
    .sort((a, b) => b[1].count - a[1].count);

  const top10: ToolUsageEntry[] = sorted.slice(0, 10).map(([tool, s]) => ({
    tool,
    count: s.count,
    successCount: s.success,
    failureCount: s.failure,
  }));

  const totalSuccess = sorted.reduce((sum, [, s]) => sum + s.success, 0);
  const overallSuccessRate = totalCalls > 0 ? Math.round((totalSuccess / totalCalls) * 10000) / 100 : 100;

  return {
    totalToolCalls: totalCalls,
    top10,
    overallSuccessRate,
  };
}

// --- Activity timeline ---

function computeActivityTimeline(
  rows: SqliteSession[],
  rowEvents: Map<string, ParsedEvent[]>,
): TelemetryData['activityTimeline'] {
  const now = new Date();

  // Sessions per day — last 30 days
  const sessionsPerDayMap = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    sessionsPerDayMap.set(formatDate(d), 0);
  }
  for (const row of rows) {
    const dateStr = row.created_at.slice(0, 10);
    if (sessionsPerDayMap.has(dateStr)) {
      sessionsPerDayMap.set(dateStr, (sessionsPerDayMap.get(dateStr) ?? 0) + 1);
    }
  }
  const sessionsPerDay: DateCount[] = Array.from(sessionsPerDayMap.entries()).map(([date, count]) => ({ date, count }));

  // Events per day — last 7 days (from recent sessions only)
  const eventsPerDayMap = new Map<string, number>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    eventsPerDayMap.set(formatDate(d), 0);
  }

  const recentRows = rows.slice(0, MAX_SESSIONS_FOR_TOOLS);
  for (const row of recentRows) {
    const events = rowEvents.get(row.id) ?? [];
    for (const event of events) {
      const dateStr = event.timestamp?.slice(0, 10);
      if (dateStr && eventsPerDayMap.has(dateStr)) {
        eventsPerDayMap.set(dateStr, (eventsPerDayMap.get(dateStr) ?? 0) + 1);
      }
    }
  }
  const eventsPerDay: DateCount[] = Array.from(eventsPerDayMap.entries()).map(([date, count]) => ({ date, count }));

  return { sessionsPerDay, eventsPerDay };
}

// --- Repo distribution ---

function computeRepoDistribution(rows: SqliteSession[]): TelemetryData['repoDistribution'] {
  const repoMap = new Map<string, number>();
  const branchMap = new Map<string, number>();

  for (const row of rows) {
    if (row.repository) {
      repoMap.set(row.repository, (repoMap.get(row.repository) ?? 0) + 1);
    }
    if (row.branch) {
      branchMap.set(row.branch, (branchMap.get(row.branch) ?? 0) + 1);
    }
  }

  const topRepos: RepoCount[] = Array.from(repoMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  const topBranches: RepoCount[] = Array.from(branchMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  return { topRepos, topBranches };
}

// --- Agent statistics ---

function computeAgentStats(
  rows: SqliteSession[],
  rowEvents: Map<string, ParsedEvent[]>,
): TelemetryData['agentStats'] {
  let totalSubAgents = 0;
  let sessionsWithAgentData = 0;

  const recentRows = rows.slice(0, MAX_SESSIONS_FOR_TOOLS);
  for (const row of recentRows) {
    const events = rowEvents.get(row.id) ?? [];
    let sessionAgentCount = 0;
    for (const event of events) {
      const type = event.type.toLowerCase();
      if (type === 'agent.subagent.start' || type === 'agent.sub_agent.start' || type === 'subagent.start') {
        sessionAgentCount++;
      }
      // Also detect task tool calls that spawn sub-agents
      if (type === 'tool.execution_start') {
        const toolName = (event.data?.toolName ?? event.data?.tool_name ?? event.data?.name) as string | undefined;
        if (toolName?.toLowerCase() === 'task') {
          sessionAgentCount++;
        }
      }
    }
    totalSubAgents += sessionAgentCount;
    if (events.length > 0) sessionsWithAgentData++;
  }

  return {
    totalSubAgentsSpawned: totalSubAgents,
    averageAgentsPerSession: sessionsWithAgentData > 0
      ? Math.round((totalSubAgents / sessionsWithAgentData) * 100) / 100
      : 0,
  };
}

// --- Agent leaderboard ---

function parseAgentName(description: string): string | null {
  // Strip leading emoji (non-ASCII chars) and whitespace
  const stripped = description.replace(/^[^\x20-\x7E]+\s*/, '');
  if (!stripped) return null;
  // Take everything before the first ':' or '('
  const match = stripped.match(/^([^:(]+)/);
  if (!match) return null;
  return match[1].trim() || null;
}

function computeAgentLeaderboard(
  rows: SqliteSession[],
  _rowEvents: Map<string, ParsedEvent[]>,
): AgentLeaderboardEntry[] {
  const agentMap = new Map<string, { completed: number; succeeded: number; failed: number }>();

  const recentRows = rows.slice(0, MAX_SESSIONS_FOR_TOOLS);

  for (const row of recentRows) {
    // Read full file for task events (tail is insufficient for large sessions)
    const taskEvents = readTaskEvents(row.id);

    for (const event of taskEvents) {
      const args = event.data.arguments as Record<string, unknown> | undefined;
      const description = (args?.description ?? '') as string;
      const agent = parseAgentName(description);
      if (!agent) continue;

      let stats = agentMap.get(agent);
      if (!stats) {
        stats = { completed: 0, succeeded: 0, failed: 0 };
        agentMap.set(agent, stats);
      }
      stats.completed++;
      stats.succeeded++; // assume success for starts (completion data may not be in tail)
    }
  }

  return Array.from(agentMap.entries())
    .sort((a, b) => b[1].completed - a[1].completed)
    .slice(0, 10)
    .map(([agent, s]) => ({
      agent,
      tasksCompleted: s.completed,
      tasksSucceeded: s.succeeded,
      tasksFailed: s.failed,
    }));
}

// --- Main aggregator ---

export function aggregateTelemetry(): TelemetryData {
  const now = Date.now();
  if (cachedResult && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedResult;
  }

  const rows = getAllSessions(); // already sorted by updated_at DESC

  // Read events for recent sessions only (for tool/agent stats)
  const rowEvents = new Map<string, ParsedEvent[]>();
  for (let i = 0; i < Math.min(rows.length, MAX_SESSIONS_FOR_TOOLS); i++) {
    try {
      rowEvents.set(rows[i].id, readEventsTail(rows[i].id));
    } catch {
      rowEvents.set(rows[i].id, []);
    }
  }

  const result: TelemetryData = {
    generatedAt: new Date().toISOString(),
    sessionOverview: computeSessionOverview(rows, rowEvents),
    toolUsage: computeToolUsage(rows, rowEvents),
    activityTimeline: computeActivityTimeline(rows, rowEvents),
    repoDistribution: computeRepoDistribution(rows),
    agentStats: computeAgentStats(rows, rowEvents),
    agentLeaderboard: computeAgentLeaderboard(rows, rowEvents),
  };

  cachedResult = result;
  cacheTimestamp = now;
  return result;
}
