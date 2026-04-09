import { SquadCastMember } from '../../src/types/index.js';
import { ParsedEvent } from './eventTailReader.js';

/* ── Role → emoji mapping ─────────────────────────────────────── */

const ROLE_EMOJI_MAP: [RegExp, string][] = [
  [/lead|architect/i, '🏗️'],
  [/frontend|ui/i, '⚛️'],
  [/backend|api/i, '🔧'],
  [/test|qa/i, '🧪'],
  [/devops|infra/i, '⚙️'],
];

const DEFAULT_EMOJI = '👤';

function emojiForRole(role: string): string {
  for (const [pattern, emoji] of ROLE_EMOJI_MAP) {
    if (pattern.test(role)) return emoji;
  }
  return DEFAULT_EMOJI;
}

/* ── Pattern A: description field like "🔧 Amos: Refactoring auth" */

const DESCRIPTION_RE = /^(\p{Emoji_Presentation}[\uFE0F\u200D\p{Emoji_Component}]*)\s+(\w+):/u;

function tryParseDescription(description: string): { emoji: string; name: string } | null {
  const match = description.match(DESCRIPTION_RE);
  if (!match) return null;
  return { emoji: match[1], name: match[2] };
}

/* ── Pattern B: prompt text like "You are Amos, the Backend Dev" */

const PROMPT_ROLE_RE = /You are (\w+), the (.+?) on this project/i;

function tryParsePrompt(prompt: string): { name: string; role: string } | null {
  const match = prompt.match(PROMPT_ROLE_RE);
  if (!match) return null;
  return { name: match[1], role: match[2] };
}

/* ── Helpers to dig into event data ───────────────────────────── */

function getEventData(event: ParsedEvent): Record<string, unknown> | undefined {
  const d = event.data;
  return d && typeof d === 'object' ? d : undefined;
}

function getString(record: Record<string, unknown> | undefined, key: string): string | undefined {
  if (!record) return undefined;
  const v = record[key];
  return typeof v === 'string' ? v : undefined;
}

function getRecord(record: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  if (!record) return undefined;
  const v = record[key];
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : undefined;
}

function isTaskToolEvent(event: ParsedEvent): boolean {
  const type = event.type.toLowerCase();
  if (type !== 'tool.execution_start' && type !== 'assistant.message') return false;
  const data = getEventData(event);
  if (!data) return false;

  // Direct tool name on the event
  const toolName = getString(data, 'toolName') ?? getString(data, 'tool_name') ?? getString(data, 'name');
  if (typeof toolName === 'string' && toolName.toLowerCase() === 'task') return true;

  // assistant.message with toolRequests containing task calls
  const toolRequests = data.toolRequests;
  if (Array.isArray(toolRequests)) {
    for (const tr of toolRequests) {
      if (!tr || typeof tr !== 'object') continue;
      const reqName =
        (tr as Record<string, unknown>).name ??
        (tr as Record<string, unknown>).toolName ??
        (tr as Record<string, unknown>).tool_name;
      if (typeof reqName === 'string' && reqName.toLowerCase() === 'task') return true;
    }
  }

  return false;
}

interface TaskArgs {
  description?: string;
  prompt?: string;
  name?: string;
  agent_type?: string;
}

function extractTaskArgs(event: ParsedEvent): TaskArgs[] {
  const data = getEventData(event);
  if (!data) return [];

  const results: TaskArgs[] = [];

  // Direct arguments on tool.execution_start
  const args = getRecord(data, 'arguments') ?? getRecord(data, 'parameters') ?? getRecord(data, 'args');
  if (args) {
    results.push({
      description: getString(args, 'description'),
      prompt: getString(args, 'prompt'),
      name: getString(args, 'name'),
      agent_type: getString(args, 'agent_type'),
    });
  }

  // toolRequests array (assistant.message events)
  const toolRequests = data.toolRequests;
  if (Array.isArray(toolRequests)) {
    for (const tr of toolRequests) {
      if (!tr || typeof tr !== 'object') continue;
      const reqName =
        (tr as Record<string, unknown>).name ??
        (tr as Record<string, unknown>).toolName ??
        (tr as Record<string, unknown>).tool_name;
      if (typeof reqName !== 'string' || reqName.toLowerCase() !== 'task') continue;

      const trArgs =
        getRecord(tr as Record<string, unknown>, 'parameters') ??
        getRecord(tr as Record<string, unknown>, 'arguments') ??
        getRecord(tr as Record<string, unknown>, 'args') ??
        getRecord(tr as Record<string, unknown>, 'input');
      if (trArgs) {
        results.push({
          description: getString(trArgs, 'description'),
          prompt: getString(trArgs, 'prompt'),
          name: getString(trArgs, 'name'),
          agent_type: getString(trArgs, 'agent_type'),
        });
      }
    }
  }

  return results;
}

/* ── Main extractor ───────────────────────────────────────────── */

const EXCLUDED_NAMES = new Set(['scribe']);

/**
 * Extract Squad cast members from session events.
 * Scans task tool calls for agent names, roles, and emojis.
 */
export function extractSquadCast(events: ParsedEvent[]): SquadCastMember[] {
  const membersByName = new Map<string, SquadCastMember>();

  for (const event of events) {
    if (!isTaskToolEvent(event)) continue;

    const taskArgsList = extractTaskArgs(event);

    for (const taskArgs of taskArgsList) {
      // Pattern A — description field: "{emoji} {Name}: {summary}"
      if (taskArgs.description) {
        const parsed = tryParseDescription(taskArgs.description);
        if (parsed && !EXCLUDED_NAMES.has(parsed.name.toLowerCase())) {
          if (!membersByName.has(parsed.name)) {
            // Try to find role from prompt if available
            let role = 'Team Member';
            if (taskArgs.prompt) {
              const promptParsed = tryParsePrompt(taskArgs.prompt);
              if (promptParsed) role = promptParsed.role;
            }
            membersByName.set(parsed.name, {
              name: parsed.name,
              role,
              emoji: parsed.emoji,
            });
          }
          continue;
        }
      }

      // Pattern B — prompt field: "You are {Name}, the {Role} on this project."
      if (taskArgs.prompt) {
        const parsed = tryParsePrompt(taskArgs.prompt);
        if (parsed && !EXCLUDED_NAMES.has(parsed.name.toLowerCase())) {
          if (!membersByName.has(parsed.name)) {
            membersByName.set(parsed.name, {
              name: parsed.name,
              role: parsed.role,
              emoji: emojiForRole(parsed.role),
            });
          }
        }
      }
    }
  }

  // Sort: Lead/Architect first, then alphabetically by name
  const members = Array.from(membersByName.values());
  members.sort((a, b) => {
    const aIsLead = /lead|architect/i.test(a.role) ? 0 : 1;
    const bIsLead = /lead|architect/i.test(b.role) ? 0 : 1;
    if (aIsLead !== bIsLead) return aIsLead - bIsLead;
    return a.name.localeCompare(b.name);
  });

  return members;
}
