import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { Session, SessionSummary, SubAgent } from '../../src/types/index.js';
import { getConfig } from '../config.js';
import { sanitizeSessionId } from '../utils/sanitize.js';
import {
  SqliteSession,
  getAllSessions,
  getSessionById,
  getFirstUserMessage,
  getLastUserMessage,
  getSessionTurnDataBatch,
  getTurnCount,
  type SessionTurnData,
} from './sqliteReader.js';
import { readEventsTail, ParsedEvent } from './eventTailReader.js';
import { deriveSessionStatus, DerivedStatus } from './statusDeriver.js';
import { buildAgentTree } from './agentTreeBuilder.js';
import { buildEventTimeline } from './eventTimelineBuilder.js';
import { buildActivityBuckets } from './activityBucketBuilder.js';

const MAX_NAME_LENGTH = 80;
const MAX_INTENT_LENGTH = 200;
const UNTITLED_SESSION_NAME = 'Untitled session';

function truncate(text: string, maxLength: number): string {
  const normalized = text.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return normalized.slice(0, maxLength);
}

function getLastFolderName(cwd: string | null): string | null {
  if (!cwd) {
    return null;
  }

  const trimmedPath = cwd.trim().replace(/[\\/]+$/g, '');
  if (!trimmedPath) {
    return null;
  }

  const parts = trimmedPath.split(/[\\/]/).filter((part) => part.length > 0);
  if (parts.length === 0) {
    return null;
  }

  return parts[parts.length - 1] ?? null;
}

function getSessionName(sqlRow: SqliteSession, firstUserMessage: string | null): string {
  if (sqlRow.summary !== null) {
    return sqlRow.summary;
  }

  if (firstUserMessage && firstUserMessage.trim().length > 0) {
    return truncate(firstUserMessage, MAX_NAME_LENGTH);
  }

  const folderName = getLastFolderName(sqlRow.cwd);
  if (folderName) {
    return folderName;
  }

  return UNTITLED_SESSION_NAME;
}

function getSessionIntent(firstUserMessage: string | null, fallbackName: string): string {
  if (firstUserMessage && firstUserMessage.trim().length > 0) {
    return truncate(firstUserMessage, MAX_INTENT_LENGTH);
  }

  return fallbackName;
}

function toEpochMs(timestamp: string): number {
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getSessionCwd(sessionId: string, sqlCwd: string | null): string | null {
  if (sqlCwd && sqlCwd.trim().length > 0) {
    return sqlCwd;
  }

  try {
    const safeId = sanitizeSessionId(sessionId);
    const config = getConfig();
    const workspaceFile = path.join(config.sessionStateDir, safeId, 'workspace.yaml');
    if (fs.existsSync(workspaceFile)) {
      const content = fs.readFileSync(workspaceFile, 'utf-8');
      const data = yaml.load(content) as Record<string, unknown>;
      if (data && typeof data.cwd === 'string' && data.cwd.trim().length > 0) {
        return data.cwd;
      }
    }
  } catch {
    // Silently fall back to null
  }

  return null;
}

const MAX_ASSISTANT_UPDATES = 20;

export function extractAssistantUpdates(events: ParsedEvent[]): string[] | undefined {
  const updates: string[] = [];
  for (const event of events) {
    if (event.type.toLowerCase() !== 'assistant.message') {
      continue;
    }
    const data = event.data;
    if (!data) {
      continue;
    }
    // Include all assistant.message events with text content, even if they
    // also carry toolRequests — the coordinator often sends user-facing text
    // and tool calls in the same message.
    const content = data.content;
    if (typeof content === 'string' && content.trim().length > 0) {
      updates.push(content.trim());
    }
  }
  if (updates.length === 0) {
    return undefined;
  }
  // Keep only the most recent updates (events are in chronological order)
  return updates.slice(-MAX_ASSISTANT_UPDATES);
}

function getLatestUserMessageFromEvents(events: ParsedEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.type.toLowerCase() !== 'user.message') {
      continue;
    }
    const data = event.data;
    if (data && typeof data.content === 'string' && data.content.trim().length > 0) {
      return data.content.trim();
    }
  }
  return null;
}

