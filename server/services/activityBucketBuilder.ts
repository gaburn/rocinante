import type { ParsedEvent } from './eventTailReader.js';

const BUCKET_COUNT = 20;
const NOISE_EVENT_TYPES = new Set([
  'session.heartbeat',
  'session.ping',
  'session.updated',
  'stream.keepalive',
]);

export function buildActivityBuckets(
  events: ParsedEvent[],
  startedAt: string,
  lastActivityAt: string,
): number[] {
  if (events.length === 0) {
    return Array.from({ length: BUCKET_COUNT }, () => 0);
  }

  const startMs = Date.parse(startedAt);
  const endMs = Date.parse(lastActivityAt);

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return [events.length];
  }

  const bucketWidth = (endMs - startMs) / BUCKET_COUNT;
  const buckets = Array.from({ length: BUCKET_COUNT }, () => 0);

  for (const event of events) {
    if (NOISE_EVENT_TYPES.has(event.type)) {
      continue;
    }

    const eventMs = Date.parse(event.timestamp);
    if (!Number.isFinite(eventMs)) {
      continue;
    }

    const rawIndex = Math.floor((eventMs - startMs) / bucketWidth);
    const bucketIndex = Math.min(Math.max(rawIndex, 0), BUCKET_COUNT - 1);
    buckets[bucketIndex] += 1;
  }

  return buckets;
}
