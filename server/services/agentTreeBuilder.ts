import { AgentStatus, SubAgent } from '../../src/types/index.js';
import { ParsedEvent } from './eventTailReader.js';

type AgentContext = {
  node: SubAgent;
  startParentId: string | null;
  hasError: boolean;
};

const MAX_TASK_LENGTH = 200;
const MAX_ARGUMENT_STRING_LENGTH = 5000;
const MAX_RESULT_CONTENT_LENGTH = 5000;
const MAX_TOOL_SUMMARY_LENGTH = 150;
const MAX_TOOL_CALLS_PER_AGENT = 5;

function getEventData(
  event: ParsedEvent,
): Record<string, unknown> | undefined {
  const dataCandidate = (event as { data?: unknown }).data;
  if (!dataCandidate || typeof dataCandidate !== 'object') {
    return undefined;
  }

  return dataCandidate as Record<string, unknown>;
}

function getString(
  record: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  if (!record) {
    return undefined;
  }

  const candidate = record[key];
  return typeof candidate === 'string' ? candidate : undefined;
}

function getRecord(
  record: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  if (!record) {
    return undefined;
  }

  const candidate = record[key];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return undefined;
  }

  return candidate as Record<string, unknown>;
}

function getToolCallIdFromData(
  data: Record<string, unknown> | undefined,
): string | undefined {
  return getString(data, 'toolCallId') ?? getString(data, 'id');
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return value.slice(0, maxLength);
}

function toToolCallSummary(
  toolName: string,
  argumentsRecord: Record<string, unknown> | undefined,
): string {
  const normalizedTool = toolName.toLowerCase();

  if (
    normalizedTool === 'bash' ||
    normalizedTool === 'powershell' ||
    normalizedTool === 'shell'
  ) {
    const command = getString(argumentsRecord, 'command') ?? toolName;
    return truncate(command, MAX_TOOL_SUMMARY_LENGTH);
  }

  if (normalizedTool === 'view') {
    return getString(argumentsRecord, 'path') ?? toolName;
  }

  if (normalizedTool === 'grep') {
    const pattern = getString(argumentsRecord, 'pattern') ?? '';
    const glob = getString(argumentsRecord, 'glob') ?? '';
    const summary = [pattern, glob].filter(Boolean).join(' ');
    return summary || toolName;
  }

  if (normalizedTool === 'edit' || normalizedTool === 'create') {
    return (
      getString(argumentsRecord, 'path') ??
      getString(argumentsRecord, 'filePath') ??
      getString(argumentsRecord, 'file') ??
      toolName
    );
  }

  const firstArgumentKey = argumentsRecord ? Object.keys(argumentsRecord)[0] : undefined;
  return firstArgumentKey ? `${toolName} ${firstArgumentKey}` : toolName;
}

function attributeToolCallToAgent(
  event: ParsedEvent,
  eventsById: Map<string, ParsedEvent>,
  agentTimeline: Map<string, { startMs: number; endMs: number }>,
  startEventToAgentId: Map<string, string>,
): string | undefined {
  let cursor = event.parentId;
  const visited = new Set<string>();

  // Strategy 1: Walk the parentId chain when event ancestry is available.
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    const parentEvent = eventsById.get(cursor);
    if (!parentEvent) {
      break;
    }

    const parentStartAgentId = startEventToAgentId.get(cursor);
    if (parentStartAgentId) {
      return parentStartAgentId;
    }

    if (parentEvent.type === 'tool.execution_start') {
      const parentData = getEventData(parentEvent);
      if (getString(parentData, 'toolName') === 'task') {
        return getToolCallIdFromData(parentData);
      }
    }

    cursor = parentEvent.parentId;
  }

  // Strategy 2: Temporal attribution when ancestry is missing in a tail-read.
  const eventMs = Date.parse(event.timestamp);
  if (Number.isNaN(eventMs)) {
    return undefined;
  }

  let bestAgentId: string | undefined;
  let bestStartMs = -1;

  for (const [agentId, range] of agentTimeline.entries()) {
    if (eventMs < range.startMs || eventMs > range.endMs) {
      continue;
    }

    if (range.startMs > bestStartMs) {
      bestStartMs = range.startMs;
      bestAgentId = agentId;
    }
  }

  return bestAgentId;
}

