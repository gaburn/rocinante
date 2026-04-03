import { ErrorDetail, SessionStatus } from '../../src/types/index.js';
import { getConfig } from '../config.js';
import { ParsedEvent } from './eventTailReader.js';

export interface DerivedStatus {
  status: SessionStatus;
  lastActivityAt: string;
  blockedReason?: string;
  errorDetails?: ErrorDetail[];
  waitingFor?: string;
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
  return [...events].sort(
    (a, b) => toEpochMs(getEventTimestamp(b)) - toEpochMs(getEventTimestamp(a)),
  );
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

  // 3. Active (fresh + ongoing tool/agent activity)
  if (fresh) {
    const hasRecentExecutionActivity = sortedEvents.some((event) => {
      const type = event.type.toLowerCase();
      return (
        type === 'tool.execution_start' ||
        type === 'tool.execution_complete' ||
        (type === 'assistant.message' && hasToolRequests(event)) ||
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