function resolveLatestUserMessage(
  sessionId: string,
  events: ParsedEvent[],
  firstUserMessage: string | null,
): string | undefined {
  // Prefer the most recent user.message event from the event log
  const fromEvents = getLatestUserMessageFromEvents(events);
  if (fromEvents) {
    return truncate(fromEvents, MAX_INTENT_LENGTH);
  }

  // Fall back to the last turn in the SQLite turns table
  const fromDb = getLastUserMessage(sessionId);
  if (fromDb && fromDb.trim().length > 0) {
    // Only set if it differs from the first message (otherwise it adds no value)
    if (fromDb !== firstUserMessage) {
      return truncate(fromDb, MAX_INTENT_LENGTH);
    }
  }

  return undefined;
}

export function mapToSession(sqlRow: SqliteSession, events: ParsedEvent[]): Session {
  const firstUserMessage = getFirstUserMessage(sqlRow.id);
  const name = getSessionName(sqlRow, firstUserMessage);
  const intent = getSessionIntent(firstUserMessage, name);
  const derivedStatus: DerivedStatus = deriveSessionStatus(events, sqlRow.updated_at);
  const rootAgent = buildAgentTree(events, derivedStatus.status, name, sqlRow.created_at);

  // Override stale-completed sessions when any agent is still running.
  let finalStatus = derivedStatus.status;
  if (finalStatus === 'completed' && hasRunningAgents(rootAgent)) {
    finalStatus = 'active';
  }

  const latestUserMessage = resolveLatestUserMessage(sqlRow.id, events, firstUserMessage);
  const assistantUpdates = extractAssistantUpdates(events);

  return {
    id: sqlRow.id,
    name,
    intent,
    status: finalStatus,
    startedAt: sqlRow.created_at,
    lastActivityAt: derivedStatus.lastActivityAt,
    agentCount: countAgentsInTree(rootAgent),
    turnCount: getTurnCount(sqlRow.id),
    rootAgent,
    events: buildEventTimeline(events),
    activityBuckets: buildActivityBuckets(events, sqlRow.created_at, derivedStatus.lastActivityAt),
    blockedReason: derivedStatus.blockedReason,
    waitingFor: derivedStatus.waitingFor,
    waitingQuestion: derivedStatus.waitingQuestion,
    waitingChoices: derivedStatus.waitingChoices,
    cwd: getSessionCwd(sqlRow.id, sqlRow.cwd),
    repository: sqlRow.repository ?? null,
    branch: sqlRow.branch ?? null,
    errorDetails: derivedStatus.errorDetails,
    latestUserMessage,
    lastAssistantUpdate: assistantUpdates && assistantUpdates.length > 0
      ? assistantUpdates[assistantUpdates.length - 1]
      : undefined,
    assistantUpdates,
  };
}

function hasRunningAgents(agent: SubAgent): boolean {
  if (agent.status === 'running') {
    return true;
  }

  return agent.children.some((child) => hasRunningAgents(child));
}

function countAgentsInTree(agent: SubAgent): number {
  return 1 + agent.children.reduce((sum, child) => sum + countAgentsInTree(child), 0);
}

export function mapAllSessions(): Session[] {
  const rows = getAllSessions();
  const mappedSessions: Session[] = [];

  for (const row of rows) {
    try {
      const events = readEventsTail(row.id);
      mappedSessions.push(mapToSession(row, events));
    } catch (error) {
      console.warn('[sessionMapper] Failed to map session. Skipping.', {
        sessionId: row.id,
        error,
      });
    }
  }

  mappedSessions.sort(
    (a, b) => toEpochMs(b.lastActivityAt) - toEpochMs(a.lastActivityAt),
  );

  return mappedSessions;
}