function sanitizeArguments(
  argumentsRecord: Record<string, unknown>,
): Record<string, string | number | boolean | null> {
  const sanitized: Record<string, string | number | boolean | null> = {};

  for (const [key, value] of Object.entries(argumentsRecord)) {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      sanitized[key] =
        typeof value === 'string'
          ? value.slice(0, MAX_ARGUMENT_STRING_LENGTH)
          : value;
    }
  }

  return sanitized;
}

function toTaskLabel(description?: string, prompt?: string): string {
  const raw = (description ?? prompt ?? '').trim();
  if (raw.length <= MAX_TASK_LENGTH) {
    return raw;
  }

  return raw.slice(0, MAX_TASK_LENGTH);
}

function mapSessionStatus(sessionStatus: string): AgentStatus {
  switch (sessionStatus.toLowerCase()) {
    case 'completed':
      return 'completed';
    case 'blocked':
      return 'blocked';
    case 'waiting':
      return 'waiting';
    case 'active':
    default:
      return 'running';
  }
}

function isErrorLikeEvent(event: ParsedEvent): boolean {
  const type = event.type.toLowerCase();
  if (type.includes('error') || type.includes('failed')) {
    return true;
  }

  const data = getEventData(event);
  if (!data) {
    return false;
  }

  const status = getString(data, 'status');
  if (status) {
    const normalized = status.toLowerCase();
    if (normalized.includes('error') || normalized.includes('failed')) {
      return true;
    }
  }

  return (
    typeof data.error === 'string' ||
    typeof data.reason === 'string'
  );
}

function getToolRequestIds(event: ParsedEvent): string[] {
  if (event.type !== 'assistant.message') {
    return [];
  }

  const data = getEventData(event);
  const toolRequests = data?.toolRequests;
  if (!Array.isArray(toolRequests)) {
    return [];
  }

  const ids: string[] = [];
  for (const item of toolRequests) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const request = item as Record<string, unknown>;
    const fromToolCallId = getString(request, 'toolCallId');
    const fromId = getString(request, 'id');
    const candidate = fromToolCallId ?? fromId;
    if (candidate) {
      ids.push(candidate);
    }
  }

  return ids;
}

function findNearestAssistantAncestor(
  parentId: string | null,
  eventsById: Map<string, ParsedEvent>,
): ParsedEvent | undefined {
  let cursor = parentId;
  const visited = new Set<string>();

  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    const parent = eventsById.get(cursor);
    if (!parent) {
      return undefined;
    }

    if (parent.type === 'assistant.message') {
      return parent;
    }

    cursor = parent.parentId;
  }

  return undefined;
}

function findNearestParentAgentId(
  startParentId: string | null,
  eventsById: Map<string, ParsedEvent>,
  eventToAgentId: Map<string, string>,
  selfId: string,
): string | undefined {
  let cursor = startParentId;
  const visited = new Set<string>();

  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    const parentAgentId = eventToAgentId.get(cursor);
    if (parentAgentId && parentAgentId !== selfId) {
      return parentAgentId;
    }

    const parentEvent = eventsById.get(cursor);
    if (!parentEvent) {
      return undefined;
    }

    cursor = parentEvent.parentId;
  }

  return undefined;
}

