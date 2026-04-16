import * as fs from 'node:fs';
import * as path from 'node:path';
import { Session, SessionSummary } from '../../../src/types/index.js';
import { getConfig } from '../../config.js';
import { SessionSource, SessionSourceName } from './types.js';
import {
  getAllSessions,
  getSessionById,
  getSessionTurnDataBatch,
} from '../sqliteReader.js';
import { readEventsTail } from '../eventTailReader.js';
import { mapToSession, mapSessionSummary } from '../sessionMapper.js';
import { getOrCompute as getOrComputeSummary, evictStale as evictStaleSummaries } from '../sessionSummaryCache.js';
import { sanitizeSessionId } from '../../utils/sanitize.js';

function toEpochMs(timestamp: string): number {
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export class CopilotSessionSource implements SessionSource {
  readonly name: SessionSourceName = 'copilot';

  isAvailable(): boolean {
    const { sqliteDbPath } = getConfig();
    return fs.existsSync(sqliteDbPath);
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

    summaries.sort(
      (a, b) => toEpochMs(b.lastActivityAt) - toEpochMs(a.lastActivityAt),
    );

    return summaries;
  }

  getSession(id: string): Session | null {
    const row = getSessionById(id);
    if (!row) {
      return null;
    }

    try {
      const events = readEventsTail(id);
      const session = mapToSession(row, events);
      session.source = 'copilot';
      return session;
    } catch (error) {
      console.warn('[CopilotSessionSource] Failed to map session by id.', {
        sessionId: id,
        error,
      });
      return null;
    }
  }
}
