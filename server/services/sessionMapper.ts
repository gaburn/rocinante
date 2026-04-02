import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { Session, SubAgent } from '../../src/types/index.js';
import { getConfig } from '../config.js';
import {
  SqliteSession,
  getAllSessions,
  getSessionById,
  getFirstUserMessage,
  getLastUserMessage,
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
    const config = getConfig();
    const workspaceFile = path.join(config.sessionStateDir, sessionId, 'workspace.yaml');
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

function extractAssistantUpdates(events: ParsedEvent[]): string[] | undefined {
  const updates: string[] = [];
  for (const event of events) {
    if (event.type.toLowerCase() !== 'assistant.message') {
      continue;
    }
    const data = event.data;
    if (!data) {
      continue;
    }
    // Skip tool-calling turns — only keep pure text responses
    const toolRequests = data.toolRequests;
    if (Array.isArray(toolRequests) && toolRequests.length > 0) {
      continue;
    }
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
    rootAgent,
    events: buildEventTimeline(events),
    activityBuckets: buildActivityBuckets(events, sqlRow.created_at, derivedStatus.lastActivityAt),
    blockedReason: derivedStatus.blockedReason,
    waitingFor: derivedStatus.waitingFor,
    cwd: getSessionCwd(sqlRow.id, sqlRow.cwd),
    repository: sqlRow.repository ?? null,
    branch: sqlRow.branch ?? null,
    errorDetails: derivedStatus.errorDetails,
    latestUserMessage,
    assistantUpdates,
  };
}

function hasRunningAgents(agent: SubAgent): boolean {
  if (agent.status === 'running') {
    return true;
  }

  return agent.children.some((child) => hasRunningAgents(child));
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
