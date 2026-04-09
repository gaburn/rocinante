import { describe, it, expect } from 'vitest';
import { extractSquadCast } from '../squadCastExtractor.js';
import type { ParsedEvent } from '../eventTailReader.js';

function makeEvent(overrides: Partial<ParsedEvent> = {}): ParsedEvent {
  return {
    type: 'tool.execution_start',
    id: 'evt-1',
    parentId: null,
    timestamp: '2026-04-10T00:00:00Z',
    data: {},
    ...overrides,
  };
}

describe('extractSquadCast', () => {
  it('returns empty array when no task tool events exist', () => {
    const events: ParsedEvent[] = [
      makeEvent({ type: 'user.message', data: { content: 'hello' } }),
      makeEvent({ type: 'assistant.message', data: { content: 'hi' } }),
    ];
    expect(extractSquadCast(events)).toEqual([]);
  });

  it('extracts from Pattern A — description field', () => {
    const events: ParsedEvent[] = [
      makeEvent({
        data: {
          toolName: 'task',
          arguments: {
            description: '🔧 Amos: Refactoring auth module',
            prompt: 'You are Amos, the Backend Dev on this project.',
            name: 'amos',
            agent_type: 'general-purpose',
          },
        },
      }),
    ];
    const cast = extractSquadCast(events);
    expect(cast).toHaveLength(1);
    expect(cast[0]).toEqual({ name: 'Amos', role: 'Backend Dev', emoji: '🔧' });
  });

  it('extracts from Pattern B — prompt text only', () => {
    const events: ParsedEvent[] = [
      makeEvent({
        data: {
          toolName: 'task',
          arguments: {
            prompt: 'You are Naomi, the Frontend Dev on this project.\nDo stuff.',
            name: 'naomi',
            agent_type: 'general-purpose',
          },
        },
      }),
    ];
    const cast = extractSquadCast(events);
    expect(cast).toHaveLength(1);
    expect(cast[0]).toEqual({ name: 'Naomi', role: 'Frontend Dev', emoji: '⚛️' });
  });

  it('derives emoji from role when no emoji in description', () => {
    const events: ParsedEvent[] = [
      makeEvent({
        data: {
          toolName: 'task',
          arguments: {
            prompt: 'You are Jordan, the QA Engineer on this project.',
            name: 'jordan',
          },
        },
      }),
    ];
    const cast = extractSquadCast(events);
    expect(cast).toHaveLength(1);
    expect(cast[0].emoji).toBe('🧪');
  });

  it('deduplicates by name (same agent spawned multiple times)', () => {
    const events: ParsedEvent[] = [
      makeEvent({
        id: 'evt-1',
        data: {
          toolName: 'task',
          arguments: {
            description: '🔧 Amos: Task one',
            prompt: 'You are Amos, the Backend Dev on this project.',
          },
        },
      }),
      makeEvent({
        id: 'evt-2',
        data: {
          toolName: 'task',
          arguments: {
            description: '🔧 Amos: Task two',
            prompt: 'You are Amos, the Backend Dev on this project.',
          },
        },
      }),
    ];
    const cast = extractSquadCast(events);
    expect(cast).toHaveLength(1);
    expect(cast[0].name).toBe('Amos');
  });

  it('excludes Scribe from cast', () => {
    const events: ParsedEvent[] = [
      makeEvent({
        data: {
          toolName: 'task',
          arguments: {
            description: '📝 Scribe: Logging decisions',
            prompt: 'You are Scribe, the Silent Recorder on this project.',
          },
        },
      }),
      makeEvent({
        id: 'evt-2',
        data: {
          toolName: 'task',
          arguments: {
            description: '🔧 Amos: Building API',
            prompt: 'You are Amos, the Backend Dev on this project.',
          },
        },
      }),
    ];
    const cast = extractSquadCast(events);
    expect(cast).toHaveLength(1);
    expect(cast[0].name).toBe('Amos');
  });

  it('sorts Lead first, then alphabetically', () => {
    const events: ParsedEvent[] = [
      makeEvent({
        id: 'evt-1',
        data: {
          toolName: 'task',
          arguments: {
            description: '🔧 Amos: Backend stuff',
            prompt: 'You are Amos, the Backend Dev on this project.',
          },
        },
      }),
      makeEvent({
        id: 'evt-2',
        data: {
          toolName: 'task',
          arguments: {
            description: '🏗️ Holden: Leading the team',
            prompt: 'You are Holden, the Lead on this project.',
          },
        },
      }),
      makeEvent({
        id: 'evt-3',
        data: {
          toolName: 'task',
          arguments: {
            description: '⚛️ Naomi: Frontend work',
            prompt: 'You are Naomi, the Frontend Dev on this project.',
          },
        },
      }),
    ];
    const cast = extractSquadCast(events);
    expect(cast).toHaveLength(3);
    expect(cast[0].name).toBe('Holden');
    expect(cast[1].name).toBe('Amos');
    expect(cast[2].name).toBe('Naomi');
  });

  it('handles assistant.message with toolRequests containing task calls', () => {
    const events: ParsedEvent[] = [
      makeEvent({
        type: 'assistant.message',
        data: {
          content: 'Spawning agents',
          toolRequests: [
            {
              id: 'tc-1',
              name: 'task',
              parameters: {
                description: '⚛️ Naomi: Building login form',
                prompt: 'You are Naomi, the Frontend Dev on this project.',
                name: 'naomi',
                agent_type: 'general-purpose',
              },
            },
            {
              id: 'tc-2',
              name: 'task',
              parameters: {
                description: '🔧 Amos: API endpoints',
                prompt: 'You are Amos, the Backend Dev on this project.',
                name: 'amos',
                agent_type: 'general-purpose',
              },
            },
          ],
        },
      }),
    ];
    const cast = extractSquadCast(events);
    expect(cast).toHaveLength(2);
    expect(cast.map((m) => m.name)).toEqual(['Amos', 'Naomi']);
  });

  it('assigns default emoji for unknown role', () => {
    const events: ParsedEvent[] = [
      makeEvent({
        data: {
          toolName: 'task',
          arguments: {
            prompt: 'You are Riley, the Documentation Specialist on this project.',
          },
        },
      }),
    ];
    const cast = extractSquadCast(events);
    expect(cast).toHaveLength(1);
    expect(cast[0].emoji).toBe('👤');
    expect(cast[0].role).toBe('Documentation Specialist');
  });

  it('handles DevOps/Infra role emoji', () => {
    const events: ParsedEvent[] = [
      makeEvent({
        data: {
          toolName: 'task',
          arguments: {
            prompt: 'You are Kai, the DevOps Engineer on this project.',
          },
        },
      }),
    ];
    const cast = extractSquadCast(events);
    expect(cast[0].emoji).toBe('⚙️');
  });

  it('ignores non-task tool events', () => {
    const events: ParsedEvent[] = [
      makeEvent({
        data: {
          toolName: 'bash',
          arguments: { command: 'echo hello' },
        },
      }),
      makeEvent({
        data: {
          toolName: 'task',
          arguments: {
            prompt: 'You are Amos, the Backend Dev on this project.',
          },
        },
      }),
    ];
    const cast = extractSquadCast(events);
    expect(cast).toHaveLength(1);
    expect(cast[0].name).toBe('Amos');
  });
});
