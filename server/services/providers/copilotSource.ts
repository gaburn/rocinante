import * as fs from 'node:fs';
import * as path from 'node:path';
import { Session, SessionSummary } from '../../../src/types/index.js';
import { getConfig } from '../../config.js';
import { SessionSource, SessionSourceName } from './types.js';
import {
  getAllSessions,
  getSessionById,
  getSessionTurnDataBatch,
  type SqliteSession,
} from '../sqliteReader.js';
import { readEventsTail } from '../eventTailReader.js';
import { readEventsHead } from '../eventTailReader.js';
import { mapToSession, mapSessionSummary, getSessionCwd, type SessionMappingContext } from '../sessionMapper.js';
import { getOrCompute as getOrComputeSummary, evictStale as evictStaleSummaries } from '../sessionSummaryCache.js';
import { sanitizeSessionId } from '../../utils/sanitize.js';

function toEpochMs(timestamp: string): number {
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/* ── Filesystem session ID discovery cache ────────────────────── */

let fsIdCache: { ids: string[]; expires: number } | null = null;
const FS_CACHE_TTL_MS = 10_000;

export class CopilotSessionSource implements SessionSource {
  readonly name: SessionSourceName = 'copilot';

  isAvailable(): boolean {
    const { sqliteDbPath, sessionStateDir } = getConfig();
    return fs.existsSync(sqliteDbPath) || fs.existsSync(sessionStateDir);
  }

  private discoverFilesystemSessionIds(): string[] {
    const now = Date.now();
    if (fsIdCache && now < fsIdCache.expires) {
      return fsIdCache.ids;
    }

    const { sessionStateDir } = getConfig();
    const ids: string[] = [];

    try {
      if (!fs.existsSync(sessionStateDir)) {
        fsIdCache = { ids: [], expires: now + FS_CACHE_TTL_MS };
        return ids;
      }

      const entries = fs.readdirSync(sessionStateDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const eventsPath = path.join(sessionStateDir, entry.name, 'events.jsonl');
        try {
          if (fs.existsSync(eventsPath)) {
            ids.push(entry.name);
          }
        } catch {
          // Skip entries we can't stat
        }
      }
    } catch {
      // sessionStateDir unreadable
    }

    fsIdCache = { ids, expires: now + FS_CACHE_TTL_MS };
    return ids;
  }

  private buildSessionFromFilesystem(id: string): Session | null {
    try {
      const safeId = sanitizeSessionId(id);
      const { sessionStateDir } = getConfig();
      const eventsPath = path.join(sessionStateDir, safeId, 'events.jsonl');

      if (!fs.existsSync(eventsPath)) {
        return null;
      }

      const headData = readEventsHead(id);
      const tailEvents = readEventsTail(id);

      const cwd = getSessionCwd(id, null);
      const now = new Date().toISOString();

      const syntheticRow: SqliteSession = {
        id,
        cwd,
        repository: null,
        branch: null,
        summary: null,
        host_type: null,
        created_at: headData.createdAt || now,
        updated_at: tailEvents.length > 0
          ? tailEvents[tailEvents.length - 1].timestamp
          : (headData.createdAt || now),
      };

      const ctx: SessionMappingContext = {
        firstUserMessage: headData.firstUserMessage,
        turnCount: headData.turnCount,
      };

      const session = mapToSession(syntheticRow, tailEvents, ctx);
      session.source = 'copilot';
      return session;
    } catch (error) {
      console.warn('[CopilotSessionSource] Failed to build session from filesystem.', { sessionId: id, error });
      return null;
    }
  }

  private buildSummaryFromFilesystem(id: string): SessionSummary | null {
    const session = this.buildSessionFromFilesystem(id);
    if (!session) return null;

    // Extract the summary fields from the full Session object
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { rootAgent, events, activityBuckets, assistantUpdates, squadCast, ...summary } = session;

    return summary as SessionSummary;
  }

  listSessionSummaries(excludeIds?: Set<string>): SessionSummary[] {
    const allRows = getAllSessions();
    // Pre-filter: skip archived sessions BEFORE any expensive per-session work
    const rows = excludeIds && excludeIds.size > 0
      ? allRows.filter((r) => !excludeIds.has(r.id))
      : allRows;

    const activeIds = new Set(rows.map((r) => r.id));
    evictStaleSummaries(activeIds);

    const sessionIds = rows.map((r) => r.id);
    const turnDataMap = getSessionTurnDataBatch(sessionIds);
    const { sessionStateDir } = getConfig();

    const summaries: SessionSummary[] = [];
    const sqliteIdSet = new Set(allRows.map((r) => r.id));

    for (const row of rows) {
      try {
        const safeId = sanitizeSessionId(row.id);
        const eventFilePath = path.join(sessionStateDir, safeId, 'events.jsonl');

        const summary = getOrComputeSummary(
          row.id,
          eventFilePath,
          row.updated_at,
          () => {
            const events = readEventsTail(row.id);
            const turnData = turnDataMap.get(row.id) ?? {
              firstMessage: null,
              lastMessage: null,
              turnCount: 0,
            };
            const s = mapSessionSummary(row, events, turnData);
            s.source = 'copilot';
            return s;
          },
        );
        summaries.push(summary);
      } catch (error) {
        console.warn('[CopilotSessionSource] Failed to map session summary. Skipping.', {
          sessionId: row.id,
          error,
        });
      }
    }

    // Merge filesystem-only sessions not present in SQLite
    const fsIds = this.discoverFilesystemSessionIds();
    for (const fsId of fsIds) {
      if (sqliteIdSet.has(fsId)) continue;
      if (excludeIds && excludeIds.has(fsId)) continue;

      try {
        const summary = this.buildSummaryFromFilesystem(fsId);
        if (summary) {
          summaries.push(summary);
        }
      } catch (error) {
        console.warn('[CopilotSessionSource] Failed to build filesystem summary. Skipping.', {
          sessionId: fsId,
          error,
        });
      }
    }

    summaries.sort(
      (a, b) => toEpochMs(b.lastActivityAt) - toEpochMs(a.lastActivityAt),
    );

    return summaries;
  }

  getSession(id: string): Session | null {
    // Try SQLite first (fast, richer metadata)
    const row = getSessionById(id);
    if (row) {
      try {
        const events = readEventsTail(id);
        const session = mapToSession(row, events);
        session.source = 'copilot';
        return session;
      } catch (error) {
        console.warn('[CopilotSessionSource] Failed to map session from SQLite.', { sessionId: id, error });
      }
    }

    // Filesystem fallback
    return this.buildSessionFromFilesystem(id);
  }
}
