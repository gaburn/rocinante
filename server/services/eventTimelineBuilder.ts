import { ParsedEvent } from './eventTailReader.js';
import { TimelineEvent } from '../../src/types/index.js';
import { getConfig } from '../config.js';

const MAX_SUMMARY_LENGTH = 120;
const NOISE_EVENT_TYPES = new Set([
  'session.heartbeat',
  'session.ping',
  'session.updated',
  'stream.keepalive',
]);

function toEpochMs(timestamp: string): number {
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function truncateSummary(value: string): string {
  if (value.length <= MAX_SUMMARY_LENGTH) {
    return value;
  }

  return value.slice(0, MAX_SUMMARY_LENGTH);
}

function toSingleLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function getEventData(event: ParsedEvent): Record<string, unknown> | undefined {
  const candidate = (event as { data?: unknown }).data;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return undefined;
  }

  return candidate as Record<string, unknown>;
}

function getString(record: Record<string, unknown>, key: string): string | undefined {
  const candidate = record[key];
  return typeof candidate === 'string' ? candidate : undefined;
}

function getRecord(
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const candidate = record[key];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return undefined;
  }

  return candidate as Record<string, unknown>;
}

function getFirstText(
  data: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = getString(data, key);
    if (value && value.trim().length > 0) {
      return truncateSummary(toSingleLine(value));
    }
  }

  return undefined;
}

function formatTaskHint(argumentsRecord: Record<string, unknown>): string {
  const agentType =
    getString(argumentsRecord, 'agent_type') ??
    getString(argumentsRecord, 'name') ??
    'task';
  const taskText =
    getString(argumentsRecord, 'description') ??
    getString(argumentsRecord, 'prompt') ??
    '';
  const briefTask = truncateSummary(toSingleLine(taskText));

  if (!briefTask) {
    return agentType;
  }

  return `${agentType}: ${briefTask}`;
}

function formatGenericArgsHint(argumentsRecord: Record<string, unknown>): string {
  const preferredKeys = ['path', 'query', 'name', 'description', 'prompt', 'id'];
  for (const key of preferredKeys) {
    const value = getString(argumentsRecord, key);
    if (value && value.trim().length > 0) {
      return truncateSummary(toSingleLine(value));
    }
  }

  for (const [key, value] of Object.entries(argumentsRecord)) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return truncateSummary(toSingleLine(`${key}=${value}`));
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return truncateSummary(`${key}=${String(value)}`);
    }
  }

  return '';
}

function formatBriefArgs(data: Record<string, unknown>): string {
  const rawArguments = data.arguments;

  if (typeof rawArguments === 'string') {
    return truncateSummary(toSingleLine(rawArguments));
  }

  if (!rawArguments || typeof rawArguments !== 'object' || Array.isArray(rawArguments)) {
    return '';
  }

  const argumentsRecord = rawArguments as Record<string, unknown>;
  const toolName = getString(data, 'toolName')?.toLowerCase();

  if (toolName === 'view') {
    const pathValue = getString(argumentsRecord, 'path');
    return pathValue ? truncateSummary(toSingleLine(pathValue)) : '';
  }

  if (toolName === 'task') {
    return formatTaskHint(argumentsRecord);
  }

  return formatGenericArgsHint(argumentsRecord);
}

function formatBriefResult(data: Record<string, unknown>): string {
  const result = data.result;

  if (typeof result === 'string') {
    return truncateSummary(toSingleLine(result));
  }

  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const resultRecord = result as Record<string, unknown>;
    const content =
      getString(resultRecord, 'content') ??
      getString(resultRecord, 'message') ??
      getString(resultRecord, 'reason');
    if (content && content.trim().length > 0) {
      return truncateSummary(toSingleLine(content));
    }
  }

  const message = getString(data, 'message');
  if (message && message.trim().length > 0) {
    return truncateSummary(toSingleLine(message));
  }

  return '';
}

function buildSummary(event: ParsedEvent): string {
  const data = getEventData(event);
  if (!data) {
    return truncateSummary(event.type);
  }

  const normalizedType = event.type.toLowerCase();
  if (normalizedType.includes('error') || normalizedType.includes('failed')) {
    const reason =
      getFirstText(data, ['message', 'reason']) ?? truncateSummary(event.type);
    return truncateSummary(`Error: ${reason}`);
  }

  switch (normalizedType) {
    case 'session.start':
      return 'Session started';
    case 'session.resume':
      return 'Session resumed';
    case 'session.shutdown':
      return 'Session ended';
    case 'session.info': {
      const infoText =
        getFirstText(data, ['content', 'message']) ?? truncateSummary(event.type);
      return truncateSummary(`Info: ${infoText}`);
    }
    case 'user.message': {
      const userText = getFirstText(data, ['content']) ?? truncateSummary(event.type);
      return truncateSummary(`User: ${userText}`);
    }
    case 'assistant.message': {
      const toolRequests = data.toolRequests;
      if (Array.isArray(toolRequests) && toolRequests.length > 0) {
        return `Assistant requested ${toolRequests.length} tool(s)`;
      }

      const assistantText =
        getFirstText(data, ['content']) ?? truncateSummary(event.type);
      return truncateSummary(`Assistant: ${assistantText}`);
    }
    case 'assistant.turn_start':
      return 'Turn started';
    case 'tool.execution_start': {
      const toolName = getString(data, 'toolName') ?? 'tool';
      const briefArgs = formatBriefArgs(data);
      if (!briefArgs) {
        return `${toolName}()`;
      }

      return truncateSummary(`${toolName}(${briefArgs})`);
    }
    case 'tool.execution_complete': {
      const briefResult = formatBriefResult(data);
      if (!briefResult) {
        return 'Tool completed';
      }

      return truncateSummary(`Tool completed: ${briefResult}`);
    }
    default:
      return truncateSummary(event.type);
  }
}

function toTimelineEvent(event: ParsedEvent): TimelineEvent {
  const data = getEventData(event);
  const toolCallId = data ? getString(data, 'toolCallId') : undefined;

  const timelineEvent: TimelineEvent = {
    id: event.id,
    type: event.type,
    timestamp: event.timestamp,
    parentId: event.parentId,
    summary: buildSummary(event),
  };

  if (toolCallId && toolCallId.trim().length > 0) {
    timelineEvent.toolCallId = toolCallId;
  }

  return timelineEvent;
}

export function buildEventTimeline(events: ParsedEvent[]): TimelineEvent[] {
  const { maxTimelineEvents } = getConfig();

  if (events.length === 0) {
    return [];
  }

  const filtered = events.filter(
    (event) => !NOISE_EVENT_TYPES.has(event.type.toLowerCase()),
  );

  const timeline = filtered
    .map(toTimelineEvent)
    .sort((a, b) => toEpochMs(b.timestamp) - toEpochMs(a.timestamp));

  return timeline.slice(0, maxTimelineEvents);
}