export function buildAgentTree(
  events: ParsedEvent[],
  sessionStatus: string,
  sessionIntent: string,
  sessionStartedAt: string,
): SubAgent {
  const root: SubAgent = {
    id: 'root',
    name: 'orchestrator',
    status: mapSessionStatus(sessionStatus),
    task: sessionIntent,
    startedAt: sessionStartedAt,
    children: [],
  };

  if (events.length === 0) {
    return root;
  }

  const eventsById = new Map<string, ParsedEvent>();
  const agentById = new Map<string, AgentContext>();
  const orderedAgentIds: string[] = [];
  const completionTimestampByAgentId = new Map<string, string>();
  const resultByAgentId = new Map<string, { content: string; success: boolean }>();
  const eventToAgentId = new Map<string, string>();
  const startEventToAgentId = new Map<string, string>();
  const assistantByRequestedAgentId = new Map<string, string>();
  const errorEventsWithoutToolCallId: ParsedEvent[] = [];

  for (const event of events) {
    if (!eventsById.has(event.id)) {
      eventsById.set(event.id, event);
    }

    for (const requestedId of getToolRequestIds(event)) {
      if (!assistantByRequestedAgentId.has(requestedId)) {
        assistantByRequestedAgentId.set(requestedId, event.id);
      }
    }

    const data = getEventData(event);
    const toolCallId = getString(data, 'toolCallId');

    if (event.type === 'tool.execution_start' && getString(data, 'toolName') === 'task') {
      if (!toolCallId || agentById.has(toolCallId)) {
        continue;
      }

      const argumentsRecord = getRecord(data, 'arguments');
      const name =
        getString(argumentsRecord, 'agent_type') ??
        getString(argumentsRecord, 'name') ??
        'task';
      const task = toTaskLabel(
        getString(argumentsRecord, 'description'),
        getString(argumentsRecord, 'prompt'),
      );

      const node: SubAgent = {
        id: toolCallId,
        name,
        status: 'running',
        task,
        startedAt: event.timestamp,
        children: [],
      };
      node.arguments = argumentsRecord ? sanitizeArguments(argumentsRecord) : undefined;

      agentById.set(toolCallId, {
        node,
        startParentId: event.parentId,
        hasError: false,
      });
      orderedAgentIds.push(toolCallId);
      eventToAgentId.set(event.id, toolCallId);
      startEventToAgentId.set(event.id, toolCallId);
      continue;
    }

    if (toolCallId && agentById.has(toolCallId) && !eventToAgentId.has(event.id)) {
      eventToAgentId.set(event.id, toolCallId);
    }

    if (event.type === 'tool.execution_complete' && toolCallId) {
      if (!completionTimestampByAgentId.has(toolCallId)) {
        completionTimestampByAgentId.set(toolCallId, event.timestamp);
      }

      if (agentById.has(toolCallId) && data && data.result !== undefined) {
        let content: string | undefined;
        if (typeof data.result === 'string') {
          content = data.result.slice(0, MAX_RESULT_CONTENT_LENGTH);
        } else if (
          typeof data.result === 'object' &&
          data.result !== null &&
          !Array.isArray(data.result)
        ) {
          const resultRecord = data.result as Record<string, unknown>;
          if (typeof resultRecord.content === 'string') {
            content = resultRecord.content.slice(0, MAX_RESULT_CONTENT_LENGTH);
          }
        }

        if (content !== undefined) {
          const success =
            data.success !== false &&
            !Object.prototype.hasOwnProperty.call(data, 'error');
          resultByAgentId.set(toolCallId, { content, success });
        }
      }
    }

    if (!isErrorLikeEvent(event)) {
      continue;
    }

    if (toolCallId && agentById.has(toolCallId)) {
      const context = agentById.get(toolCallId);
      if (context) {
        context.hasError = true;
      }
    } else {
      errorEventsWithoutToolCallId.push(event);
    }
  }

  if (agentById.size === 0) {
    return root;
  }

  for (const event of events) {
    if (eventToAgentId.has(event.id)) {
      continue;
    }

    const inferredAgentId = findNearestParentAgentId(
      event.parentId,
      eventsById,
      eventToAgentId,
      '',
    );
    if (inferredAgentId) {
      eventToAgentId.set(event.id, inferredAgentId);
    }
  }

  for (const errorEvent of errorEventsWithoutToolCallId) {
    let cursor = errorEvent.parentId;
    const visited = new Set<string>();
    while (cursor && !visited.has(cursor)) {
      visited.add(cursor);
      const parentAgentId = eventToAgentId.get(cursor);
      if (parentAgentId) {
        const parentContext = agentById.get(parentAgentId);
        if (parentContext) {
          parentContext.hasError = true;
        }
        break;
      }

      const parentEvent = eventsById.get(cursor);
      if (!parentEvent) {
        break;
      }

      cursor = parentEvent.parentId;
    }
  }

  const childrenByParentId = new Map<string, SubAgent[]>();
  const topLevel: SubAgent[] = [];

  for (const agentId of orderedAgentIds) {
    const context = agentById.get(agentId);
    if (!context) {
      continue;
    }

    const completedAt = completionTimestampByAgentId.get(agentId);
    if (completedAt) {
      context.node.status = 'completed';
      context.node.completedAt = completedAt;
    } else if (context.hasError) {
      context.node.status = 'blocked';
    } else {
      context.node.status = 'running';
    }

    const result = resultByAgentId.get(agentId);
    if (result) {
      context.node.result = result;
    }

    const assistantEventId = assistantByRequestedAgentId.get(agentId);
    const assistantEvent =
      (assistantEventId ? eventsById.get(assistantEventId) : undefined) ??
      findNearestAssistantAncestor(context.startParentId, eventsById);

    const parentFromStartChain = findNearestParentAgentId(
      context.startParentId,
      eventsById,
      eventToAgentId,
      agentId,
    );
    if (parentFromStartChain) {
      const existingChildren = childrenByParentId.get(parentFromStartChain) ?? [];
      existingChildren.push(context.node);
      childrenByParentId.set(parentFromStartChain, existingChildren);
      continue;
    }

    const parentLookupStartId = assistantEvent?.parentId ?? context.startParentId;
    const parentAgentId = findNearestParentAgentId(
      parentLookupStartId,
      eventsById,
      eventToAgentId,
      agentId,
    );

    if (!parentAgentId) {
      topLevel.push(context.node);
      continue;
    }

    const existingChildren = childrenByParentId.get(parentAgentId) ?? [];
    existingChildren.push(context.node);
    childrenByParentId.set(parentAgentId, existingChildren);
  }

  for (const agentId of orderedAgentIds) {
    const context = agentById.get(agentId);
    if (!context) {
      continue;
    }

    context.node.children = childrenByParentId.get(agentId) ?? [];
  }

  const completedToolCallIds = new Set<string>();
  for (const event of events) {
    if (event.type !== 'tool.execution_complete') {
      continue;
    }

    const completeData = getEventData(event);
    const completeId = getToolCallIdFromData(completeData);
    if (completeId) {
      completedToolCallIds.add(completeId);
    }
  }

  const toolCallsByAgentId = new Map<
    string,
    { name: string; summary: string; status: 'running' | 'completed'; timestamp: string }[]
  >();
  const agentTimeline = new Map<string, { startMs: number; endMs: number }>();
  const nowMs = Date.now();
  for (const [agentId, context] of agentById.entries()) {
    const startMs = Date.parse(context.node.startedAt);
    if (Number.isNaN(startMs)) {
      continue;
    }

    const completedAt = context.node.completedAt;
    const completedMs = completedAt ? Date.parse(completedAt) : NaN;
    const endMs = Number.isNaN(completedMs) ? nowMs : completedMs;
    agentTimeline.set(agentId, { startMs, endMs });
  }

  for (const event of events) {
    if (event.type !== 'tool.execution_start') {
      continue;
    }

    const data = getEventData(event);
    const toolName = getString(data, 'toolName');
    if (!toolName || toolName === 'task') {
      continue;
    }

    const owningAgentId = attributeToolCallToAgent(
      event,
      eventsById,
      agentTimeline,
      startEventToAgentId,
    );
    if (!owningAgentId) {
      continue;
    }

    const ownerContext = agentById.get(owningAgentId);
    if (!ownerContext) {
      continue;
    }

    const argumentsRecord = getRecord(data, 'arguments');
    const executionId = getToolCallIdFromData(data);
    const status: 'running' | 'completed' =
      executionId && completedToolCallIds.has(executionId) ? 'completed' : 'running';

    const toolCallEntry = {
      name: toolName,
      summary: toToolCallSummary(toolName, argumentsRecord),
      status,
      timestamp: event.timestamp,
    };

    const existing = toolCallsByAgentId.get(owningAgentId) ?? [];
    existing.push(toolCallEntry);
    toolCallsByAgentId.set(owningAgentId, existing);
  }

  for (const [agentId, toolCalls] of toolCallsByAgentId.entries()) {
    const context = agentById.get(agentId);
    if (!context) {
      continue;
    }

    context.node.toolCalls = toolCalls
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, MAX_TOOL_CALLS_PER_AGENT);
  }

  root.children = topLevel;
  return root;
}
