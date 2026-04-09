import { ErrorDetail, SessionStatus } from '../../src/types/index.js';
import { getConfig } from '../config.js';
import { ParsedEvent } from './eventTailReader.js';

export interface DerivedStatus {
  status: SessionStatus;
  lastActivityAt: string;
  blockedReason?: string;
  errorDetails?: ErrorDetail[];
  waitingFor?: string;
  waitingQuestion?: string;
  waitingChoices?: string[];
}

function toEpochMs(timestamp: string): number {
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getEventTimestamp(event: ParsedEvent): string {
  const candidate = (event as { timestamp?: unknown }).timestamp;
  return typeof candidate === 'string' ? candidate : '';
}

function getEventData(
  event: ParsedEvent,
): Record<string, unknown> | undefined {
  const candidate = (event as { data?: unknown }).data;
  if (!candidate || typeof candidate !== 'object') {
    return undefined;
  }
  return candidate as Record<string, unknown>;
}

function getBlockedReason(event: ParsedEvent): string | undefined {
  const data = getEventData(event);
  if (!data) {
    return undefined;
  }

  const reasonCandidate =
    data.message ?? data.reason ?? data.error ?? data.details;

  if (typeof reasonCandidate === 'string' && reasonCandidate.trim().length > 0) {
    return reasonCandidate;
  }

  return undefined;
}

function hasToolRequests(event: ParsedEvent): boolean {
  const data = getEventData(event);
  const toolRequests = data?.toolRequests;
  return Array.isArray(toolRequests) && toolRequests.length > 0;
}

interface AskUserToolRequest {
  question?: string;
  choices?: string[];
}

function getAskUserRequest(event: ParsedEvent): AskUserToolRequest | null {
  const data = getEventData(event);
  const toolRequests = data?.toolRequests;
  
  if (!Array.isArray(toolRequests)) {
    return null;
  }

  for (const toolRequest of toolRequests) {
    if (!toolRequest || typeof toolRequest !== 'object') {
      continue;
    }

    // Check for ask_user, askUser, or ask-user tool names
    const toolName = 
      (toolRequest as { name?: unknown }).name ??
      (toolRequest as { toolName?: unknown }).toolName ??
      (toolRequest as { tool_name?: unknown }).tool_name;

    if (typeof toolName === 'string') {
      const normalized = toolName.toLowerCase().replace(/[-_]/g, '');
      if (normalized === 'askuser') {
        // Extract question and choices from parameters/arguments/args/input
        const params = 
          (toolRequest as { parameters?: unknown }).parameters ??
          (toolRequest as { arguments?: unknown }).arguments ??
          (toolRequest as { args?: unknown }).args ??
          (toolRequest as { input?: unknown }).input;

        if (params && typeof params === 'object') {
          const question = (params as { question?: unknown }).question;
          const choices = (params as { choices?: unknown }).choices;

          const q = typeof question === 'string' && question !== '' ? question : undefined;
          const c = Array.isArray(choices) ? choices.filter((v): v is string => typeof v === 'string') : undefined;
          return {
            question: q,
            choices: c && c.length > 0 ? c : undefined,
          };
        }

        return {};
      }
    }
  }

  return null;
}

function isUserCancellation(event: ParsedEvent): boolean {
  const type = event.type.toLowerCase();
  if (type.includes('cancel')) return true;

  const data = getEventData(event);
  if (!data) return false;

  for (const field of [data.message, data.reason, data.error]) {
    if (typeof field === 'string' && field.toLowerCase().includes('cancelled by user')) {
      return true;
    }
  }
  return false;
}

function isErrorLikeEvent(event: ParsedEvent): boolean {
  // User cancellations are intentional, not errors
  if (isUserCancellation(event)) return false;

  const type = event.type.toLowerCase();
  if (type.includes('error') || type.includes('failed')) {
    return true;
  }

  const data = getEventData(event);
  if (!data) {
    return false;
  }

  const status = data.status;
  if (typeof status === 'string') {
    const normalizedStatus = status.toLowerCase();
    if (normalizedStatus.includes('error') || normalizedStatus.includes('failed')) {
      return true;
    }
  }

  return (
    typeof data.error === 'string' ||
    typeof data.reason === 'string' ||
    typeof data.message === 'string'
  );
}

function collectErrorDetails(events: ParsedEvent[]): ErrorDetail[] {
  const errorDetails = events
    .filter(isErrorLikeEvent)
    .map((event) => ({
      eventType: event.type,
      message: getBlockedReason(event) ?? event.type,
      timestamp: getEventTimestamp(event),
    }))
    .sort((a, b) => toEpochMs(b.timestamp) - toEpochMs(a.timestamp));

  return errorDetails.slice(0, 10);
}

function isAskUserToolExecution(event: ParsedEvent): boolean {
  const data = getEventData(event);
  if (!data) return false;
  const toolName = data.toolName ?? data.tool_name ?? data.name;
  if (typeof toolName !== 'string') return false;
  const normalized = toolName.toLowerCase().replace(/[-_]/g, '');
  return normalized === 'askuser';
}

function getToolCallId(event: ParsedEvent): string | undefined {
  const data = getEventData(event);
  if (!data) return undefined;
  const id = data.toolCallId ?? data.tool_call_id;
  return typeof id === 'string' ? id : undefined;
}

function findAskUserFromToolExecution(
  toolEvent: ParsedEvent,
  allEvents: ParsedEvent[],
): AskUserToolRequest | null {
  const toolCallId = getToolCallId(toolEvent);

  // Search the parent assistant.message event for matching toolCallId
  for (const event of allEvents) {
    if (event.type.toLowerCase() !== 'assistant.message') continue;
    const data = getEventData(event);
    const toolRequests = data?.toolRequests;
    if (!Array.isArray(toolRequests)) continue;

    for (const tr of toolRequests) {
      if (!tr || typeof tr !== 'object') continue;
      const trId =
        (tr as { id?: unknown }).id ??
        (tr as { toolCallId?: unknown }).toolCallId ??
        (tr as { tool_call_id?: unknown }).tool_call_id;

      const matchById = toolCallId && typeof trId === 'string' && trId === toolCallId;
      if (!matchById) continue;

      // Found the matching tool request — extract question/choices
      const params =
        (tr as { parameters?: unknown }).parameters ??
        (tr as { arguments?: unknown }).arguments ??
        (tr as { args?: unknown }).args ??
        (tr as { input?: unknown }).input;

      if (params && typeof params === 'object') {
        const question = (params as { question?: unknown }).question;
        const choices = (params as { choices?: unknown }).choices;
        const q = typeof question === 'string' && question !== '' ? question : undefined;
        const c = Array.isArray(choices) ? choices.filter((v): v is string => typeof v === 'string') : undefined;
        return {
          question: q,
          choices: c && c.length > 0 ? c : undefined,
        };
      }
      return {};
    }
  }

  // Fallback: no matching parent found, still return empty ask_user info
  return {};
}

function findAskUserParentMessage(
  sortedEvents: ParsedEvent[],
  toolExecEvent: ParsedEvent,
): ParsedEvent | null {
  const data = getEventData(toolExecEvent);
  const toolCallId = data?.toolCallId ?? data?.tool_call_id;
  if (typeof toolCallId !== 'string') return null;

  for (const event of sortedEvents) {
    if (event.type.toLowerCase() !== 'assistant.message') continue;
    const msgData = getEventData(event);
    const toolRequests = msgData?.toolRequests;
    if (!Array.isArray(toolRequests)) continue;
    for (const req of toolRequests) {
      if (!req || typeof req !== 'object') continue;
      const reqId =
        (req as Record<string, unknown>).id ??
        (req as Record<string, unknown>).toolCallId ??
        (req as Record<string, unknown>).tool_call_id;
      if (typeof reqId === 'string' && reqId === toolCallId) {
        return event;
      }
    }
  }
  return null;
}

function isAgentActivity(type: string): boolean {
  const normalizedType = type.toLowerCase();
  return (
    normalizedType.startsWith('agent.') ||
    normalizedType.includes('.agent.') ||
    normalizedType.includes('agent_') ||
    normalizedType.includes('agent.')
  );
}

function isWaitingSignalEvent(event: ParsedEvent): boolean {
  const type = event.type.toLowerCase();
  return (
    type.includes('waiting') ||
    type.includes('awaiting_user') ||
    type.includes('awaiting-input') ||
    type.includes('awaiting_input') ||
    type.includes('user_input_needed') ||
    type.includes('turn.completed') ||
    type.includes('assistant.completed') ||
    type.includes('response.completed')
  );
}

function getSortedByRecency(events: ParsedEvent[]): ParsedEvent[] {
  const indexed = events.map((event, idx) => ({ event, idx }));
  indexed.sort((a, b) => {
    const diff = toEpochMs(getEventTimestamp(b.event)) - toEpochMs(getEventTimestamp(a.event));
    if (diff !== 0) return diff;
    return b.idx - a.idx; // Later file position = more recent
  });
  return indexed.map(({ event }) => event);
}

function isWithinThreshold(timestamp: string): boolean {
  const { staleThresholdMs } = getConfig();
  const ms = toEpochMs(timestamp);
  return ms > 0 && Date.now() - ms <= staleThresholdMs;
}

function getLastMeaningfulEvent(events: ParsedEvent[]): ParsedEvent | null {
  const ignorableTypes = new Set([
    'session.heartbeat',
    'session.ping',
    'session.updated',
    'stream.keepalive',
    'hook.start',
    'hook.end',
  ]);

  for (const event of getSortedByRecency(events)) {
    if (!ignorableTypes.has(event.type.toLowerCase())) {
      return event;
    }
  }

  return null;
}

function getMostRecentTimestamp(events: ParsedEvent[]): string | null {
  if (events.length === 0) {
    return null;
  }

  let latestTimestamp = '';
  let latestEpoch = -1;

  for (const event of events) {
    const timestamp = getEventTimestamp(event);
    const epoch = toEpochMs(timestamp);
    if (epoch > latestEpoch) {
      latestEpoch = epoch;
      latestTimestamp = timestamp;
    }
  }

  return latestTimestamp || null;
}

/* ── Squad session detection ──────────────────────────────────── */

const SQUAD_STRING_SIGNALS = [
  '.squad/',
  'squad.agent.md',
  '"name":"scribe"',
  '"name":"Scribe"',
  'Squad (Coordinator)',
];

/**
 * Detect whether a session is a Squad session by scanning event data
 * for Squad-specific signals (agent paths, governance files, spawn patterns).
 * Returns true only when a signal is found; undefined otherwise (for sparse DTO).
 */
export function detectSquadSession(events: ParsedEvent[]): boolean {
  for (const event of events) {
    const raw = JSON.stringify(event.data);
    for (const signal of SQUAD_STRING_SIGNALS) {
      if (raw.includes(signal)) {
        return true;
      }
    }

    // Check for task tool calls spawning squad-named agents
    const type = event.type.toLowerCase();
    if (
      (type === 'tool.execution_start' || type === 'assistant.message') &&
      event.data
    ) {
      const data = event.data;
      const toolName = (data.toolName ?? data.tool_name ?? data.name) as string | undefined;
      if (typeof toolName === 'string' && toolName.toLowerCase() === 'task') {
        const args = (data.arguments ?? data.parameters ?? data.args) as Record<string, unknown> | undefined;
        if (args && typeof args === 'object') {
          const agentType = args.agent_type;
          const agentName = args.name;
          if (
            agentType === 'general-purpose' &&
            typeof agentName === 'string' &&
            /^(scribe|amos|priya|jordan|kai|riley|squad)/i.test(agentName)
          ) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

export function deriveSessionStatus(
  events: ParsedEvent[],
  updatedAt: string,
): DerivedStatus {
  if (events.length === 0) {
    const status: SessionStatus = isWithinThreshold(updatedAt) ? 'active' : 'completed';
    return {
      status,
      lastActivityAt: updatedAt,
    };
  }

  const sortedEvents = getSortedByRecency(events);
  const mostRecentEvent = sortedEvents[0];
  const mostRecentTimestamp =
    getMostRecentTimestamp(events) ?? getEventTimestamp(mostRecentEvent);
  const normalizedRecentType = mostRecentEvent.type.toLowerCase();

  // 1. Completed (session.shutdown wins over all other signals)
  const shutdownEvent = sortedEvents.find(
    (event) => event.type.toLowerCase() === 'session.shutdown',
  );
  if (shutdownEvent) {
    return {
      status: 'completed',
      lastActivityAt: getEventTimestamp(shutdownEvent),
    };
  }

  // 2. Blocked (error-like/failure-like signal — only if the error IS the most recent meaningful event)
  const lastMeaningful = getLastMeaningfulEvent(sortedEvents);

  const mostRecentErrorEvent = sortedEvents.find(isErrorLikeEvent);
  if (mostRecentErrorEvent && lastMeaningful) {
    const errorTime = toEpochMs(getEventTimestamp(mostRecentErrorEvent));
    const lastMeaningfulTime = toEpochMs(getEventTimestamp(lastMeaningful));
    // Only blocked if the error is the most recent meaningful event (or newer)
    if (errorTime >= lastMeaningfulTime) {
      return {
        status: 'blocked',
        lastActivityAt: mostRecentTimestamp,
        blockedReason: getBlockedReason(mostRecentErrorEvent),
        errorDetails: collectErrorDetails(events),
      };
    }
  }

  const fresh = isWithinThreshold(mostRecentTimestamp);

  // 2.5. Ask-user waiting (takes priority over general active detection)
  // If the most recent meaningful event is an ask_user tool execution,
  // the session is waiting for user input — even if other tools recently completed.
  if (fresh && lastMeaningful) {
    if (isAskUserToolExecution(lastMeaningful)) {
      const parentMessage = findAskUserParentMessage(sortedEvents, lastMeaningful);
      const askUserRequest = parentMessage ? getAskUserRequest(parentMessage) : null;
      return {
        status: 'waiting',
        lastActivityAt: mostRecentTimestamp,
        waitingFor: 'user input',
        waitingQuestion: askUserRequest?.question,
        waitingChoices: askUserRequest?.choices,
      };
    }

    // Also check: if the most recent assistant.message has ask_user as a tool request
    // and ask_user hasn't completed yet (no matching tool.execution_complete)
    if (lastMeaningful.type.toLowerCase() === 'assistant.message') {
      const askReq = getAskUserRequest(lastMeaningful);
      if (askReq) {
        return {
          status: 'waiting',
          lastActivityAt: mostRecentTimestamp,
          waitingFor: 'user input',
          waitingQuestion: askReq.question,
          waitingChoices: askReq.choices,
        };
      }
    }
  }

  // 3. Active (fresh + ongoing tool/agent activity)
  if (fresh) {
    const hasRecentExecutionActivity = sortedEvents.some((event) => {
      const type = event.type.toLowerCase();
      // Don't count ask_user tool requests as execution activity
      if (type === 'assistant.message' && hasToolRequests(event)) {
        const askUserRequest = getAskUserRequest(event);
        if (askUserRequest !== null) {
          return false; // ask_user is waiting, not active
        }
        return true; // Other tool requests are active
      }
      if (
        (type === 'tool.execution_start' || type === 'tool.execution_complete') &&
        isAskUserToolExecution(event)
      ) {
        return false; // ask_user tool execution is waiting, not active
      }
      return (
        type === 'tool.execution_start' ||
        type === 'tool.execution_complete' ||
        isAgentActivity(type)
      );
    });

    if (hasRecentExecutionActivity) {
      return {
        status: 'active',
        lastActivityAt: mostRecentTimestamp,
      };
    }
  }

  // 4. Waiting (fresh but assistant appears to have finished its turn)
  if (fresh) {
    // Check for ask_user tool execution as the latest meaningful event
    if (lastMeaningful) {
      const lastMeaningfulType = lastMeaningful.type.toLowerCase();
      if (
        (lastMeaningfulType === 'tool.execution_start' || lastMeaningfulType === 'tool.execution_complete') &&
        isAskUserToolExecution(lastMeaningful)
      ) {
        const askUserInfo = findAskUserFromToolExecution(lastMeaningful, sortedEvents);
        return {
          status: 'waiting',
          lastActivityAt: mostRecentTimestamp,
          waitingFor: 'user input',
          waitingQuestion: askUserInfo?.question,
          waitingChoices: askUserInfo?.choices,
        };
      }
    }

    // Check for ask_user tool request in assistant.message
    if (normalizedRecentType === 'assistant.message') {
      const askUserRequest = getAskUserRequest(mostRecentEvent);
      if (askUserRequest !== null) {
        return {
          status: 'waiting',
          lastActivityAt: mostRecentTimestamp,
          waitingFor: 'user input',
          waitingQuestion: askUserRequest.question,
          waitingChoices: askUserRequest.choices,
        };
      }
    }

    const isAssistantMessageWithoutToolRequests =
      normalizedRecentType === 'assistant.message' && !hasToolRequests(mostRecentEvent);
    const hasWaitingSignal =
      (lastMeaningful !== null && isWaitingSignalEvent(lastMeaningful)) ||
      isAssistantMessageWithoutToolRequests;

    if (hasWaitingSignal) {
      return {
        status: 'waiting',
        lastActivityAt: mostRecentTimestamp,
        waitingFor: 'user input',
      };
    }
  }

  // 5. Stale => Completed
  if (!fresh) {
    return {
      status: 'completed',
      lastActivityAt: mostRecentTimestamp,
    };
  }

  // Fresh but not clearly active/blocked/waiting: default to active.
  return {
    status: 'active',
    lastActivityAt: mostRecentTimestamp,
  };
}

