import { describe, it, expect } from 'vitest';
import { extractAssistantUpdates } from '../sessionMapper.js';
import type { ParsedEvent } from '../eventTailReader.js';

function createEvent(
  type: string,
  data: Record<string, unknown>,
  timestamp = new Date().toISOString(),
): ParsedEvent {
  return {
    type,
    id: `evt-${Math.random().toString(36).substring(7)}`,
    parentId: null,
    timestamp,
    data,
  };
}

describe('extractAssistantUpdates', () => {
  describe('basic content extraction', () => {
    it('includes content from assistant.message without toolRequests', () => {
      const events: ParsedEvent[] = [
        createEvent('assistant.message', { content: 'Hello, I can help!' }),
      ];
      const result = extractAssistantUpdates(events);
      expect(result).toEqual(['Hello, I can help!']);
    });

    it('includes content from assistant.message WITH toolRequests AND content (the fix)', () => {
      const events: ParsedEvent[] = [
        createEvent('assistant.message', {
          content: 'Let me search for that file.',
          toolRequests: [{ name: 'grep', parameters: { pattern: 'foo' } }],
        }),
      ];
      const result = extractAssistantUpdates(events);
      expect(result).toEqual(['Let me search for that file.']);
    });

    it('excludes assistant.message with toolRequests but empty content', () => {
      const events: ParsedEvent[] = [
        createEvent('assistant.message', {
          content: '',
          toolRequests: [{ name: 'grep', parameters: { pattern: 'foo' } }],
        }),
      ];
      const result = extractAssistantUpdates(events);
      expect(result).toBeUndefined();
    });

    it('excludes assistant.message with toolRequests and whitespace-only content', () => {
      const events: ParsedEvent[] = [
        createEvent('assistant.message', {
          content: '   \n  ',
          toolRequests: [{ name: 'grep', parameters: {} }],
        }),
      ];
      const result = extractAssistantUpdates(events);
      expect(result).toBeUndefined();
    });
  });

  describe('filtering and edge cases', () => {
    it('returns undefined when no events are provided', () => {
      expect(extractAssistantUpdates([])).toBeUndefined();
    });

    it('returns undefined when no assistant.message events exist', () => {
      const events: ParsedEvent[] = [
        createEvent('user.message', { content: 'Hi' }),
        createEvent('tool.result', { output: 'done' }),
      ];
      expect(extractAssistantUpdates(events)).toBeUndefined();
    });

    it('returns undefined when assistant.message has no data', () => {
      const events: ParsedEvent[] = [
        { type: 'assistant.message', id: 'e1', parentId: null, timestamp: new Date().toISOString(), data: undefined as unknown as Record<string, unknown> },
      ];
      expect(extractAssistantUpdates(events)).toBeUndefined();
    });

    it('returns undefined when content is not a string', () => {
      const events: ParsedEvent[] = [
        createEvent('assistant.message', { content: 42 }),
      ];
      expect(extractAssistantUpdates(events)).toBeUndefined();
    });

    it('trims whitespace from content', () => {
      const events: ParsedEvent[] = [
        createEvent('assistant.message', { content: '  trimmed text  ' }),
      ];
      const result = extractAssistantUpdates(events);
      expect(result).toEqual(['trimmed text']);
    });

    it('handles case-insensitive type matching', () => {
      const events: ParsedEvent[] = [
        createEvent('Assistant.Message', { content: 'Works with caps' }),
      ];
      const result = extractAssistantUpdates(events);
      expect(result).toEqual(['Works with caps']);
    });

    it('collects multiple assistant messages in order', () => {
      const events: ParsedEvent[] = [
        createEvent('assistant.message', { content: 'First' }),
        createEvent('user.message', { content: 'question' }),
        createEvent('assistant.message', { content: 'Second' }),
        createEvent('assistant.message', { content: 'Third' }),
      ];
      const result = extractAssistantUpdates(events);
      expect(result).toEqual(['First', 'Second', 'Third']);
    });
  });

  describe('MAX_ASSISTANT_UPDATES limit (20)', () => {
    it('limits updates to the most recent 20', () => {
      const events: ParsedEvent[] = [];
      for (let i = 0; i < 25; i++) {
        events.push(createEvent('assistant.message', { content: `Update ${i}` }));
      }

      const result = extractAssistantUpdates(events);
      expect(result).toHaveLength(20);
      // Should keep the last 20 (indices 5..24)
      expect(result![0]).toBe('Update 5');
      expect(result![19]).toBe('Update 24');
    });

    it('returns all updates when exactly at the limit', () => {
      const events: ParsedEvent[] = [];
      for (let i = 0; i < 20; i++) {
        events.push(createEvent('assistant.message', { content: `Update ${i}` }));
      }

      const result = extractAssistantUpdates(events);
      expect(result).toHaveLength(20);
      expect(result![0]).toBe('Update 0');
      expect(result![19]).toBe('Update 19');
    });

    it('returns all updates when below the limit', () => {
      const events: ParsedEvent[] = [
        createEvent('assistant.message', { content: 'Only one' }),
      ];
      const result = extractAssistantUpdates(events);
      expect(result).toHaveLength(1);
    });
  });
});