export function mapSessionById(id: string): Session | undefined {
  const row = getSessionById(id);
  if (!row) {
    return undefined;
  }

  try {
    const events = readEventsTail(id);
    return mapToSession(row, events);
  } catch (error) {
    console.warn('[sessionMapper] Failed to map session by id.', {
      sessionId: id,
      error,
    });
    return undefined;
  }
}

/* ── Lightweight summary mapper (list endpoint) ───────────────── */

function resolveLatestUserMessageFromBatch(
  events: ParsedEvent[],
  firstUserMessage: string | null,
  lastUserMessage: string | null,
): string | undefined {
  const fromEvents = getLatestUserMessageFromEvents(events);
  if (fromEvents) {
    return truncate(fromEvents, MAX_INTENT_LENGTH);
  }

  if (lastUserMessage && lastUserMessage.trim().length > 0) {
    if (lastUserMessage !== firstUserMessage) {
      return truncate(lastUserMessage, MAX_INTENT_LENGTH);
    }
  }

  return undefined;
}

export function mapSessionSummary(
  sqlRow: SqliteSession,
  events: ParsedEvent[],
  turnData: SessionTurnData,
): SessionSummary {
  const firstUserMessage = turnData.firstMessage;
  const name = getSessionName(sqlRow, firstUserMessage);
  const intent = getSessionIntent(firstUserMessage, name);
  const derivedStatus: DerivedStatus = deriveSessionStatus(events, sqlRow.updated_at);
  const rootAgent = buildAgentTree(events, derivedStatus.status, name, sqlRow.created_at);

  let finalStatus = derivedStatus.status;
  if (finalStatus === 'completed' && hasRunningAgents(rootAgent)) {
    finalStatus = 'active';
  }

  const latestUserMessage = resolveLatestUserMessageFromBatch(
    events, firstUserMessage, turnData.lastMessage,
  );

  const assistantUpdates = extractAssistantUpdates(events);
  const lastAssistantUpdate = assistantUpdates && assistantUpdates.length > 0
    ? assistantUpdates[assistantUpdates.length - 1]
    : undefined;

  return {
    id: sqlRow.id,
    name,
    intent,
    status: finalStatus,
    startedAt: sqlRow.created_at,
    lastActivityAt: derivedStatus.lastActivityAt,
    agentCount: countAgentsInTree(rootAgent),
    turnCount: turnData.turnCount,
    blockedReason: derivedStatus.blockedReason,
    waitingFor: derivedStatus.waitingFor,
    waitingQuestion: derivedStatus.waitingQuestion,
    waitingChoices: derivedStatus.waitingChoices,
    cwd: getSessionCwd(sqlRow.id, sqlRow.cwd),
    repository: sqlRow.repository ?? null,
    branch: sqlRow.branch ?? null,
    errorDetails: derivedStatus.errorDetails,
    latestUserMessage,
    lastAssistantUpdate,
  };
}

/**
 * Map all sessions to lightweight summaries for the list endpoint.
 * Uses a single batch query for turn data instead of N+1 per-session reads.
 */
export function mapAllSessionSummaries(): SessionSummary[] {
  const rows = getAllSessions();
  const sessionIds = rows.map((r) => r.id);
  const turnDataMap = getSessionTurnDataBatch(sessionIds);

  const summaries: SessionSummary[] = [];

  for (const row of rows) {
    try {
      const events = readEventsTail(row.id);
      const turnData = turnDataMap.get(row.id) ?? {
        firstMessage: null,
        lastMessage: null,
        turnCount: 0,
      };
      summaries.push(mapSessionSummary(row, events, turnData));
    } catch (error) {
      console.warn('[sessionMapper] Failed to map session summary. Skipping.', {
        sessionId: row.id,
        error,
      });
    }
  }

  summaries.sort(
    (a, b) => toEpochMs(b.lastActivityAt) - toEpochMs(a.lastActivityAt),
  );

  return summaries;
}
