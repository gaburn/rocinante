import { describe, it, expect } from 'vitest';
import { buildActivityBuckets } from '../activityBucketBuilder.js';
import type { ParsedEvent } from '../eventTailReader.js';

const BUCKET_COUNT = 20;

function createEvent(
  type: string,
  timestamp: string,
  data: Record<string, unknown> = {},
): ParsedEvent {
  return {
    type,
    id: `evt-${Math.random().toString(36).substring(7)}`,
    parentId: null,
    timestamp,
    data,
  };
}

describe('buildActivityBuckets', () => {
  const startedAt = '2025-01-01T00:00:00Z';
  const lastActivityAt = '2025-01-01T01:00:00Z';

  describe('empty and trivial inputs', () => {
    it('returns 20 zeros when events is empty', () => {
      const result = buildActivityBuckets([], startedAt, lastActivityAt);
      expect(result).toHaveLength(BUCKET_COUNT);
      expect(result.every((v) => v === 0)).toBe(true);
    });

    it('returns 20 zeros when all events are noise types', () => {
      const noiseTypes = ['session.heartbeat', 'session.ping', 'session.updated', 'stream.keepalive'];
      const events = noiseTypes.map((type) =>
        createEvent(type, '2025-01-01T00:30:00Z'),
      );
      const result = buildActivityBuckets(events, startedAt, lastActivityAt);
      expect(result).toHaveLength(BUCKET_COUNT);
      expect(result.every((v) => v === 0)).toBe(true);
    });
  });

  describe('same-timestamp events', () => {
    it('places all events in the center bucket when timestamps are identical', () => {
      const ts = '2025-01-01T00:30:00Z';
      const events = [
        createEvent('assistant.message', ts),
        createEvent('user.message', ts),
        createEvent('tool.result', ts),
      ];

      const result = buildActivityBuckets(events, startedAt, lastActivityAt);
      expect(result).toHaveLength(BUCKET_COUNT);

      const centerIndex = Math.floor(BUCKET_COUNT / 2); // 10
      expect(result[centerIndex]).toBe(3);

      // All other buckets should be zero
      const total = result.reduce((a, b) => a + b, 0);
      expect(total).toBe(3);
    });
  });

  describe('distributed events', () => {
    it('distributes events across buckets based on timestamp spread', () => {
      const baseMs = Date.parse('2025-01-01T00:00:00Z');
      const spanMs = 60 * 60 * 1000; // 1 hour
      const events: ParsedEvent[] = [];

      // Place events at regular intervals across the time range
      for (let i = 0; i < 20; i++) {
        const ts = new Date(baseMs + (i / 20) * spanMs).toISOString();
        events.push(createEvent('assistant.message', ts));
      }

      const result = buildActivityBuckets(events, startedAt, lastActivityAt);
      expect(result).toHaveLength(BUCKET_COUNT);

      // Total events should be preserved
      const total = result.reduce((a, b) => a + b, 0);
      expect(total).toBe(20);

      // Events should be spread, not all in one bucket
      const nonZeroBuckets = result.filter((v) => v > 0).length;
      expect(nonZeroBuckets).toBeGreaterThan(1);
    });

    it('places early events in early buckets and late events in late buckets', () => {
      const events = [
        createEvent('user.message', '2025-01-01T00:00:00Z'),
        createEvent('assistant.message', '2025-01-01T01:00:00Z'),
      ];

      const result = buildActivityBuckets(events, startedAt, lastActivityAt);
      expect(result).toHaveLength(BUCKET_COUNT);

      // First event should be in the first bucket
      expect(result[0]).toBeGreaterThan(0);
      // Last event should be in the last bucket
      expect(result[BUCKET_COUNT - 1]).toBeGreaterThan(0);
    });
  });

  describe('noise filtering', () => {
    it('filters out session.heartbeat events', () => {
      const events = [
        createEvent('session.heartbeat', '2025-01-01T00:10:00Z'),
        createEvent('assistant.message', '2025-01-01T00:20:00Z'),
        createEvent('session.heartbeat', '2025-01-01T00:30:00Z'),
      ];

      const result = buildActivityBuckets(events, startedAt, lastActivityAt);
      const total = result.reduce((a, b) => a + b, 0);
      // Only the assistant.message should be counted (same-timestamp → center bucket)
      expect(total).toBe(1);
    });

    it('filters out session.ping events', () => {
      const events = [
        createEvent('session.ping', '2025-01-01T00:15:00Z'),
        createEvent('tool.result', '2025-01-01T00:15:00Z'),
      ];

      const result = buildActivityBuckets(events, startedAt, lastActivityAt);
      const total = result.reduce((a, b) => a + b, 0);
      expect(total).toBe(1);
    });

    it('filters out stream.keepalive events', () => {
      const events = [
        createEvent('stream.keepalive', '2025-01-01T00:05:00Z'),
        createEvent('stream.keepalive', '2025-01-01T00:15:00Z'),
        createEvent('stream.keepalive', '2025-01-01T00:25:00Z'),
      ];

      const result = buildActivityBuckets(events, startedAt, lastActivityAt);
      const total = result.reduce((a, b) => a + b, 0);
      expect(total).toBe(0);
    });

    it('filters out session.updated events', () => {
      const events = [
        createEvent('session.updated', '2025-01-01T00:10:00Z'),
        createEvent('user.message', '2025-01-01T00:10:00Z'),
      ];

      const result = buildActivityBuckets(events, startedAt, lastActivityAt);
      const total = result.reduce((a, b) => a + b, 0);
      expect(total).toBe(1);
    });
  });

  describe('invalid timestamps', () => {
    it('skips events with invalid timestamps', () => {
      const events = [
        createEvent('assistant.message', 'not-a-date'),
        createEvent('user.message', '2025-01-01T00:30:00Z'),
      ];

      const result = buildActivityBuckets(events, startedAt, lastActivityAt);
      const total = result.reduce((a, b) => a + b, 0);
      // Only the valid event should be counted (single event → center bucket)
      expect(total).toBe(1);
    });

    it('returns zeros if all events have invalid timestamps', () => {
      const events = [
        createEvent('assistant.message', 'invalid1'),
        createEvent('user.message', 'also-invalid'),
      ];

      const result = buildActivityBuckets(events, startedAt, lastActivityAt);
      expect(result).toHaveLength(BUCKET_COUNT);
      expect(result.every((v) => v === 0)).toBe(true);
    });
  });

  describe('output shape', () => {
    it('always returns exactly 20 buckets', () => {
      const scenarios = [
        [],
        [createEvent('user.message', '2025-01-01T00:30:00Z')],
        Array.from({ length: 100 }, (_, i) =>
          createEvent('assistant.message', new Date(Date.parse(startedAt) + i * 1000).toISOString()),
        ),
      ];

      for (const events of scenarios) {
        const result = buildActivityBuckets(events, startedAt, lastActivityAt);
        expect(result).toHaveLength(BUCKET_COUNT);
        expect(result.every((v) => typeof v === 'number' && v >= 0)).toBe(true);
      }
    });
  });
});
