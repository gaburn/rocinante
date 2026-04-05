import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deriveSessionStatus } from '../statusDeriver.js';
import { ParsedEvent } from '../eventTailReader.js';

// Mock the config module
vi.mock('../../config.js', () => ({
  getConfig: vi.fn(() => ({
    staleThresholdMs: 300000, // 5 minutes - high enough that test events are "fresh"
  })),
}));

describe('statusDeriver - ask_user detection', () => {
  const now = Date.now();
  const freshTimestamp = new Date(now).toISOString();
  const staleTimestamp = new Date(now - 400000).toISOString(); // 6+ minutes ago

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createEvent(
    type: string,
    data: Record<string, unknown>,
    timestamp = freshTimestamp,
  ): ParsedEvent {
    return {
      type,
      id: `evt-${Math.random().toString(36).substring(7)}`,
      parentId: null,
      timestamp,
      data,
    };
  }

  describe('ask_user detection with "name" field', () => {
    it('should detect ask_user as only tool request and set waiting status with question and choices', () => {
      const events: ParsedEvent[] = [
        createEvent('assistant.message', {
          toolRequests: [
            {
              name: 'ask_user',
              parameters: {
                question: 'What database?',
                choices: ['PostgreSQL', 'MySQL'],
              },
            },
          ],
        }),
      ];

      const result = deriveSessionStatus(events, freshTimestamp);

      expect(result.status).toBe('waiting');
      expect(result.waitingFor).toBe('user input');
      expect(result.waitingQuestion).toBe('What database?');
      expect(result.waitingChoices).toEqual(['PostgreSQL', 'MySQL']);
    });

    it('should detect ask_user with no choices (freeform input)', () => {
      const events: ParsedEvent[] = [
        createEvent('assistant.message', {
          toolRequests: [
            {
              name: 'ask_user',
              parameters: {
                question: 'What should I name it?',
              },
            },
          ],
        }),
      ];

      const result = deriveSessionStatus(events, freshTimestamp);

      expect(result.status).toBe('waiting');
      expect(result.waitingFor).toBe('user input');
      expect(result.waitingQuestion).toBe('What should I name it?');
      expect(result.waitingChoices).toBeUndefined();
    });

    it('should detect ask_user with empty choices array', () => {
      const events: ParsedEvent[] = [
        createEvent('assistant.message', {
          toolRequests: [
            {
              name: 'ask_user',
              parameters: {
                question: 'Enter your API key',
                choices: [],
              },
            },
          ],
        }),
      ];

      const result = deriveSessionStatus(events, freshTimestamp);

      expect(result.status).toBe('waiting');
      expect(result.waitingQuestion).toBe('Enter your API key');
      expect(result.waitingChoices).toBeUndefined(); // Empty array should be normalized to undefined
    });

    it('should prioritize ask_user when mixed with other tool requests', () => {
      const events: ParsedEvent[] = [
        createEvent('assistant.message', {
          toolRequests: [
            {
              name: 'report_intent',
              parameters: { intent: 'Checking config' },
            },
            {
              name: 'ask_user',
              parameters: {
                question: 'Which approach?',
                choices: ['Option A', 'Option B'],
              },
            },
          ],
        }),
      ];

      const result = deriveSessionStatus(events, freshTimestamp);

      expect(result.status).toBe('waiting');
      expect(result.waitingQuestion).toBe('Which approach?');
      expect(result.waitingChoices).toEqual(['Option A', 'Option B']);
    });
  });

  describe('ask_user detection with "toolName" field (alternate schema)', () => {
    it('should detect ask_user using toolName field with arguments', () => {
      const events: ParsedEvent[] = [
        createEvent('assistant.message', {
          toolRequests: [
            {
              toolName: 'ask_user',
              arguments: {
                question: 'Continue with deployment?',
                choices: ['Yes', 'No'],
              },
            },
          ],
        }),
      ];

      const result = deriveSessionStatus(events, freshTimestamp);

      expect(result.status).toBe('waiting');
      expect(result.waitingQuestion).toBe('Continue with deployment?');
      expect(result.waitingChoices).toEqual(['Yes', 'No']);
    });

    it('should handle toolName with arguments (no choices)', () => {
      const events: ParsedEvent[] = [
        createEvent('assistant.message', {
          toolRequests: [
            {
              toolName: 'ask_user',
              arguments: { question: 'Enter commit message' },
            },
          ],
        }),
      ];

      const result = deriveSessionStatus(events, freshTimestamp);

      expect(result.status).toBe('waiting');
      expect(result.waitingQuestion).toBe('Enter commit message');
      expect(result.waitingChoices).toBeUndefined();
    });
  });

  describe('non-ask_user tool requests', () => {
    it('should remain active for non-ask_user tool requests', () => {
      const events: ParsedEvent[] = [
        createEvent('assistant.message', {
          toolRequests: [
            {
              name: 'edit',
              parameters: { path: 'foo.ts', old_str: 'a', new_str: 'b' },
            },
          ],
        }),
      ];

      const result = deriveSessionStatus(events, freshTimestamp);

      expect(result.status).toBe('active');
      expect(result.waitingQuestion).toBeUndefined();
      expect(result.waitingChoices).toBeUndefined();
    });

    it('should remain active for multiple non-ask_user tool requests', () => {
      const events: ParsedEvent[] = [
        createEvent('assistant.message', {
          toolRequests: [
            { name: 'report_intent', parameters: { intent: 'Testing' } },
            { name: 'view', parameters: { path: 'src/index.ts' } },
            { name: 'powershell', parameters: { command: 'npm test' } },
          ],
        }),
      ];

      const result = deriveSessionStatus(events, freshTimestamp);

      expect(result.status).toBe('active');
    });
  });

  describe('stale ask_user events', () => {
    it('should return completed status for stale ask_user event', () => {
      const events: ParsedEvent[] = [
        createEvent(
          'assistant.message',
          {
            toolRequests: [
              {
                name: 'ask_user',
                parameters: { question: 'Old question?' },
              },
            ],
          },
          staleTimestamp,
        ),
      ];

      const result = deriveSessionStatus(events, staleTimestamp);

      expect(result.status).toBe('completed');
      expect(result.waitingQuestion).toBeUndefined();
    });
  });

  describe('ask_user after session.shutdown', () => {
    it('should return completed when session.shutdown exists (shutdown wins)', () => {
      const shutdownTime = new Date(now - 10000).toISOString();
      const events: ParsedEvent[] = [
        createEvent('session.shutdown', {}, shutdownTime),
        createEvent('assistant.message', {
          toolRequests: [
            {
              name: 'ask_user',
              parameters: { question: 'Too late?' },
            },
          ],
        }),
      ];

      const result = deriveSessionStatus(events, freshTimestamp);

      expect(result.status).toBe('completed');
      expect(result.waitingQuestion).toBeUndefined();
      expect(result.lastActivityAt).toBe(shutdownTime);
    });
  });

  describe('existing behavior preserved', () => {
    it('should maintain waiting status for assistant.message without toolRequests', () => {
      const events: ParsedEvent[] = [
        createEvent('assistant.message', {
          content: 'Here is your answer',
        }),
      ];

      const result = deriveSessionStatus(events, freshTimestamp);

      expect(result.status).toBe('waiting');
      expect(result.waitingFor).toBe('user input');
      // No question or choices for standard assistant messages
      expect(result.waitingQuestion).toBeUndefined();
      expect(result.waitingChoices).toBeUndefined();
    });

    it('should remain active for tool.execution_start events', () => {
      const events: ParsedEvent[] = [
        createEvent('tool.execution_start', { toolName: 'grep' }),
      ];

      const result = deriveSessionStatus(events, freshTimestamp);

      expect(result.status).toBe('active');
    });
  });

  describe('edge cases', () => {
    it('should handle malformed toolRequests gracefully', () => {
      const events: ParsedEvent[] = [
        createEvent('assistant.message', {
          toolRequests: [
            {
              name: 'ask_user',
              // Missing parameters
            },
          ],
        }),
      ];

      const result = deriveSessionStatus(events, freshTimestamp);

      // Should still detect as waiting but without question details
      expect(result.status).toBe('waiting');
    });

    it('should handle toolRequests with null/undefined question', () => {
      const events: ParsedEvent[] = [
        createEvent('assistant.message', {
          toolRequests: [
            {
              name: 'ask_user',
              parameters: { question: null },
            },
          ],
        }),
      ];

      const result = deriveSessionStatus(events, freshTimestamp);

      expect(result.status).toBe('waiting');
      expect(result.waitingQuestion).toBeUndefined();
    });

    it('should handle multiple ask_user requests (take most recent)', () => {
      const olderTime = new Date(now - 5000).toISOString();
      const events: ParsedEvent[] = [
        createEvent(
          'assistant.message',
          {
            toolRequests: [
              {
                name: 'ask_user',
                parameters: { question: 'First question?' },
              },
            ],
          },
          olderTime,
        ),
        createEvent('assistant.message', {
          toolRequests: [
            {
              name: 'ask_user',
              parameters: {
                question: 'Second question?',
                choices: ['A', 'B'],
              },
            },
          ],
        }),
      ];

      const result = deriveSessionStatus(events, freshTimestamp);

      expect(result.status).toBe('waiting');
      // Should use the most recent ask_user
      expect(result.waitingQuestion).toBe('Second question?');
      expect(result.waitingChoices).toEqual(['A', 'B']);
    });

    it('should handle ask_user after error event (error has priority)', () => {
      const errorTime = freshTimestamp;
      const events: ParsedEvent[] = [
        createEvent('assistant.message', {
          toolRequests: [
            {
              name: 'ask_user',
              parameters: { question: 'What to do?' },
            },
          ],
        }),
        createEvent(
          'tool.execution_error',
          { error: 'Fatal error occurred' },
          errorTime,
        ),
      ];

      const result = deriveSessionStatus(events, freshTimestamp);

      // Error is most recent meaningful event - should be blocked
      expect(result.status).toBe('blocked');
      expect(result.blockedReason).toBe('Fatal error occurred');
    });
  });

  describe('question text extraction', () => {
    it('should extract question from parameters.question', () => {
      const events: ParsedEvent[] = [
        createEvent('assistant.message', {
          toolRequests: [
            {
              name: 'ask_user',
              parameters: { question: 'Select your framework' },
            },
          ],
        }),
      ];

      const result = deriveSessionStatus(events, freshTimestamp);

      expect(result.waitingQuestion).toBe('Select your framework');
    });

    it('should extract question from arguments.question (toolName variant)', () => {
      const events: ParsedEvent[] = [
        createEvent('assistant.message', {
          toolRequests: [
            {
              toolName: 'ask_user',
              arguments: { question: 'Confirm action?' },
            },
          ],
        }),
      ];

      const result = deriveSessionStatus(events, freshTimestamp);

      expect(result.waitingQuestion).toBe('Confirm action?');
    });

    it('should handle empty string question', () => {
      const events: ParsedEvent[] = [
        createEvent('assistant.message', {
          toolRequests: [
            {
              name: 'ask_user',
              parameters: { question: '' },
            },
          ],
        }),
      ];

      const result = deriveSessionStatus(events, freshTimestamp);

      expect(result.status).toBe('waiting');
      expect(result.waitingQuestion).toBeUndefined(); // Empty string should be normalized
    });

    it('should preserve whitespace in question text', () => {
      const events: ParsedEvent[] = [
        createEvent('assistant.message', {
          toolRequests: [
            {
              name: 'ask_user',
              parameters: { question: '  Should I proceed?  ' },
            },
          ],
        }),
      ];

      const result = deriveSessionStatus(events, freshTimestamp);

      // Question should be preserved as-is (trimming is display layer concern)
      expect(result.waitingQuestion).toBe('  Should I proceed?  ');
    });
  });

  describe('choices array handling', () => {
    it('should extract choices array from parameters', () => {
      const events: ParsedEvent[] = [
        createEvent('assistant.message', {
          toolRequests: [
            {
              name: 'ask_user',
              parameters: {
                question: 'Pick one',
                choices: ['Red', 'Green', 'Blue'],
              },
            },
          ],
        }),
      ];

      const result = deriveSessionStatus(events, freshTimestamp);

      expect(result.waitingChoices).toEqual(['Red', 'Green', 'Blue']);
    });

    it('should handle single-choice array', () => {
      const events: ParsedEvent[] = [
        createEvent('assistant.message', {
          toolRequests: [
            {
              name: 'ask_user',
              parameters: { question: 'Only option', choices: ['OK'] },
            },
          ],
        }),
      ];

      const result = deriveSessionStatus(events, freshTimestamp);

      expect(result.waitingChoices).toEqual(['OK']);
    });

    it('should normalize non-array choices to undefined', () => {
      const events: ParsedEvent[] = [
        createEvent('assistant.message', {
          toolRequests: [
            {
              name: 'ask_user',
              parameters: { question: 'Test', choices: 'not-an-array' },
            },
          ],
        }),
      ];

      const result = deriveSessionStatus(events, freshTimestamp);

      expect(result.waitingChoices).toBeUndefined();
    });
  });
});
