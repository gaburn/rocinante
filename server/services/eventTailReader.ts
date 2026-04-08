import * as fs from 'node:fs';
import * as path from 'node:path';
import { getConfig } from '../config.js';
import { sanitizeSessionId } from '../utils/sanitize.js';

export interface ParsedEvent {
  type: string;
  id: string;
  parentId: string | null;
  timestamp: string;
  data: Record<string, unknown>;
}

type CacheEntry = {
  mtime: number;
  size: number;
  events: ParsedEvent[];
};

const cache = new Map<string, CacheEntry>();

export function readEventsTail(sessionId: string): ParsedEvent[] {
  const safeId = sanitizeSessionId(sessionId);
  const { sessionStateDir, tailBytes } = getConfig();
  const filePath = path.join(sessionStateDir, safeId, 'events.jsonl');

  let stats: fs.Stats;
  try {
    stats = fs.statSync(filePath);
  } catch (error) {
    const fsError = error as NodeJS.ErrnoException;
    if (fsError.code === 'ENOENT') {
      cache.delete(sessionId);
      return [];
    }
    throw error;
  }

  const mtime = stats.mtimeMs;
  const size = stats.size;

  const cached = cache.get(sessionId);
  if (cached && cached.mtime === mtime && cached.size === size) {
    return cached.events;
  }

  if (size === 0) {
    const emptyEvents: ParsedEvent[] = [];
    cache.set(sessionId, { mtime, size, events: emptyEvents });
    return emptyEvents;
  }

  let content = '';
  let seeked = false;

  if (size <= tailBytes) {
    content = fs.readFileSync(filePath, 'utf8');
  } else {
    seeked = true;
    const start = size - tailBytes;
    const buffer = Buffer.allocUnsafe(tailBytes);
    const fd = fs.openSync(filePath, 'r');

    try {
      const bytesRead = fs.readSync(fd, buffer, 0, tailBytes, start);
      content = buffer.toString('utf8', 0, bytesRead);
    } finally {
      fs.closeSync(fd);
    }
  }

  const lines = content.split('\n');
  if (seeked && lines.length > 0) {
    lines.shift();
  }

  const events: ParsedEvent[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    try {
      const parsed = JSON.parse(line) as ParsedEvent;
      events.push(parsed);
    } catch {
      // Intentionally ignore malformed lines.
    }
  }

  cache.set(sessionId, { mtime, size, events });
  return events;
}

export function clearCache(): void {
  cache.clear();
}
