import * as fs from 'node:fs';
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

  listSessionSummaries(): SessionSummary[] {
    const rows = getAllSessions();
    const sessionIds = rows.map((r) => r.id);
    const turnDataMap = getSessionTurnDataBatch(sessionIds);

    const summaries: SessionSummary[] = [];

    for (const row of rows) {
      try {
        const events = readEventsTail(row.id);
        const turnData = turnDataMap.get(row.id) ?? {
          firstMessage: null,
          lastMessage: null,
          turnCount: 0,
        };
        const summary = mapSessionSummary(row, events, turnData);
        summary.source = 'copilot';
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
