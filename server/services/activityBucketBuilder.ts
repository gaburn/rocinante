import type { ParsedEvent } from './eventTailReader.js';

const BUCKET_COUNT = 20;
const NOISE_EVENT_TYPES = new Set([
  'session.heartbeat',
  'session.ping',
  'session.updated',
  'stream.keepalive',
]);

/* eslint-disable @typescript-eslint/no-unused-vars */
export function buildActivityBuckets(
  events: ParsedEvent[],
  _startedAt: string,
  _lastActivityAt: string,
): number[] {
  /* eslint-enable @typescript-eslint/no-unused-vars */
  if (events.length === 0) {
    return Array.from({ length: BUCKET_COUNT }, () => 0);
  }

  // Filter to meaningful events and collect their timestamps
  const eventTimestamps: number[] = [];
  for (const event of events) {
    if (NOISE_EVENT_TYPES.has(event.type)) continue;
    const eventMs = Date.parse(event.timestamp);
    if (Number.isFinite(eventMs)) {
      eventTimestamps.push(eventMs);
    }
  }

  if (eventTimestamps.length === 0) {
    return Array.from({ length: BUCKET_COUNT }, () => 0);
  }

  // Use the actual event time range, not the full session range
  const eventStartMs = Math.min(...eventTimestamps);
  const eventEndMs = Math.max(...eventTimestamps);

  // If all events are at the same timestamp, spread them into a single bucket
  if (eventEndMs <= eventStartMs) {
    const buckets = Array.from({ length: BUCKET_COUNT }, () => 0);
    buckets[Math.floor(BUCKET_COUNT / 2)] = eventTimestamps.length;
    return buckets;
  }

  const bucketWidth = (eventEndMs - eventStartMs) / BUCKET_COUNT;
  const buckets = Array.from({ length: BUCKET_COUNT }, () => 0);

  for (const ts of eventTimestamps) {
    const rawIndex = Math.floor((ts - eventStartMs) / bucketWidth);
    const bucketIndex = Math.min(Math.max(rawIndex, 0), BUCKET_COUNT - 1);
    buckets[bucketIndex] += 1;
  }

  return buckets;
}
